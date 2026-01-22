import os
import time
import uuid
import mimetypes
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import folder_paths

# ComfyUI server (aiohttp)
try:
    from server import PromptServer
except Exception as e:
    PromptServer = None


# -----------------------------
# Config
# -----------------------------
DEFAULT_PUBLIC_BASE_URL = os.getenv("BEYOND_PUBLIC_BASE_URL", "http://127.0.0.1:8188").rstrip("/")
DEFAULT_TTL_MINUTES = int(os.getenv("BEYOND_LORA_URL_TTL_MINUTES", "120"))
MAX_TTL_MINUTES = int(os.getenv("BEYOND_LORA_URL_TTL_MAX_MINUTES", "10080"))  # 7 days

# If true, require token even for localhost. Keep it true by default.
REQUIRE_TOKEN_ALWAYS = os.getenv("BEYOND_LORA_REQUIRE_TOKEN_ALWAYS", "1") == "1"


# -----------------------------
# Registry (in-memory)
# -----------------------------
@dataclass
class ShareEntry:
    file_path: str
    token: str
    created_at: float
    expires_at: float
    filename: str


_SHARE_REGISTRY: Dict[str, ShareEntry] = {}
_ROUTES_REGISTERED = False


def _now() -> float:
    return time.time()


def _cleanup_registry() -> None:
    t = _now()
    # remove expired
    expired = [sid for sid, ent in _SHARE_REGISTRY.items() if ent.expires_at <= t]
    for sid in expired:
        _SHARE_REGISTRY.pop(sid, None)


def _clamp_ttl_minutes(ttl: int) -> int:
    if ttl <= 0:
        return 1
    if ttl > MAX_TTL_MINUTES:
        return MAX_TTL_MINUTES
    return ttl


def _get_lora_dir_candidates() -> Tuple[str, ...]:
    """
    folder_paths usually resolves to <ComfyUI>/models/loras.
    We still handle multiple configured paths.
    """
    try:
        paths = folder_paths.get_folder_paths("loras")
        if paths:
            return tuple(paths)
    except Exception:
        pass

    # fallback
    base = folder_paths.models_dir if hasattr(folder_paths, "models_dir") else os.path.join(os.getcwd(), "models")
    return (os.path.join(base, "loras"),)


def _list_loras() -> Tuple[str, ...]:
    """
    Returns display names relative to a loras root:
      - "my_lora.safetensors"
      - "subdir/other_lora.safetensors"
    """
    exts = {".safetensors", ".pt", ".ckpt"}
    results = []
    for root in _get_lora_dir_candidates():
        if not os.path.isdir(root):
            continue
        for dirpath, _, filenames in os.walk(root):
            for fn in filenames:
                _, ext = os.path.splitext(fn)
                if ext.lower() not in exts:
                    continue
                full = os.path.join(dirpath, fn)
                rel = os.path.relpath(full, root)
                # normalize to forward slashes for UI
                rel = rel.replace("\\", "/")
                results.append(rel)

    results = sorted(set(results), key=lambda s: s.lower())
    if not results:
        return ("(no loras found)",)
    return tuple(results)


def _resolve_lora_path(rel_name: str) -> Optional[str]:
    """
    Converts a relative lora name to an absolute path inside one of the loras roots.
    Prevents path traversal by requiring the result to stay within the root.
    """
    if not rel_name or rel_name == "(no loras found)":
        return None

    # normalize rel_name (avoid ..)
    rel_name = rel_name.replace("\\", "/").lstrip("/")
    if ".." in rel_name.split("/"):
        return None

    for root in _get_lora_dir_candidates():
        candidate = os.path.abspath(os.path.join(root, rel_name))
        root_abs = os.path.abspath(root)

        # ensure candidate is under root
        if os.path.commonpath([candidate, root_abs]) != root_abs:
            continue

        if os.path.isfile(candidate):
            return candidate

    return None


def _extract_token_from_request(request) -> Optional[str]:
    """
    Accept either:
      - ?token=XYZ
      - Authorization: Bearer XYZ
    """
    token = request.query.get("token")
    if token:
        return token

    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None

    return None


