from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from db.session import get_db
from db.users import User, UserRole
from db.feedback import Feedback
from api.schemas.feedback import FeedbackCreate, FeedbackResponse
from api.dependencies import get_current_user, get_teacher_user
from datetime import datetime

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.post("/", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
def create_feedback(
    feedback_data: FeedbackCreate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Create feedback for a student (Teacher/Admin only)"""
    # Verify student exists
    student = db.query(User).filter(User.id == feedback_data.student_id).first()
    if not student or student.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found"
        )
    
    new_feedback = Feedback(
        teacher_id=current_user.id,
        student_id=feedback_data.student_id,
        submission_id=feedback_data.submission_id,
        feedback_type=feedback_data.feedback_type,
        text_feedback=feedback_data.text_feedback
    )
    
    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)
    
    return new_feedback


@router.get("/received", response_model=List[FeedbackResponse])
def get_my_feedback(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get feedback received by current user"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can view received feedback"
        )
    
    feedback = db.query(Feedback).filter(
        Feedback.student_id == current_user.id
    ).order_by(Feedback.created_at.desc()).all()
    
    return feedback


@router.get("/given", response_model=List[FeedbackResponse])
def get_given_feedback(
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get feedback given by current teacher"""
    feedback = db.query(Feedback).filter(
        Feedback.teacher_id == current_user.id
    ).order_by(Feedback.created_at.desc()).all()
    
    return feedback


@router.put("/{feedback_id}/read")
def mark_feedback_read(
    feedback_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark feedback as read"""
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found"
        )
    
    if feedback.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to mark this feedback as read"
        )
    
    feedback.is_read = True
    feedback.read_at = datetime.now()
    db.commit()
    
    return {"message": "Feedback marked as read"}


@router.get("/student/{student_id}", response_model=List[FeedbackResponse])
def get_student_feedback(
    student_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get all feedback for a specific student (Teacher/Admin only)"""
    feedback = db.query(Feedback).filter(
        Feedback.student_id == student_id
    ).order_by(Feedback.created_at.desc()).all()
    
    return feedback
