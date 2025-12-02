from ..common import BOOLEAN, STRING, CATEGORY, any, logger

class CSwitchFromAny:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (any, ),
                "boolean": BOOLEAN,
            }
        }

    CATEGORY = "Beyond Nodes/Logic"
    # CATEGORY = CATEGORY.MAIN.value + CATEGORY.SWITCH.value

    RETURN_TYPES = (any, any,)
    RETURN_NAMES = ("on_true", "on_false",)

    FUNCTION = "execute"

    def execute(self, any,boolean=True):
        logger.debug("Any switch: " + str(boolean))

        if boolean:
            return any, None
        else:
            return None, any

class CSwitchBooleanAny:
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "on_true": (any, {"lazy": True}),
                "on_false": (any, {"lazy": True}),
                "boolean": BOOLEAN,
            }
        }

    CATEGORY = "Beyond Nodes/Logic"
    # CATEGORY = CATEGORY.MAIN.value + CATEGORY.SWITCH.value
    
    RETURN_TYPES = (any,)

    FUNCTION = "execute"

    def check_lazy_status(self, on_true=None, on_false=None, boolean=True):
        needed = "on_true" if boolean else "on_false"
        return [needed]

    def execute(self, on_true, on_false, boolean=True):
        logger.debug("Any switch: " + str(boolean))

        if boolean:
            return (on_true,)
        else:
            return (on_false,)

class AnyType(str):
    """A special string subclass that equals any other type for ComfyUI type checking."""
    def __ne__(self, __value: object) -> bool:
        return False

# Create an instance to use as the any type
any_type = AnyType("*")

class TwoWaySwitch:
    """Two-way switch that selects between two inputs based on selection setting."""
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selection_setting": ("INT", {"default": 1, "min": 1, "max": 2}),
            },
            "optional": {
                "input_1": (any,),
                "input_2": (any,),
            }
        }

    RETURN_TYPES = (any,)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch_inputs"
    
    CATEGORY = "Beyond Nodes/Logic"

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        """Allow any input types."""
        return True

    def switch_inputs(self, selection_setting=1, input_1=None, input_2=None):
        """
        Two-way switch that selects between two inputs based on the selection_setting.
        Compatible with IntegerSettings node:
        - selection_setting = 1 (Disable): selects input_1
        - selection_setting = 2 (Enable): selects input_2
        """
        if selection_setting == 2:
            # Enable state - select second input
            selected_output = input_2 if input_2 is not None else input_1
        else:
            # Disable state (1) or any other value - select first input
            selected_output = input_1 if input_1 is not None else input_2
        
        return (selected_output,)
