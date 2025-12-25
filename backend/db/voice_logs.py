from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .session import Base


class VoiceActionType(str, enum.Enum):
    
    TTS = "tts"  # ? Text-to-Speech
    STT = "stt"  # ? Speech-to-Text
    COMMAND = "command"  # ? Voice command
    NAVIGATION = "navigation"  # ? Voice navigation
    


class VoiceLog(Base):
    
    __tablename__ = "voice_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    action_type = Column(Enum(VoiceActionType), nullable=False)
    
    # * Input/Output
    input_text = Column(Text, nullable=True)  # ? For TTS
    output_text = Column(Text, nullable=True)  # ? For STT
    audio_url = Column(String(500), nullable=True)
    
    # * Command details
    command = Column(String(255), nullable=True)  # ? e.g., "start test", "next question"
    command_success = Column(Boolean, nullable=True)
    
    # * Context
    page_url = Column(String(500), nullable=True)
    session_id = Column(String(100), nullable=True)
    
    # * Performance metrics
    processing_time = Column(Float, nullable=True)  # ? in seconds
    confidence_score = Column(Float, nullable=True)  # ? STT confidence
    
    # * Error tracking
    error_occurred = Column(Boolean, default=False)
    error_message = Column(Text, nullable=True)
    error_code = Column(String(50), nullable=True)
    
    # * Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<VoiceLog {self.action_type} User:{self.user_id}>"
