"""变量渲染工具：把字符串中的 {{var}} 占位符替换为运行时的变量值。"""

import re
from typing import Any

from fastapi import HTTPException


VARIABLE_PATTERN = re.compile(r"{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}")


def render_text(value: str, variables: dict[str, str]) -> str:
    """渲染单条字符串；未定义的变量直接报 422，避免静默遗漏。"""
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in variables:
            raise HTTPException(status_code=422, detail=f"Undefined variable: {name}")
        return variables[name]

    return VARIABLE_PATTERN.sub(replace, value)


def render_value(value: Any, variables: dict[str, str]) -> Any:
    """递归渲染字符串/列表/字典；非字符串原样返回。"""
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
