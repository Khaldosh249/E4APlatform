import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRight, CheckCircle, Volume2, 
  VolumeX, FileText, Download
} from 'lucide-react';
import Navbar from '../components/Navbar';
import AudioPlayer from '../components/AudioPlayer';
import api from '../lib/api';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useAccessibilityStore from '../store/accessibilityStore';

export default function LessonView() {
  const { courseId, lessonId } = useParams();
  const { user } = useAuthStore();
  const { autoPlayTTS } = useAccessibilityStore();
  
  const [lesson, setLesson] = useState(null);
  const [allLessons, setAllLessons] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  const isStudent = user?.role === 'student';
  const basePath = isStudent ? '/student' : '/teacher';

  useEffect(() => {
    loadLesson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const loadLesson = async () => {
    try {
      const [lessonRes, lessonsRes] = await Promise.all([
        api.get(`/lessons/${lessonId}`),
        api.get(`/lessons/course/${courseId}`)
      ]);
      
      setLesson(lessonRes.data);
      setAllLessons(lessonsRes.data);

      // Load or create progress for students
      if (isStudent) {
        try {
          const progressRes = await api.get(`/lessons/${lessonId}/progress`);
          setProgress(progressRes.data);
        } catch (e) {
          // Create progress if doesn't exist
          try {
            const newProgress = await api.post(`/lessons/${lessonId}/progress`);
            setProgress(newProgress.data);
          } catch (err) {
            // Progress already exists or other error
          }
        }
      }

      // Auto-enable TTS for visually impaired users
      if (user?.is_visually_impaired || autoPlayTTS) {
        setTtsEnabled(true);
      }
    } catch (error) {
      toast.error('Failed to load lesson');
    } finally {
      setLoading(false);
    }
  };

  const markAsCompleted = async () => {
    if (!isStudent || progress?.completed) return;
    
    try {
      await api.put(`/lessons/${lessonId}/progress`, { completed: true });
      setProgress(prev => ({ ...prev, completed: true }));
      toast.success('Lesson marked as completed!');
    } catch (error) {
      toast.error('Failed to update progress');
    }
  };

  const currentIndex = allLessons.findIndex(l => l.id === parseInt(lessonId));
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const renderContent = () => {
    if (!lesson) return null;

    switch (lesson.content_type) {
      case 'video':
        return (
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            <video 
              controls 
              className="w-full h-full"
              src={lesson.file_url}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        );
      
      case 'pdf':
        return (
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <span className="flex items-center text-gray-600">
                <FileText className="h-5 w-5 mr-2" />
                PDF Document
              </span>
              {lesson.file_url && (
                <a 
                  href={lesson.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </a>
              )}
            </div>
            {lesson.file_url && (
              <iframe 
                src={lesson.file_url}
                className="w-full h-96 rounded"
                title={lesson.title}
              />
            )}
          </div>
        );
      
      case 'image':
        return (
          <div className="rounded-lg overflow-hidden">
            <img 
              src={lesson.file_url}
              alt={lesson.title}
              className="w-full max-h-96 object-contain"
            />
          </div>
        );
      
      case 'audio':
        return (
          <div className="bg-gray-100 rounded-lg p-6">
            <audio controls className="w-full">
              <source src={lesson.file_url} />
              Your browser does not support the audio element.
            </audio>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="flex justify-center items-center h-96">
          <div className="text-xl">Loading...</div>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p>Lesson not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-6">
          <Link 
            to={`${basePath}/courses/${courseId}`}
            className="inline-flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Course
          </Link>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              Lesson {currentIndex + 1} of {allLessons.length}
            </span>
          </div>
        </div>

        {/* Lesson Content */}
        <div className="card mb-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{lesson.title}</h1>
              {lesson.duration_minutes && (
                <p className="text-sm text-gray-500">
                  Estimated time: {lesson.duration_minutes} minutes
                </p>
              )}
            </div>
            
            {isStudent && (
              <div className="flex items-center gap-2">
                {progress?.completed ? (
                  <span className="flex items-center text-green-600 font-medium">
                    <CheckCircle className="h-5 w-5 mr-1" />
                    Completed
                  </span>
                ) : (
                  <button
                    onClick={markAsCompleted}
                    className="btn btn-primary flex items-center"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Complete
                  </button>
                )}
              </div>
            )}
          </div>

          {/* TTS Audio Player */}
          {lesson.audio_url && (
            <div className="mb-6 p-4 bg-primary-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center text-primary-700 font-medium">
                  <Volume2 className="h-5 w-5 mr-2" />
                  Text-to-Speech Audio
                </span>
                <button
                  onClick={() => setTtsEnabled(!ttsEnabled)}
                  className={`p-2 rounded ${
                    ttsEnabled 
                      ? 'bg-primary-600 text-white' 
                      : 'bg-white text-gray-600'
                  }`}
                  aria-label={ttsEnabled ? 'Disable TTS' : 'Enable TTS'}
                >
                  {ttsEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
              </div>
              
              {ttsEnabled && (
                <AudioPlayer 
                  src={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${lesson.audio_url}`}
                  autoPlay={autoPlayTTS}
                />
              )}
            </div>
          )}

          {/* Media Content */}
          {lesson.content_type !== 'text' && lesson.file_url && (
            <div className="mb-6">
              {renderContent()}
            </div>
          )}

          {/* Text Content */}
          <div className="prose max-w-none">
            <div 
              className="text-gray-700 leading-relaxed whitespace-pre-wrap"
              style={{ fontSize: 'inherit' }}
            >
              {lesson.content_text}
            </div>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between">
          {prevLesson ? (
            <Link
              to={`${basePath}/courses/${courseId}/lessons/${prevLesson.id}`}
              className="btn btn-secondary flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Previous: {prevLesson.title}
            </Link>
          ) : (
            <div />
          )}
          
          {nextLesson ? (
            <Link
              to={`${basePath}/courses/${courseId}/lessons/${nextLesson.id}`}
              className="btn btn-primary flex items-center"
            >
              Next: {nextLesson.title}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          ) : (
            <Link
              to={`${basePath}/courses/${courseId}`}
              className="btn btn-primary"
            >
              Back to Course
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
