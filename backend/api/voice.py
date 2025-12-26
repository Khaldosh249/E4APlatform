"""
OpenAI Realtime Speech-to-Speech WebSocket Handler
Full-featured voice assistant with quiz, lesson, assignment support
"""

import os
import json
import base64
import asyncio
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from db.session import get_db
from db import courses, lessons, users, quizzes, assignments
from db.users import User
from db.models import QuizAttempt, Submission, LessonProgress
from core.security import SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/voice", tags=["voice"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini"


def get_user_from_token(token: str, db: Session) -> User:
    """Verify token and return user"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            return None
    except JWTError:
        return None
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None
    
    return user


def parse_options(options):
    """Parse quiz options from various formats"""
    if not options:
        return []
    if isinstance(options, list):
        return options
    try:
        parsed = json.loads(options)
        return parsed if isinstance(parsed, list) else []
    except:
        try:
            return json.loads(options.replace("'", '"'))
        except:
            return []


# Enhanced tools for the voice assistant
VOICE_TOOLS = [
    # Course Navigation
    {
        "type": "function",
        "name": "list_enrolled_courses",
        "description": "Get the list of courses the student is enrolled in with their progress",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "get_courses_by_name",
        "description": "Search for courses by name substring, used when the student wants to find a specific course, or asked for an assignment or quiz you first get the course id by searching by name",
        "parameters": {
            "type": "object",
            "properties": {
                "name_substr": {"type": "string", "description": "Substring to search in course names"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "list_available_courses",
        "description": "List all available courses that the student can enroll in",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "enroll_in_course",
        "description": "Enroll the student in a specific course",
        "parameters": {
            "type": "object",
            "properties": {
                "course_id": {"type": "integer", "description": "The ID of the course to enroll in"},
                "course_number": {"type": "integer", "description": "The number of the course from the list (1-based)"},
                "course_name": {"type": "string", "description": "The name of the course (partial match)"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "get_course_details",
        "description": "Get details about a specific course including its lessons, quizzes, and assignments",
        "parameters": {
            "type": "object",
            "properties": {
                "course_id": {"type": "integer", "description": "The ID of the course"},
                "course_number": {"type": "integer", "description": "The number from the courses list"},
                "course_name": {"type": "string", "description": "The name of the course (partial match)"}
            },
            "required": []
        }
    },
    # Lesson Functions
    {
        "type": "function",
        "name": "list_course_lessons",
        "description": "List all lessons in a course",
        "parameters": {
            "type": "object",
            "properties": {
                "course_id": {"type": "integer", "description": "The ID of the course"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "get_lesson_content",
        "description": "Get and read the content of a specific lesson",
        "parameters": {
            "type": "object",
            "properties": {
                "lesson_id": {"type": "integer", "description": "The ID of the lesson"},
                "lesson_number": {"type": "integer", "description": "The lesson number (1-based index)"},
                "course_id": {"type": "integer", "description": "The course ID"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "mark_lesson_complete",
        "description": "Mark the current lesson as completed",
        "parameters": {
            "type": "object",
            "properties": {
                "lesson_id": {"type": "integer", "description": "The ID of the lesson to mark complete"}
            },
            "required": []
        }
    },
    # Quiz Functions
    {
        "type": "function",
        "name": "list_all_quizzes",
        "description": "List all quizzes from all enrolled courses with their attempt status",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "start_quiz",
        "description": "Start a quiz for the student to take",
        "parameters": {
            "type": "object",
            "properties": {
                "quiz_id": {"type": "integer", "description": "The ID of the quiz"},
                "quiz_number": {"type": "integer", "description": "The quiz number from the list"},
                "quiz_name": {"type": "string", "description": "The name of the quiz (partial match)"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "read_current_question",
        "description": "Read the current quiz question and its options",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "answer_question",
        "description": "Record an answer for the current quiz question (requires confirmation)",
        "parameters": {
            "type": "object",
            "properties": {
                "answer": {"type": "string", "description": "The answer: 'A', 'B', 'C', 'D' or option number 1-4"}
            },
            "required": ["answer"]
        }
    },
    {
        "type": "function",
        "name": "confirm_answer",
        "description": "Confirm or cancel the pending quiz answer",
        "parameters": {
            "type": "object",
            "properties": {
                "confirmed": {"type": "boolean", "description": "True to confirm, False to cancel"}
            },
            "required": ["confirmed"]
        }
    },
    {
        "type": "function",
        "name": "navigate_question",
        "description": "Navigate to next, previous, or specific question in the quiz",
        "parameters": {
            "type": "object",
            "properties": {
                "direction": {"type": "string", "enum": ["next", "previous", "first", "last"], "description": "Direction to navigate"},
                "question_number": {"type": "integer", "description": "Specific question number to go to"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "submit_quiz",
        "description": "Submit the quiz and get the results",
        "parameters": {
            "type": "object",
            "properties": {
                "confirm": {"type": "boolean", "description": "Must be true to confirm submission"}
            },
            "required": ["confirm"]
        }
    },
    {
        "type": "function",
        "name": "get_quiz_status",
        "description": "Get the current status of the quiz attempt (answered questions, remaining, etc)",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    # Assignment Functions
    {
        "type": "function",
        "name": "list_all_assignments",
        "description": "List all assignments from all enrolled courses with their submission status",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "get_assignment_details",
        "description": "Get details of a specific assignment",
        "parameters": {
            "type": "object",
            "properties": {
                "assignment_id": {"type": "integer", "description": "The ID of the assignment"},
                "assignment_number": {"type": "integer", "description": "The assignment number from the list"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "start_assignment_submission",
        "description": "Start the assignment submission process",
        "parameters": {
            "type": "object",
            "properties": {
                "assignment_id": {"type": "integer", "description": "The ID of the assignment"}
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "dictate_assignment_answer",
        "description": "Record dictated content for assignment submission",
        "parameters": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "The dictated content for the assignment"},
                "append": {"type": "boolean", "description": "True to append to existing content, False to replace"}
            },
            "required": ["content"]
        }
    },
    {
        "type": "function",
        "name": "review_assignment_submission",
        "description": "Read back the current assignment submission content",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "submit_assignment",
        "description": "Submit the assignment",
        "parameters": {
            "type": "object",
            "properties": {
                "confirm": {"type": "boolean", "description": "Must be true to confirm submission"}
            },
            "required": ["confirm"]
        }
    },
    # Progress & Navigation
    {
        "type": "function",
        "name": "get_student_progress",
        "description": "Get the student's overall progress across all courses",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "type": "function",
        "name": "navigate_to_page",
        "description": "Navigate the user to a specific page in the application",
        "parameters": {
            "type": "object",
            "properties": {
                "page": {
                    "type": "string",
                    "enum": ["dashboard", "courses", "progress", "settings", "back", "home"],
                    "description": "The page to navigate to"
                }
            },
            "required": ["page"]
        }
    },
    {
        "type": "function",
        "name": "clear_display",
        "description": "Clear the current display and return to idle state",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    }
]

SYSTEM_INSTRUCTIONS = """You are a helpful voice assistant for the E4A Learning Platform, specifically designed to help visually impaired students navigate and interact with educational content through voice commands.

