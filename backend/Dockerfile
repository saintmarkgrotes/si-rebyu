FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# IMPORTANT: exactly one worker. The AI rate limiter and the in-memory auth-token cache are both
# per-process; running more than one worker would let each process send its own full quota of
# requests to the AI provider, multiplying past the configured per-minute limit. If this backend
# ever needs to scale beyond one process, the rate limiter has to move to a shared store first
# (e.g. Redis) -- don't just raise this number.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
