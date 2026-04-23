FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY simulate-traffic.py prompts.json ./

ENV PYTHONUNBUFFERED=1
USER 1001

CMD ["python", "simulate-traffic.py"]