## Your Capabilities:
1. **Course Management**: Help students browse, enroll in, and navigate courses
2. **Lesson Reading**: Read lesson content aloud and track progress
3. **Quiz Taking**: Guide students through quizzes with voice confirmation for answers
4. **Assignment Submission**: Help students dictate and submit assignments
5. **Progress Tracking**: Report on student progress across all courses

## Important Guidelines:

### General Communication:
- Be concise but friendly - students are listening, not reading
- When listing items, always number them clearly (1, 2, 3...)
- Always confirm important actions before executing
- If something fails, explain clearly and suggest alternatives

### Quiz Interaction Flow:
1. When starting a quiz, read the first question automatically
2. For each question, read: question text, then options (A, B, C, D)
3. When student answers, ALWAYS ask for confirmation: "You selected [answer]. Say 'yes' or 'confirm' to lock in this answer, or 'no' to change it."
4. Only after confirmation, move to the next question
5. Before submitting, summarize: "You answered X out of Y questions. Say 'submit' to finish the quiz."

### Assignment Interaction Flow:
1. Read the assignment description first
2. Tell the student they can dictate their answer
3. After dictation, read back what was recorded
4. Ask for confirmation before submitting

### Navigation:
- Students can ask for courses, quizzes, or assignments directly from anywhere
- Remember the current context (which course/lesson/quiz they're in)
- Provide clear "escape routes" - always tell them how to go back or cancel

Current student information will be provided with each session."""


class VoiceSessionManager:
    """Manages voice session state for each connected user"""
    
    def __init__(self):
        self.sessions = {}
    
    def create_session(self, user_id: int):
        self.sessions[user_id] = {
            "mode": "idle",  # idle, quiz, lesson, assignment
            # Course context
            "current_course_id": None,
            "courses_cache": [],
            "available_courses_cache": [],
            # Lesson context
            "current_lesson_id": None,
            "lessons_cache": [],
            # Quiz context
            "current_quiz_id": None,
            "quiz_questions": [],
            "current_question_index": 0,
            "quiz_answers": {},
            "pending_answer": None,
            "quizzes_cache": [],
            # Assignment context
            "current_assignment_id": None,
            "assignment_content": "",
            "assignments_cache": []
        }
        return self.sessions[user_id]
    
    def get_session(self, user_id: int):
        return self.sessions.get(user_id)
    
    def update_session(self, user_id: int, **kwargs):
        if user_id in self.sessions:
            self.sessions[user_id].update(kwargs)
    
    def remove_session(self, user_id: int):
        if user_id in self.sessions:
            del self.sessions[user_id]


session_manager = VoiceSessionManager()


async def execute_function(
    function_name: str, 
    arguments: dict, 
    user_id: int, 
    db: Session,
    websocket: WebSocket = None
) -> dict:
    """Execute a function call and return the result"""
    
    session = session_manager.get_session(user_id)
    
    async def send_context_update(data):
        """Send context update to client"""
        if websocket:
            try:
                await websocket.send_json({
                    "type": "context_update",
                    "data": data
                })
            except:
                pass
    
    # ==================== COURSE FUNCTIONS ====================
    
    if function_name == "list_enrolled_courses":
        enrollments = courses.get_user_enrollments(db, user_id)
        course_list = []
        for i, enrollment in enumerate(enrollments, 1):
            course = enrollment.course
            course_list.append({
                "number": i,
                "id": course.id,
                "title": course.title,
                "description": course.description[:100] + "..." if len(course.description or "") > 100 else course.description,
                "progress": enrollment.progress_percentage
            })
        
        session_manager.update_session(user_id, courses_cache=course_list)
        
        await send_context_update({
            "action": "show_courses",
            "courses": course_list,
            "enrolled": True
        })
        
        if not course_list:
            return {
                "success": True,
                "message": "You are not enrolled in any courses yet. Would you like me to show you the available courses?"
            }
        
        return {
            "success": True,
            "courses": course_list,
            "message": f"You are enrolled in {len(course_list)} courses. " + 
                      ", ".join([f"Number {c['number']}: {c['title']} at {c['progress']}% progress" for c in course_list[:5]])
        }
    
    elif function_name == "get_courses_by_name":
        name_substr = arguments.get("name_substr")
        if not name_substr:
            return {"success": False, "message": "Please provide a course name or substring to search for."}
        
        matched_courses = courses.get_courses_by_name(db, name_substr)
        course_list = []
        for i, course in enumerate(matched_courses, 1):
            course_list.append({
                "number": i,
                "id": course.id,
                "title": course.title,
                "description": course.description[:100] + "..." if len(course.description or "") > 100 else course.description
            })
        
        if not course_list:
            return {"success": True, "message": f"No courses found matching '{name_substr}'."}
        
        return {
            "success": True,
            "courses": course_list,
            "message": f"Found {len(course_list)} courses matching '{name_substr}': " +
                      ", ".join([f"Number {c['number']}: {c['title']}" for c in course_list[:5]])
        }
    
    elif function_name == "list_available_courses":
        all_courses = courses.get_courses(db, published_only=True)
        enrollments = courses.get_user_enrollments(db, user_id)
        enrolled_ids = {e.course_id for e in enrollments}
        
        available = []
        for i, course in enumerate(all_courses, 1):
            if course.id not in enrolled_ids:
                available.append({
                    "number": len(available) + 1,
                    "id": course.id,
                    "title": course.title,
                    "description": course.description[:100] + "..." if len(course.description or "") > 100 else course.description
                })
        
        session_manager.update_session(user_id, available_courses_cache=available)
        
        await send_context_update({
            "action": "show_courses",
            "courses": available,
            "enrolled": False
        })
        
        if not available:
            return {"success": True, "message": "You are already enrolled in all available courses!"}
        
        return {
            "success": True,
            "courses": available,
            "message": f"There are {len(available)} courses available. " +
                      ", ".join([f"Number {c['number']}: {c['title']}" for c in available[:5]])
        }
    
    elif function_name == "enroll_in_course":
        course_id = arguments.get("course_id")
        course_number = arguments.get("course_number")
        course_name = arguments.get("course_name")
        
        # Find course by various methods
        available_cache = session.get("available_courses_cache", [])
        if course_number and available_cache:
            for c in available_cache:
                if c["number"] == course_number:
                    course_id = c["id"]
                    break
        
        if not course_id and course_name:
            available_course = courses.get_courses_by_name(db, course_name)
            if available_course:
                course_id = available_course[0].id
            
            
        
        if not course_id:
            return {"success": False, "message": "Course not found. Please say the course number or name from the available courses list."}
        
        # Check if already enrolled
        existing = courses.get_enrollment(db, user_id, course_id)
        if existing:
            return {"success": False, "message": "You are already enrolled in this course."}
        
        # Enroll
        try:
            enrollment = courses.create_enrollment(db, user_id, course_id)
            course = courses.get_course(db, course_id)
            
            await send_context_update({
                "action": "enrollment_complete",
                "course": {"id": course.id, "title": course.title}
            })
            
            return {
                "success": True,
                "message": f"Great! You are now enrolled in {course.title}. Would you like me to show you the course content?"
            }
        except Exception as e:
            return {"success": False, "message": f"Failed to enroll: {str(e)}"}
    
    elif function_name == "get_course_details":
        course_id = arguments.get("course_id")
        course_number = arguments.get("course_number")
        course_name = arguments.get("course_name")
        
        # Find course
        courses_cache = session.get("courses_cache", [])
        if course_number and courses_cache:
            for c in courses_cache:
                if c["number"] == course_number:
                    course_id = c["id"]
                    break
        
        if not course_id and course_name:
            for c in courses_cache:
                if course_name.lower() in c["title"].lower():
                    course_id = c["id"]
                    break
        
        print(courses_cache)
        
        if not course_id:
            return {"success": False, "message": "Course not found. Please specify the course number or name."}
        
        course = courses.get_course(db, course_id)
        if not course:
            return {"success": False, "message": "Course not found."}
        
        course_lessons = lessons.get_lessons_by_course(db, course_id)
        course_quizzes = quizzes.get_quizzes_by_course(db, course_id)
        course_assignments = assignments.get_assignments_by_course(db, course_id)
        
        lessons_cache = [{"number": i+1, "id": l.id, "title": l.title} for i, l in enumerate(course_lessons)]
        session_manager.update_session(user_id, current_course_id=course_id, lessons_cache=lessons_cache)
        
        return {
            "success": True,
            "course": {"id": course.id, "title": course.title, "description": course.description},
            "lesson_count": len(course_lessons),
            "quiz_count": len(course_quizzes),
            "assignment_count": len(course_assignments),
            "message": f"Course '{course.title}' has {len(course_lessons)} lessons, {len(course_quizzes)} quizzes, and {len(course_assignments)} assignments. What would you like to do?"
        }
    
    # ==================== LESSON FUNCTIONS ====================
    
    elif function_name == "list_course_lessons":
        course_id = arguments.get("course_id") or session.get("current_course_id")
        
        if not course_id:
            return {"success": False, "message": "Please select a course first, or say 'show my courses'."}
        
        course_lessons = lessons.get_lessons_by_course(db, course_id)
        lesson_list = [{"number": i+1, "id": l.id, "title": l.title, "duration": l.duration_minutes} 
                      for i, l in enumerate(course_lessons)]
        
        session_manager.update_session(user_id, lessons_cache=lesson_list, current_course_id=course_id)
        
        return {
            "success": True,
            "lessons": lesson_list,
            "message": f"This course has {len(lesson_list)} lessons. " +
                      ", ".join([f"Lesson {l['number']}: {l['title']}" for l in lesson_list[:5]])
        }
    
    elif function_name == "get_lesson_content":
        lesson_id = arguments.get("lesson_id")
        lesson_number = arguments.get("lesson_number")
        course_id = arguments.get("course_id") or session.get("current_course_id")
        
        # Find lesson by number
        if not lesson_id and lesson_number:
            cached = session.get("lessons_cache", [])
            for l in cached:
                if l["number"] == lesson_number:
                    lesson_id = l["id"]
                    break
        
        if not lesson_id:
            return {"success": False, "message": "Lesson not found. Please say the lesson number."}
        
        lesson = lessons.get_lesson(db, lesson_id)
        if not lesson:
            return {"success": False, "message": "Lesson not found."}
        
        session_manager.update_session(user_id, mode="lesson", current_lesson_id=lesson_id, current_course_id=lesson.course_id)
        
        await send_context_update({
            "action": "start_lesson",
            "lesson": {
                "id": lesson.id,
                "title": lesson.title,
                "content_text": lesson.content_text,
                "duration_minutes": lesson.duration_minutes
            }
        })
        
        # Truncate content for voice
        content = lesson.content_text or ""
        if len(content) > 2000:
            content = content[:2000] + "... The content continues. Say 'continue reading' to hear more."
        
        return {
            "success": True,
            "lesson": {"id": lesson.id, "title": lesson.title, "content": content},
            "message": f"Lesson: {lesson.title}. {content}"
        }
    
    elif function_name == "mark_lesson_complete":
        lesson_id = arguments.get("lesson_id") or session.get("current_lesson_id")
        
        if not lesson_id:
            return {"success": False, "message": "No lesson selected."}
        
        # Check/create lesson progress
        progress = db.query(LessonProgress).filter(
            LessonProgress.student_id == user_id,
            LessonProgress.lesson_id == lesson_id
        ).first()
        
        if not progress:
            progress = LessonProgress(
                student_id=user_id,
                lesson_id=lesson_id,
                completed=True,
                completed_at=datetime.now()
            )
            db.add(progress)
        else:
            progress.is_completed = True
            progress.completed_at = datetime.now()
        
        db.commit()
        
        return {"success": True, "message": "Lesson marked as complete! Would you like to continue to the next lesson?"}
    
    # ==================== QUIZ FUNCTIONS ====================
    
    elif function_name == "list_all_quizzes":
        enrollments = courses.get_user_enrollments(db, user_id)
        all_quizzes = []
        
        for enrollment in enrollments:
            course_quizzes = quizzes.get_quizzes_by_course(db, enrollment.course_id)
            for quiz in course_quizzes:
                # Check if attempted
                attempt = db.query(QuizAttempt).filter(
                    QuizAttempt.student_id == user_id,
                    QuizAttempt.quiz_id == quiz.id
                ).order_by(QuizAttempt.time_submitted.desc()).first()
                
                quiz_data = {
                    "number": len(all_quizzes) + 1,
                    "id": quiz.id,
                    "title": quiz.title,
                    "course_id": enrollment.course_id,
                    "course_title": enrollment.course.title,
                    "question_count": len(quiz.questions) if quiz.questions else 0,
                    "attempted": attempt is not None,
                    "score": attempt.score if attempt else None,
                    "passed": attempt.passed if attempt else None
                }
                all_quizzes.append(quiz_data)
        
        session_manager.update_session(user_id, quizzes_cache=all_quizzes)
        
        await send_context_update({
            "action": "show_quizzes",
            "quizzes": all_quizzes
        })
        
        if not all_quizzes:
            return {"success": True, "message": "No quizzes available. Enroll in a course first."}
        
        return {
            "success": True,
            "quizzes": all_quizzes,
            "message": f"You have {len(all_quizzes)} quizzes. " +
                      ", ".join([f"Quiz {q['number']}: {q['title']} from {q['course_title']}" + 
                               (f" - Score: {q['score']}%" if q['attempted'] else " - Not attempted")
                               for q in all_quizzes[:5]])
        }
    
    elif function_name == "start_quiz":
        quiz_id = arguments.get("quiz_id")
        quiz_number = arguments.get("quiz_number")
        quiz_name = arguments.get("quiz_name")
        
        # Find quiz
        quizzes_cache = session.get("quizzes_cache", [])
        if quiz_number and quizzes_cache:
            for q in quizzes_cache:
                if q["number"] == quiz_number:
                    quiz_id = q["id"]
                    break
        
        if not quiz_id and quiz_name:
            for q in quizzes_cache:
                if quiz_name.lower() in q["title"].lower():
                    quiz_id = q["id"]
                    break
        
        if not quiz_id:
            # Try current course
            course_id = session.get("current_course_id")
            if course_id:
                course_quizzes = quizzes.get_quizzes_by_course(db, course_id)
                if quiz_number and quiz_number <= len(course_quizzes):
                    quiz_id = course_quizzes[quiz_number - 1].id
        
        if not quiz_id:
            return {"success": False, "message": "Quiz not found. Say 'show my quizzes' to see available quizzes."}
        
        quiz = quizzes.get_quiz(db, quiz_id)
        if not quiz:
            return {"success": False, "message": "Quiz not found."}
        
        questions = quiz.questions or []
        if not questions:
            return {"success": False, "message": "This quiz has no questions."}
        
        # Initialize quiz session
        quiz_questions = [
            {
                "id": q.id,
                "question_text": q.question_text,
                "options": parse_options(q.options),
                "question_type": q.question_type,
            }
            for q in questions
        ]
        
        session_manager.update_session(
            user_id,
            mode="quiz",
            current_quiz_id=quiz_id,
            quiz_questions=quiz_questions,
            current_question_index=0,
            quiz_answers={},
            pending_answer=None
        )
        
        await send_context_update({
            "action": "start_quiz",
            "quiz": {"id": quiz.id, "title": quiz.title},
            "questions": quiz_questions,
            "currentIndex": 0
        })
        
        # Read first question
        q = quiz_questions[0]
        options_text = ", ".join([f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(q["options"])])
        
        return {
            "success": True,
            "message": f"Starting quiz: {quiz.title}. There are {len(questions)} questions. " +
                      f"Question 1: {q['question_text']}. {options_text}. " +
                      "Say the letter of your answer, like 'A' or 'Option A'."
        }
    
    elif function_name == "read_current_question":
        if session.get("mode") != "quiz" or not session.get("quiz_questions"):
            return {"success": False, "message": "No quiz in progress. Say 'start quiz' to begin a quiz."}
        
        idx = session.get("current_question_index", 0)
        questions = session.get("quiz_questions", [])
        q = questions[idx]
        options_text = ", ".join([f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(q["options"])])
        
        answers = session.get("quiz_answers", {})
        answered = answers.get(idx)
        answer_status = f"Your current answer: Option {chr(65+answered)}. " if answered is not None else "Not answered yet. "
        
        return {
            "success": True,
            "message": f"Question {idx + 1} of {len(questions)}: " +
                      f"{q['question_text']}. {options_text}. {answer_status}" +
                      "Say the letter of your answer."
        }
    
    elif function_name == "answer_question":
        if session.get("mode") != "quiz":
            return {"success": False, "message": "No quiz in progress."}
        
        answer = arguments.get("answer", "").upper().strip()
        
        # Parse answer
        answer_index = None
        if answer in ["A", "1", "OPTION A", "ANSWER A", "FIRST"]:
            answer_index = 0
        elif answer in ["B", "2", "OPTION B", "ANSWER B", "SECOND"]:
            answer_index = 1
        elif answer in ["C", "3", "OPTION C", "ANSWER C", "THIRD"]:
            answer_index = 2
        elif answer in ["D", "4", "OPTION D", "ANSWER D", "FOURTH"]:
            answer_index = 3
        
        if answer_index is None:
            return {"success": False, "message": "I didn't understand that answer. Please say A, B, C, or D."}
        
        idx = session.get("current_question_index", 0)
        questions = session.get("quiz_questions", [])
        q = questions[idx]
        
        if answer_index >= len(q["options"]):
            return {"success": False, "message": f"This question only has {len(q['options'])} options."}
        
        session_manager.update_session(user_id, pending_answer=answer_index)
        
        await send_context_update({
            "action": "pending_answer",
            "questionIndex": idx,
            "answer": answer_index,
            "answerText": q["options"][answer_index]
        })
        
        return {
            "success": True,
            "pending_confirmation": True,
            "message": f"You selected Option {chr(65+answer_index)}: {q['options'][answer_index]}. " +
                      "Say 'yes' or 'confirm' to lock in this answer, or 'no' to change it."
        }
    
    elif function_name == "confirm_answer":
        if session.get("mode") != "quiz":
            return {"success": False, "message": "No quiz in progress."}
        
        pending = session.get("pending_answer")
        if pending is None:
            return {"success": False, "message": "No answer pending confirmation. Please select an answer first."}
        
        confirmed = arguments.get("confirmed", False)
        
        if confirmed:
            idx = session.get("current_question_index", 0)
            questions = session.get("quiz_questions", [])
            answers = session.get("quiz_answers", {})
            
            answers[idx] = pending
            session_manager.update_session(user_id, quiz_answers=answers, pending_answer=None)
            
            await send_context_update({
                "action": "answer_confirmed",
                "questionIndex": idx,
                "answer": pending
            })
            
            # Auto-advance to next question
            if idx < len(questions) - 1:
                new_idx = idx + 1
                session_manager.update_session(user_id, current_question_index=new_idx)
                
                await send_context_update({
                    "action": "show_question",
                    "questionIndex": new_idx
                })
                
                q = questions[new_idx]
                options_text = ", ".join([f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(q["options"])])
                
                return {
                    "success": True,
                    "message": f"Answer confirmed. Question {new_idx + 1}: {q['question_text']}. {options_text}"
                }
            else:
                answered = len(answers)
                total = len(questions)
                return {
                    "success": True,
                    "message": f"Answer confirmed. You've reached the last question. " +
                              f"You've answered {answered} of {total} questions. " +
                              "Say 'submit quiz' when you're ready."
                }
        else:
            session_manager.update_session(user_id, pending_answer=None)
            await send_context_update({"action": "answer_cancelled", "questionIndex": session.get("current_question_index", 0)})
            return {"success": True, "message": "Answer cancelled. Please select a different option: A, B, C, or D."}
    
    elif function_name == "navigate_question":
        if session.get("mode") != "quiz":
            return {"success": False, "message": "No quiz in progress."}
        
        direction = arguments.get("direction")
        question_number = arguments.get("question_number")
        
        questions = session.get("quiz_questions", [])
        idx = session.get("current_question_index", 0)
        new_idx = idx
        
        if question_number:
            new_idx = question_number - 1
        elif direction == "next":
            new_idx = idx + 1
        elif direction == "previous":
            new_idx = idx - 1
        elif direction == "first":
            new_idx = 0
        elif direction == "last":
            new_idx = len(questions) - 1
        
        if new_idx < 0 or new_idx >= len(questions):
            return {"success": False, "message": "Invalid question number."}
        
        session_manager.update_session(user_id, current_question_index=new_idx, pending_answer=None)
        
        await send_context_update({"action": "show_question", "questionIndex": new_idx})
        
        # Read the question
        q = questions[new_idx]
        options_text = ", ".join([f"Option {chr(65+i)}: {opt}" for i, opt in enumerate(q["options"])])
        answers = session.get("quiz_answers", {})
        answered = answers.get(new_idx)
        answer_status = f"Your answer: Option {chr(65+answered)}. " if answered is not None else ""
        
        return {
            "success": True,
            "message": f"Question {new_idx + 1} of {len(questions)}: {q['question_text']}. {options_text}. {answer_status}"
        }
    
    elif function_name == "submit_quiz":
        if session.get("mode") != "quiz":
            return {"success": False, "message": "No quiz in progress."}
        
        confirm = arguments.get("confirm", False)
        
        answers = session.get("quiz_answers", {})
        questions = session.get("quiz_questions", [])
        answered = len(answers)
        total = len(questions)
        
        if not confirm:
            unanswered = total - answered
            return {
                "success": False,
                "message": f"You've answered {answered} of {total} questions. " +
                          (f"You have {unanswered} unanswered questions. " if unanswered > 0 else "") +
                          "Say 'yes, submit quiz' to confirm submission."
            }
        
        # Calculate score
        quiz_id = session.get("current_quiz_id")
        quiz = quizzes.get_quiz(db, quiz_id)
        
        correct = 0
        for idx, q in enumerate(questions):
            if idx in answers:
                if answers[idx] == q.get("correct_answer"):
                    correct += 1
        
        score = round((correct / total) * 100) if total > 0 else 0
        passed = score >= (quiz.passing_score or 70)
        
        # Save attempt
        attempt = QuizAttempt(
            student_id=user_id,
            quiz_id=quiz_id,
            score=score,
            max_score=score,
            passed=passed,
            answers_text=json.dumps(answers),
            time_submitted=datetime.now()
        )
        db.add(attempt)
        db.commit()
        
        await send_context_update({
            "action": "quiz_completed",
            "score": score,
            "total": total,
            "correct": correct,
            "passed": passed
        })
        
        # Reset quiz state
        session_manager.update_session(
            user_id,
            mode="idle",
            current_quiz_id=None,
            quiz_questions=[],
            quiz_answers={},
            pending_answer=None
        )
        
        result_message = "Congratulations! You passed!" if passed else "You didn't pass this time, but you can try again."
        
        return {
            "success": True,
            "score": score,
            "passed": passed,
            "message": f"Quiz submitted! You got {correct} out of {total} correct, which is {score}%. {result_message}"
        }
    
    elif function_name == "get_quiz_status":
        if session.get("mode") != "quiz":
            return {"success": False, "message": "No quiz in progress."}
        
        answers = session.get("quiz_answers", {})
        questions = session.get("quiz_questions", [])
        answered = len(answers)
        total = len(questions)
        unanswered = [i+1 for i in range(total) if i not in answers]
        
        return {
            "success": True,
            "answered": answered,
            "total": total,
            "unanswered": unanswered,
            "current_question": session.get("current_question_index", 0) + 1,
            "message": f"You're on question {session.get('current_question_index', 0) + 1}. " +
                      f"Answered: {answered} of {total}. " +
                      (f"Unanswered: {', '.join(map(str, unanswered[:5]))}." if unanswered else "All questions answered!")
        }
    
    # ==================== ASSIGNMENT FUNCTIONS ====================
    
    elif function_name == "list_all_assignments":
        enrollments = courses.get_user_enrollments(db, user_id)
        all_assignments = []
        
        for enrollment in enrollments:
            course_assignments = assignments.get_assignments_by_course(db, enrollment.course_id)
            for assignment in course_assignments:
                submission = db.query(Submission).filter(
                    Submission.student_id == user_id,
                    Submission.assignment_id == assignment.id
                ).first()
                
                # Determine submission status
                submission_status = "not_submitted"
                if submission:
                    submission_status = submission.status.value if hasattr(submission.status, 'value') else str(submission.status)
                
                assignment_data = {
                    "number": len(all_assignments) + 1,
                    "id": assignment.id,
                    "title": assignment.title,
                    "course_id": enrollment.course_id,
                    "course_title": enrollment.course.title,
                    "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
                    "max_score": assignment.max_score,
                    "submitted": submission is not None,
                    "status": submission_status,
                    "score": submission.score if submission else None,
                    "is_late": submission.is_late if submission else False,
                    "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
                    "graded_at": submission.graded_at.isoformat() if submission and submission.graded_at else None
                }
                all_assignments.append(assignment_data)
        
        session_manager.update_session(user_id, assignments_cache=all_assignments)
        
        await send_context_update({
            "action": "show_assignments",
            "assignments": all_assignments
        })
        
        if not all_assignments:
            return {"success": True, "message": "No assignments available."}
        
        pending = [a for a in all_assignments if not a["submitted"]]
        
        return {
            "success": True,
            "assignments": all_assignments,
            "message": f"You have {len(all_assignments)} assignments, {len(pending)} pending. " +
                      ", ".join([f"Assignment {a['number']}: {a['title']}" + 
                               (" - Submitted" if a['submitted'] else f" - Due {a['due_date'][:10] if a['due_date'] else 'No due date'}")
                               for a in all_assignments[:5]])
        }
    
    elif function_name == "get_assignment_details":
        assignment_id = arguments.get("assignment_id")
        assignment_number = arguments.get("assignment_number")
        
        assignments_cache = session.get("assignments_cache", [])
        if assignment_number and assignments_cache:
            for a in assignments_cache:
                if a["number"] == assignment_number:
                    assignment_id = a["id"]
                    break
        
        if not assignment_id:
            return {"success": False, "message": "Assignment not found. Say 'show my assignments' first."}
        
        assignment = assignments.get_assignment(db, assignment_id)
        if not assignment:
            return {"success": False, "message": "Assignment not found."}
        
        submission = db.query(Submission).filter(
            Submission.student_id == user_id,
            Submission.assignment_id == assignment_id
        ).first()
        
        session_manager.update_session(user_id, current_assignment_id=assignment_id)
        
        # Determine submission status
        submission_status = "not_submitted"
        if submission:
            submission_status = submission.status.value if hasattr(submission.status, 'value') else str(submission.status)
        
        await send_context_update({
            "action": "show_assignment",
            "assignment": {
                "id": assignment.id,
                "title": assignment.title,
                "description": assignment.description,
                "due_date": assignment.due_date.isoformat() if assignment.due_date else None,
                "max_score": assignment.max_score,
                "allow_late_submission": assignment.allow_late_submission
            },
            "submission": {
                "submitted": submission is not None,
                "status": submission_status,
                "score": submission.score if submission else None,
                "is_late": submission.is_late if submission else False,
                "submitted_at": submission.submitted_at.isoformat() if submission and submission.submitted_at else None,
                "graded_at": submission.graded_at.isoformat() if submission and submission.graded_at else None
            } if submission else None
        })
        
        status = ""
        if submission:
            status = f"You already submitted this assignment"
            if submission.is_late:
                status += " (late submission)"
            if submission.status.value == 'graded' if hasattr(submission.status, 'value') else submission.status == 'graded':
                percentage = round((submission.score / assignment.max_score) * 100) if assignment.max_score else 0
                status += f" and received a grade of {submission.score} out of {assignment.max_score}, which is {percentage} percent."
            else:
                status += " and it's awaiting grading."
            if submission.submitted_at:
                status += f" Submitted on {submission.submitted_at.strftime('%B %d, %Y at %I:%M %p')}."
        else:
            is_overdue = assignment.due_date and datetime.now() > assignment.due_date
            if is_overdue:
                if assignment.allow_late_submission:
                    status = "This assignment is past due, but late submissions are allowed. Say 'start assignment' to begin."
                else:
                    status = "This assignment is past due and no longer accepts submissions."
            else:
                status = "You haven't submitted this assignment yet. Say 'start assignment' to begin."
        
        return {
            "success": True,
            "assignment": {"title": assignment.title, "description": assignment.description},
            "message": f"Assignment: {assignment.title}. {assignment.description}. {status}"
        }
    
    elif function_name == "start_assignment_submission":
        assignment_id = arguments.get("assignment_id") or session.get("current_assignment_id")
        
        if not assignment_id:
            return {"success": False, "message": "Please select an assignment first."}
        
        session_manager.update_session(user_id, mode="assignment", current_assignment_id=assignment_id, assignment_content="")
        
        return {
            "success": True,
            "message": "Ready to record your assignment submission. Start dictating your answer. " +
                      "Say 'done' when finished, or 'review' to hear what you've said so far."
        }
    
    elif function_name == "dictate_assignment_answer":
        if session.get("mode") != "assignment":
            return {"success": False, "message": "No assignment in progress. Say 'start assignment' first."}
        
        content = arguments.get("content", "")
        append = arguments.get("append", True)
        
        current_content = session.get("assignment_content", "")
        if append:
            new_content = current_content + " " + content if current_content else content
        else:
            new_content = content
        
        session_manager.update_session(user_id, assignment_content=new_content)
        
        return {
            "success": True,
            "content_length": len(new_content),
            "message": f"Got it. You've dictated {len(new_content.split())} words so far. " +
                      "Continue dictating, say 'review' to hear it back, or 'submit' when done."
        }
    
    elif function_name == "review_assignment_submission":
        if session.get("mode") != "assignment":
            return {"success": False, "message": "No assignment in progress."}
        
        content = session.get("assignment_content", "")
        if not content:
            return {"success": True, "message": "You haven't dictated anything yet."}
        
        return {"success": True, "content": content, "message": f"Here's what you've written: {content}"}
    
    elif function_name == "submit_assignment":
        if session.get("mode") != "assignment":
            return {"success": False, "message": "No assignment in progress."}
        
        confirm = arguments.get("confirm", False)
        content = session.get("assignment_content", "")
        
        if not content:
            return {"success": False, "message": "You haven't written anything yet. Please dictate your answer first."}
        
        if not confirm:
            word_count = len(content.split())
            return {"success": False, "message": f"Your submission has {word_count} words. Say 'yes, submit' to confirm."}
        
        # Create submission
        assignment_id = session.get("current_assignment_id")
        submission = Submission(
            student_id=user_id,
            assignment_id=assignment_id,
            text_answer=content,
            submitted_at=datetime.now()
        )
        db.add(submission)
        db.commit()
        
        await send_context_update({
            "action": "assignment_submitted",
            "success": True
        })
        
        # Reset state
        session_manager.update_session(user_id, mode="idle", current_assignment_id=None, assignment_content="")
        
        return {"success": True, "message": "Your assignment has been submitted successfully! Your teacher will grade it soon."}
    
    # ==================== PROGRESS & NAVIGATION ====================
    
    elif function_name == "get_student_progress":
        enrollments = courses.get_user_enrollments(db, user_id)
        
        progress_data = []
        total_progress = 0
        for enrollment in enrollments:
            progress_data.append({
                "course": enrollment.course.title,
                "progress": enrollment.progress_percentage,
                "completed": enrollment.completed
            })
            total_progress += enrollment.progress_percentage
        
        avg_progress = total_progress / len(enrollments) if enrollments else 0
        
        await send_context_update({
            "action": "show_progress",
            "progress": {
                "courses": progress_data,
                "average": round(avg_progress, 1),
                "total_courses": len(enrollments),
                "completed": sum(1 for e in enrollments if e.completed)
            }
        })
        
        return {
            "success": True,
            "progress": progress_data,
            "average_progress": round(avg_progress, 1),
            "total_courses": len(enrollments),
            "completed_courses": sum(1 for e in enrollments if e.completed),
            "message": f"Your average progress is {round(avg_progress)}% across {len(enrollments)} courses. " +
                      f"{sum(1 for e in enrollments if e.completed)} courses completed."
        }
    
    elif function_name == "navigate_to_page":
        page = arguments.get("page")
        
        url_map = {
            "dashboard": "/student",
            "home": "/student",
            "courses": "/student/courses",
            "progress": "/student/progress",
            "settings": "/student/accessibility",
            "back": "BACK"
        }
        
        url = url_map.get(page)
        if not url:
            return {"success": False, "message": f"Unknown destination: {page}"}
        
        await send_context_update({
            "action": "navigate",
            "url": url if url != "BACK" else None,
            "back": url == "BACK"
        })
        
        # Reset context
        session_manager.update_session(user_id, mode="idle")
        
        return {"success": True, "navigation": {"url": url, "page": page}, "message": f"Navigating to {page}."}
    
    elif function_name == "clear_display":
        session_manager.update_session(user_id, mode="idle")
        
        await send_context_update({"action": "clear_display"})
        
        return {"success": True, "message": "Display cleared. What would you like to do?"}
    
    return {"success": False, "message": "Unknown function"}


@router.websocket("/realtime/{token}")
async def voice_realtime_websocket(websocket: WebSocket, token: str):
    """
    WebSocket endpoint for real-time voice interaction.
    Bridges between the client and OpenAI's Realtime API.
    """
    await websocket.accept()
    
    # Verify token and get user
    db = next(get_db())
    try:
        user = get_user_from_token(token, db)
        if not user:
            await websocket.send_json({"type": "error", "message": "Invalid token"})
            await websocket.close()
            return
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close()
        return
    
    # Create session
    session = session_manager.create_session(user.id)
    
    # Check for OpenAI API key
    if not OPENAI_API_KEY:
        await websocket.send_json({
            "type": "error", 
            "message": "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
        })
        await websocket.close()
        return
    
    openai_ws = None
    
    try:
        # Connect to OpenAI Realtime API
        import websockets
        
        headers = [
            ("Authorization", f"Bearer {OPENAI_API_KEY}"),
            ("OpenAI-Beta", "realtime=v1")
        ]
        
        async with websockets.connect(OPENAI_REALTIME_URL, additional_headers=headers) as openai_ws:
            # Send session configuration
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": SYSTEM_INSTRUCTIONS + f"\n\nCurrent user: {user.full_name} (Student)",
                    "voice": "alloy",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "input_audio_transcription": {
                        "model": "gpt-4o-transcribe"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.3,
                        "prefix_padding_ms": 500,
                        "silence_duration_ms": 800
                    },
                    "tools": VOICE_TOOLS,
                    "tool_choice": "auto",
                    "temperature": 0.8
                }
            }
            await openai_ws.send(json.dumps(session_config))
            
            # Notify client that connection is ready
            await websocket.send_json({
                "type": "session.created",
                "message": "Voice assistant connected. You can start speaking."
            })
            
            async def forward_to_openai():
                """Forward messages from client to OpenAI"""
                try:
                    audio_chunks_received = 0
                    while True:
                        data = await websocket.receive()
                        
                        if "text" in data:
                            message = json.loads(data["text"])
                            msg_type = message.get("type")
                            
                            # Handle different message types from client
                            if msg_type == "input_audio_buffer.append":
                                # Forward audio data to OpenAI
                                audio_chunks_received += 1
                                if audio_chunks_received % 50 == 0:  # Log every 50 chunks
                                    print(f"Received {audio_chunks_received} audio chunks from client")
                                await openai_ws.send(json.dumps(message))
                            
                            elif msg_type == "input_audio_buffer.commit":
                                # Commit audio buffer
                                print(f"Committing audio buffer after {audio_chunks_received} chunks")
                                await openai_ws.send(json.dumps(message))
                            
                            elif msg_type == "conversation.item.create":
                                # Text input
                                print(f"Text input received: {message}")
                                await openai_ws.send(json.dumps(message))
                            
                            elif message.get("type") == "response.create":
                                # Request response
                                await openai_ws.send(json.dumps(message))
                        
                        elif "bytes" in data:
                            # Binary audio data
                            audio_base64 = base64.b64encode(data["bytes"]).decode()
                            await openai_ws.send(json.dumps({
                                "type": "input_audio_buffer.append",
                                "audio": audio_base64
                            }))
                
                except WebSocketDisconnect:
                    print("Client disconnected in forward_to_openai")
                    raise  # Re-raise to cancel gather
                except asyncio.CancelledError:
                    print("forward_to_openai cancelled")
                    raise
                except Exception as e:
                    print(f"Error forwarding to OpenAI: {e}")
                    raise  # Re-raise to cancel gather
            
            async def forward_to_client():
                """Forward messages from OpenAI to client, handling function calls"""
                try:
                    async for message in openai_ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        # Log important events
                        if event_type not in ["response.audio.delta"]:  # Don't log audio chunks
                            print(f"OpenAI event: {event_type}")
                        
                        # Log speech events for debugging
                        if event_type == "input_audio_buffer.speech_started":
                            print(">>> Speech detected - user is speaking")
                        elif event_type == "input_audio_buffer.speech_stopped":
                            print(">>> Speech ended - processing audio")
                        elif event_type == "input_audio_buffer.committed":
                            print(">>> Audio buffer committed to conversation")
                        elif event_type == "conversation.item.created":
                            item = event.get("item", {})
                            print(f">>> Conversation item created: type={item.get('type')}, role={item.get('role')}")
                        elif event_type == "response.created":
                            print(">>> AI response generation started")
                        elif event_type == "response.done":
                            response = event.get("response", {})
                            status = response.get("status")
                            print(f">>> AI response done: status={status}")
                            if response.get("status_details"):
                                print(f">>> Status details: {response.get('status_details')}")
                        
                        # Handle function calls
                        if event_type == "response.function_call_arguments.done":
                            call_id = event.get("call_id")
                            function_name = event.get("name")
                            arguments = json.loads(event.get("arguments", "{}"))
                            
                            print(f"Function call: {function_name} with args: {arguments}")
                            
                            # Execute the function
                            result = await execute_function(
                                function_name, 
                                arguments, 
                                user.id, 
                                db,
                                websocket
                            )
                            
                            print(f"Function result: {result}")
                            
                            # Send function result back to OpenAI
                            function_output = {
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": json.dumps(result)
                                }
                            }
                            await openai_ws.send(json.dumps(function_output))
                            
                            # Request a response after function call
                            await openai_ws.send(json.dumps({"type": "response.create"}))
                            
                            # Send navigation command to client if present
                            if result.get("navigation"):
                                await websocket.send_json({
                                    "type": "navigation",
                                    "data": result["navigation"]
                                })
                        
                        # Forward relevant events to client
                        elif event_type in [
                            "session.created",
                            "session.updated",
                            "response.audio.delta",
                            "response.audio.done",
                            "response.audio_transcript.delta",
                            "response.audio_transcript.done",
                            "response.text.delta",
                            "response.text.done",
                            "response.done",
                            "response.created",
                            "input_audio_buffer.speech_started",
                            "input_audio_buffer.speech_stopped",
                            "input_audio_buffer.committed",
                            "conversation.item.created",
                            "conversation.item.input_audio_transcription.completed",
                            "conversation.item.input_audio_transcription.failed",
                            "error"
                        ]:
                            # Log transcription failures for debugging
                            if event_type == "conversation.item.input_audio_transcription.failed":
                                error_info = event.get("error", {})
                                print(f">>> TRANSCRIPTION FAILED <<<")
                                print(f"    Error type: {error_info.get('type')}")
                                print(f"    Error message: {error_info.get('message')}")
                                print(f"    Error code: {error_info.get('code')}")
                                print(f"    Full event: {json.dumps(event, indent=2)}")
                            elif event_type == "error":
                                print(f">>> ERROR EVENT: {json.dumps(event, indent=2)}")
                            await websocket.send_json(event)
                
                except WebSocketDisconnect:
                    print("Client disconnected in forward_to_client")
                    raise  # Re-raise to cancel gather
                except asyncio.CancelledError:
                    print("forward_to_client cancelled")
                    raise
                except Exception as e:
                    print(f"Error forwarding to client: {e}")
                    raise  # Re-raise to cancel gather
            
            # Run both forwarding tasks concurrently with proper cancellation
            try:
                await asyncio.gather(
                    forward_to_openai(),
                    forward_to_client(),
                    return_exceptions=False
                )
            except (WebSocketDisconnect, asyncio.CancelledError):
                print("Connection tasks ended")
            except Exception as e:
                print(f"Task error: {e}")
    
    except WebSocketDisconnect:
        print("Client disconnected")
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Connection error: {str(e)}"
            })
        except:
            pass  # WebSocket may already be closed
    
    finally:
        session_manager.remove_session(user.id)
        try:
            await websocket.close()
        except:
            pass  # WebSocket may already be closed


@router.get("/session-token")
async def get_voice_session_token(
    db: Session = Depends(get_db)
):
    """Get a temporary token for voice WebSocket connection - this endpoint is deprecated, use existing auth token instead"""
    from api.dependencies import get_current_user
    
    return {
        "message": "Use your existing authentication token for voice WebSocket connection",
        "endpoint": "/api/voice/realtime/{token}"
    }
