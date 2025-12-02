from .common.types import BOOLEAN, STRING, CATEGORY, any


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

    CATEGORY = "Beyond Nodes/Switching"
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

    CATEGORY = "Beyond Nodes/Switching"
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