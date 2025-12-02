try:
    from .nodes.Compositor4 import *
    from .nodes.Compositor4 import Compositor4
    from .nodes.CompositorConfig4 import CompositorConfig4
    from .nodes.Compositor4TransformsOut import Compositor4TransformsOut
    from .nodes.Compositor4MasksOutput import Compositor4MasksOutput
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Compositor nodes\033[0m")

try:
    from .nodes.Logic import Compare, Int, Float, Bool, String, IfExecute, DebugPrint, AlwaysEqualProxy
    
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Logic nodes\033[0m")

try:
    from .nodes.Masking import Mask_Rectangular_Area
    
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Masking nodes\033[0m")

try:
    from .nodes.Logic import TwoWaySwitch
    from .nodes.Switch import CSwitchBooleanAny
    
except ImportError:
    print("\033[34mBeyond Nodes: \033[92mFailed loading Switch nodes\033[0m")


NODE_CLASS_MAPPINGS = { 
    ### Compositor Nodes
    "Compositor4-beyond_nodes": Compositor4,
    "CompositorConfig4-beyond_nodes": CompositorConfig4,
    "Compositor4TransformsOut-beyond_nodes": Compositor4TransformsOut,
    "Compositor4MasksOutput-beyond_nodes": Compositor4MasksOutput,
    ### Logic Nodes
    "Compare-beyond_nodes": Compare,
    "Int-beyond_nodes": Int,
    "Float-beyond_nodes": Float,
    "Bool-beyond_nodes": Bool,
    "String-beyond_nodes": String,
    "If ANY return A else B-beyond_nodes": IfExecute,
    "DebugPrint-beyond_nodes": DebugPrint,
    "If ANY execute A else B-beyond_nodes": IfExecuteNode,
    ### Masking Nodes
    "MaskRectArea-beyond_nodes": Mask_Rectangular_Area,
    ### Switch Nodes 
    "TwoWaySwitch-beyond_nodes": TwoWaySwitch,
    "BooleanSwitch-beyond_nodes": CSwitchBooleanAny
    
}

NODE_DISPLAY_NAME_MAPPINGS = {
    ### Compositor Nodes
    "Compositor4-beyond_nodes": "🦾 Compositor V4 ",
    "CompositorConfig4-beyond_nodes": "🦾 Compositor Config V4 🦾",
    "Compositor4TransformsOut-beyond_nodes": "🦾 Compositor Transforms Output V4 🦾",
    "Compositor4MasksOutput-beyond_nodes": "🦾 Compositor Masks Output V4 🦾",
    ### Logic Nodes
    "Compare-beyond_nodes": "Compare 🦾",
    "Int-beyond_nodes": "Int 🦾",
    "Float-beyond_nodes": "Float 🦾",
    "Bool-beyond_nodes": "Bool 🦾",
    "String-beyond_nodes": "String 🦾",
    "If ANY return A else B-beyond_nodes": "If ANY return A else B",
    "DebugPrint-beyond_nodes": "DebugPrint",
    "If ANY execute A else B-beyond_nodes": "If ANY execute A else B",
    ### Masking Nodes
    "MaskRectArea-beyond_nodes": "Mask Rectangular Area",
    ### Switch Nodes 
    "TwoWaySwitch-beyond_nodes": "Two Way Switch 🦾",
    "BooleanSwitch-beyond_nodes": "Boolean Switch Any Type",
}
