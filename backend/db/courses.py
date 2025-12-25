from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .session import Base


class Course(Base):
    
    __tablename__ = "courses"
    
    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    subject_code = Column(String(50), nullable=True)  # ? e.g., "CS101"
    
    # * Accessibility
    has_audio_intro = Column(Boolean, default=False)
    audio_intro_url = Column(String(500), nullable=True)
    
    # * Status
    is_active = Column(Boolean, default=True)
    is_published = Column(Boolean, default=False)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    teacher = relationship("User", back_populates="courses_taught")
    lessons = relationship("Lesson", back_populates="course", cascade="all, delete-orphan")
    assignments = relationship("Assignment", back_populates="course", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="course", cascade="all, delete-orphan")
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    
    
    
    def __repr__(self):
        return f"<Course {self.title}>"


class Enrollment(Base):
    
    __tablename__ = "enrollments"
    
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    
    # * Progress tracking
    progress_percentage = Column(Integer, default=0)
    last_accessed = Column(DateTime, nullable=True)
    
    # * Status
    is_active = Column(Boolean, default=True)
    completed = Column(Boolean, default=False)
    completion_date = Column(DateTime, nullable=True)
    
    # * Timestamps
    enrolled_at = Column(DateTime, default=datetime.now)
    
    # * Relationships
    student = relationship("User", back_populates="enrollments", foreign_keys=[student_id])
    course = relationship("Course", back_populates="enrollments")
    
    def __repr__(self):
        return f"<Enrollment Student:{self.student_id} Course:{self.course_id}>"



def get_user_enrollments(db, user_id: int):
    return db.query(Enrollment).filter(Enrollment.student_id == user_id).all()


def get_courses(db, skip: int = 0, limit: int = 100, published_only: bool = False):
    query = db.query(Course)
    if published_only:
        query = query.filter(Course.is_published == True, Course.is_active == True)
    return query.offset(skip).limit(limit).all()


def get_course(db, course_id: int):
    return db.query(Course).filter(Course.id == course_id).first()

