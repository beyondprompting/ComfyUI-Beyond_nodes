from ..common.prompts import PROMPT_TEMPLATE


class Prompt:
    @classmethod
    def INPUT_TYPES(cls):
        # Sentinel values (these are what “not selected” means)
        cam_sentinel = "📷 Select camera angle (optional)"
        light_sentinel = "💡 Select lighting (optional)"

        return {
            "required": {
                "text": ("STRING", {"default": "", "multiline": True, "placeholder": "Main prompt (required)"}),

                # Optional selectors implemented as dropdowns with a sentinel default
                "camera_angle": (
                    [cam_sentinel] + PROMPT_TEMPLATE.get("camera_angle", []),
                    {"default": cam_sentinel},
                ),
                "camera_angle_strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05},
                ),

                "lighting": (
                    [light_sentinel] + PROMPT_TEMPLATE.get("lighting", []),
                    {"default": light_sentinel},
                ),
                "lighting_strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05},
                ),
            },
            "optional": {
                # Optional incoming prompt text from other nodes
                "text_in": ("STRING", {"default": "", "multiline": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "my_unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "doit"
    CATEGORY = "Beyond nodes/Prompt"

    # --- helpers ---
    @staticmethod
    def _append_section(base: str, selectable_name: str, value: str, sentinel: str, strength: float) -> str:
        """
        Appends:
        \n### <selectable_name> ("<selectable_name>") [strength=<strength>]
        \n<value>
        only if value != sentinel and value is non-empty.
        """
        v = (value or "").strip()
        if not v or v == sentinel:
            return base

        base = (base or "").rstrip()
        s = float(strength)
        return f'{base}\n### {selectable_name} ("{selectable_name}") [strength={s:g}]\n{v}'

    @staticmethod
    def _append_text(base: str, extra: str) -> str:
        """
        Appends extra text as a new line block only if it is non-empty.
        """
        e = (extra or "").strip()
        if not e:
            return (base or "").strip()
        base = (base or "").rstrip()
        return f"{base}\n{e}"

    def doit(
        self,
        text,
        camera_angle,
        camera_angle_strength,
        lighting,
        lighting_strength,
        text_in="",
        **kwargs
    ):
        out = (text or "").strip()

        # Compose with optional incoming text
        out = self._append_text(out, text_in)

        # must match the sentinel strings defined in INPUT_TYPES
        cam_sentinel = "📷 Select camera angle (optional)"
        light_sentinel = "💡 Select lighting (optional)"

        # Append selected sections (only when not sentinel)
        out = self._append_section(out, "camera_angle", camera_angle, cam_sentinel, camera_angle_strength)
        out = self._append_section(out, "lighting", lighting, light_sentinel, lighting_strength)

        return (out,)
