from fastapi import APIRouter

from app.api.routes import auth, entries, groups, receipts, users

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(groups.router)
api_router.include_router(entries.router)
api_router.include_router(receipts.router)
