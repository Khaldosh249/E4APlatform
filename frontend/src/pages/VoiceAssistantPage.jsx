import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useAccessibilityStore from '../store/accessibilityStore';

/**
 * VoiceAssistantPage - Full-page voice assistant with OpenAI Realtime API
 * Comprehensive voice-controlled interface for visually impaired students
 */
const VoiceAssistantPage = () => {
  const navigate = useNavigate();
  const { token, user } = useAuthStore();
  const { highContrast } = useAccessibilityStore();
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  
  // Audio state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rateLimitWait, setRateLimitWait] = useState(0);
  
  // Conversation state
  const [messages, setMessages] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [aiTranscript, setAiTranscript] = useState('');
  
  // Context state - what the student is currently doing
  const [currentContext, setCurrentContext] = useState({
    mode: 'idle', // idle, browsing, quiz, lesson, assignment
    course: null,
    lesson: null,
    quiz: null,
    assignment: null,
    quizQuestions: [],
    currentQuestionIndex: 0,
    quizAnswers: {},
    pendingConfirmation: null
  });
  
  // Display state for quiz/lesson content
  const [displayContent, setDisplayContent] = useState(null);
  
  // Lesson audio state - for playing TTS audio and pausing AI
  const [lessonAudioPlaying, setLessonAudioPlaying] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [pendingLessonAudio, setPendingLessonAudio] = useState(null); // Stores audio URL waiting to be played
  const [readyToPlayLessonAudio, setReadyToPlayLessonAudio] = useState(false); // True when AI finished and user can press Space
  const lessonAudioRef = useRef(null);
  const pendingLessonAudioRef = useRef(null); // Ref to track pending audio in message handler
  
  // Refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const audioQueueRef = useRef([]);
  const messagesEndRef = useRef(null);
  const isListeningRef = useRef(false);
  const audioPlaybackTimeRef = useRef(0);
  const mountedRef = useRef(true);
  const activeAudioSourcesRef = useRef([]);
  
  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTranscript, aiTranscript]);
  
  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
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
  
  // Play audio from base64 PCM16
  const playAudio = useCallback(async (base64Audio) => {
    try {
      const audioContext = await initAudioContext();
      const pcmData = base64ToArrayBuffer(base64Audio);
      
      const dataView = new DataView(pcmData);
      const numSamples = pcmData.byteLength / 2;
      const float32Array = new Float32Array(numSamples);
      
      for (let i = 0; i < numSamples; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768.0;
      }
      
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);
      
      const currentTime = audioContext.currentTime;
      const startTime = Math.max(currentTime, audioPlaybackTimeRef.current);
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start(startTime);
      
      // Track active sources for interruption
      activeAudioSourcesRef.current.push(source);
      source.onended = () => {
        activeAudioSourcesRef.current = activeAudioSourcesRef.current.filter(s => s !== source);
      };
      
      audioPlaybackTimeRef.current = startTime + audioBuffer.duration;
      
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }, [initAudioContext]);
  
  // Interrupt/stop all audio playback (for voice interrupts)
  const interruptAudio = useCallback(() => {
    // Stop all active audio sources
    activeAudioSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
      }
    });
    activeAudioSourcesRef.current = [];
    
    // Clear the audio queue
    audioQueueRef.current = [];
    
    // Reset playback time
    audioPlaybackTimeRef.current = 0;
    
    setIsSpeaking(false);
    
    // Send truncate message to OpenAI to stop generating audio
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'response.cancel'
      }));
    }
  }, []);
  
  // Process audio queue
  const processAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0) return;
    
    setIsSpeaking(true);
    
    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current.shift();
      await playAudio(audioData);
    }
  }, [playAudio]);
  
  // Reset audio playback
  const resetAudioPlayback = useCallback(() => {
    audioPlaybackTimeRef.current = 0;
    setIsSpeaking(false);
  }, []);
  
  // Add message to conversation
  const addMessage = useCallback((role, content) => {
    setMessages(prev => [...prev, {
      id: Date.now(),
      role,
      content,
      timestamp: new Date().toISOString()
    }]);
  }, []);
  
  // Handle context updates from backend
  const handleContextUpdate = useCallback((data) => {
    console.log('Context update:', data);
    
    if (data.action === 'start_quiz') {
      setCurrentContext(prev => ({
        ...prev,
        mode: 'quiz',
        quiz: data.quiz,
        quizQuestions: data.questions || [],
        currentQuestionIndex: 0,
        quizAnswers: {}
      }));
      setDisplayContent({
        type: 'quiz',
        quiz: data.quiz,
        questions: data.questions,
        currentIndex: 0
      });
    }
    
    else if (data.action === 'show_question') {
      setCurrentContext(prev => ({
        ...prev,
        currentQuestionIndex: data.questionIndex
      }));
      setDisplayContent(prev => ({
        ...prev,
        currentIndex: data.questionIndex
      }));
    }
    
    else if (data.action === 'pending_answer') {
      // When user selects an answer but hasn't confirmed yet
      setCurrentContext(prev => ({
        ...prev,
        pendingConfirmation: {
          type: 'quiz_answer',
          questionIndex: data.questionIndex,
          answer: data.answer,
          answerText: data.answerText
        }
      }));
    }
    
    else if (data.action === 'answer_confirmed') {
      // When user confirms their answer
      setCurrentContext(prev => ({
        ...prev,
        quizAnswers: {
          ...prev.quizAnswers,
          [data.questionIndex]: data.answer
        },
        pendingConfirmation: null
      }));
      // Update display to reflect the confirmed answer
      setDisplayContent(prev => prev?.type === 'quiz' ? {
        ...prev,
        // Keep the current index, it will be updated by show_question
      } : prev);
    }
    
    else if (data.action === 'answer_cancelled') {
      // When user cancels their pending answer
      setCurrentContext(prev => ({
        ...prev,
        pendingConfirmation: null
      }));
    }
    
    else if (data.action === 'quiz_completed') {
      setDisplayContent({
        type: 'quiz_result',
        score: data.correct,  // Use correct count, not percentage
        total: data.total,
        passed: data.passed,
        answers: data.answers
      });
      setCurrentContext(prev => ({
        ...prev,
        mode: 'idle',
        pendingConfirmation: null
      }));
    }
    
    else if (data.action === 'start_lesson') {
      setCurrentContext(prev => ({
        ...prev,
        mode: 'lesson',
        lesson: data.lesson
      }));
      setDisplayContent({
        type: 'lesson',
        lesson: data.lesson
      });
      
      // If lesson has audio URL, store it and wait for AI to finish speaking
      // Then user will press Space to start the audio
      if (data.has_audio && data.lesson?.audio_url) {
        // Build full audio URL using API base URL
        const audioUrl = data.lesson.audio_url.startsWith('http') 
          ? data.lesson.audio_url 
          : `${import.meta.env.VITE_API_URL}${data.lesson.audio_url}`;
        
        // Store the audio URL - will play after AI finishes and user presses Space
        setPendingLessonAudio(audioUrl);
        pendingLessonAudioRef.current = audioUrl; // Also update ref for message handler
        
        // Stop any current listening using ref
        if (isListeningRef.current) {
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
        }
      }
    }
    
    else if (data.action === 'start_assignment') {
      setCurrentContext(prev => ({
        ...prev,
        mode: 'assignment',
        assignment: data.assignment
      }));
      setDisplayContent({
        type: 'assignment',
        assignment: data.assignment
      });
    }
    
    else if (data.action === 'confirm_submission') {
      setCurrentContext(prev => ({
        ...prev,
        pendingConfirmation: {
          type: data.submissionType, // 'quiz' or 'assignment'
          data: data.submissionData
        }
      }));
    }
    
    else if (data.action === 'submission_complete') {
      setCurrentContext(prev => ({
        ...prev,
        mode: 'idle',
        pendingConfirmation: null
      }));
      setDisplayContent({
        type: 'submission_result',
        success: data.success,
        message: data.message,
        result: data.result
      });
    }
    
    else if (data.action === 'show_courses') {
      setDisplayContent({
        type: 'courses',
        courses: data.courses,
        enrolled: data.enrolled
      });
    }
    
    else if (data.action === 'show_progress') {
      setDisplayContent({
        type: 'progress',
        progress: data.progress
      });
    }
    
    else if (data.action === 'enrollment_complete') {
      setDisplayContent({
        type: 'enrollment_result',
        success: data.success,
        course: data.course,
        message: data.message
      });
    }
    
    else if (data.action === 'show_assignments') {
      setDisplayContent({
        type: 'assignments',
        assignments: data.assignments
      });
    }
    
    else if (data.action === 'show_quizzes') {
      setDisplayContent({
        type: 'quizzes',
        quizzes: data.quizzes
      });
    }
    
    else if (data.action === 'navigate') {
      if (data.url) {
        navigate(data.url);
      }
    }
    
    else if (data.action === 'clear_display') {
      setDisplayContent(null);
      setCurrentContext(prev => ({
        ...prev,
        mode: 'idle'
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, addMessage]);
  
  // Handle WebSocket messages
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'session.created':
          console.log('Voice session created');
          setIsConnected(true);
          setIsConnecting(false);
          addMessage('system', 'Voice assistant ready. Press Space or click the microphone to start speaking.');
          break;
        
        case 'session.updated':
          console.log('Voice session updated');
          break;
          
        case 'input_audio_buffer.speech_started':
          // Interrupt AI audio when user starts speaking
          interruptAudio();
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
        
        case 'conversation.item.input_audio_transcription.failed':
          console.error('Transcription failed:', data);
          setCurrentTranscript('');
          setIsProcessing(false);
          // Don't show error to user for minor transcription issues
          if (data.error?.message) {
            console.log('Transcription error:', data.error.message);
          }
          break;
        
        case 'input_audio_buffer.committed':
          console.log('Audio buffer committed');
          break;
        
        case 'conversation.item.created':
          console.log('Conversation item created');
          break;
        
        case 'response.created':
          console.log('Response generation started');
          setIsProcessing(true);
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
          resetAudioPlayback();
          break;
          
        case 'response.function_call_arguments.done':
          console.log('Function call:', data.name, data.arguments);
          break;
          
        case 'response.done':
          setIsProcessing(false);
          // Check for rate limit in response
          if (data.response?.status === 'failed') {
            const errorDetails = data.response?.status_details?.error;
            if (errorDetails?.code === 'rate_limit_exceeded') {
              const waitMatch = errorDetails.message?.match(/try again in ([\d.]+)s/);
              const waitTime = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) : 5;
              setRateLimitWait(waitTime);
              addMessage('system', `⏳ Rate limit reached. Please wait ${waitTime} seconds before speaking again.`);
              // Countdown timer
              const countdown = setInterval(() => {
                setRateLimitWait(prev => {
                  if (prev <= 1) {
                    clearInterval(countdown);
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);
            } else if (errorDetails?.message) {
              addMessage('error', errorDetails.message);
            }
          }
          
          // Check if there's pending lesson audio - AI has finished speaking
          if (pendingLessonAudioRef.current) {
            setReadyToPlayLessonAudio(true);
            setAiPaused(true);
            addMessage('system', '🎧 Press Space to start the lesson audio.');
          }
          break;
          
        case 'context_update':
          handleContextUpdate(data.data);
          break;
          
        case 'display_update':
          setDisplayContent(data.content);
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
  }, [aiTranscript, handleContextUpdate, processAudioQueue, resetAudioPlayback, interruptAudio]);
  
  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      const wsUrl = `${import.meta.env.VITE_WS_URL}/voice/realtime/${token}`;
      
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
  
  // Disconnect from WebSocket (used in cleanup and can be exposed for manual disconnect)
  // eslint-disable-next-line no-unused-vars
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
      processorRef.current = audioContext.createScriptProcessor(4096, 1, 1);
      isListeningRef.current = true;
      
      processorRef.current.onaudioprocess = (event) => {
        if (!isListeningRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        
        // Check audio level for debugging
        let maxLevel = 0;
        for (let i = 0; i < inputData.length; i++) {
          const absLevel = Math.abs(inputData[i]);
          if (absLevel > maxLevel) maxLevel = absLevel;
        }
        
        // Only log occasionally to not spam console
        if (Math.random() < 0.01 && maxLevel > 0.01) {
          console.log(`Audio level: ${(maxLevel * 100).toFixed(1)}%`);
        }
        
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
        
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio
        }));
      };
      
      source.connect(processorRef.current);
      processorRef.current.connect(audioContext.destination);
      
      setIsListening(true);
      
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
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));
    }
  }, []);
  
  // Stop lesson audio playback
  const stopLessonAudio = useCallback(() => {
    if (lessonAudioRef.current) {
      lessonAudioRef.current.pause();
      lessonAudioRef.current.currentTime = 0;
      lessonAudioRef.current = null;
    }
    setLessonAudioPlaying(false);
  }, []);
  
  // Play the pending lesson audio
  const playPendingLessonAudio = useCallback(() => {
    if (!pendingLessonAudio) return;
    
    setReadyToPlayLessonAudio(false);
    setLessonAudioPlaying(true);
    addMessage('system', '🎧 Playing lesson audio...');
    
    const audio = new Audio(pendingLessonAudio);
    lessonAudioRef.current = audio;
    
    audio.onended = () => {
      setLessonAudioPlaying(false);
      setAiPaused(false);
      lessonAudioRef.current = null;
      setPendingLessonAudio(null);
      pendingLessonAudioRef.current = null;
      addMessage('system', '✅ Lesson audio finished. Press Space to resume voice interaction.');
    };
    
    audio.onerror = (e) => {
      console.error('Error playing lesson audio:', e);
      setLessonAudioPlaying(false);
      setAiPaused(false);
      lessonAudioRef.current = null;
      setPendingLessonAudio(null);
      pendingLessonAudioRef.current = null;
      addMessage('error', 'Failed to play lesson audio.');
    };
    
    audio.play().catch(e => {
      console.error('Failed to play audio:', e);
      setLessonAudioPlaying(false);
      setAiPaused(false);
      lessonAudioRef.current = null;
      setPendingLessonAudio(null);
      pendingLessonAudioRef.current = null;
    });
  }, [pendingLessonAudio, addMessage]);
  
  // Resume AI interaction after lesson audio
  const resumeAI = useCallback(() => {
    stopLessonAudio();
    setAiPaused(false);
    setPendingLessonAudio(null);
    pendingLessonAudioRef.current = null;
    setReadyToPlayLessonAudio(false);
    addMessage('system', '🎤 Voice assistant resumed. You can speak now.');
  }, [stopLessonAudio, addMessage]);
  
  // Toggle listening
  const toggleListening = useCallback(async () => {
    // If ready to play lesson audio (AI finished speaking, waiting for Space), play it
    if (readyToPlayLessonAudio && pendingLessonAudio) {
      playPendingLessonAudio();
      return;
    }
    
    // If AI is paused (during or after lesson audio), resume it first
    if (aiPaused) {
      resumeAI();
      // Then start listening
      if (!isConnected) {
        await connect();
      }
      await startAudioCapture();
      return;
    }
    
    // If lesson audio is playing, stop it
    if (lessonAudioPlaying) {
      stopLessonAudio();
    }
    
    if (isListening) {
      stopAudioCapture();
    } else {
      if (!isConnected) {
        await connect();
      }
      await startAudioCapture();
    }
  }, [isListening, isConnected, connect, startAudioCapture, stopAudioCapture, aiPaused, lessonAudioPlaying, resumeAI, stopLessonAudio, readyToPlayLessonAudio, pendingLessonAudio, playPendingLessonAudio]);
  
  // Auto-connect on mount and auto-start for visually impaired users
  useEffect(() => {
    mountedRef.current = true;
    
    // Small delay to ensure component is fully mounted
    const connectTimer = setTimeout(async () => {
      if (mountedRef.current) {
        await connect();
        
        // Auto-start listening for visually impaired users after connection
        if (user?.is_blind) {
          // Wait for connection to be established
          setTimeout(() => {
            if (mountedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
              startAudioCapture();
            }
          }, 1000);
        }
      }
    }, 100);
    
    return () => {
      mountedRef.current = false;
      clearTimeout(connectTimer);
      
      // Clean up WebSocket
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
      
      // Clean up audio
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Navigate to dashboard based on user role
  const goToDashboard = useCallback(() => {
    if (user?.role === 'admin') navigate('/admin');
    else if (user?.role === 'teacher') navigate('/teacher');
    else navigate('/student');
  }, [user, navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        toggleListening();
      }
      
      if (event.code === 'Escape') {
        goToDashboard();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleListening, goToDashboard]);
  
  // Parse quiz options helper
  const parseOptions = (options) => {
    if (!options) return [];
    if (Array.isArray(options)) return options;
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      try {
        return JSON.parse(options.replace(/'/g, '"'));
      } catch {
        return [];
      }
    }
  };
  
  // Render quiz display
  const renderQuizDisplay = () => {
    if (!displayContent || displayContent.type !== 'quiz') return null;
    
    const { quiz, questions } = displayContent;
    // Use currentContext.currentQuestionIndex as the source of truth
    const currentIndex = currentContext.currentQuestionIndex;
    const question = questions[currentIndex];
    const answer = currentContext.quizAnswers[currentIndex];
    const pending = currentContext.pendingConfirmation;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{quiz?.title}</h2>
          <span className="text-sm text-gray-500">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-6">
          <div 
            className="bg-indigo-600 h-2 rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        
        {question && (
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {question.question_text}
            </p>
            
            <div className="space-y-3">
              {parseOptions(question.options).map((option, idx) => (
                <div 
                  key={idx}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    answer === idx
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                      : pending?.answer === idx
                      ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center">
                    <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mr-3 font-medium">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-gray-900 dark:text-white">{option}</span>
                    {answer === idx && (
                      <span className="ml-auto text-green-600">✓ Selected</span>
                    )}
                    {pending?.answer === idx && (
                      <span className="ml-auto text-yellow-600">⏳ Confirm?</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {pending && pending.type === 'quiz_answer' && (
              <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <p className="text-yellow-800 dark:text-yellow-200">
                  Say &quot;Yes&quot; or &quot;Confirm&quot; to select option {String.fromCharCode(65 + pending.answer)}, 
                  or &quot;No&quot; or &quot;Cancel&quot; to choose a different answer.
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Answered questions summary */}
        <div className="mt-6 flex flex-wrap gap-2">
          {questions.map((_, idx) => (
            <div
              key={idx}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                idx === currentIndex
                  ? 'bg-indigo-600 text-white'
                  : currentContext.quizAnswers[idx] !== undefined
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Render quiz result
  const renderQuizResult = () => {
    if (!displayContent || displayContent.type !== 'quiz_result') return null;
    
    const { score, total, passed } = displayContent;
    const percentage = Math.round((score / total) * 100);
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 text-center">
        <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-4 ${
          passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
        }`}>
          {passed ? (
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {passed ? 'Congratulations!' : 'Keep Practicing!'}
        </h2>
        
        <p className="text-4xl font-bold text-indigo-600 mb-2">{percentage}%</p>
        <p className="text-gray-600 dark:text-gray-400">
          You got {score} out of {total} questions correct
        </p>
        
        <p className="mt-4 text-sm text-gray-500">
          Say &quot;Try again&quot; to retake the quiz, or &quot;Go back&quot; to return to the course.
        </p>
      </div>
    );
  };
  
  // Render lesson display
  const renderLessonDisplay = () => {
    if (!displayContent || displayContent.type !== 'lesson') return null;
    
    const { lesson } = displayContent;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{lesson.title}</h2>
        {lesson.duration_minutes && (
          <p className="text-sm text-gray-500 mb-4">Duration: {lesson.duration_minutes} minutes</p>
        )}
        
        <div className="prose dark:prose-invert max-w-none">
          <div dangerouslySetInnerHTML={{ __html: lesson.content_text?.replace(/\n/g, '<br/>') || '' }} />
        </div>
        
        <p className="mt-4 text-sm text-gray-500">
          Say &quot;Next lesson&quot;, &quot;Previous lesson&quot;, or &quot;Go back&quot; to navigate.
        </p>
      </div>
    );
  };
  
  // Render assignment display
  const renderAssignmentDisplay = () => {
    if (!displayContent || displayContent.type !== 'assignment') return null;
    
    const { assignment } = displayContent;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{assignment.title}</h2>
        
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-gray-500">Due Date:</span>
            <span className="ml-2 text-gray-900 dark:text-white">
              {new Date(assignment.due_date).toLocaleDateString()}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Max Score:</span>
            <span className="ml-2 text-gray-900 dark:text-white">{assignment.max_score}</span>
          </div>
        </div>
        
        <div className="prose dark:prose-invert max-w-none mb-4">
          <p>{assignment.description}</p>
        </div>
        
        {assignment.submission ? (
          <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <p className="text-green-800 dark:text-green-200">
              ✓ Submitted on {new Date(assignment.submission.submitted_at).toLocaleDateString()}
              {assignment.submission.grade !== null && (
                <span className="ml-2">- Grade: {assignment.submission.grade}/{assignment.max_score}</span>
              )}
            </p>
          </div>
        ) : (
          <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
            <p className="text-yellow-800 dark:text-yellow-200">
              📝 Not submitted yet. Say &quot;Submit assignment&quot; and then dictate your answer.
            </p>
          </div>
        )}
      </div>
    );
  };
  
  // Render courses list
  const renderCoursesList = () => {
    if (!displayContent || displayContent.type !== 'courses') return null;
    
    const { courses, enrolled } = displayContent;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          {enrolled ? 'Your Enrolled Courses' : 'Available Courses'}
        </h2>
        
        <div className="space-y-3">
          {courses.map((course, idx) => (
            <div 
              key={course.id}
              className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
            >
              <div className="flex items-center">
                <span className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mr-3 font-medium text-indigo-600">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">{course.title}</h3>
                  <p className="text-sm text-gray-500 truncate">{course.description}</p>
                </div>
                {course.progress !== undefined && (
                  <div className="ml-4 text-right">
                    <span className="text-sm font-medium text-indigo-600">{course.progress}%</span>
                    <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-1">
                      <div 
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{ width: `${course.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <p className="mt-4 text-sm text-gray-500">
          Say the course number to {enrolled ? 'open it' : 'enroll'}, 
          e.g., &quot;Course 1&quot; or &quot;{enrolled ? 'Open' : 'Enroll in'} [course name]&quot;
        </p>
      </div>
    );
  };
  
  // Render progress display
  const renderProgressDisplay = () => {
    if (!displayContent || displayContent.type !== 'progress') return null;
    
    const { progress } = displayContent;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Your Progress</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
            <p className="text-3xl font-bold text-indigo-600">{progress.totalCourses}</p>
            <p className="text-sm text-gray-500">Enrolled Courses</p>
          </div>
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/30 rounded-lg">
            <p className="text-3xl font-bold text-green-600">{progress.completedCourses}</p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
          <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
            <p className="text-3xl font-bold text-purple-600">{Math.round(progress.averageProgress)}%</p>
            <p className="text-sm text-gray-500">Average Progress</p>
          </div>
        </div>
        
        <div className="space-y-3">
          {progress.courses?.map((course, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <span className="text-gray-900 dark:text-white">{course.course}</span>
              <div className="flex items-center">
                <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2 mr-3">
                  <div 
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{ width: `${course.progress}%` }}
                  />
                </div>
                <span className="text-sm text-gray-500">{course.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Render assignments list
  const renderAssignmentsList = () => {
    if (!displayContent || displayContent.type !== 'assignments') return null;
    
    const { assignments } = displayContent;
    
    const getStatusDisplay = (assignment) => {
      if (assignment.status === 'graded') {
        const percentage = Math.round((assignment.score / assignment.max_score) * 100);
        const isGood = percentage >= 60;
        return {
          label: `Graded: ${assignment.score}/${assignment.max_score} (${percentage}%)`,
          color: isGood ? 'green' : 'orange',
          icon: '✓'
        };
      }
      if (assignment.submitted) {
        return {
          label: 'Submitted - Pending Grade',
          color: 'blue',
          icon: '⏳'
        };
      }
      if (assignment.due_date && new Date(assignment.due_date) < new Date()) {
        return {
          label: 'Overdue',
          color: 'red',
          icon: '!'
        };
      }
      return {
        label: 'Pending',
        color: 'yellow',
        icon: '○'
      };
    };
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Your Assignments</h2>
        
        <div className="space-y-3">
          {assignments.map((assignment, idx) => {
            const status = getStatusDisplay(assignment);
            return (
              <div 
                key={assignment.id}
                className={`p-4 rounded-lg border ${
                  status.color === 'green' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' :
                  status.color === 'blue' ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' :
                  status.color === 'red' ? 'border-red-300 bg-red-50 dark:bg-red-900/20' :
                  status.color === 'orange' ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20' :
                  'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
                }`}
              >
                <div className="flex items-center">
                  <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mr-3 font-medium">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-white">{assignment.title}</h3>
                    <p className="text-sm text-gray-500">
                      {assignment.course_title} • Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'No due date'}
                    </p>
                    {assignment.is_late && (
                      <p className="text-xs text-orange-600">Submitted late</p>
                    )}
                    {assignment.submitted_at && (
                      <p className="text-xs text-gray-400">
                        Submitted: {new Date(assignment.submitted_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="ml-4">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      status.color === 'green' ? 'bg-green-100 text-green-800' :
                      status.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                      status.color === 'red' ? 'bg-red-100 text-red-800' :
                      status.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {status.icon} {status.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="mt-4 text-sm text-gray-500">
          Say &quot;Assignment [number]&quot; to view and submit an assignment.
        </p>
      </div>
    );
  };
  
  // Render quizzes list
  const renderQuizzesList = () => {
    if (!displayContent || displayContent.type !== 'quizzes') return null;
    
    const { quizzes } = displayContent;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Your Quizzes</h2>
        
        <div className="space-y-3">
          {quizzes.map((quiz, idx) => (
            <div 
              key={quiz.id}
              className={`p-4 rounded-lg border ${
                quiz.attempted
                  ? quiz.passed
                    ? 'border-green-300 bg-green-50 dark:bg-green-900/20'
                    : 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center">
                <span className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mr-3 font-medium">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-white">{quiz.title}</h3>
                  <p className="text-sm text-gray-500">
                    {quiz.course_title} • {quiz.question_count} questions
                  </p>
                </div>
                <div className="ml-4">
                  {quiz.attempted ? (
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      quiz.passed 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {quiz.score}% {quiz.passed ? '✓' : ''}
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                      Not attempted
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <p className="mt-4 text-sm text-gray-500">
          Say &quot;Quiz [number]&quot; or &quot;Take quiz [name]&quot; to start a quiz.
        </p>
      </div>
    );
  };
  
  return (
    <div className={`min-h-screen ${highContrast ? 'bg-black' : 'bg-gray-100 dark:bg-gray-900'}`}>
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToDashboard}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Go to dashboard"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold">Voice Assistant</h1>
              <p className="text-sm text-indigo-200">
                {user?.full_name} • {currentContext.mode === 'idle' ? 'Ready' : `Mode: ${currentContext.mode}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
              isConnected ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
              <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Display Content */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-center mb-4">
              <button
                onClick={toggleListening}
                disabled={isConnecting}
                className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all transform ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600 scale-110'
                    : isConnecting
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'
                } text-white shadow-xl`}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
              >
                {isListening && (
                  <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75" />
                )}
                
                <svg className="w-12 h-12 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isListening ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  )}
                </svg>
              </button>
            </div>
            
            <div className="text-center">
              <p className={`text-lg font-medium ${
                lessonAudioPlaying ? 'text-blue-600' :
                readyToPlayLessonAudio ? 'text-green-600' :
                aiPaused ? 'text-purple-600' :
                rateLimitWait > 0 ? 'text-orange-600' : 
                isListening ? 'text-red-600' : isProcessing ? 'text-yellow-600' : isSpeaking ? 'text-green-600' : 'text-gray-600 dark:text-gray-400'
              }`}>
                {isConnecting && 'Connecting...'}
                {lessonAudioPlaying && '🎧 Playing lesson audio... Press Space to stop'}
                {!lessonAudioPlaying && readyToPlayLessonAudio && '🎧 Press Space to start the lesson audio'}
                {!lessonAudioPlaying && !readyToPlayLessonAudio && aiPaused && '⏸️ AI paused. Press Space to resume'}
                {!lessonAudioPlaying && !aiPaused && !readyToPlayLessonAudio && rateLimitWait > 0 && `⏳ Rate limited - wait ${rateLimitWait}s`}
                {!lessonAudioPlaying && !aiPaused && !readyToPlayLessonAudio && rateLimitWait === 0 && isConnected && !isListening && !isProcessing && !isSpeaking && 'Press Space or click to speak'}
                {!lessonAudioPlaying && !aiPaused && !readyToPlayLessonAudio && rateLimitWait === 0 && isListening && '🎤 Listening...'}
                {!lessonAudioPlaying && !aiPaused && !readyToPlayLessonAudio && rateLimitWait === 0 && isProcessing && '⏳ Processing...'}
                {!lessonAudioPlaying && !aiPaused && !readyToPlayLessonAudio && rateLimitWait === 0 && isSpeaking && '🔊 Speaking...'}
              </p>
              
              <p className="text-sm text-gray-500 mt-2">
                Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Space</kbd> to talk • 
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded ml-1">Esc</kbd> to go back
              </p>
            </div>
          </div>
          
          {/* Dynamic Content Display */}
          {renderQuizDisplay()}
          {renderQuizResult()}
          {renderLessonDisplay()}
          {renderAssignmentDisplay()}
          {renderCoursesList()}
          {renderProgressDisplay()}
          {renderAssignmentsList()}
          {renderQuizzesList()}
          
          {/* Help Card */}
          {!displayContent && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Voice Commands</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h3 className="font-medium text-indigo-600 mb-2">Navigation</h3>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>&quot;Show my courses&quot;</li>
                    <li>&quot;Show available courses&quot;</li>
                    <li>&quot;Show my progress&quot;</li>
                    <li>&quot;Show my assignments&quot;</li>
                    <li>&quot;Show my quizzes&quot;</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-medium text-indigo-600 mb-2">Actions</h3>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>&quot;Enroll in course [name/number]&quot;</li>
                    <li>&quot;Take quiz [name/number]&quot;</li>
                    <li>&quot;Read lesson [number]&quot;</li>
                    <li>&quot;Submit assignment&quot;</li>
                    <li>&quot;Go back&quot; / &quot;Go home&quot;</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-medium text-indigo-600 mb-2">During Quiz</h3>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>&quot;Option A/B/C/D&quot; or &quot;Answer 1/2/3/4&quot;</li>
                    <li>&quot;Yes&quot; / &quot;Confirm&quot; to confirm</li>
                    <li>&quot;No&quot; / &quot;Cancel&quot; to change</li>
                    <li>&quot;Next question&quot; / &quot;Previous&quot;</li>
                    <li>&quot;Submit quiz&quot;</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="font-medium text-indigo-600 mb-2">Help</h3>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-400">
                    <li>&quot;Help&quot; - List all commands</li>
                    <li>&quot;Where am I&quot; - Current context</li>
                    <li>&quot;Read again&quot; - Repeat last</li>
                    <li>&quot;Stop&quot; - Stop speaking</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Right Column - Conversation */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-bold text-gray-900 dark:text-white">Conversation</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !connectionError && (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p>Start speaking to interact</p>
              </div>
            )}
            
            {connectionError && (
              <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4 text-red-700 dark:text-red-300">
                <p className="font-medium">Connection Error</p>
                <p className="text-sm mt-1">{connectionError}</p>
                <button onClick={connect} className="mt-2 text-sm underline">
                  Try reconnecting
                </button>
              </div>
            )}
            
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : message.role === 'error'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : message.role === 'system'
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            
            {currentTranscript && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl px-4 py-2 bg-indigo-400 text-white rounded-br-sm opacity-70">
                  <p className="text-sm italic">{currentTranscript}</p>
                </div>
              </div>
            )}
            
            {aiTranscript && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm opacity-70">
                  <p className="text-sm italic">{aiTranscript}</p>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default VoiceAssistantPage;
