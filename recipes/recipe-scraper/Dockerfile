FROM python:3.12-slim

WORKDIR /app

# lxml sometimes needs these on ARM
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8010

# If you see slow scraping, you can bump workers later.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010"]
