from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Callable, Optional

from bs4 import BeautifulSoup
from PIL import Image

try:
    from PyPDF2 import PdfReader
except ImportError:  # pragma: no cover - compatibility for older PyPDF2
    from PyPDF2 import PdfFileReader as PdfReader

try:
    import docx
except ImportError:  # pragma: no cover - dependency is declared in requirements
    docx = None


VisionExtractor = Callable[[str, str, bytes], str]


@dataclass
class ParsedDocument:
    text: str
    file_type: str
    metadata: dict = field(default_factory=dict)


class UnsupportedSourceFileError(ValueError):
    pass


class EmptyExtractedTextError(ValueError):
    pass


class VisionExtractorRequiredError(ValueError):
    pass


class DocumentParser:
    SUPPORTED_EXTENSIONS = {
        ".txt",
        ".md",
        ".pdf",
        ".docx",
        ".html",
        ".htm",
        ".png",
        ".jpg",
        ".jpeg",
        ".bmp",
    }
    IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp"}

    @classmethod
    def extract_from_bytes(
        cls,
        filename: str,
        data: bytes,
        vision_extractor: Optional[VisionExtractor] = None,
    ) -> ParsedDocument:
        extension = Path(filename).suffix.lower()
        if extension not in cls.SUPPORTED_EXTENSIONS:
            raise UnsupportedSourceFileError(f"不支持的源文件类型: {extension or filename}")

        if extension in {".txt", ".md"}:
            text = cls._extract_text(data)
            file_type = extension.lstrip(".")
            metadata = {"encoding": cls._detect_encoding(data)}
        elif extension in {".html", ".htm"}:
            text = cls._extract_html(data)
            file_type = "html"
            metadata = {}
        elif extension == ".pdf":
            text = cls._extract_pdf(data)
            file_type = "pdf"
            metadata = {}
        elif extension == ".docx":
            text = cls._extract_docx(data)
            file_type = "docx"
            metadata = {}
        else:
            text, metadata = cls._extract_image(filename, extension, data, vision_extractor)
            file_type = extension.lstrip(".")

        text = (text or "").strip()
        if not text:
            raise EmptyExtractedTextError("源文件未解析出有效文本内容")

        return ParsedDocument(text=text, file_type=file_type, metadata=metadata)

    @staticmethod
    def _detect_encoding(data: bytes) -> str:
        for encoding in ("utf-8-sig", "utf-8", "gbk"):
            try:
                data.decode(encoding)
                return encoding
            except UnicodeDecodeError:
                continue
        return "utf-8"

    @classmethod
    def _extract_text(cls, data: bytes) -> str:
        encoding = cls._detect_encoding(data)
        return data.decode(encoding, errors="replace")

    @classmethod
    def _extract_html(cls, data: bytes) -> str:
        html = cls._extract_text(data)
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.extract()
        return soup.get_text(separator="\n", strip=True)

    @staticmethod
    def _extract_pdf(data: bytes) -> str:
        reader = PdfReader(BytesIO(data))
        parts = []
        for page in reader.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                parts.append(page_text.strip())
        return "\n".join(parts)

    @staticmethod
    def _extract_docx(data: bytes) -> str:
        if docx is None:
            raise UnsupportedSourceFileError("当前环境缺少 python-docx，无法解析 Word 文档")

        document = docx.Document(BytesIO(data))
        parts = []
        parts.extend(paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip())
        for table in document.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    parts.append(" | ".join(cells))
        return "\n".join(parts)

    @staticmethod
    def _extract_image(
        filename: str,
        extension: str,
        data: bytes,
        vision_extractor: Optional[VisionExtractor],
    ) -> tuple[str, dict]:
        if vision_extractor is None:
            raise VisionExtractorRequiredError("图片源文件需要配置视觉解析模型")

        content_type = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".bmp": "image/png",
        }[extension]
        image_data = data
        metadata = {"vision_content_type": content_type}

        if extension == ".bmp":
            with Image.open(BytesIO(data)) as image:
                converted = BytesIO()
                image.convert("RGB").save(converted, format="PNG")
                image_data = converted.getvalue()
            metadata["converted_from"] = "bmp"

        return vision_extractor(filename, content_type, image_data), metadata
