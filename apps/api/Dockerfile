FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-impress tesseract-ocr tesseract-ocr-eng \
    tesseract-ocr-hin fonts-liberation fonts-crosextra-carlito fonts-noto-core \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY fonts ./fonts
RUN mkdir -p /usr/local/share/fonts/anything && cp fonts/*.ttf /usr/local/share/fonts/anything/ && fc-cache -f
RUN useradd --create-home converter
USER converter
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
