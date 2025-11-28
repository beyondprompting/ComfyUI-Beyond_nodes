import torch
import numpy as np


# MASK RECT AREA ADVANCED

class Mask_Rect_Area_Advanced:
    # Creates a rectangle mask using pixels relative to image size.

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "x": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 64}),
                "y": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 64}),
                "width": ("INT", {"default": 256, "min": 0, "max": 4096, "step": 64}),
                "height": ("INT", {"default": 256, "min": 0, "max": 4096, "step": 64}),
                "image_width": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 64}),
                "image_height": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 64}),
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"}
        }

    CATEGORY = "Image/Masking"

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("MASKS",)

    FUNCTION = "rect_mask_adv"

    def rect_mask_adv(self, extra_pnginfo, unique_id, **kwargs):
         # Get node values
        min_x = kwargs["x"]
        min_y = kwargs["y"]
        width = kwargs["width"]
        height = kwargs["height"]
        image_width = kwargs["image_width"]
        image_height = kwargs["image_height"]

        # Calculate maximum coordinates
        max_x = min_x + width
        max_y = min_y + height

        # Create a mask with the image dimensions
        mask = torch.zeros((image_height, image_width))

        # Draw the rectangle on the mask
        mask[int(min_y):int(max_y), int(min_x):int(max_x)] = 1

        # Return the mask as a tensor with an additional channel
        return (mask.unsqueeze(0),)
