from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.assignments import AssignmentType, SubmissionStatus


class AssignmentBase(BaseModel):
    title: str
    description: Optional[str] = None
    instructions: str
    assignment_type: AssignmentType = AssignmentType.BOTH
    max_score: int = 100
    allow_late_submission: bool = False


class AssignmentCreate(AssignmentBase):
    course_id: int
    due_date: Optional[datetime] = None


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    max_score: Optional[int] = None
    due_date: Optional[datetime] = None
    is_published: Optional[bool] = None


class AssignmentResponse(AssignmentBase):
    id: int
    course_id: int
    instructions_audio_url: Optional[str] = None
    due_date: Optional[datetime] = None
    is_published: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class SubmissionCreate(BaseModel):
    assignment_id: int
    text_answer: Optional[str] = None


class SubmissionGrade(BaseModel):
    score: int
    feedback_text: Optional[str] = None


class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    text_answer: Optional[str] = None
    voice_answer_url: Optional[str] = None
    attachment_url: Optional[str] = None
    score: Optional[int] = None
    status: SubmissionStatus
    is_late: bool
    submitted_at: datetime
    graded_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
