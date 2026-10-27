FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
# Fetch the recognition models at build time, so the container needs no network at run time.
RUN python -c "from rapidocr import RapidOCR; RapidOCR()"
USER nobody
EXPOSE 8000
CMD ["python", "server.py"]
