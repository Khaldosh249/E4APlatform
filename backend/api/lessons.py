from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from db.session import get_db
from db.users import User, UserRole
from db.courses import Course
from db.lessons import Lesson, LessonAudio, LessonProgress
from api.schemas.lessons import (
    LessonCreate, LessonUpdate, LessonResponse,
    LessonProgressResponse, LessonProgressUpdate
)
from api.dependencies import get_current_user, get_teacher_user
from core.tts import generate_tts_audio
from datetime import datetime

router = APIRouter(prefix="/lessons", tags=["Lessons"])


def lesson_to_response(lesson: Lesson, db: Session) -> dict:
    """Convert lesson model to response dict with audio_url"""
    lesson_audio = db.query(LessonAudio).filter(LessonAudio.lesson_id == lesson.id).first()
    
    return {
        "id": lesson.id,
        "course_id": lesson.course_id,
        "title": lesson.title,
        "description": lesson.description,
        "content_text": lesson.content_text,
        "content_type": lesson.content_type,
        "order_index": lesson.order_index,
        "file_url": lesson.file_url,
        "audio_url": lesson_audio.audio_url if lesson_audio else None,
        "duration": lesson.duration,
        "duration_minutes": lesson.duration // 60 if lesson.duration else 10,
        "is_published": lesson.is_published,
        "created_at": lesson.created_at,
        "updated_at": lesson.updated_at
    }


@router.get("/course/{course_id}", response_model=List[LessonResponse])
def get_course_lessons(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all lessons for a course"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    query = db.query(Lesson).filter(Lesson.course_id == course_id)
    
    # Students can only see published lessons
    if current_user.role == UserRole.STUDENT:
        query = query.filter(Lesson.is_published == True)
    
    lessons = query.order_by(Lesson.order_index).all()
    return [lesson_to_response(lesson, db) for lesson in lessons]


@router.get("/{lesson_id}", response_model=LessonResponse)
def get_lesson(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get lesson by ID"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found"
        )
    
    # Check permissions
    if current_user.role == UserRole.STUDENT and not lesson.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lesson is not published"
        )
    
    return lesson_to_response(lesson, db)
    
    return lesson


@router.post("/", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
def create_lesson(
    lesson_data: LessonCreate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Create a new lesson (Teacher/Admin only)"""
    # Verify course ownership
    course = db.query(Course).filter(Course.id == lesson_data.course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to add lessons to this course"
        )
    
    new_lesson = Lesson(
        course_id=lesson_data.course_id,
        title=lesson_data.title,
        description=lesson_data.description,
        content_text=lesson_data.content_text,
        content_type=lesson_data.content_type,
        order_index=lesson_data.order_index
    )
    
    db.add(new_lesson)
    db.commit()
    db.refresh(new_lesson)
    
    # Generate TTS audio for text content
    if lesson_data.content_text:
        audio_url = generate_tts_audio(
            lesson_data.content_text,
            language="en",
            filename=f"lesson_{new_lesson.id}.mp3"
        )
        
        if audio_url:
            lesson_audio = LessonAudio(
                lesson_id=new_lesson.id,
                audio_url=audio_url,
                language="en",
                is_processed=True
            )
            db.add(lesson_audio)
            db.commit()
    
    return new_lesson


@router.put("/{lesson_id}", response_model=LessonResponse)
def update_lesson(
    lesson_id: int,
    lesson_data: LessonUpdate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Update lesson (Teacher/Admin only)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this lesson"
        )
    
    # Update fields
    update_data = lesson_data.model_dump(exclude_unset=True)
    
    # If content_text is updated, regenerate TTS
    if "content_text" in update_data and update_data["content_text"]:
        audio_url = generate_tts_audio(
            update_data["content_text"],
            language="en",
            filename=f"lesson_{lesson_id}.mp3"
        )
        
        if audio_url:
            # Update or create lesson audio
            lesson_audio = db.query(LessonAudio).filter(
                LessonAudio.lesson_id == lesson_id
            ).first()
            
            if lesson_audio:
                lesson_audio.audio_url = audio_url
                lesson_audio.is_processed = True
            else:
                lesson_audio = LessonAudio(
                    lesson_id=lesson_id,
                    audio_url=audio_url,
                    language="en",
                    is_processed=True
                )
                db.add(lesson_audio)
    
    for field, value in update_data.items():
        setattr(lesson, field, value)
    
    db.commit()
    db.refresh(lesson)
    
    return lesson


@router.delete("/{lesson_id}")
def delete_lesson(
    lesson_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Delete lesson (Teacher/Admin only)"""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == lesson.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this lesson"
        )
    
    db.delete(lesson)
    db.commit()
    
    return {"message": "Lesson deleted successfully"}


@router.get("/progress/course/{course_id}", response_model=List[LessonProgressResponse])
def get_course_progress(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's progress for all lessons in a course"""
    # Get all lesson IDs for this course
    lesson_ids = db.query(Lesson.id).filter(Lesson.course_id == course_id).all()
    lesson_ids = [l[0] for l in lesson_ids]
    
    # Get progress for these lessons
    progress_list = db.query(LessonProgress).filter(
        LessonProgress.lesson_id.in_(lesson_ids),
        LessonProgress.student_id == current_user.id
    ).all()
    
    return progress_list


@router.get("/{lesson_id}/progress", response_model=LessonProgressResponse)
def get_lesson_progress(
    lesson_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's progress for a lesson (creates if not exists)"""
    progress = db.query(LessonProgress).filter(
        LessonProgress.lesson_id == lesson_id,
        LessonProgress.student_id == current_user.id
    ).first()
    
    if not progress:
        # Create new progress entry
        progress = LessonProgress(
            student_id=current_user.id,
            lesson_id=lesson_id
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
    
    return progress


@router.put("/{lesson_id}/progress", response_model=LessonProgressResponse)
def update_lesson_progress(
    lesson_id: int,
    progress_data: LessonProgressUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update student's progress for a lesson"""
    progress = db.query(LessonProgress).filter(
        LessonProgress.lesson_id == lesson_id,
        LessonProgress.student_id == current_user.id
    ).first()
    
    if not progress:
        progress = LessonProgress(
            student_id=current_user.id,
            lesson_id=lesson_id
        )
        db.add(progress)
    
    # Update fields
    update_data = progress_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(progress, field, value)
    
    # Update completion status
    if progress_data.completed:
        progress.is_completed = True
        progress.completed_at = datetime.now()
        progress.completion_percentage = 100
    
    db.commit()
    db.refresh(progress)
    
    return progress
