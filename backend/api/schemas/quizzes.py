from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from db.quizzes import QuestionType


class QuestionCreate(BaseModel):
    
    question_text: str
    question_type: QuestionType
    points: int = 1
    order_index: int = 0
    correct_answer: Optional[str] = None
    options: Optional[str] = None  # JSON string
    explanation: Optional[str] = None
    


class QuestionResponse(QuestionCreate):
    id: int
    quiz_id: int
    question_audio_url: Optional[str] = None
    explanation_audio_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class QuizBase(BaseModel):
    title: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    time_limit: Optional[int] = None
    max_score: int = 100
    passing_score: int = 60
    max_attempts: int = 0
    shuffle_questions: bool = False
    show_results_immediately: bool = True


class QuizCreate(QuizBase):
    course_id: int


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    time_limit: Optional[int] = None
    max_score: Optional[int] = None
    passing_score: Optional[int] = None
    max_attempts: Optional[int] = None
    is_published: Optional[bool] = None


class QuizResponse(QuizBase):
    id: int
    course_id: int
    instructions_audio_url: Optional[str] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    is_published: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class AnswerSubmit(BaseModel):
    question_id: int
    answer_text: Optional[str] = None


class QuizSubmit(BaseModel):
    answers: list[AnswerSubmit]


class QuizAttemptResponse(BaseModel):
    id: int
    quiz_id: int
    student_id: int
    attempt_number: int
    score: float
    max_score: int
    percentage: float
    passed: bool
    time_started: datetime
    time_submitted: Optional[datetime] = None
    time_taken: Optional[int] = None
    is_completed: bool
    is_graded: bool
    
    class Config:
        from_attributes = True
