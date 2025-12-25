from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CourseBase(BaseModel):
    title: str
    description: Optional[str] = None
    subject_code: Optional[str] = None


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    subject_code: Optional[str] = None
    is_active: Optional[bool] = None
    is_published: Optional[bool] = None


class CourseResponse(CourseBase):
    id: int
    teacher_id: int
    is_active: bool
    is_published: bool
    has_audio_intro: bool
    audio_intro_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class EnrollmentResponse(BaseModel):
    id: int
    student_id: int
    course_id: int
    progress_percentage: int
    is_active: bool
    completed: bool
    enrolled_at: datetime
    course: CourseResponse
    
    class Config:
        from_attributes = True
