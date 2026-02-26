"""JSON schema helpers for OpenAI strict mode structured output."""

import json


def schema_for_openai(schema: dict) -> dict:
    """Ensure schema satisfies OpenAI strict mode: additionalProperties=false, required=all properties."""

    def fix_obj(obj: dict) -> None:
        if not isinstance(obj, dict):
            return
        if obj.get("type") == "object":
            obj["additionalProperties"] = False
            props = obj.get("properties", {})
            if props:
                required = set(obj.get("required", []))
                required.update(props.keys())
                obj["required"] = sorted(required)
        for v in obj.values():
            if isinstance(v, dict):
                fix_obj(v)
            elif isinstance(v, list):
                for item in v:
                    if isinstance(item, dict):
                        fix_obj(item)

    result = json.loads(json.dumps(schema))
    fix_obj(result)
    if "$defs" in result:
        fix_obj(result["$defs"])
    return result
