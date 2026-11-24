"""
Export OpenAPI JSON Schema directly from FastAPI application.
Inspired by fastapi/full-stack-fastapi-template.
"""
import json
import os
import sys

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app

def export_schema():
    openapi_schema = app.openapi()
    target_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "openapi.json"))
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(openapi_schema, f, indent=2)
    print(f"✅ Successfully exported OpenAPI schema to {target_path}")

if __name__ == "__main__":
    export_schema()
