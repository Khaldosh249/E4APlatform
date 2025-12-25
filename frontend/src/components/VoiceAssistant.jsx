import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Loader2, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import useAccessibilityStore from '../store/accessibilityStore';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export default function VoiceAssistant({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { ttsSpeed } = useAccessibilityStore();
  
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [conversationHistory, setConversationHistory] = useState([]);
  
  // Data cache
  const [courses, setCourses] = useState([]);
  const [currentCourse, setCurrentCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const utteranceRef = useRef(null);
  const pendingTranscriptRef = useRef('');

  // Load enrolled courses on mount
  useEffect(() => {
    if (isOpen) {
      loadCourses();
      speak('Voice assistant activated. Say "help" to hear available commands.');
    }
    return () => {
      stopListening();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadCourses = async () => {
    try {
      const res = await api.get('/courses/enrolled/my-enrollments');
      setCourses(res.data);
    } catch (err) {
      console.error('Failed to load courses:', err);
    }
  };

  const loadLessons = async (courseId) => {
    try {
      const res = await api.get(`/lessons/course/${courseId}`);
      setLessons(res.data);
      return res.data;
    } catch (err) {
      console.error('Failed to load lessons:', err);
      return [];
    }
  };

  // Text-to-Speech function
  const speak = useCallback((text) => {
    if (!text) return;
    
    stopSpeaking();
    setIsSpeaking(true);
    setResponse(text);
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = ttsSpeed || 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
    };
    
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [ttsSpeed]);

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
  };

  // Speech Recognition
  const startListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setTranscript('');
      setError('');
    };

    recognitionRef.current.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultTranscript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += resultTranscript;
        } else {
          interimTranscript += resultTranscript;
        }
      }

      setTranscript(finalTranscript || interimTranscript);
      
      // Store final transcript for processing when recognition ends
      if (finalTranscript) {
        pendingTranscriptRef.current = finalTranscript;
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(`Error: ${event.error}`);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
      // Process the final transcript when recognition ends
      if (pendingTranscriptRef.current) {
        const cmd = pendingTranscriptRef.current.toLowerCase().trim();
        pendingTranscriptRef.current = '';
        processCommand(cmd);
      }
    };

    recognitionRef.current.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  };

  // Process voice commands
  const processCommand = async (command) => {
    setIsProcessing(true);
    addToHistory('user', command);

    try {
      let responseText = '';

      // Help command
      if (command.includes('help') || command.includes('what can you do') || command.includes('commands')) {
        responseText = getHelpText();
      }
      // List courses
      else if (command.includes('show courses') || command.includes('list courses') || 
               command.includes('my courses') || command.includes('available courses') ||
               command.includes('what courses')) {
        responseText = await handleListCourses();
      }
      // Select/Choose course by number or name
      else if (command.includes('select course') || command.includes('choose course') || 
               command.includes('open course') || command.includes('go to course')) {
        responseText = await handleSelectCourse(command);
      }
      // List lessons
      else if (command.includes('show lessons') || command.includes('list lessons') || 
               command.includes('what lessons') || command.includes('available lessons')) {
        responseText = await handleListLessons();
      }
      // Select/Choose lesson by number or name
      else if (command.includes('select lesson') || command.includes('choose lesson') || 
               command.includes('open lesson') || command.includes('go to lesson') ||
               command.includes('play lesson') || command.includes('start lesson')) {
        responseText = await handleSelectLesson(command);
      }
      // Read current lesson
      else if (command.includes('read lesson') || command.includes('read content') ||
               command.includes('what does it say') || command.includes('read this')) {
        responseText = handleReadLesson();
      }
      // Navigation
      else if (command.includes('go back') || command.includes('back')) {
        responseText = handleGoBack();
      }
      else if (command.includes('go home') || command.includes('home') || command.includes('dashboard')) {
        navigate('/student');
        responseText = 'Navigating to your dashboard.';
      }
      // Current context
      else if (command.includes('where am i') || command.includes('current') || command.includes('status')) {
        responseText = getCurrentContext();
      }
      // Close assistant
      else if (command.includes('close') || command.includes('exit') || command.includes('stop assistant')) {
        responseText = 'Closing voice assistant. Goodbye!';
        speak(responseText);
        setTimeout(() => onClose(), 2000);
        return;
      }
      // Unknown command - use OpenAI for natural language understanding
      else {
        responseText = await handleNaturalLanguage(command);
      }

      addToHistory('assistant', responseText);
      speak(responseText);
    } catch (err) {
      console.error('Error processing command:', err);
      const errorMsg = 'Sorry, I encountered an error processing your request.';
      speak(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const getHelpText = () => {
    return `Here are the available commands:
      Say "show courses" to list your enrolled courses.
      Say "select course" followed by the number or name to choose a course.
      Say "show lessons" to list lessons in the current course.
      Say "select lesson" followed by the number to open a lesson.
      Say "read lesson" to hear the lesson content.
      Say "where am I" to know your current location.
      Say "go back" to return to the previous screen.
      Say "go home" to return to your dashboard.
      Say "close" to exit the voice assistant.`;
  };

  const handleListCourses = async () => {
    await loadCourses();
    
    if (courses.length === 0) {
      return 'You are not enrolled in any courses yet. Please enroll in courses from your dashboard.';
    }

    const courseList = courses.map((enrollment, index) => 
      `${index + 1}. ${enrollment.course.title}`
    ).join('. ');

    return `You have ${courses.length} enrolled courses: ${courseList}. Say "select course" followed by the number to choose one.`;
  };

  const handleSelectCourse = async (command) => {
    if (courses.length === 0) {
      await loadCourses();
    }

    // Try to extract number
    const numberMatch = command.match(/\d+/);
    if (numberMatch) {
      const index = parseInt(numberMatch[0]) - 1;
      if (index >= 0 && index < courses.length) {
        const selectedCourse = courses[index].course;
        setCurrentCourse(selectedCourse);
        const loadedLessons = await loadLessons(selectedCourse.id);
        return `Selected ${selectedCourse.title}. This course has ${loadedLessons.length} lessons. Say "show lessons" to hear them, or "select lesson" followed by a number.`;
      }
    }

    // Try to match by name
    const courseName = command.replace(/select course|choose course|open course|go to course/gi, '').trim();
    const matchedCourse = courses.find(e => 
      e.course.title.toLowerCase().includes(courseName)
    );

    if (matchedCourse) {
      setCurrentCourse(matchedCourse.course);
      const loadedLessons = await loadLessons(matchedCourse.course.id);
      return `Selected ${matchedCourse.course.title}. This course has ${loadedLessons.length} lessons. Say "show lessons" to hear them.`;
    }

    return 'I could not find that course. Say "show courses" to hear the list of available courses.';
  };

  const handleListLessons = async () => {
    if (!currentCourse) {
      return 'Please select a course first. Say "show courses" to see available courses.';
    }

    if (lessons.length === 0) {
      await loadLessons(currentCourse.id);
    }

    if (lessons.length === 0) {
      return `The course ${currentCourse.title} has no lessons yet.`;
    }

    const lessonList = lessons.map((lesson, index) => 
      `${index + 1}. ${lesson.title}`
    ).join('. ');

    return `${currentCourse.title} has ${lessons.length} lessons: ${lessonList}. Say "select lesson" followed by the number to open one.`;
  };

  const handleSelectLesson = async (command) => {
    if (!currentCourse) {
      return 'Please select a course first. Say "show courses" to see available courses.';
    }

    if (lessons.length === 0) {
      await loadLessons(currentCourse.id);
    }

    // Try to extract number
    const numberMatch = command.match(/\d+/);
    if (numberMatch) {
      const index = parseInt(numberMatch[0]) - 1;
      if (index >= 0 && index < lessons.length) {
        const selectedLesson = lessons[index];
        setCurrentLesson(selectedLesson);
        navigate(`/student/courses/${currentCourse.id}/lessons/${selectedLesson.id}`);
        return `Opening lesson ${index + 1}: ${selectedLesson.title}. Say "read lesson" to hear the content.`;
      }
    }

    // Try to match by name
    const lessonName = command.replace(/select lesson|choose lesson|open lesson|go to lesson|play lesson|start lesson/gi, '').trim();
    const matchedLesson = lessons.find(l => 
      l.title.toLowerCase().includes(lessonName)
    );

    if (matchedLesson) {
      setCurrentLesson(matchedLesson);
      navigate(`/student/courses/${currentCourse.id}/lessons/${matchedLesson.id}`);
      return `Opening lesson: ${matchedLesson.title}. Say "read lesson" to hear the content.`;
    }

    return 'I could not find that lesson. Say "show lessons" to hear the list of available lessons.';
  };

  const handleReadLesson = () => {
    if (!currentLesson) {
      return 'No lesson is currently selected. Say "select lesson" followed by a number to choose one.';
    }

    return `Lesson: ${currentLesson.title}. ${currentLesson.content || 'This lesson has no text content.'}`;
  };

  const handleGoBack = () => {
    if (currentLesson) {
      setCurrentLesson(null);
      if (currentCourse) {
        navigate(`/student/courses/${currentCourse.id}`);
        return `Going back to ${currentCourse.title}. Say "show lessons" to see available lessons.`;
      }
    }
    
    if (currentCourse) {
      setCurrentCourse(null);
      setLessons([]);
      navigate('/student');
      return 'Going back to your dashboard. Say "show courses" to see your enrolled courses.';
    }

    navigate('/student');
    return 'You are at your dashboard.';
  };

  const getCurrentContext = () => {
    if (currentLesson) {
      return `You are viewing lesson: ${currentLesson.title} from course: ${currentCourse?.title}. Say "read lesson" to hear the content.`;
    }
    if (currentCourse) {
      return `You are in course: ${currentCourse.title}. It has ${lessons.length} lessons. Say "show lessons" to hear them.`;
    }
    return `You are at your dashboard. You have ${courses.length} enrolled courses. Say "show courses" to hear them.`;
  };

  // Use OpenAI for natural language understanding
  const handleNaturalLanguage = async (command) => {
    if (!OPENAI_API_KEY) {
      return 'I did not understand that command. Say "help" to hear available commands.';
    }

    try {
      const context = getCurrentContext();
      const systemPrompt = `You are a voice assistant for an educational platform helping visually impaired students navigate.
Current context: ${context}
Available courses: ${courses.map(e => e.course.title).join(', ')}
${currentCourse ? `Current course: ${currentCourse.title}` : ''}
${lessons.length > 0 ? `Available lessons: ${lessons.map(l => l.title).join(', ')}` : ''}

Respond briefly and helpfully. If the user wants to do something, guide them on what command to say.
Available commands: show courses, select course [number], show lessons, select lesson [number], read lesson, go back, go home, help.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: command }
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });

      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'I did not understand. Say "help" for available commands.';
    } catch (err) {
      console.error('OpenAI error:', err);
      return 'I did not understand that command. Say "help" to hear available commands.';
    }
  };

  const addToHistory = (role, content) => {
    setConversationHistory(prev => [...prev.slice(-10), { role, content, timestamp: new Date() }]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isListening ? 'bg-red-100 animate-pulse' : 
              isSpeaking ? 'bg-green-100' : 
              'bg-primary-100'
            }`}>
              {isListening ? (
                <Mic className="h-6 w-6 text-red-600" />
              ) : isSpeaking ? (
                <Volume2 className="h-6 w-6 text-green-600" />
              ) : (
                <MicOff className="h-6 w-6 text-primary-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">Voice Assistant</h2>
              <p className="text-sm text-gray-500">
                {isListening ? 'Listening...' : 
                 isSpeaking ? 'Speaking...' : 
                 isProcessing ? 'Processing...' :
                 'Click the microphone to speak'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
            aria-label="Close voice assistant"
          >
            ×
          </button>
        </div>

        {/* Status Indicator */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-3 h-3 rounded-full ${
              isListening ? 'bg-red-500 animate-pulse' :
              isSpeaking ? 'bg-green-500' :
              'bg-gray-400'
            }`} />
            <span className="font-medium">
              {isListening ? 'Listening' : isSpeaking ? 'Speaking' : 'Ready'}
            </span>
          </div>
          
          {transcript && (
            <div className="mt-2">
              <p className="text-sm text-gray-500">You said:</p>
              <p className="text-lg">{transcript}</p>
            </div>
          )}
          
          {response && (
            <div className="mt-3">
              <p className="text-sm text-gray-500">Assistant:</p>
              <p className="text-gray-800">{response}</p>
            </div>
          )}
          
          {error && (
            <p className="mt-2 text-red-600 text-sm">{error}</p>
          )}
        </div>

        {/* Control Buttons */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              isListening 
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={isListening ? 'Stop listening' : 'Start listening'}
          >
            {isProcessing ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : isListening ? (
              <MicOff className="h-8 w-8" />
            ) : (
              <Mic className="h-8 w-8" />
            )}
          </button>
          
          <button
            onClick={isSpeaking ? stopSpeaking : () => speak(response)}
            disabled={!response}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              isSpeaking 
                ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            } ${!response ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-label={isSpeaking ? 'Stop speaking' : 'Repeat response'}
          >
            {isSpeaking ? (
              <VolumeX className="h-6 w-6" />
            ) : (
              <Volume2 className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Quick Commands */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Quick Commands</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Show courses', 'Show lessons', 'Help', 'Where am I', 'Go back', 'Go home'].map(cmd => (
              <button
                key={cmd}
                onClick={() => processCommand(cmd.toLowerCase())}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition-colors"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation History */}
        {conversationHistory.length > 0 && (
          <div className="border-t mt-4 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Conversation History</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {conversationHistory.map((item, index) => (
                <div 
                  key={index}
                  className={`text-sm p-2 rounded ${
                    item.role === 'user' 
                      ? 'bg-blue-50 text-blue-800' 
                      : 'bg-gray-50 text-gray-800'
                  }`}
                >
                  <span className="font-medium">{item.role === 'user' ? 'You: ' : 'Assistant: '}</span>
                  {item.content.substring(0, 100)}{item.content.length > 100 ? '...' : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
