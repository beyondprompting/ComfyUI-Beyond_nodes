import torch
import numpy as np
from PIL import Image, ImageSequence, ImageOps
import os
import folder_paths
import comfy.utils
import node_helpers
import hashlib
import torchvision.transforms.v2 as T
from ..common.imageFunctions import tensor2pil, pil2tensor, image2mask, fit_resize_image, tensor_to_hash, create_temp_file
from ..common import any


# MASK RECT AREA ADVANCED

class Mask_Rectangular_Area:
    # Creates a rectangle mask using pixels relative to image size.

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "x": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 64}),
                "y": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 64}),
                "width": ("INT", {"default": 512, "min": 0, "max": 4096, "step": 64}),
                "height": ("INT", {"default": 512, "min": 0, "max": 4096, "step": 64}),
                "image_width": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 64}),
                "image_height": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 64}),
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"}
        }

    CATEGORY = "Beyond nodes/Masking"

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


class ImageMaskScaleAs:

    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(self):

        fit_mode = ['letterbox', 'crop', 'fill']
        method_mode = ['lanczos', 'bicubic', 'hamming', 'bilinear', 'box', 'nearest']

        return {
            "required": {
                "scale_as": (any, {}),
                "fit": (fit_mode,),
                "method": (method_mode,),
            },
            "optional": {
                "image": ("IMAGE",),  #
                "mask": ("MASK",),  #
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "BOX", "INT", "INT")
    RETURN_NAMES = ("image", "mask", "original_size", "widht", "height",)
    FUNCTION = 'image_mask_scale_as'
    CATEGORY = 'Beyond nodes/Masking'

    def image_mask_scale_as(self, scale_as, fit, method,
                            image=None, mask = None,
                            ):
        NODE_NAME = 'ImageMaskScaleAs'
        if scale_as.shape[0] > 0:
            _asimage = tensor2pil(scale_as[0])
        else:
            _asimage = tensor2pil(scale_as)
        target_width, target_height = _asimage.size
        _mask = Image.new('L', size=_asimage.size, color='black')
        _image = Image.new('RGB', size=_asimage.size, color='black')
        orig_width = 4
        orig_height = 4
        resize_sampler = Image.LANCZOS
        if method == "bicubic":
            resize_sampler = Image.BICUBIC
        elif method == "hamming":
            resize_sampler = Image.HAMMING
        elif method == "bilinear":
            resize_sampler = Image.BILINEAR
        elif method == "box":
            resize_sampler = Image.BOX
        elif method == "nearest":
            resize_sampler = Image.NEAREST

        ret_images = []
        ret_masks = []
        
        if image is not None:
            for i in image:
                i = torch.unsqueeze(i, 0)
                _image = tensor2pil(i).convert('RGB')
                orig_width, orig_height = _image.size
                _image = fit_resize_image(_image, target_width, target_height, fit, resize_sampler)
                ret_images.append(pil2tensor(_image))
        if mask is not None:
            if mask.dim() == 2:
                mask = torch.unsqueeze(mask, 0)
            for m in mask:
                m = torch.unsqueeze(m, 0)
                _mask = tensor2pil(m).convert('L')
                orig_width, orig_height = _mask.size
                _mask = fit_resize_image(_mask, target_width, target_height, fit, resize_sampler).convert('L')
                ret_masks.append(image2mask(_mask))
        if len(ret_images) > 0 and len(ret_masks) >0:
            # log(f"{NODE_NAME} Processed {len(ret_images)} image(s).", message_type='finish')
            return (torch.cat(ret_images, dim=0), torch.cat(ret_masks, dim=0), [orig_width, orig_height],target_width, target_height,)
        elif len(ret_images) > 0 and len(ret_masks) == 0:
            # log(f"{NODE_NAME} Processed {len(ret_images)} image(s).", message_type='finish')
            return (torch.cat(ret_images, dim=0), None, [orig_width, orig_height],target_width, target_height,)
        elif len(ret_images) == 0 and len(ret_masks) > 0:
            # log(f"{NODE_NAME} Processed {len(ret_masks)} image(s).", message_type='finish')
            return (None, torch.cat(ret_masks, dim=0), [orig_width, orig_height], target_width, target_height,)
        else:
            # log(f"Error: {NODE_NAME} skipped, because the available image or mask is not found.", message_type='error')
            return (None, None, [orig_width, orig_height], 0, 0,)

class MaskToImage:
    """Converts a mask (alpha) to an RGB image with a color and background"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "color": ("COLOR",),
                "background": ("COLOR", {"default": "#000000"}),
            },
            "optional": {
                "invert": ("BOOLEAN", {"default": False}),
            },
        }

    CATEGORY = "Beyond nodes/Masking"

    RETURN_TYPES = ("IMAGE",)

    FUNCTION = "render_mask"

    def render_mask(self, mask, color, background, invert=False):
        masks = tensor2pil(1.0 - mask) if invert else tensor2pil(mask)
        images = []

        for m in masks:
            _mask = m.convert("L")

            # log.debug(
            #     f"Converted mask to PIL Image format, size: {_mask.size}"
            # )

            image = Image.new("RGBA", _mask.size, color=color)
            # apply the mask
            image = Image.composite(
                image, Image.new("RGBA", _mask.size, color=background), _mask
            )

            # image = ImageChops.multiply(image, mask)
            # apply over background
            # image = Image.alpha_composite(Image.new("RGBA", image.size, color=background), image)

            images.append(image.convert("RGB"))

        return (pil2tensor(images),)

class MaskBoundingBox:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask": ("MASK",),
                "padding": ("INT", { "default": 0, "min": 0, "max": 4096, "step": 1, }),
                "blur": ("INT", { "default": 0, "min": 0, "max": 256, "step": 1, }),
            },
            "optional": {
                "image_optional": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("MASK", "IMAGE", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("MASK", "IMAGE", "x", "y", "width", "height")
    FUNCTION = "execute"
    CATEGORY = "Beyond nodes/Masking"

    def execute(self, mask, padding, blur, image_optional=None):
        if mask.dim() == 2:
            mask = mask.unsqueeze(0)

        if image_optional is None:
            image_optional = mask.unsqueeze(3).repeat(1, 1, 1, 3)

        # resize the image if it's not the same size as the mask
        if image_optional.shape[1:] != mask.shape[1:]:
            image_optional = comfy.utils.common_upscale(image_optional.permute([0,3,1,2]), mask.shape[2], mask.shape[1], upscale_method='bicubic', crop='center').permute([0,2,3,1])

        # match batch size
        if image_optional.shape[0] < mask.shape[0]:
            image_optional = torch.cat((image_optional, image_optional[-1].unsqueeze(0).repeat(mask.shape[0]-image_optional.shape[0], 1, 1, 1)), dim=0)
        elif image_optional.shape[0] > mask.shape[0]:
            image_optional = image_optional[:mask.shape[0]]

        # blur the mask
        if blur > 0:
            if blur % 2 == 0:
                blur += 1
            mask = T.functional.gaussian_blur(mask.unsqueeze(1), blur).squeeze(1)

        _, y, x = torch.where(mask)
        x1 = max(0, x.min().item() - padding)
        x2 = min(mask.shape[2], x.max().item() + 1 + padding)
        y1 = max(0, y.min().item() - padding)
        y2 = min(mask.shape[1], y.max().item() + 1 + padding)

        # crop the mask
        mask = mask[:, y1:y2, x1:x2]
        image_optional = image_optional[:, y1:y2, x1:x2, :]

        return (mask, image_optional, x1, y1, x2 - x1, y2 - y1)

class EditMask:

    def __init__(self):
        self.image_id = None

    @classmethod
    def INPUT_TYPES(s):
        return {"required":
                    {"image": ("IMAGE",), # 表示一个张量
                     
                     },

                    "optional":{
                            "image_update": ("IMAGE_FILE",)
                        },
                   
                }

    CATEGORY = "Beyond nodes/Masking"

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")

    FUNCTION = "edit"

    OUTPUT_NODE = True

    def edit(self, image,image_update=None):

        # 根据image输入来判断是否是新的图片
        if self.image_id==None:
            self.image_id=tensor_to_hash(image)
            image_update=None
        else:
            image_id=tensor_to_hash(image)
            if image_id!=self.image_id:
                image_update=None
                self.image_id=image_id


        image_path=None
        # print('#image_update',self.image_id,image_update)
        if image_update==None:
            print('--')
        else:
            if 'images' in image_update:
                images=image_update['images']
                filename=images[0]['filename']
                subfolder=images[0]['subfolder']
                type=images[0]['type']
                name, base_dir=folder_paths.annotated_filepath(filename)
                if type.endswith("output"):
                    base_dir = folder_paths.get_output_directory() 
                elif type.endswith("input"):
                    base_dir = folder_paths.get_input_directory() 
                elif type.endswith("temp"):
                    base_dir = folder_paths.get_temp_directory() 
                #base_dir = folder_paths.get_input_directory()  
                # print(base_dir,subfolder, name)
                image_path = os.path.join(base_dir,subfolder, name)
        
        if image_path==None:
            image_path,images=create_temp_file(image)

        print('#image_path',os.path.exists(image_path),image_path)
        # image_path = folder_paths.get_annotated_filepath(image) #文件名
        
        if not os.path.exists(image_path):
            image_path,images=create_temp_file(image)


        img = node_helpers.pillow(Image.open, image_path)
        
        output_images = []
        output_masks = []
        w, h = None, None

        excluded_formats = ['MPO']
        
        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            if i.mode == 'I':
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")

            if len(output_images) == 0:
                w = image.size[0]
                h = image.size[1]
            
            if image.size[0] != w or image.size[1] != h:
                continue
            
            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            if 'A' in i.getbands():
                mask = np.array(i.getchannel('A')).astype(np.float32) / 255.0
                mask = 1. - torch.from_numpy(mask)
            else:
                # 尺寸不对，需要按照image来
                mask = torch.zeros((h, w), dtype=torch.float32, device="cpu")

            output_images.append(image)
            output_masks.append(mask.unsqueeze(0))

        if len(output_images) > 1 and img.format not in excluded_formats:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

        return {"ui":{"images": images},"result": (output_image, output_mask)}

        # return (output_image, output_mask)