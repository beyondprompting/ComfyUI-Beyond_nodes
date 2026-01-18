import uuid
from datetime import datetime

class UUIDFilename:
    ## Generates a filename prefix using a UUID and optional date stamp.
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prefix": ("STRING", {"default": ""}),
                "include_date": ("BOOLEAN", {"default": True}),
                "uuid_len": ("INT", {"default": 32, "min": 8, "max": 32, "step": 1}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filename_prefix",)
    FUNCTION = "make"
    CATEGORY = "utils"

    def make(self, prefix: str, include_date: bool, uuid_len: int):
        u = uuid.uuid4().hex  # 32 hex chars, no dashes
        u = u[:uuid_len]

        if include_date:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base = f"{stamp}_{u}"
        else:
            base = u

        if prefix:
            base = f"{prefix}_{base}"

        return (base,)

NODE_CLASS_MAPPINGS = {"UUIDFilename": UUIDFilename}
NODE_DISPLAY_NAME_MAPPINGS = {"UUIDFilename": "UUID Filename Prefix"}
