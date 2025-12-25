"""
OpenAI Realtime Speech-to-Speech WebSocket Handler
Integrates with OpenAI's Realtime API for voice-based interactions
"""

import os
import json
import base64
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from db.session import get_db
from db import courses, lessons, users, quizzes, assignments
from db.users import User
from core.security import SECRET_KEY, ALGORITHM
import httpx

router = APIRouter(prefix="/voice", tags=["voice"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"


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

# Define tools/functions for the voice assistant
VOICE_TOOLS = [
    {
        "type": "function",
        "name": "list_enrolled_courses",
        "description": "Get the list of courses the student is enrolled in",
        "parameters": {
            "type": "object",
            "properties": {},
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
                "course_id": {
                    "type": "integer",
                    "description": "The ID of the course"
                },
                "course_name": {
                    "type": "string",
                    "description": "The name of the course (partial match supported)"
                }
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "get_lesson_content",
        "description": "Get the content of a specific lesson to read aloud",
        "parameters": {
            "type": "object",
            "properties": {
                "lesson_id": {
                    "type": "integer",
                    "description": "The ID of the lesson"
                },
                "course_id": {
                    "type": "integer",
                    "description": "The ID of the course containing the lesson"
                },
                "lesson_number": {
                    "type": "integer",
                    "description": "The lesson number (1-based index)"
                }
            },
            "required": []
        }
    },
    {
        "type": "function",
        "name": "list_course_lessons",
        "description": "List all lessons in a course",
        "parameters": {
            "type": "object",
            "properties": {
                "course_id": {
                    "type": "integer",
                    "description": "The ID of the course"
                }
            },
            "required": ["course_id"]
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
                    "enum": ["dashboard", "course", "lesson", "quiz", "assignment", "progress", "settings"],
                    "description": "The page to navigate to"
                },
                "course_id": {
                    "type": "integer",
                    "description": "Course ID (required for course, lesson, quiz, assignment pages)"
                },
                "lesson_id": {
                    "type": "integer",
                    "description": "Lesson ID (required for lesson page)"
                },
                "quiz_id": {
                    "type": "integer",
                    "description": "Quiz ID (required for quiz page)"
                },
                "assignment_id": {
                    "type": "integer",
                    "description": "Assignment ID (required for assignment page)"
                }
            },
            "required": ["page"]
        }
    },
    {
        "type": "function",
        "name": "get_student_progress",
        "description": "Get the student's progress across all enrolled courses",
        "parameters": {
            "type": "object",
            "properties": {},
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
    }
]

SYSTEM_INSTRUCTIONS = """You are a helpful voice assistant for the E4A Learning Platform, specifically designed to help visually impaired students navigate and interact with educational content.

Your responsibilities:
1. Help students browse and select courses
2. Read lesson content aloud when requested
3. Navigate students to different parts of the platform
4. Provide information about their progress
5. Answer questions about course content

Guidelines:
- Be concise but friendly in your responses
- When listing items, number them clearly so students can select by number
- Always confirm actions before navigating
- If a student asks to "read" or "open" something, use the appropriate function
- Speak naturally as if having a conversation
- When reading lesson content, read it clearly and at a good pace
- Remember the current context (which course/lesson the student is viewing)

Current context will be provided with each interaction."""


class VoiceSessionManager:
    """Manages voice session state for each connected user"""
    
    def __init__(self):
        self.sessions = {}
    
    def create_session(self, user_id: int):
        self.sessions[user_id] = {
            "current_course_id": None,
            "current_lesson_id": None,
            "courses_cache": [],
            "lessons_cache": []
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
    db: Session
) -> dict:
    """Execute a function call and return the result"""
    
    session = session_manager.get_session(user_id)
    
    if function_name == "list_enrolled_courses":
        enrollments = courses.get_user_enrollments(db, user_id)
        course_list = []
        for i, enrollment in enumerate(enrollments, 1):
            course = enrollment.course
            course_list.append({
                "number": i,
                "id": course.id,
                "title": course.title,
                "description": course.description,
                "progress": enrollment.progress_percentage
            })
        
        # Cache courses
        session_manager.update_session(user_id, courses_cache=course_list)
        
        return {
            "success": True,
            "courses": course_list,
            "message": f"You are enrolled in {len(course_list)} courses."
        }
    
    elif function_name == "list_available_courses":
        all_courses = courses.get_courses(db, published_only=True)
        enrollments = courses.get_user_enrollments(db, user_id)
        enrolled_ids = {e.course_id for e in enrollments}
        
        available = []
        for i, course in enumerate(all_courses, 1):
            if course.id not in enrolled_ids:
                available.append({
                    "number": i,
                    "id": course.id,
                    "title": course.title,
                    "description": course.description
                })
        
        return {
            "success": True,
            "courses": available,
            "message": f"There are {len(available)} courses available to enroll in."
        }
    
    elif function_name == "get_course_details":
        course_id = arguments.get("course_id")
        course_name = arguments.get("course_name")
        
        # Find course by ID or name
        if not course_id and course_name:
            # Search by name in cache
            cached = session.get("courses_cache", [])
            for c in cached:
                if course_name.lower() in c["title"].lower():
                    course_id = c["id"]
                    break
        
        if not course_id:
            return {"success": False, "message": "Course not found. Please say the course number or name."}
        
        course = courses.get_course(db, course_id)
        if not course:
            return {"success": False, "message": "Course not found."}
        
        course_lessons = lessons.get_lessons_by_course(db, course_id)
        course_quizzes = quizzes.get_quizzes_by_course(db, course_id)
        course_assignments = assignments.get_assignments_by_course(db, course_id)
        
        # Update session
        session_manager.update_session(
            user_id, 
            current_course_id=course_id,
            lessons_cache=[{"number": i+1, "id": l.id, "title": l.title} for i, l in enumerate(course_lessons)]
        )
        
        return {
            "success": True,
            "course": {
                "id": course.id,
                "title": course.title,
                "description": course.description
            },
            "lessons": [{"number": i+1, "id": l.id, "title": l.title} for i, l in enumerate(course_lessons)],
            "quizzes": [{"id": q.id, "title": q.title} for q in course_quizzes],
            "assignments": [{"id": a.id, "title": a.title} for a in course_assignments],
            "message": f"Course '{course.title}' has {len(course_lessons)} lessons, {len(course_quizzes)} quizzes, and {len(course_assignments)} assignments."
        }
    
    elif function_name == "list_course_lessons":
        course_id = arguments.get("course_id") or session.get("current_course_id")
        
        if not course_id:
            return {"success": False, "message": "Please select a course first."}
        
        course_lessons = lessons.get_lessons_by_course(db, course_id)
        lesson_list = [{"number": i+1, "id": l.id, "title": l.title} for i, l in enumerate(course_lessons)]
        
        session_manager.update_session(user_id, lessons_cache=lesson_list)
        
        return {
            "success": True,
            "lessons": lesson_list,
            "message": f"This course has {len(lesson_list)} lessons."
        }
    
    elif function_name == "get_lesson_content":
        lesson_id = arguments.get("lesson_id")
        lesson_number = arguments.get("lesson_number")
        course_id = arguments.get("course_id") or session.get("current_course_id")
        
        # Find lesson by number in cache
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
        
        session_manager.update_session(user_id, current_lesson_id=lesson_id)
        
        return {
            "success": True,
            "lesson": {
                "id": lesson.id,
                "title": lesson.title,
                "content_text": lesson.content_text,
                "duration_minutes": lesson.duration_minutes
            },
            "navigation": {
                "page": "lesson",
                "course_id": lesson.course_id,
                "lesson_id": lesson.id
            },
            "message": f"Here is the content of lesson: {lesson.title}"
        }
    
    elif function_name == "navigate_to_page":
        page = arguments.get("page")
        course_id = arguments.get("course_id") or session.get("current_course_id")
        lesson_id = arguments.get("lesson_id") or session.get("current_lesson_id")
        quiz_id = arguments.get("quiz_id")
        assignment_id = arguments.get("assignment_id")
        
        navigation = {"page": page}
        
        if page == "dashboard":
            navigation["url"] = "/student"
        elif page == "course" and course_id:
            navigation["url"] = f"/student/courses/{course_id}"
            navigation["course_id"] = course_id
        elif page == "lesson" and course_id and lesson_id:
            navigation["url"] = f"/student/courses/{course_id}/lessons/{lesson_id}"
            navigation["course_id"] = course_id
            navigation["lesson_id"] = lesson_id
        elif page == "quiz" and course_id and quiz_id:
            navigation["url"] = f"/student/courses/{course_id}/quizzes/{quiz_id}"
            navigation["course_id"] = course_id
            navigation["quiz_id"] = quiz_id
        elif page == "assignment" and course_id and assignment_id:
            navigation["url"] = f"/student/courses/{course_id}/assignments/{assignment_id}"
            navigation["course_id"] = course_id
            navigation["assignment_id"] = assignment_id
        elif page == "progress":
            navigation["url"] = "/student/progress"
        elif page == "settings":
            navigation["url"] = "/student/accessibility"
        else:
            return {"success": False, "message": "Cannot navigate. Missing required information."}
        
        return {
            "success": True,
            "navigation": navigation,
            "message": f"Navigating to {page}."
        }
    
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
        
        return {
            "success": True,
            "progress": progress_data,
            "average_progress": round(avg_progress, 1),
            "total_courses": len(enrollments),
            "completed_courses": sum(1 for e in enrollments if e.completed),
            "message": f"Your average progress is {round(avg_progress)}% across {len(enrollments)} courses."
        }
    
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
                        "model": "whisper-1"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 500
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
                    pass
                except Exception as e:
                    print(f"Error forwarding to OpenAI: {e}")
            
            async def forward_to_client():
                """Forward messages from OpenAI to client, handling function calls"""
                try:
                    async for message in openai_ws:
                        event = json.loads(message)
                        event_type = event.get("type")
                        
                        # Log important events
                        if event_type not in ["response.audio.delta"]:  # Don't log audio chunks
                            print(f"OpenAI event: {event_type}")
                        
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
                                db
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
                            "input_audio_buffer.speech_started",
                            "input_audio_buffer.speech_stopped",
                            "conversation.item.input_audio_transcription.completed",
                            "error"
                        ]:
                            await websocket.send_json(event)
                
                except Exception as e:
                    print(f"Error forwarding to client: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
            
            # Run both forwarding tasks concurrently
            await asyncio.gather(
                forward_to_openai(),
                forward_to_client()
            )
    
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.send_json({
            "type": "error",
            "message": f"Connection error: {str(e)}"
        })
    
    finally:
        session_manager.remove_session(user.id)
        await websocket.close()


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
