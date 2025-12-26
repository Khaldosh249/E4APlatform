from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import json
from db.session import get_db
from db.users import User, UserRole
from db.courses import Course
from db.quizzes import Quiz, Question, QuizAttempt, Answer, QuestionType
from api.schemas.quizzes import (
    QuizCreate, QuizUpdate, QuizResponse,
    QuestionCreate, QuestionResponse,
    QuizSubmit, QuizAttemptResponse, QuizAttemptDetailResponse,
    QuizGradeSubmit, AnswerResponse
)
from api.dependencies import get_current_user, get_teacher_user
from core.tts import generate_tts_audio

router = APIRouter(prefix="/quizzes", tags=["Quizzes"])


@router.get("/course/{course_id}", response_model=List[QuizResponse])
def get_course_quizzes(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all quizzes for a course"""
    query = db.query(Quiz).filter(Quiz.course_id == course_id)
    
    # Students can only see published quizzes
    if current_user.role == UserRole.STUDENT:
        query = query.filter(Quiz.is_published == True)
    
    quizzes = query.all()
    return quizzes


@router.get("/{quiz_id}", response_model=QuizResponse)
def get_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get quiz by ID"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    return quiz


@router.post("/", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
def create_quiz(
    quiz_data: QuizCreate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Create a new quiz (Teacher/Admin only)"""
    # Verify course ownership
    course = db.query(Course).filter(Course.id == quiz_data.course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to add quizzes to this course"
        )
    
    new_quiz = Quiz(
        course_id=quiz_data.course_id,
        title=quiz_data.title,
        description=quiz_data.description,
        instructions=quiz_data.instructions,
        time_limit=quiz_data.time_limit,
        max_score=quiz_data.max_score,
        passing_score=quiz_data.passing_score,
        max_attempts=quiz_data.max_attempts,
        shuffle_questions=quiz_data.shuffle_questions,
        show_results_immediately=quiz_data.show_results_immediately,
        is_auto_graded=quiz_data.is_auto_graded
    )
    
    # Generate TTS for instructions
    if quiz_data.instructions:
        audio_url = generate_tts_audio(
            quiz_data.instructions,
            language="en",
            filename=f"quiz_{new_quiz.id}_instructions.mp3"
        )
        new_quiz.instructions_audio_url = audio_url
    
    db.add(new_quiz)
    db.commit()
    db.refresh(new_quiz)
    
    return new_quiz


@router.put("/{quiz_id}", response_model=QuizResponse)
def update_quiz(
    quiz_id: int,
    quiz_data: QuizUpdate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Update quiz (Teacher/Admin only)"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == quiz.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this quiz"
        )
    
    # Update fields
    update_data = quiz_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(quiz, field, value)
    
    db.commit()
    db.refresh(quiz)
    
    return quiz


@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Delete quiz (Teacher/Admin only)"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == quiz.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this quiz"
        )
    
    db.delete(quiz)
    db.commit()
    
    return {"message": "Quiz deleted successfully"}


@router.post("/{quiz_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def add_question(
    quiz_id: int,
    question_data: QuestionCreate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Add a question to a quiz (Teacher/Admin only)"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == quiz.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to add questions to this quiz"
        )
    
    new_question = Question(
        quiz_id=quiz_id,
        question_text=question_data.question_text,
        question_type=question_data.question_type,
        points=question_data.points,
        order_index=question_data.order_index,
        correct_answer=question_data.correct_answer,
        options=question_data.options,
        explanation=question_data.explanation
    )
    
    # Generate TTS for question
    if question_data.question_text:
        audio_url = generate_tts_audio(
            question_data.question_text,
            language="en",
            filename=f"question_{new_question.id}.mp3"
        )
        new_question.question_audio_url = audio_url
    
    # Generate TTS for explanation
    if question_data.explanation:
        audio_url = generate_tts_audio(
            question_data.explanation,
            language="en",
            filename=f"question_{new_question.id}_explanation.mp3"
        )
        new_question.explanation_audio_url = audio_url
    
    db.add(new_question)
    db.commit()
    db.refresh(new_question)
    
    return new_question


@router.get("/{quiz_id}/questions", response_model=List[QuestionResponse])
def get_quiz_questions(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all questions for a quiz"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    questions = db.query(Question).filter(
        Question.quiz_id == quiz_id
    ).order_by(Question.order_index).all()
    
    return questions


@router.post("/{quiz_id}/start", response_model=QuizAttemptResponse)
def start_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start a quiz attempt (Student only)"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can take quizzes"
        )
    
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz or not quiz.is_published:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not available"
        )
    
    # Check attempt limit
    previous_attempts = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.student_id == current_user.id
    ).count()
    
    if quiz.max_attempts > 0 and previous_attempts >= quiz.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum attempts ({quiz.max_attempts}) reached"
        )
    
    # Create new attempt
    attempt = QuizAttempt(
        quiz_id=quiz_id,
        student_id=current_user.id,
        attempt_number=previous_attempts + 1,
        max_score=quiz.max_score
    )
    
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    
    return attempt


