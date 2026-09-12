import os
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Anything Convertable API"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "100"))


settings = Settings()
