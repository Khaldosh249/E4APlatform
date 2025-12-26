from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from db.session import get_db, SessionLocal
from db.users import User, UserRole
from db.courses import Course, Enrollment
from db.lessons import Lesson, LessonAudio, LessonProgress
from api.schemas.lessons import (
    LessonCreate, LessonUpdate, LessonResponse,
    LessonProgressResponse, LessonProgressUpdate
)
from api.dependencies import get_current_user, get_teacher_user
from core.tts import generate_tts_audio
from datetime import datetime

router = APIRouter(prefix="/lessons", tags=["Lessons"])


def generate_tts_background(lesson_id: int, content_text: str, language: str = "en"):
    """Background task to generate TTS audio for a lesson"""
    db = SessionLocal()
    try:
        audio_url = generate_tts_audio(
            content_text,
            language=language,
            filename=f"lesson_{lesson_id}.mp3"
        )
        
        if audio_url:
            # Check if audio record already exists
            lesson_audio = db.query(LessonAudio).filter(
                LessonAudio.lesson_id == lesson_id
            ).first()
            
            if lesson_audio:
                lesson_audio.audio_url = audio_url
                lesson_audio.is_processed = True
                lesson_audio.processing_error = None
            else:
                lesson_audio = LessonAudio(
                    lesson_id=lesson_id,
                    audio_url=audio_url,
                    language=language,
                    is_processed=True
                )
                db.add(lesson_audio)
            
            db.commit()
            print(f"TTS audio generated successfully for lesson {lesson_id}")
        else:
            # Mark as failed
            lesson_audio = db.query(LessonAudio).filter(
                LessonAudio.lesson_id == lesson_id
            ).first()
            if lesson_audio:
                lesson_audio.processing_error = "Failed to generate audio"
                db.commit()
    except Exception as e:
        print(f"Error generating TTS for lesson {lesson_id}: {e}")
        # Mark as failed
        lesson_audio = db.query(LessonAudio).filter(
            LessonAudio.lesson_id == lesson_id
        ).first()
        if lesson_audio:
            lesson_audio.processing_error = str(e)
            db.commit()
    finally:
        db.close()


def lesson_to_response(lesson: Lesson, db: Session) -> dict:
    """Convert lesson model to response dict with audio_url"""
    lesson_audio = db.query(LessonAudio).filter(LessonAudio.lesson_id == lesson.id).first()
    
    # Determine TTS status
    tts_status = "none"  # No TTS requested
    if lesson_audio:
        if lesson_audio.processing_error:
            tts_status = "error"
        elif lesson_audio.is_processed and lesson_audio.audio_url:
            tts_status = "ready"
        else:
            tts_status = "processing"
    
    return {
        "id": lesson.id,
        "course_id": lesson.course_id,
        "title": lesson.title,
        "description": lesson.description,
        "content_text": lesson.content_text,
        "content_type": lesson.content_type,
        "order_index": lesson.order_index,
        "file_url": lesson.file_url,
        "audio_url": lesson_audio.audio_url if lesson_audio and lesson_audio.is_processed else None,
        "tts_status": tts_status,
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


@router.post("/", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
def create_lesson(
    lesson_data: LessonCreate,
    background_tasks: BackgroundTasks,
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
        order_index=lesson_data.order_index,
        is_published=lesson_data.is_published
    )
    
    db.add(new_lesson)
    db.commit()
    db.refresh(new_lesson)
    
    # Create a placeholder audio record and generate TTS in background
    if lesson_data.content_text:
        # Create placeholder record to track processing status
        lesson_audio = LessonAudio(
            lesson_id=new_lesson.id,
            audio_url="",  # Will be filled by background task
            language="en",
            is_processed=False  # Mark as processing
        )
        db.add(lesson_audio)
        db.commit()
        
        # Add background task for TTS generation
        background_tasks.add_task(
            generate_tts_background,
            new_lesson.id,
            lesson_data.content_text,
            "en"
        )
    
    return lesson_to_response(new_lesson, db)


@router.put("/{lesson_id}", response_model=LessonResponse)
def update_lesson(
    lesson_id: int,
    lesson_data: LessonUpdate,
    background_tasks: BackgroundTasks,
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
    
    # If content_text is updated, regenerate TTS in background
    if "content_text" in update_data and update_data["content_text"]:
        # Mark existing audio as processing
        lesson_audio = db.query(LessonAudio).filter(
            LessonAudio.lesson_id == lesson_id
        ).first()
        
        if lesson_audio:
            lesson_audio.is_processed = False
            lesson_audio.processing_error = None
        else:
            lesson_audio = LessonAudio(
                lesson_id=lesson_id,
                audio_url="",
                language="en",
                is_processed=False
            )
            db.add(lesson_audio)
        
        # Add background task for TTS generation
        background_tasks.add_task(
            generate_tts_background,
            lesson_id,
            update_data["content_text"],
            "en"
        )
    
    for field, value in update_data.items():
        setattr(lesson, field, value)
    
    db.commit()
    db.refresh(lesson)
    
    return lesson_to_response(lesson, db)


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
        
        # Update course progress will be handled here
        course = progress.lesson.course
        
        enrollment = db.query(Enrollment).filter(
            Enrollment.course_id == course.id,
            Enrollment.student_id == current_user.id
        ).first()
        
        if enrollment:
            # Calculate overall course progress
            total_lessons = db.query(Lesson).filter(Lesson.course_id == course.id, Lesson.is_published == True).count()
            completed_lessons = db.query(LessonProgress).join(Lesson).filter(
                Lesson.course_id == course.id,
                LessonProgress.student_id == current_user.id,
                LessonProgress.is_completed == True
            ).count()
            
            enrollment.progress_percentage = (completed_lessons / total_lessons) * 100 if total_lessons > 0 else 0
            if enrollment.progress_percentage == 100:
                enrollment.completion_date = datetime.now()
                enrollment.completed = True
                
        
        
        
    
    db.commit()
    db.refresh(progress)
    
    return progress
