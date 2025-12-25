from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .session import Base


class AssignmentType(str, enum.Enum):
    
    TEXT = "text"
    VOICE = "voice"
    BOTH = "both"
    


class SubmissionStatus(str, enum.Enum):
    
    PENDING = "pending"
    SUBMITTED = "submitted"
    GRADED = "graded"
    RETURNED = "returned"
    


class Assignment(Base):
    
    __tablename__ = "assignments"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=False)
    
    # * Assignment type
    assignment_type = Column(Enum(AssignmentType), default=AssignmentType.BOTH)
    
    # * Audio version of instructions
    instructions_audio_url = Column(String(500), nullable=True)
    
    # * Grading
    max_score = Column(Integer, default=100)
    
    # * Deadlines
    due_date = Column(DateTime, nullable=True)
    allow_late_submission = Column(Boolean, default=False)
    
    # * Status
    is_published = Column(Boolean, default=False)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    course = relationship("Course", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Assignment {self.title}>"


class Submission(Base):
    
    __tablename__ = "submissions"
    
    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # * Submission content
    text_answer = Column(Text, nullable=True)
    voice_answer_url = Column(String(500), nullable=True)
    voice_answer_transcript = Column(Text, nullable=True)  # ? STT output
    
    # * File attachments (if any)
    attachment_url = Column(String(500), nullable=True)
    
    # * Grading
    score = Column(Integer, nullable=True)
    status = Column(Enum(SubmissionStatus), default=SubmissionStatus.PENDING)
    
    # * Late submission
    is_late = Column(Boolean, default=False)
    
    # * Timestamps
    submitted_at = Column(DateTime, default=datetime.now)
    graded_at = Column(DateTime, nullable=True)
    
    # * Relationships
    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("User", back_populates="submissions")
    feedback = relationship("Feedback", back_populates="submission", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Submission Assignment:{self.assignment_id} Student:{self.student_id}>"



def get_assignments_by_course(db, course_id: int):
    return db.query(Assignment).filter(Assignment.course_id == course_id).all()


def get_assignment(db, assignment_id: int):
    return db.query(Assignment).filter(Assignment.id == assignment_id).first()

