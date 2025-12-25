"""
Central import file for all database models
Import this to use all models in your application
"""

from .session import Base, engine, get_db
from .users import User, UserRole
from .courses import Course, Enrollment
from .lessons import Lesson, LessonAudio, LessonProgress, ContentType
from .assignments import Assignment, Submission, AssignmentType, SubmissionStatus
from .quizzes import Quiz, Question, QuizAttempt, Answer, QuestionType
from .feedback import Feedback, FeedbackType
from .voice_logs import VoiceLog, VoiceActionType


# Create all tables
def create_tables():
    """
    Create all database tables
    Call this function once during initial setup
    """
    Base.metadata.create_all(bind=engine)
    print("✅ All database tables created successfully!")


# Drop all tables (use with caution!)
def drop_tables():
    """
    Drop all database tables
    WARNING: This will delete all data!
    """
    Base.metadata.drop_all(bind=engine)
    print("⚠️ All database tables dropped!")


# Export all models
__all__ = [
    # Session
    "Base",
    "engine",
    "get_db",
    
    # Users
    "User",
    "UserRole",
    
    # Courses
    "Course",
    "Enrollment",
    
    # Lessons
    "Lesson",
    "LessonAudio",
    "LessonProgress",
    "ContentType",
    
    # Assignments
    "Assignment",
    "Submission",
    "AssignmentType",
    "SubmissionStatus",
    
    # Quizzes
    "Quiz",
    "Question",
    "QuizAttempt",
    "Answer",
    "QuestionType",
    
    # Feedback
    "Feedback",
    "FeedbackType",
    
    # Voice Logs
    "VoiceLog",
    "VoiceActionType",
    
    # Utility functions
    "create_tables",
    "drop_tables",
]
