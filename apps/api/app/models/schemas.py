from pydantic import BaseModel, Field
from typing import Any, Literal

class ReconstructResponse(BaseModel):
    document:dict[str,Any]
    quality:dict[str,Any]
    warnings:list[str]=[]

class EditCommand(BaseModel):
    document:dict[str,Any]
    command:str=Field(min_length=1,max_length=2000)
    selected_id:str|None=None

class ExportRequest(BaseModel):
    document:dict[str,Any]
    format:Literal['pdf','docx','html','svg']
