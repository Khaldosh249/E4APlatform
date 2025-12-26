from typing import Optional
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .session import Base


class ContentType(str, enum.Enum):
    
    TEXT = "text"
    PDF = "pdf"
    DOC = "doc"
    AUDIO = "audio"
    VIDEO = "video"
    


class Lesson(Base):
    
    __tablename__ = "lessons"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    content_text = Column(Text, nullable=True)  # ? Original text content
    
    # * File information
    content_type = Column(Enum(ContentType), default=ContentType.TEXT)
    file_url = Column(String(500), nullable=True)  # ? PDF/DOC URL
    
    # * Ordering
    order_index = Column(Integer, default=0)
    
    # * Duration (in seconds, for audio)
    duration = Column(Integer, nullable=True)
    
    # * Status
    is_published = Column(Boolean, default=False)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    course = relationship("Course", back_populates="lessons")
    lesson_audio = relationship("LessonAudio", back_populates="lesson", cascade="all, delete-orphan")
    progress = relationship("LessonProgress", back_populates="lesson", cascade="all, delete-orphan")
    
    @property
    def duration_minutes(self) -> Optional[int]:
        if self.duration:
            return self.duration // 60
        return None
    
    def __repr__(self):
        return f"<Lesson {self.title}>"


class LessonAudio(Base):
    
    __tablename__ = "lesson_audio"
    
    id = Column(Integer, primary_key=True, index=True)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    
    # * Audio file details
    audio_url = Column(String(500), nullable=False)
    audio_format = Column(String(10), default="mp3")  # ? mp3, wav, ogg
    file_size = Column(Integer, nullable=True)  # ? in bytes
    duration = Column(Integer, nullable=True)  # ? in seconds
    
    # * TTS metadata
    language = Column(String(10), default="en")
    voice_name = Column(String(100), nullable=True)  # e.g., "en-US-Neural2-A"
    
    # * Processing status
    is_processed = Column(Boolean, default=False)
    processing_error = Column(Text, nullable=True)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # * Relationships
    lesson = relationship("Lesson", back_populates="lesson_audio")
    
    def __repr__(self):
        return f"<LessonAudio for Lesson:{self.lesson_id}>"


class LessonProgress(Base):
    
    __tablename__ = "lesson_progress"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    lesson_id = Column(Integer, ForeignKey("lessons.id"), nullable=False)
    
    # * Progress tracking
    is_completed = Column(Boolean, default=False)
    completion_percentage = Column(Integer, default=0)
    time_spent = Column(Integer, default=0)  # ? in seconds
    
    # * Last position (for audio playback resume)
    last_position = Column(Integer, default=0)  # ? in seconds
    
    # * Timestamps
    started_at = Column(DateTime, default=datetime.now)
    completed_at = Column(DateTime, nullable=True)
    last_accessed = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    lesson = relationship("Lesson", back_populates="progress")
    
    def __repr__(self):
        return f"<LessonProgress Student:{self.student_id} Lesson:{self.lesson_id}>"


def get_lessons_by_course(db, course_id: int):
    return db.query(Lesson).filter(Lesson.course_id == course_id).order_by(Lesson.order_index).all()

def get_lesson(db, lesson_id: int):
    return db.query(Lesson).filter(Lesson.id == lesson_id).first()
