import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from ..dependencies import get_session
from ..services import xmind

router = APIRouter(prefix="/api/v1/xmind", tags=["xmind"])


@router.post("/upload-parse", status_code=status.HTTP_201_CREATED)
async def upload_and_parse_xmind(
    request: Request,
    file: Annotated[UploadFile, File()],
    uploader_id: Annotated[int, Form()] = 1,
    save_cases: Annotated[bool, Form()] = False,
    module_mapping: Annotated[str | None, Form()] = None,
    session: Session = Depends(get_session),
) -> dict:
    original_name = file.filename or "upload.xmind"
    if not original_name.lower().endswith(".xmind"):
        raise HTTPException(status_code=415, detail="Only .xmind files are supported")
    content = await file.read(xmind.MAX_UPLOAD_BYTES + 1)
    parsed_mapping = None
    if save_cases:
        if not module_mapping:
            raise HTTPException(
                status_code=422, detail="module_mapping is required when save_cases is true"
            )
        try:
            parsed_mapping = json.loads(module_mapping)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=422, detail="module_mapping must be valid JSON") from error
        if not isinstance(parsed_mapping, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in parsed_mapping.items()
        ):
            raise HTTPException(status_code=422, detail="module_mapping must be a string map")
    try:
        return xmind.save_upload(
            session,
            original_name=original_name,
            content=content,
            uploader_id=uploader_id,
            upload_dir=Path(request.app.state.upload_dir),
            module_mapping=parsed_mapping,
        )
    except xmind.XMindParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