def _register_routes_once() -> None:
    global _ROUTES_REGISTERED

    if _ROUTES_REGISTERED:
        return

    if PromptServer is None:
        # Comfy server not importable (should not happen in real Comfy runs)
        return

    app = PromptServer.instance.app

    # Avoid double-adding if hot-reloaded
    # We'll just set the flag; routes are idempotent enough if not re-added.
    # In practice, Comfy loads custom_nodes once on startup.
    from aiohttp import web

    async def handle_get_lora(request):
        _cleanup_registry()

        share_id = request.match_info.get("share_id", "")
        entry = _SHARE_REGISTRY.get(share_id)
        if not entry:
            return web.Response(status=404, text="Not found")

        if REQUIRE_TOKEN_ALWAYS:
            req_token = _extract_token_from_request(request)
            if not req_token or req_token != entry.token:
                return web.Response(status=401, text="Unauthorized")

        # Ensure still exists
        if not os.path.isfile(entry.file_path):
            _SHARE_REGISTRY.pop(share_id, None)
            return web.Response(status=410, text="Gone (file missing)")

        # Content headers
        mime, _ = mimetypes.guess_type(entry.filename)
        if not mime:
            mime = "application/octet-stream"

        # Stream file
        resp = web.FileResponse(path=entry.file_path)
        resp.content_type = mime

        # Force download-like behavior; user can still fetch it programmatically
        resp.headers["Content-Disposition"] = f'attachment; filename="{entry.filename}"'
        resp.headers["Cache-Control"] = "no-store"
        return resp

    async def handle_list_shares(request):
        # Optional: basic introspection endpoint (still token-protected per-share, not here).
        # You can remove this if you don't want it.
        _cleanup_registry()
        return web.json_response(
            {
                "count": len(_SHARE_REGISTRY),
                "shares": [
                    {
                        "share_id": sid,
                        "filename": ent.filename,
                        "expires_at": ent.expires_at,
                    }
                    for sid, ent in _SHARE_REGISTRY.items()
                ],
            }
        )

    app.router.add_get("/beyond/loras/{share_id}", handle_get_lora)
    app.router.add_get("/beyond/loras", handle_list_shares)

    _ROUTES_REGISTERED = True


# -----------------------------
# Node
# -----------------------------
class Beyond_Public_LoRA_URL:
    """
    Create a token-protected public URL for a LoRA file located under models/loras.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lora_name": (_list_loras(),),
                "token": ("STRING", {"default": "", "multiline": False}),
                "ttl_minutes": ("INT", {"default": DEFAULT_TTL_MINUTES, "min": 1, "max": MAX_TTL_MINUTES, "step": 1}),
            },
            "optional": {
                "public_base_url": ("STRING", {"default": DEFAULT_PUBLIC_BASE_URL, "multiline": False}),
                "one_time": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("public_url", "lora_abs_path", "expires_in_seconds")
    FUNCTION = "make_url"
    CATEGORY = "Beyond Nodes/Sharing"

    def make_url(
        self,
        lora_name: str,
        token: str,
        ttl_minutes: int,
        public_base_url: str = DEFAULT_PUBLIC_BASE_URL,
        one_time: bool = False,
    ):
        _register_routes_once()
        _cleanup_registry()

        abs_path = _resolve_lora_path(lora_name)
        if not abs_path:
            return ("", "", 0)

        token = (token or "").strip()
        if not token:
            # If you want auto-token generation, you can change this.
            raise ValueError("Token is required (non-empty).")

        ttl_minutes = _clamp_ttl_minutes(int(ttl_minutes))
        expires_in = ttl_minutes * 60

        share_id = uuid.uuid4().hex
        filename = os.path.basename(abs_path)

        entry = ShareEntry(
            file_path=abs_path,
            token=token,
            created_at=_now(),
            expires_at=_now() + expires_in,
            filename=filename,
        )
        _SHARE_REGISTRY[share_id] = entry

        base = (public_base_url or DEFAULT_PUBLIC_BASE_URL).rstrip("/")
        url = f"{base}/beyond/loras/{share_id}?token={token}"

        # one_time behavior: if enabled, delete after first successful fetch
        # Implemented as a soft toggle here; actual deletion requires knowing fetch succeeded.
        # If you want real one-time URLs, we can implement it by wrapping FileResponse and deleting after send.
        if one_time:
            # Mark by encoding into token field? (simple approach)
            # We'll implement real one-time in a follow-up if you want; leaving this noop is safer than lying.
            pass

        return (url, abs_path, expires_in)


NODE_CLASS_MAPPINGS = {
    "Beyond_Public_LoRA_URL": Beyond_Public_LoRA_URL,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Beyond_Public_LoRA_URL": "Beyond: Public LoRA URL (Token Protected)",
}
