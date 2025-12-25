import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import useAuthStore from '../store/authStore';

/**
 * RealtimeVoiceAssistant - WebSocket-based voice assistant using OpenAI Realtime API
 * Provides true speech-to-speech interaction via backend WebSocket proxy
 */
const RealtimeVoiceAssistant = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  
  // Audio state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Conversation state
  const [messages, setMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [aiTranscript, setAiTranscript] = useState('');
  
  // Navigation state from function calls
  const [navigationContext, setNavigationContext] = useState({
    currentCourse: null,
    currentLesson: null,
    courses: [],
    lessons: []
  });
  
  // Refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const audioQueueRef = useRef([]);
  const sessionIdRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isListeningRef = useRef(false); // Track listening state in ref for callback
  
  // Generate unique session ID
  const generateSessionId = () => {
    return `voice_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  };
  
  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTranscript, aiTranscript]);
  
  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000 // OpenAI Realtime API uses 24kHz
      });
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);
  
  // Convert Float32Array to Int16 PCM
  const floatTo16BitPCM = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };
  
  // Convert ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  
  // Convert base64 to ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };
  
  // Audio playback state refs
  const audioPlaybackTimeRef = useRef(0);
  
  // Play audio from base64 PCM16 - improved streaming playback
  const playAudio = useCallback(async (base64Audio) => {
    try {
      const audioContext = await initAudioContext();
      const pcmData = base64ToArrayBuffer(base64Audio);
      
      // Convert Int16 PCM (little-endian) to Float32
      const dataView = new DataView(pcmData);
      const numSamples = pcmData.byteLength / 2;
      const float32Array = new Float32Array(numSamples);
      
      for (let i = 0; i < numSamples; i++) {
        // Read as little-endian Int16
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768.0;
      }
      
      // Create audio buffer at 24kHz (OpenAI's output sample rate)
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);
      
      // Schedule playback to avoid gaps
      const currentTime = audioContext.currentTime;
      const startTime = Math.max(currentTime, audioPlaybackTimeRef.current);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(startTime);
      
      // Update next playback time
      audioPlaybackTimeRef.current = startTime + audioBuffer.duration;
      
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }, [initAudioContext]);
  
  // Process audio queue - now processes immediately for streaming
  const processAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) return;
    
    setIsSpeaking(true);
    
    // Process all queued audio immediately
    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift();
      await playAudio(audioData);
    }
  }, [playAudio]);
  
  // Reset playback time when audio ends
  const resetAudioPlayback = useCallback(() => {
    audioPlaybackTimeRef.current = 0;
    setIsSpeaking(false);
  }, []);
  
  // Handle navigation from function calls
  const handleNavigation = useCallback((action, data) => {
    switch (action) {
      case 'navigate_to_course':
        if (data.course_id) {
          navigate(`/courses/${data.course_id}`);
          setNavigationContext(prev => ({
            ...prev,
            currentCourse: data
          }));
        }
        break;
        
      case 'navigate_to_lesson':
        if (data.lesson_id && data.course_id) {
          navigate(`/courses/${data.course_id}/lessons/${data.lesson_id}`);
          setNavigationContext(prev => ({
            ...prev,
            currentLesson: data
          }));
        }
        break;
        
      case 'navigate_to_quiz':
        if (data.quiz_id && data.course_id) {
          navigate(`/courses/${data.course_id}/quizzes/${data.quiz_id}`);
        }
        break;
        
      case 'courses_loaded':
        setNavigationContext(prev => ({
          ...prev,
          courses: data.courses || []
        }));
        break;
        
      case 'lessons_loaded':
        setNavigationContext(prev => ({
          ...prev,
          lessons: data.lessons || []
        }));
        break;
        
      default:
        console.log('Unknown navigation action:', action, data);
    }
  }, [navigate]);
  
  // Handle WebSocket messages
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'session.created':
          console.log('Voice session created');
          setIsConnected(true);
          setIsConnecting(false);
          addMessage('system', 'Voice assistant connected. Click the microphone to start speaking.');
          break;
          
        case 'input_audio_buffer.speech_started':
          setCurrentTranscript('Listening...');
          break;
          
        case 'input_audio_buffer.speech_stopped':
          setCurrentTranscript('Processing...');
          setIsProcessing(true);
          break;
          
        case 'conversation.item.input_audio_transcription.completed':
          if (data.transcript) {
            setCurrentTranscript('');
            addMessage('user', data.transcript);
          }
          break;
          
        case 'response.audio_transcript.delta':
          if (data.delta) {
            setAiTranscript(prev => prev + data.delta);
          }
          break;
          
        case 'response.audio_transcript.done':
          if (aiTranscript || data.transcript) {
            addMessage('assistant', data.transcript || aiTranscript);
            setAiTranscript('');
          }
          setIsProcessing(false);
          break;
          
        case 'response.audio.delta':
          if (data.delta) {
            audioQueueRef.current.push(data.delta);
            processAudioQueue();
          }
          break;
          
        case 'response.audio.done':
          // Reset playback timing for next response
          resetAudioPlayback();
          break;
          
        case 'response.function_call_arguments.done':
          console.log('Function call completed:', data.name, data.arguments);
          break;
          
        case 'response.done':
          setIsProcessing(false);
          // Handle function call results
          if (data.response?.output) {
            data.response.output.forEach(item => {
              if (item.type === 'function_call_output') {
                try {
                  const result = JSON.parse(item.output);
                  if (result.action) {
                    handleNavigation(result.action, result);
                  }
                } catch (e) {
                  console.log('Function output:', item.output);
                }
              }
            });
          }
          break;
          
        case 'navigation':
          // Direct navigation command from backend
          handleNavigation(data.action, data.data);
          break;
          
        case 'error':
          console.error('Voice error:', data.error);
          addMessage('error', data.error?.message || 'An error occurred');
          setIsProcessing(false);
          break;
          
        default:
          console.log('Unhandled message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTranscript, handleNavigation, processAudioQueue, resetAudioPlayback]);
  
  // Add message to conversation
  const addMessage = useCallback((role, content) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      role,
      content,
      timestamp: new Date().toISOString()
    }]);
  }, []);
  
  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      sessionIdRef.current = generateSessionId();
      // Connect to backend WebSocket which bridges to OpenAI Realtime API
      const wsUrl = `wss://api.e4a.khaldosh.dev/voice/realtime/${token}`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
      };
      
      wsRef.current.onmessage = handleMessage;
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('Connection error. Please check if the server is running.');
        setIsConnecting(false);
      };
      
      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setIsListening(false);
        stopAudioCapture();
        
        if (event.code !== 1000) {
          setConnectionError(`Connection closed: ${event.reason || 'Unknown reason'}`);
        }
      };
      
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionError(error.message);
      setIsConnecting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, handleMessage]);
  
  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    stopAudioCapture();
    setIsConnected(false);
    setIsListening(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Start audio capture
  const startAudioCapture = useCallback(async () => {
    try {
      const audioContext = await initAudioContext();
      
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
      
      // Create script processor for audio capture
      processorRef.current = audioContext.createScriptProcessor(4096, 1, 1);
      
      // Set listening ref before setting up processor
      isListeningRef.current = true;
      
      processorRef.current.onaudioprocess = (event) => {
        // Use ref instead of state for real-time check
        if (!isListeningRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Downsample if necessary (browser usually uses 44100Hz or 48000Hz)
        const targetSampleRate = 24000;
        const sourceSampleRate = audioContext.sampleRate;
        
        let audioData;
        if (sourceSampleRate !== targetSampleRate) {
          const ratio = sourceSampleRate / targetSampleRate;
          const newLength = Math.round(inputData.length / ratio);
          audioData = new Float32Array(newLength);
          for (let i = 0; i < newLength; i++) {
            audioData[i] = inputData[Math.round(i * ratio)];
          }
        } else {
          audioData = new Float32Array(inputData);
        }
        
        const pcmBuffer = floatTo16BitPCM(audioData);
        const base64Audio = arrayBufferToBase64(pcmBuffer);
        
        // Send audio to server
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio
        }));
      };
      
      source.connect(processorRef.current);
      processorRef.current.connect(audioContext.destination);
      
      setIsListening(true);
      console.log('Audio capture started, sample rate:', audioContext.sampleRate);
      
    } catch (error) {
      console.error('Error starting audio capture:', error);
      setConnectionError('Microphone access denied. Please allow microphone permissions.');
    }
  }, [initAudioContext]);
  
  // Stop audio capture
  const stopAudioCapture = useCallback(() => {
    isListeningRef.current = false;
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    setIsListening(false);
    
    // Commit the audio buffer
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));
    }
  }, []);
  
  // Toggle listening
  const toggleListening = useCallback(async () => {
    if (isListening) {
      stopAudioCapture();
    } else {
      if (!isConnected) {
        await connect();
      }
      await startAudioCapture();
    }
  }, [isListening, isConnected, connect, startAudioCapture, stopAudioCapture]);
  
  // Send text message (fallback) - exposed for future text input feature
  // eslint-disable-next-line no-unused-vars
  const sendTextMessage = useCallback((text) => {
    if (!isConnected || !text.trim()) return;
    
    addMessage('user', text);
    
    wsRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text.trim()
        }]
      }
    }));
    
    wsRef.current.send(JSON.stringify({
      type: 'response.create'
    }));
    
  }, [isConnected, addMessage]);
  
  // Connect on open
  useEffect(() => {
    if (isOpen && !isConnected && !isConnecting) {
      connect();
    }
    
    return () => {
      if (!isOpen) {
        disconnect();
      }
    };
  }, [isOpen, isConnected, isConnecting, connect, disconnect]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [disconnect]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!isOpen) return;
      
      // Space to toggle listening
      if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        toggleListening();
      }
      
      // Escape to close
      if (event.code === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggleListening, onClose]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      role="dialog"
      aria-modal="true"
      aria-label="Voice Assistant"
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
              <h2 className="text-lg font-semibold">Voice Assistant</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Close voice assistant"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Status */}
          <div className="mt-2 text-sm text-indigo-100">
            {isConnecting && 'Connecting...'}
            {isConnected && !isListening && !isProcessing && 'Ready - Press Space or click microphone to speak'}
            {isListening && 'Listening...'}
            {isProcessing && 'Processing...'}
            {isSpeaking && 'Speaking...'}
          </div>
        </div>
        
        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
          {messages.length === 0 && !connectionError && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <p>Start speaking to interact with the voice assistant</p>
              <p className="text-sm mt-2">Say things like &quot;Show my courses&quot; or &quot;Help me navigate&quot;</p>
            </div>
          )}
          
          {connectionError && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4 text-red-700 dark:text-red-300">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-medium">Connection Error</p>
                  <p className="text-sm mt-1">{connectionError}</p>
                  <button
                    onClick={connect}
                    className="mt-2 text-sm underline hover:no-underline"
                  >
                    Try reconnecting
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : message.role === 'error'
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    : message.role === 'system'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow rounded-bl-sm'
                }`}
              >
                <p className="text-sm">{message.content}</p>
              </div>
            </div>
          ))}
          
          {/* Current transcripts */}
          {currentTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-indigo-400 text-white rounded-br-sm opacity-70">
                <p className="text-sm italic">{currentTranscript}</p>
              </div>
            </div>
          )}
          
          {aiTranscript && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow rounded-bl-sm opacity-70">
                <p className="text-sm italic">{aiTranscript}</p>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Controls */}
        <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center space-x-4">
            {/* Microphone button */}
            <button
              onClick={toggleListening}
              disabled={isConnecting}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all transform ${
                isListening
                  ? 'bg-red-500 hover:bg-red-600 scale-110'
                  : isConnecting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'
              } text-white shadow-lg`}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
              {/* Pulse animation when listening */}
              {isListening && (
                <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75" />
              )}
              
              <svg className="w-8 h-8 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isListening ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                )}
              </svg>
            </button>
          </div>
          
          {/* Instructions */}
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Space</kbd> to talk • <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd> to close</p>
          </div>
          
          {/* Navigation context */}
          {(navigationContext.currentCourse || navigationContext.currentLesson) && (
            <div className="mt-3 p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-sm">
              <p className="text-indigo-700 dark:text-indigo-300">
                {navigationContext.currentCourse && (
                  <span>📚 Course: {navigationContext.currentCourse.title}</span>
                )}
                {navigationContext.currentLesson && (
                  <span className="ml-2">📖 Lesson: {navigationContext.currentLesson.title}</span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

RealtimeVoiceAssistant.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default RealtimeVoiceAssistant;
