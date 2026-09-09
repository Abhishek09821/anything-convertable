import os
from pydantic import BaseModel

class Settings(BaseModel):
    app_name: str = 'Anything Convertable API'
    cors_origins: list[str] = [
        'http://localhost:3000',
        'http://localhost:5173',
    ]
    openai_api_key: str | None = os.getenv('OPENAI_API_KEY')
    vision_model: str = os.getenv('VISION_MODEL', 'gpt-4o-mini')
    max_upload_mb: int = int(os.getenv('MAX_UPLOAD_MB', '50'))

settings = Settings()
