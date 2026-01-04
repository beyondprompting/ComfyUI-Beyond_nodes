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
                "lighting": (
                    [light_sentinel] + PROMPT_TEMPLATE.get("lighting", []),
                    {"default": light_sentinel},
                ),
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
    def _append_section(base: str, selectable_name: str, value: str, sentinel: str) -> str:
        """
        Appends:
        \n### <selectable_name> ("<selectable_name>")
        \n<value>
        only if value != sentinel and value is non-empty.
        """
        v = (value or "").strip()
        if not v or v == sentinel:
            return base

        base = (base or "").rstrip()
        return f'{base}\n### {selectable_name}'# ("{selectable_name}")\n{v}'

    def doit(self, text, camera_angle, lighting, **kwargs):
        out = (text or "").strip()

        # must match the sentinel strings defined in INPUT_TYPES
        cam_sentinel = "📷 Select camera angle (optional)"
        light_sentinel = "💡 Select lighting (optional)"

        out = self._append_section(out, "camera_angle: ", camera_angle, cam_sentinel)
        out = self._append_section(out, "lighting: ", lighting, light_sentinel)

        return (out,)