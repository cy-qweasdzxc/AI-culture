FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/pyproject.toml ./
COPY backend/requirements.lock ./
COPY backend/app ./app
RUN pip install --no-cache-dir -c requirements.lock .
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/scripts ./scripts
COPY data/demo ./data/demo
COPY data/suzhou ./data/suzhou
# Evaluation inputs ship with the image so the retrieval/live tooling can run inside the
# container without a manual `docker cp`. Reviewed corpora and result files stay out.
COPY data/raw ./data/raw
COPY data/testsets ./data/testsets
COPY data/templates ./data/templates
RUN useradd --create-home --uid 10001 citystory && chown -R citystory:citystory /app
USER citystory
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" || exit 1
CMD ["sh", "-c", "alembic upgrade head && python scripts/seed.py && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
