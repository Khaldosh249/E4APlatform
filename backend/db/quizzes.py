from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .session import Base


class QuestionType(str, enum.Enum):
    
    MCQ = "mcq"  # ? Multiple Choice
    SHORT_ANSWER = "short_answer"
    TRUE_FALSE = "true_false"
    VOICE = "voice"  # ? Voice-based answer
    

class Quiz(Base):
    
    __tablename__ = "quizzes"
    
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    
    # * Audio instructions
    instructions_audio_url = Column(String(500), nullable=True)
    
    # * Quiz settings
    time_limit = Column(Integer, nullable=True)  # ? in minutes, None = no limit
    max_score = Column(Integer, default=100)
    passing_score = Column(Integer, default=60)
    
    # * Attempt settings
    max_attempts = Column(Integer, default=1)  # ? 0 = unlimited
    shuffle_questions = Column(Boolean, default=False)
    show_results_immediately = Column(Boolean, default=True)
    
    # * Deadlines
    available_from = Column(DateTime, nullable=True)
    available_until = Column(DateTime, nullable=True)
    
    # * Status
    is_published = Column(Boolean, default=False)
    is_auto_graded = Column(Boolean, default=True)  # False for manual grading by teacher
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    course = relationship("Course", back_populates="quizzes")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Quiz {self.title}>"


class Question(Base):
    
    __tablename__ = "questions"
    
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    
    question_text = Column(Text, nullable=False)
    question_type = Column(Enum(QuestionType), nullable=False)
    
    # * Audio version of question
    question_audio_url = Column(String(500), nullable=True)
    
    # * Points
    points = Column(Integer, default=1)
    
    # * Order
    order_index = Column(Integer, default=0)
    
    # * Correct answer (for auto-grading)
    correct_answer = Column(Text, nullable=True)  # ? JSON or plain text
    
    # ? For MCQ: options stored as JSON
    # ? Example: {"A": "Option 1", "B": "Option 2", "C": "Option 3", "D": "Option 4"}
    options = Column(Text, nullable=True)  # ? JSON string
    
    # * Explanation (shown after submission)
    explanation = Column(Text, nullable=True)
    explanation_audio_url = Column(String(500), nullable=True)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # * Relationships
    quiz = relationship("Quiz", back_populates="questions")
    answers = relationship("Answer", back_populates="question", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Question {self.id} ({self.question_type})>"


class QuizAttempt(Base):
    
    __tablename__ = "quiz_attempts"
    
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # * Attempt info
    attempt_number = Column(Integer, default=1)
    
    # * Scoring
    score = Column(Float, default=0.0)
    max_score = Column(Integer, nullable=False)
    percentage = Column(Float, default=0.0)
    passed = Column(Boolean, default=False)
    answers_text = Column(Text, nullable=True)  # ? Answers in text
    
    # * Timing
    time_started = Column(DateTime, default=datetime.now)
    time_submitted = Column(DateTime, nullable=True)
    time_taken = Column(Integer, nullable=True)  # ? in seconds
    
    # * Status
    is_completed = Column(Boolean, default=False)
    is_graded = Column(Boolean, default=False)
    
    # * Relationships
    quiz = relationship("Quiz", back_populates="attempts")
    student = relationship("User", back_populates="quiz_attempts")
    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<QuizAttempt Quiz:{self.quiz_id} Student:{self.student_id} #{self.attempt_number}>"


class Answer(Base):
    
    __tablename__ = "answers"
    
    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("quiz_attempts.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    
    # * Student's answer
    answer_text = Column(Text, nullable=True)
    answer_voice_url = Column(String(500), nullable=True)
    answer_voice_transcript = Column(Text, nullable=True)  # ? STT output
    
    # * Grading
    is_correct = Column(Boolean, nullable=True)
    points_earned = Column(Float, default=0.0)
    
    # * Feedback
    teacher_feedback = Column(Text, nullable=True)
    
    # * Timestamps
    answered_at = Column(DateTime, default=datetime.now)
    graded_at = Column(DateTime, nullable=True)
    
    # * Relationships
    attempt = relationship("QuizAttempt", back_populates="answers")
    question = relationship("Question", back_populates="answers")
    
    def __repr__(self):
        return f"<Answer Attempt:{self.attempt_id} Question:{self.question_id}>"



def get_quizzes_by_course(db, course_id: int):
    return db.query(Quiz).filter(Quiz.course_id == course_id, Quiz.is_published == True).all()


def get_quiz(db, quiz_id: int):
    return db.query(Quiz).filter(Quiz.id == quiz_id).first()
