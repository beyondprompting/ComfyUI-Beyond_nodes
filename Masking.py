import torch
import numpy as np
from PIL import Image, ImageFilter


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
                "blur_radius": ("INT", {"default": 0, "min": 0, "max": 255, "step": 1}),
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
        blur_radius = kwargs["blur_radius"]

        # Calculate maximum coordinates
        max_x = min_x + width
        max_y = min_y + height

        # Optional: clamp to image bounds to avoid indexing issues
        min_x_clamped = max(0, min_x)
        min_y_clamped = max(0, min_y)
        max_x_clamped = max(0, min(image_width, max_x))
        max_y_clamped = max(0, min(image_height, max_y))

        # Create a mask with the image dimensions
        mask = torch.zeros((image_height, image_width), dtype=torch.float32)

        # Draw the rectangle on the mask (if it’s not degenerate)
        if max_x_clamped > min_x_clamped and max_y_clamped > min_y_clamped:
            mask[int(min_y_clamped):int(max_y_clamped), int(min_x_clamped):int(max_x_clamped)] = 1.0

        # Apply blur if the radius is greater than 0
        if blur_radius > 0:
            # Convert tensor -> PIL (as 0–255 uint8 grayscale)
            mask_np = (mask.cpu().numpy() * 255).astype(np.uint8)
            mask_img = Image.fromarray(mask_np, mode="L")

            # Apply Gaussian blur using PIL
            blurred_img = mask_img.filter(ImageFilter.GaussianBlur(radius=blur_radius))

            # Convert back to tensor in [0, 1] float32
            blurred_np = np.array(blurred_img).astype(np.float32) / 255.0
            mask = torch.from_numpy(blurred_np)

        # Return the mask as a tensor with an additional channel: [1, H, W]
        return (mask.unsqueeze(0),)
