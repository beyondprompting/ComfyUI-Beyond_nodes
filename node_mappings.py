try:
    from .nodes.Compositor4 import Compositor4
    from .nodes.Compositor3 import Compositor3
    from .nodes.CompositorConfig4 import CompositorConfig4
    from .nodes.Compositor4TransformsOut import Compositor4TransformsOut
    from .nodes.Compositor4MasksOutput import Compositor4MasksOutput
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Compositor nodes\033[0m")

try:
    from .nodes.Image import ImageScaleDown, ImageScaleDownBy
    print("loaded Image nodes")
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Image nodes\033[0m")

try:
    from .nodes.Logic import Compare, Int, Float, Bool, String, IfExecute, DebugPrint, AlwaysEqualProxy
    
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Logic nodes\033[0m")

try:
    from .nodes.Masking import Mask_Rectangular_Area, ImageMaskScaleAs, MaskToImage, MaskBoundingBox, EditMask, RoundMask
    
except ImportError as e:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Masking nodes\033[0m")
    print(e)

try:
    from .nodes.Switch import TwoWaySwitch, CSwitchBooleanAny, CSwitchFromAny, ImageMaskSwitch, BooleanControlOutput
    
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Switch nodes\033[0m")

try:
    from .nodes.Prompt import Prompt

except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Prompt nodes\033[0m")


NODE_CLASS_MAPPINGS = { 
    ### Compositor Nodes
    "Compositor3-beyond_nodes": Compositor3,
    "Compositor4-beyond_nodes": Compositor4,
    "CompositorConfig4-beyond_nodes": CompositorConfig4,
    "Compositor4TransformsOut-beyond_nodes": Compositor4TransformsOut,
    "Compositor4MasksOutput-beyond_nodes": Compositor4MasksOutput,
    ### Image Nodes
    "ImageScaleDownBy-beyond_nodes": ImageScaleDownBy,
    ### Logic Nodes
    "Compare-beyond_nodes": Compare,
    "Int-beyond_nodes": Int,
    "Float-beyond_nodes": Float,
    "Bool-beyond_nodes": Bool,
    "String-beyond_nodes": String,
    "If ANY return A else B-beyond_nodes": IfExecute,
    "DebugPrint-beyond_nodes": DebugPrint,
    ### Masking Nodes
    "MaskRectArea-beyond_nodes": Mask_Rectangular_Area,
    "MaskToImage-beyond_nodes": MaskToImage,
    "MaskBoundingBox-beyond_nodes": MaskBoundingBox,
    "ImageMaskScaleAs-beyond_nodes": ImageMaskScaleAs,
    ### Switch Nodes 
    "TwoWaySwitch-beyond_nodes": TwoWaySwitch,
    "BooleanSwitch-beyond_nodes": CSwitchBooleanAny,
    "ImageMaskSwitch-beyond_nodes": ImageMaskSwitch,
    "BooleanControlOutput-beyond_nodes": BooleanControlOutput,
    "EditMask-beyond_nodes": EditMask,
    "RoundMask-beyond_nodes": RoundMask,
    ### Prompt Nodes
    "Prompt-beyond_nodes": Prompt,

}

NODE_DISPLAY_NAME_MAPPINGS = {
    ### Compositor Nodes
    "Compositor3-beyond_nodes": "🦾 Compositor V3 ",
    "Compositor4-beyond_nodes": "🦾 Compositor V4 ",
    "CompositorConfig4-beyond_nodes": "🦾 Compositor Config V4 🦾",
    "Compositor4TransformsOut-beyond_nodes": "🦾 Compositor Transforms Output V4 🦾",
    "Compositor4MasksOutput-beyond_nodes": "🦾 Compositor Masks Output V4 🦾",
    ## Image Nodes
    "ImageScaleDownBy-beyond_nodes": "🦾 Image Scale Down By",
    ### Logic Nodes
    "Compare-beyond_nodes": "Compare 🦾",
    "Int-beyond_nodes": "Int 🦾",
    "Float-beyond_nodes": "Float 🦾",
    "Bool-beyond_nodes": "Bool 🦾",
    "String-beyond_nodes": "String 🦾",
    "If ANY return A else B-beyond_nodes": "If ANY return A else B 🦾",
    "DebugPrint-beyond_nodes": "DebugPrint 🦾",
    ### Masking Nodes
    "MaskRectArea-beyond_nodes": "Mask Rectangular Area 🦾",
    "MaskToImage-beyond_nodes": "Mask to Image 🦾",
    "MaskBoundingBox": "Mask Bounding Box 🦾",
    "ImageMaskScaleAs-beyond_nodes": "Scale an Image/Mask as a Ref 🦾",
    ### Switch Nodes 
    "TwoWaySwitch-beyond_nodes": "Two Way Switch 🦾",
    "BooleanSwitch-beyond_nodes": "Boolean Switch Any Type 🦾",
    "ImageMaskSwitch-beyond_nodes":"Image and Mask Switch 🦾",
    "BooleanControlOutput-beyond_nodes": "Boolean Control Output 🦾",
    "EditMask-beyond_nodes": "Edit Mask from image input 🦾",
    "RoundMask-beyond_nodes": "Round Mask 🦾",
    ### Prompt Nodes
    "Prompt-beyond_nodes": "🦾 Prompt with Selectors",
}
