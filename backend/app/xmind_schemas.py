from pydantic import BaseModel, ConfigDict, Field

from .services.xmind_skill import GeneratedFunctionalCase, MAX_GENERATED_CASES


class XMindConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    uploader_id: int = Field(default=1, gt=0)
    module_mapping: dict[str, str] = Field(min_length=1, max_length=200)
    cases: list[GeneratedFunctionalCase] = Field(
        min_length=1,
        max_length=MAX_GENERATED_CASES,
    )


class XMindTaskConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    module_mapping: dict[str, str] = Field(min_length=1, max_length=200)


class XMindExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cases: list[GeneratedFunctionalCase] = Field(
        min_length=1,
        max_length=MAX_GENERATED_CASES,
    )
