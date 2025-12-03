"""
@author: Beyond Prompting
@title: Beyond Nodes
@nickname: Beyond Nodes
@description: Beyond Node Packages
"""

from .node_mappings import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

print("------------------------------------------")    
print("\033[34mBeyond Nodes Packages v0.1 : \033[92m 175 Nodes Loaded\033[0m")
print("------------------------------------------") 
print("** ") 
print("** ") 
print("------------------------------------------") 

EXTENSION_NAME = "Beyond Nodes Packages"

WEB_DIRECTORY = "./web"

# Additional web resources to ensure they're loaded
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]