import { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import RealtimeVoiceAssistant from './RealtimeVoiceAssistant';
import useAccessibilityStore from '../store/accessibilityStore';
import useAuthStore from '../store/authStore';

export default function VoiceAssistantButton() {
  const [isOpen, setIsOpen] = useState(false);
  const { ttsEnabled } = useAccessibilityStore();
  const { user } = useAuthStore();

  // Keyboard shortcut: Alt + V to toggle voice assistant
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        if (user?.role === 'student') {
          setIsOpen(prev => !prev);
        }
      }
      // Escape to close
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [user, isOpen]);

  // Only show for students
  if (!user || user.role !== 'student') {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all z-40 ${
          ttsEnabled 
            ? 'bg-primary-600 hover:bg-primary-700 text-white' 
            : 'bg-gray-600 hover:bg-gray-700 text-white'
        }`}
        aria-label="Open voice assistant (Alt+V)"
        title="Voice Assistant - OpenAI Realtime Speech (Alt+V)"
      >
        <Mic className="h-6 w-6" />
        {/* Pulse indicator when TTS enabled */}
        {ttsEnabled && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
        )}
      </button>

      {/* Realtime Voice Assistant Modal */}
      <RealtimeVoiceAssistant 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  );
}
