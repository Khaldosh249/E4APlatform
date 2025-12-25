from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .session import Base


class FeedbackType(str, enum.Enum):
    
    ASSIGNMENT = "assignment"
    GENERAL = "general"
    PROGRESS = "progress"
    


class Feedback(Base):
    
    __tablename__ = "feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=True)
    
    feedback_type = Column(Enum(FeedbackType), default=FeedbackType.GENERAL)
    
    # * Feedback content
    text_feedback = Column(Text, nullable=True)
    voice_feedback_url = Column(String(500), nullable=True)
    
    # * Status
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    teacher = relationship("User", foreign_keys=[teacher_id], back_populates="feedback_given")
    student = relationship("User", foreign_keys=[student_id], back_populates="feedback_received")
    submission = relationship("Submission", back_populates="feedback")
    
    def __repr__(self):
        return f"<Feedback Teacher:{self.teacher_id} -> Student:{self.student_id}>"
