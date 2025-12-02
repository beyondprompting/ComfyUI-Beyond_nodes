import os
import logging

CONFIG = {
    "loglevel": int(os.environ.get("BEYOND_NODES_LOGLEVEL", logging.INFO)),
    "indent": int(os.environ.get("BEYOND_NODES_INDENT", 2))
}
