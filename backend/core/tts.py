import os
from gtts import gTTS
from pathlib import Path
import hashlib

# Directory for storing audio files
AUDIO_DIR = Path("media/audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def generate_tts_audio(text: str, language: str = "en", filename: str = None) -> str:
    """
    Generate TTS audio from text
    Returns the relative URL path to the audio file
    """
    if not text:
        return None
    
    # Generate filename from text hash if not provided
    if not filename:
        text_hash = hashlib.md5(text.encode()).hexdigest()
        filename = f"tts_{text_hash}.mp3"
    
    filepath = AUDIO_DIR / filename
    
    # Check if file already exists
    if filepath.exists():
        return f"/media/audio/{filename}"
    
    try:
        # Generate TTS audio
        tts = gTTS(text=text, lang=language, slow=False)
        tts.save(str(filepath))
        
        return f"/media/audio/{filename}"
    except Exception as e:
        print(f"TTS generation error: {e}")
        return None


def delete_audio_file(audio_url: str):
    """Delete an audio file"""
    if not audio_url:
        return
    
    try:
        filename = audio_url.split("/")[-1]
        filepath = AUDIO_DIR / filename
        
        if filepath.exists():
            filepath.unlink()
    except Exception as e:
        print(f"Error deleting audio file: {e}")
