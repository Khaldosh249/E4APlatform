from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from db.session import get_db
from db.users import User, UserRole
from db.courses import Course, Enrollment
from api.schemas.courses import CourseCreate, CourseUpdate, CourseResponse, EnrollmentResponse
from api.dependencies import get_current_user, get_teacher_user
from datetime import datetime

router = APIRouter(prefix="/courses", tags=["Courses"])


@router.get("/", response_model=List[CourseResponse])
def get_all_courses(
    skip: int = 0,
    limit: int = 100,
    published_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all courses"""
    query = db.query(Course)
    
    # Students can only see published courses
    if current_user.role == UserRole.STUDENT or published_only:
        query = query.filter(Course.is_published == True, Course.is_active == True)
    
    courses = query.offset(skip).limit(limit).all()
    return courses


@router.get("/my-courses", response_model=List[CourseResponse])
def get_my_courses(
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get courses created by current teacher"""
    courses = db.query(Course).filter(Course.teacher_id == current_user.id).all()
    return courses


@router.get("/{course_id}", response_model=CourseResponse)
def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get course by ID"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    # Check permissions
    if current_user.role == UserRole.STUDENT:
        if not course.is_published or not course.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Course is not available"
            )
    
    return course


@router.post("/", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    course_data: CourseCreate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Create a new course (Teacher/Admin only)"""
    new_course = Course(
        teacher_id=current_user.id,
        title=course_data.title,
        description=course_data.description,
        subject_code=course_data.subject_code
    )
    
    db.add(new_course)
    db.commit()
    db.refresh(new_course)
    
    return new_course


@router.put("/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: int,
    course_data: CourseUpdate,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Update course (Teacher/Admin only)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    # Check ownership
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this course"
        )
    
    # Update fields
    update_data = course_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(course, field, value)
    
    db.commit()
    db.refresh(course)
    
    return course


@router.delete("/{course_id}")
def delete_course(
    course_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Delete course (Teacher/Admin only)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    # Check ownership
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this course"
        )
    
    db.delete(course)
    db.commit()
    
    return {"message": "Course deleted successfully"}


@router.post("/{course_id}/enroll", response_model=EnrollmentResponse)
def enroll_in_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Enroll in a course (Student only)"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can enroll in courses"
        )
    
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course or not course.is_published or not course.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not available"
        )
    
    # Check if already enrolled
    existing = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.course_id == course_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already enrolled in this course"
        )
    
    enrollment = Enrollment(
        student_id=current_user.id,
        course_id=course_id
    )
    
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    
    return enrollment


@router.get("/enrolled/my-enrollments", response_model=List[EnrollmentResponse])
def get_my_enrollments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's enrollments"""
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students have enrollments"
        )
    
    enrollments = db.query(Enrollment).filter(
        Enrollment.student_id == current_user.id,
        Enrollment.is_active == True
    ).all()
    
    return enrollments


@router.get("/{course_id}/enrollments", response_model=List[EnrollmentResponse])
def get_course_enrollments(
    course_id: int,
    current_user: User = Depends(get_teacher_user),
    db: Session = Depends(get_db)
):
    """Get all enrollments for a course (Teacher/Admin only)"""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
        )
    
    # Check ownership
    if current_user.role == UserRole.TEACHER and course.teacher_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to view enrollments for this course"
        )
    
    enrollments = db.query(Enrollment).filter(Enrollment.course_id == course_id).all()
    return enrollments