@router.post("/{quiz_id}/submit", response_model=QuizAttemptResponse)
def submit_quiz(
    quiz_id: int,
    submission: QuizSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit quiz answers and get graded (Student only)"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can submit quizzes"
        )
    
    # Get active attempt
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.is_completed == False
    ).order_by(QuizAttempt.id.desc()).first()
    
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active quiz attempt found"
        )
    
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    total_score = 0.0
    
    # Process each answer
    for answer_data in submission.answers:
        question = db.query(Question).filter(
            Question.id == answer_data.question_id
        ).first()
        
        if not question:
            continue
        
        # Create answer record
        answer = Answer(
            attempt_id=attempt.id,
            question_id=answer_data.question_id,
            answer_text=answer_data.answer_text
        )
        
        # Only auto-grade if quiz is set to auto-graded (None defaults to True)
        if quiz.is_auto_graded is not False:
            is_correct = False
            if question.question_type == QuestionType.MCQ:
                if answer_data.answer_text and answer_data.answer_text.strip() == question.correct_answer:
                    is_correct = True
            elif question.question_type == QuestionType.TRUE_FALSE:
                if answer_data.answer_text and answer_data.answer_text.lower() == question.correct_answer.lower():
                    is_correct = True
            elif question.question_type == QuestionType.SHORT_ANSWER:
                # For short answer, check if answer contains keywords (simple matching)
                if answer_data.answer_text and question.correct_answer:
                    if question.correct_answer.lower() in answer_data.answer_text.lower():
                        is_correct = True
            
            answer.is_correct = is_correct
            answer.points_earned = question.points if is_correct else 0
            total_score += answer.points_earned
        else:
            # Manual grading - no score yet
            answer.is_correct = None
            answer.points_earned = 0
        
        db.add(answer)
    
    # Update attempt with results (None defaults to True for auto-grading)
    if quiz.is_auto_graded is not False:
        attempt.score = total_score
        attempt.percentage = (total_score / quiz.max_score * 100) if quiz.max_score > 0 else 0
        attempt.passed = attempt.percentage >= quiz.passing_score
        attempt.is_graded = True
    else:
        # Manual grading - mark as submitted but not graded
        attempt.score = 0
        attempt.percentage = 0
        attempt.passed = False
        attempt.is_graded = False
    
    attempt.is_completed = True
    attempt.time_submitted = datetime.now()
    
    # Calculate time taken
    time_taken = (datetime.now() - attempt.time_started).total_seconds()
    attempt.time_taken = int(time_taken)
    
    db.commit()
    db.refresh(attempt)
    
    return attempt


@router.get("/{quiz_id}/attempts", response_model=List[QuizAttemptResponse])
def get_my_attempts(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's quiz attempts"""
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == quiz_id,
        QuizAttempt.student_id == current_user.id
    ).all()
    
    return attempts


@router.get("/{quiz_id}/all-attempts", response_model=List[QuizAttemptResponse])
def get_all_attempts(
    quiz_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get all attempts for a quiz (Teacher/Admin only)"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == quiz.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view attempts for this quiz"
        )
    
    attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == quiz_id).all()
    return attempts


@router.get("/{quiz_id}/all-attempts-detail", response_model=List[QuizAttemptDetailResponse])
def get_all_attempts_detail(
    quiz_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get all attempts with answers for a quiz (Teacher/Admin only) - for grading"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == quiz.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view attempts for this quiz"
        )
    
    attempts = db.query(QuizAttempt).filter(QuizAttempt.quiz_id == quiz_id).all()
    return attempts


@router.get("/attempts/{attempt_id}", response_model=QuizAttemptDetailResponse)
def get_attempt_detail(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed attempt with answers (Student can view own, Teacher can view all in their courses)"""
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found"
        )
    
    # Students can only view their own attempts
    if current_user.role == UserRole.STUDENT:
        if attempt.student_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view your own attempts"
            )
    elif current_user.role == UserRole.TEACHER:
        # Teachers can only view attempts for quizzes in their courses
        quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
        course = db.query(Course).filter(Course.id == quiz.course_id).first()
        if course.teacher_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only view attempts for your courses"
            )
    
    return attempt


@router.post("/attempts/{attempt_id}/grade")
def grade_attempt(
    attempt_id: int,
    grade_data: QuizGradeSubmit,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Grade a quiz attempt (Teacher/Admin only)"""
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attempt not found"
        )
    
    # Check ownership
    quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
    course = db.query(Course).filter(Course.id == quiz.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to grade this quiz"
        )
    
    total_score = 0.0
    
    # Grade each answer
    for grade in grade_data.answers:
        answer = db.query(Answer).filter(Answer.id == grade.answer_id).first()
        if not answer or answer.attempt_id != attempt_id:
            continue
        
        answer.is_correct = grade.is_correct
        answer.points_earned = grade.points_earned
        answer.teacher_feedback = grade.feedback
        answer.graded_at = datetime.now()
        total_score += grade.points_earned
    
    # Update attempt
    attempt.score = total_score
    attempt.percentage = (total_score / quiz.max_score * 100) if quiz.max_score > 0 else 0
    attempt.passed = attempt.percentage >= quiz.passing_score
    attempt.is_graded = True
    
    db.commit()
    db.refresh(attempt)
    
    return {"message": "Attempt graded successfully", "score": attempt.score, "percentage": attempt.percentage, "passed": attempt.passed}


@router.get("/my-attempts/all", response_model=List[QuizAttemptDetailResponse])
def get_all_my_attempts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all quiz attempts for the current student"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can view their attempts"
        )
    
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.student_id == current_user.id,
        QuizAttempt.is_completed == True
    ).order_by(QuizAttempt.time_submitted.desc()).all()
    
    return attempts
