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
    session: Session = Depends(get_session),
) -> dict:
    original_name = file.filename or "upload.xmind"
    if not original_name.lower().endswith(".xmind"):
        raise HTTPException(status_code=415, detail="Only .xmind files are supported")
    content = await file.read(xmind.MAX_UPLOAD_BYTES + 1)
    try:
        return xmind.save_upload(
            session,
            original_name=original_name,
            content=content,
            uploader_id=uploader_id,
            upload_dir=Path(request.app.state.upload_dir),
        )
    except xmind.XMindParseError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
