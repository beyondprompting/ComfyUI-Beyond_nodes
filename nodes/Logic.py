import nodes

COMPARE_FUNCTIONS = {
    "a == b": lambda a, b: a == b,
    "a != b": lambda a, b: a != b,
    "a < b": lambda a, b: a < b,
    "a > b": lambda a, b: a > b,
    "a <= b": lambda a, b: a <= b,
    "a >= b": lambda a, b: a >= b,
}


class AlwaysEqualProxy(str):
    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


class String:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {"value": ("STRING", {"default": "", "multiline": True})},
        }

    RETURN_TYPES = ("STRING",)

    RETURN_NAMES = ("STRING",)

    FUNCTION = "execute"

    CATEGORY = "Logic"

    def execute(self, value):
        return (value,)


class Int:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {"value": ("INT", {"default": 0})},
        }

    RETURN_TYPES = ("INT",)

    RETURN_NAMES = ("INT",)

    FUNCTION = "execute"

    CATEGORY = "Logic"

    def execute(self, value):
        return (value,)


class Float:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {"value": ("FLOAT", {"default": 0, "step": 0.01})},
        }

    RETURN_TYPES = ("FLOAT",)

    RETURN_NAMES = ("FLOAT",)

    FUNCTION = "execute"

    CATEGORY = "Logic"

    def execute(self, value):
        return (value,)


class Bool:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {"value": ("BOOLEAN", {"default": False})},
        }

    RETURN_TYPES = ("BOOLEAN",)

    RETURN_NAMES = ("BOOLEAN",)

    FUNCTION = "execute"

    CATEGORY = "Logic"

    def execute(self, value):
        return (value,)


class Compare:
    """
    This nodes compares the two inputs and outputs the result of the comparison.
    """

    @classmethod
    def INPUT_TYPES(s):
        """
        Comparison node takes two inputs, a and b, and compares them.
        """
        s.compare_functions = list(COMPARE_FUNCTIONS.keys())
        return {
            "required": {
                "a": (AlwaysEqualProxy("*"), {"default": 0}),
                "b": (AlwaysEqualProxy("*"), {"default": 0}),
                "comparison": (s.compare_functions, {"default": "a == b"}),
            },
        }

    RETURN_TYPES = ("BOOLEAN",)

    RETURN_NAMES = ("BOOLEAN",)

    FUNCTION = "compare"

    CATEGORY = "Logic"

    def compare(self, a, b, comparison):
        """
        Compare two inputs and return the result of the comparison.

        Args:
            a (UNKNOWN): The first input.
            b (UNKNOWN): The second input.
            comparison (STRING): The comparison to perform. Can be one of "==", "!=", "<", ">", "<=", ">=".

        Returns:
            : The result of the comparison.
        """
        return (COMPARE_FUNCTIONS[comparison](a, b),)


class IfExecute:
    """
    This node executes IF_TRUE if ANY is True, otherwise it executes IF_FALSE.

    ANY can be any input, IF_TRUE and IF_FALSE can be any output.
    """

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "ANY": (AlwaysEqualProxy("*"),),
                "IF_TRUE": (AlwaysEqualProxy("*"),),
                "IF_FALSE": (AlwaysEqualProxy("*"),),
            },
        }

    RETURN_TYPES = (AlwaysEqualProxy("*"),)

    OUTPUT_TOOLTIPS = (
        "Based on the value of ANY, either IF_TRUE or IF_FALSE will be returned.",
    )

    RETURN_NAMES = ("?",)

    FUNCTION = "return_based_on_bool"

    CATEGORY = "Logic"

    def return_based_on_bool(self, ANY, IF_TRUE, IF_FALSE):
        return (IF_TRUE if ANY else IF_FALSE,)


class IfExecuteNode:
    """
    This node lets you choose from all nodes and execute the selected one when ANY is True.
    """

    @classmethod
    def INPUT_TYPES(cls):
        cls.node_names = list(nodes.NODE_CLASS_MAPPINGS.keys())
        return {
            "required": {
                "ANY": (AlwaysEqualProxy("*"),),
                "NODE_TRUE": (cls.node_names, {"default": cls.node_names[0]}),
                "NODE_FALSE": (cls.node_names, {"default": cls.node_names[0]}),
            },
        }

    RETURN_TYPES = ()

    OUTPUT_NODE = True

    CATEGORY = "Logic"

    FUNCTION = "execute"

    def execute(self, ANY, NODE_TRUE, NODE_FALSE):
        if ANY:
            return self.execute_node(NODE_TRUE)
        else:
            return self.execute_node(NODE_FALSE)

    def execute_node(self, node_name):
        node = nodes.NODE_CLASS_MAPPINGS[node_name]()
        return node.execute()


class DebugPrint:
    """
    This node prints the input to the console.
    """

    @classmethod
    def INPUT_TYPES(s):
        """
        Takes in any input.

        """
        return {"required": {"ANY": (AlwaysEqualProxy({}),)}}

    RETURN_TYPES = ()

    OUTPUT_NODE = True

    FUNCTION = "log_input"

    CATEGORY = "Logic"

    def log_input(self, ANY):
        print(ANY)
        return {}

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
                "input_1": (any_type,),
                "input_2": (any_type,),
            }
        }

    RETURN_TYPES = (any_type,)
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

