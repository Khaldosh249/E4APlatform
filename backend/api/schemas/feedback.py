from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.feedback import FeedbackType


class FeedbackCreate(BaseModel):
    student_id: int
    feedback_type: FeedbackType = FeedbackType.GENERAL
    text_feedback: Optional[str] = None
    submission_id: Optional[int] = None


class FeedbackResponse(BaseModel):
    id: int
    teacher_id: int
    student_id: int
    submission_id: Optional[int] = None
    feedback_type: FeedbackType
    text_feedback: Optional[str] = None
    voice_feedback_url: Optional[str] = None
    is_read: bool
    created_at: datetime
    
    class Config:
        from_attributes = True
