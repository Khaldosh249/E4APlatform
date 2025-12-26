from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from db.session import get_db
from db.users import User, UserRole
from db.courses import Course
from db.assignments import Assignment, Submission, SubmissionStatus
from db.feedback import Feedback, FeedbackType
from api.schemas.assignments import (
    AssignmentCreate, AssignmentUpdate, AssignmentResponse,
    SubmissionCreate, SubmissionGrade, SubmissionResponse, SubmissionUpdate
)
from api.dependencies import get_current_user, get_teacher_user
from core.tts import generate_tts_audio

router = APIRouter(prefix="/assignments", tags=["Assignments"])


@router.get("/course/{course_id}/my-submissions", response_model=List[SubmissionResponse])
def get_my_course_submissions(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all submissions by the current student for a course"""
    # Get all assignment IDs for this course
    assignment_ids = db.query(Assignment.id).filter(
        Assignment.course_id == course_id
    ).all()
    assignment_ids = [a[0] for a in assignment_ids]
    
    # Get all submissions for these assignments by this student
    submissions = db.query(Submission).filter(
        Submission.assignment_id.in_(assignment_ids),
        Submission.student_id == current_user.id
    ).all()
    
    return submissions


@router.get("/course/{course_id}", response_model=List[AssignmentResponse])
def get_course_assignments(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all assignments for a course"""
    query = db.query(Assignment).filter(Assignment.course_id == course_id)
    
    # Students can only see published assignments
    if current_user.role == UserRole.STUDENT:
        query = query.filter(Assignment.is_published == True)
    
    assignments = query.all()
    return assignments


@router.get("/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get assignment by ID"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    return assignment


@router.post("/", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    assignment_data: AssignmentCreate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Create a new assignment (Teacher/Admin only)"""
    # Verify course ownership
    course = db.query(Course).filter(Course.id == assignment_data.course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to add assignments to this course"
        )
    
    new_assignment = Assignment(
        course_id=assignment_data.course_id,
        title=assignment_data.title,
        description=assignment_data.description,
        instructions=assignment_data.instructions,
        assignment_type=assignment_data.assignment_type,
        max_score=assignment_data.max_score,
        due_date=assignment_data.due_date,
        allow_late_submission=assignment_data.allow_late_submission
    )
    
    # Generate TTS for instructions
    if assignment_data.instructions:
        audio_url = generate_tts_audio(
            assignment_data.instructions,
            language="en",
            filename=f"assignment_{new_assignment.id}_instructions.mp3"
        )
        new_assignment.instructions_audio_url = audio_url
    
    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)
    
    return new_assignment


@router.put("/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(
    assignment_id: int,
    assignment_data: AssignmentUpdate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Update assignment (Teacher/Admin only)"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == assignment.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this assignment"
        )
    
    # Update fields
    update_data = assignment_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)
    
    db.commit()
    db.refresh(assignment)
    
    return assignment


@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Delete assignment (Teacher/Admin only)"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == assignment.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this assignment"
        )
    
    db.delete(assignment)
    db.commit()
    
    return {"message": "Assignment deleted successfully"}


@router.post("/submit", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
def submit_assignment(
    submission_data: SubmissionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Submit an assignment (Student only)"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can submit assignments"
        )
    
    assignment = db.query(Assignment).filter(
        Assignment.id == submission_data.assignment_id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check if already submitted
    existing = db.query(Submission).filter(
        Submission.assignment_id == submission_data.assignment_id,
        Submission.student_id == current_user.id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment already submitted"
        )
    
    # Check if late
    is_late = False
    if assignment.due_date and datetime.now() > assignment.due_date:
        if not assignment.allow_late_submission:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignment deadline has passed"
            )
        is_late = True
    
    submission = Submission(
        assignment_id=submission_data.assignment_id,
        student_id=current_user.id,
        text_answer=submission_data.text_answer,
        is_late=is_late,
        status=SubmissionStatus.SUBMITTED
    )
    
    db.add(submission)
    db.commit()
    db.refresh(submission)
    
    return submission


# Update submission
@router.post("/submit/{assignment_id}", response_model=SubmissionResponse)
def update_submission(
    assignment_id: int,
    submission_data: SubmissionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing assignment submission (Student only)"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can update submissions"
        )
    
    submission = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.student_id == current_user.id
    ).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    assignment = db.query(Assignment).filter(
        Assignment.id == assignment_id
    ).first()
    
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check if late
    is_late = False
    if assignment.due_date and datetime.now() > assignment.due_date:
        if not assignment.allow_late_submission:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignment deadline has passed"
            )
        is_late = True
    
    # Update submission
    submission.text_answer = submission_data.text_answer
    submission.is_late = is_late
    submission.status = SubmissionStatus.SUBMITTED
    submission.submitted_at = datetime.now()
    
    db.commit()
    db.refresh(submission)
    
    return submission


@router.get("/{assignment_id}/submissions", response_model=List[SubmissionResponse])
def get_assignment_submissions(
    assignment_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get all submissions for an assignment (Teacher/Admin only)"""
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assignment not found"
        )
    
    # Check ownership
    course = db.query(Course).filter(Course.id == assignment.course_id).first()
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view submissions for this assignment"
        )
    
    submissions = db.query(Submission).filter(
        Submission.assignment_id == assignment_id
    ).all()
    
    return submissions


@router.get("/my-submissions/{assignment_id}", response_model=SubmissionResponse)
def get_my_submission(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get student's own submission"""
    submission = db.query(Submission).filter(
        Submission.assignment_id == assignment_id,
        Submission.student_id == current_user.id
    ).first()
    
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    return submission


@router.post("/grade/{submission_id}")
def grade_submission(
    submission_id: int,
    grade_data: SubmissionGrade,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Grade a submission (Teacher/Admin only)"""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found"
        )
    
    # Check ownership
    assignment = db.query(Assignment).filter(
        Assignment.id == submission.assignment_id
    ).first()
    course = db.query(Course).filter(Course.id == assignment.course_id).first()
    
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to grade this submission"
        )
    
    # Update submission
    submission.score = grade_data.score
    submission.status = SubmissionStatus.GRADED
    submission.graded_at = datetime.now()
    
    # Add feedback if provided
    if grade_data.feedback_text:
        feedback = Feedback(
            teacher_id=current_user.id,
            student_id=submission.student_id,
            submission_id=submission.id,
            feedback_type=FeedbackType.ASSIGNMENT,
            text_feedback=grade_data.feedback_text
        )
        db.add(feedback)
    
    db.commit()
    
    return {"message": "Submission graded successfully", "score": grade_data.score}
