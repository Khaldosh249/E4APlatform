import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, BookOpen, FileText, ClipboardList, 
  CheckCircle, Play, Volume2, Clock
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function CourseDetail() {
  const { courseId } = useParams();
  const { user } = useAuthStore();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [progress, setProgress] = useState([]);
  const [activeTab, setActiveTab] = useState('lessons');
  const [loading, setLoading] = useState(true);

  const isStudent = user?.role === 'student';
  const basePath = isStudent ? '/student' : '/teacher';

  useEffect(() => {
    loadCourseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const loadCourseData = async () => {
    try {
      const [courseRes, lessonsRes, assignmentsRes, quizzesRes] = await Promise.all([
        api.get(`/courses/${courseId}`),
        api.get(`/lessons/course/${courseId}`),
        api.get(`/assignments/course/${courseId}`),
        api.get(`/quizzes/course/${courseId}`)
      ]);
      
      setCourse(courseRes.data);
      setLessons(lessonsRes.data);
      setAssignments(assignmentsRes.data);
      setQuizzes(quizzesRes.data);

      // Load progress for students
      if (isStudent) {
        try {
          const progressRes = await api.get(`/lessons/progress/course/${courseId}`);
          setProgress(progressRes.data);
        } catch (e) {
          // Progress might not exist yet
        }
      }
    } catch (error) {
      toast.error('Failed to load course data');
    } finally {
      setLoading(false);
    }
  };

  const getLessonProgress = (lessonId) => {
    return progress.find(p => p.lesson_id === lessonId);
  };

  const isLessonCompleted = (lessonId) => {
    const p = getLessonProgress(lessonId);
    return p?.completed || false;
  };

  const tabs = [
    { id: 'lessons', label: 'Lessons', icon: BookOpen, count: lessons.length },
    { id: 'assignments', label: 'Assignments', icon: FileText, count: assignments.length },
    { id: 'quizzes', label: 'Quizzes', icon: ClipboardList, count: quizzes.length }
  ];

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

  if (!course) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <p>Course not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link 
          to={basePath}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Link>

        {/* Course Header */}
        <div className="card mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{course.title}</h1>
              <p className="text-gray-600 mb-2">{course.description}</p>
              {course.subject_code && (
                <span className="inline-block px-3 py-1 bg-gray-100 rounded-full text-sm text-gray-600">
                  Code: {course.subject_code}
                </span>
              )}
            </div>
            
            {isStudent && (
              <div className="mt-4 md:mt-0">
                <div className="text-center p-4 bg-primary-50 rounded-lg">
                  <p className="text-sm text-primary-600 font-medium">Your Progress</p>
                  <p className="text-3xl font-bold text-primary-900">
                    {lessons.length > 0 
                      ? Math.round((progress.filter(p => p.completed).length / lessons.length) * 100)
                      : 0}%
                  </p>
                  <p className="text-sm text-primary-600">
                    {progress.filter(p => p.completed).length} / {lessons.length} lessons
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
              <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded-full text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Lessons Tab */}
        {activeTab === 'lessons' && (
          <div className="space-y-4">
            {lessons.length === 0 ? (
              <div className="card text-center py-12">
                <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No lessons available yet.</p>
              </div>
            ) : (
              lessons.map((lesson, index) => (
                <div key={lesson.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${
                        isLessonCompleted(lesson.id)
                          ? 'bg-green-100 text-green-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {isLessonCompleted(lesson.id) ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : (
                          <span className="font-semibold">{index + 1}</span>
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-1">{lesson.title}</h3>
                        <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                          {lesson.content?.substring(0, 150)}...
                        </p>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {lesson.duration_minutes || 10} min
                          </span>
                          {lesson.content_type && (
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs capitalize">
                              {lesson.content_type}
                            </span>
                          )}
                          {lesson.audio_url && (
                            <span className="flex items-center text-primary-600">
                              <Volume2 className="h-4 w-4 mr-1" />
                              TTS Available
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <Link
                      to={`${basePath}/courses/${courseId}/lessons/${lesson.id}`}
                      className="btn btn-primary flex items-center"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {isLessonCompleted(lesson.id) ? 'Review' : 'Start'}
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            {assignments.length === 0 ? (
              <div className="card text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No assignments available yet.</p>
              </div>
            ) : (
              assignments.map(assignment => (
                <div key={assignment.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">{assignment.title}</h3>
                      <p className="text-gray-600 text-sm mb-3">{assignment.description}</p>
                      
                      <div className="flex items-center gap-4 text-sm">
                        {assignment.due_date && (
                          <span className={`flex items-center ${
                            new Date(assignment.due_date) < new Date() 
                              ? 'text-red-600' 
                              : 'text-gray-500'
                          }`}>
                            <Clock className="h-4 w-4 mr-1" />
                            Due: {new Date(assignment.due_date).toLocaleDateString()}
                          </span>
                        )}
                        <span className="text-gray-500">
                          Max Score: {assignment.max_score || 100}
                        </span>
                        {assignment.audio_url && (
                          <span className="flex items-center text-primary-600">
                            <Volume2 className="h-4 w-4 mr-1" />
                            TTS Available
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Link
                      to={`${basePath}/courses/${courseId}/assignments/${assignment.id}`}
                      className="btn btn-primary"
                    >
                      {isStudent ? 'View / Submit' : 'View'}
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Quizzes Tab */}
        {activeTab === 'quizzes' && (
          <div className="space-y-4">
            {quizzes.length === 0 ? (
              <div className="card text-center py-12">
                <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No quizzes available yet.</p>
              </div>
            ) : (
              quizzes.map(quiz => (
                <div key={quiz.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-1">{quiz.title}</h3>
                      <p className="text-gray-600 text-sm mb-3">{quiz.description}</p>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Questions: {quiz.question_count || quiz.questions?.length || 0}</span>
                        <span>Pass Score: {quiz.pass_score}%</span>
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          {quiz.is_auto_graded ? 'Auto-graded' : 'Manual grading'}
                        </span>
                        {quiz.time_limit && (
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            {quiz.time_limit} min
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Link
                      to={`${basePath}/courses/${courseId}/quizzes/${quiz.id}`}
                      className="btn btn-primary"
                    >
                      {isStudent ? 'Take Quiz' : 'View'}
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
