from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

from api.auth import router as auth_router
from api.users import router as users_router
from api.courses import router as courses_router
from api.lessons import router as lessons_router
from api.assignments import router as assignments_router
from api.quizzes import router as quizzes_router
from api.feedback import router as feedback_router
from api.voice import router as voice_router

from db.models import create_tables

# Create audio directory
Path("media/audio").mkdir(parents=True, exist_ok=True)
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    
    # Startup code
    create_tables()
    print("✅ Database tables initialized successfully!")
    
    yield
    # Shutdown code
    

app = FastAPI(
    title="E4A Learning Platform API",
    description="Accessible learning platform for all students including visually impaired users",
    version="1.0.0",
    lifespan=lifespan,
)

ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# static files
app.mount("/media", StaticFiles(directory="media"), name="media")

# routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(courses_router)
app.include_router(lessons_router)
app.include_router(assignments_router)
app.include_router(quizzes_router)
app.include_router(feedback_router)
app.include_router(voice_router)

@app.get("/")
def root():
    return {
        "message": "Welcome to E4A Learning Platform API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}




