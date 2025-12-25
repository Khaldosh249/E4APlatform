from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .session import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


class User(Base):
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.STUDENT)
    
    # * Accessibility preferences
    is_blind = Column(Boolean, default=False)
    voice_speed = Column(Integer, default=1)  # ? 1 = normal, 2 = fast, 0 = slow
    preferred_language = Column(String(10), default="en")
    
    # * Account status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    verification_token = Column(String(255), nullable=True)
    reset_token = Column(String(255), nullable=True)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    last_login = Column(DateTime, nullable=True)
    
    # * Relationships
    # * Students
    enrollments = relationship("Enrollment", back_populates="student", foreign_keys="Enrollment.student_id")
    submissions = relationship("Submission", back_populates="student")
    quiz_attempts = relationship("QuizAttempt", back_populates="student")
    feedback_received = relationship("Feedback", foreign_keys="Feedback.student_id", back_populates="student")
    
    # * Teachers
    courses_taught = relationship("Course", back_populates="teacher")
    feedback_given = relationship("Feedback", foreign_keys="Feedback.teacher_id", back_populates="teacher")
    
    def __repr__(self):
        return f"<User {self.email} ({self.role})>"
