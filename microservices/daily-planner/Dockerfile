FROM python:3.12-slim

WORKDIR /app
COPY microservices/daily-planner/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY microservices/daily-planner/main.py .

CMD ["python", "main.py"]
