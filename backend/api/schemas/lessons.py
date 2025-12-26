from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.lessons import ContentType


class LessonBase(BaseModel):
    title: str
    description: Optional[str] = None
    content_text: Optional[str] = None
    content_type: ContentType = ContentType.TEXT
    order_index: int = 0


class LessonCreate(LessonBase):
    course_id: int


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content_text: Optional[str] = None
    content_type: Optional[ContentType] = None
    order_index: Optional[int] = None
    is_published: Optional[bool] = None


class LessonResponse(LessonBase):
    id: int
    course_id: int
    file_url: Optional[str] = None
    audio_url: Optional[str] = None
    duration: Optional[int] = None
    duration_minutes: Optional[int] = None
    is_published: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class LessonProgressResponse(BaseModel):
    id: int
    student_id: int
    lesson_id: int
    is_completed: bool
    completion_percentage: int
    time_spent: int
    last_position: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    last_accessed: datetime
    
    # Alias for frontend compatibility
    @property
    def completed(self) -> bool:
        return self.is_completed
    
    class Config:
        from_attributes = True


class LessonProgressUpdate(BaseModel):
    completion_percentage: Optional[int] = None
    time_spent: Optional[int] = None
    last_position: Optional[int] = None
    completed: Optional[bool] = None
