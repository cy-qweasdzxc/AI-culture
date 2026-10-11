import logging
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes.admin import router as admin_router
from app.api.routes.ai import router as ai_router
from app.api.routes.public import router as public_router
from app.core.config import get_settings
from app.core.errors import DomainError

settings = get_settings()
app = FastAPI(title="城迹入戏 API", version="0.2.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "Authorization"])


@app.middleware("http")
async def browser_origin_check(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin:
        parsed = urlparse(origin)
        same_host = parsed.netloc == request.headers.get("host") and parsed.scheme in {"http", "https"}
        if origin not in settings.origins and not same_host:
            return JSONResponse(status_code=403, content={"error": {"code": "ORIGIN_REJECTED", "message": "请求来源未获允许。"}})
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(DomainError)
async def domain_error_handler(_request: Request, error: DomainError):
    content = {"code": error.code, "message": error.message}
    if error.details is not None:
        content["details"] = error.details
    return JSONResponse(status_code=error.status, content={"error": content})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError):
    # Pydantic inputs can contain passwords and arbitrary user text: expose locations/types only.
    details = [{"location": list(item["loc"]), "type": item["type"]} for item in error.errors()]
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "请求字段无效。", "details": details}})


@app.exception_handler(SQLAlchemyError)
async def database_error_handler(_request: Request, error: SQLAlchemyError):
    logging.getLogger("citystory").error("Database operation failed: %s", type(error).__name__)
    return JSONResponse(status_code=503, content={"error": {"code": "DATABASE_UNAVAILABLE", "message": "数据服务暂不可用，请稍后重试。"}})


@app.exception_handler(Exception)
async def unexpected_error_handler(_request: Request, error: Exception):
    logging.getLogger("citystory").error("Unhandled service error: %s", type(error).__name__)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "服务暂不可用，请稍后重试。"}})


app.include_router(public_router)
app.include_router(ai_router)
app.include_router(admin_router)
