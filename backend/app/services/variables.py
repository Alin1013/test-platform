import re
from typing import Any

from fastapi import HTTPException


VARIABLE_PATTERN = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}")


def render_text(value: str, variables: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            raise HTTPException(status_code=422, detail=f"Undefined variable: {name}")
        return variables[name]

    return VARIABLE_PATTERN.sub(replace, value)


def render_value(value: Any, variables: dict[str, str]) -> Any:
    if isinstance(value, str):
        return render_text(value, variables)
    if isinstance(value, list):
        return [render_value(item, variables) for item in value]
    if isinstance(value, dict):
        return {
            render_text(str(key), variables): render_value(item, variables)
            for key, item in value.items()
        }
    return value
