"""AWS Lambda entry point — triggered by EventBridge scheduler."""

import os
import sys

# add parent dir to path so main can be imported
sys.path.insert(0, os.path.dirname(__file__))
from main import run


def handler(event, context):
    run()
    return {"statusCode": 200, "body": "ok"}
