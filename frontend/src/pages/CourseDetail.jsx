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
  const [submissions, setSubmissions] = useState([]);
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

      // Load progress and submissions for students
      if (isStudent) {
        try {
          const progressRes = await api.get(`/lessons/progress/course/${courseId}`);
          setProgress(progressRes.data);
        } catch (e) {
          // Progress might not exist yet
        }
        
        // Load submissions for this course
        try {
          const submissionsRes = await api.get(`/assignments/course/${courseId}/my-submissions`);
          setSubmissions(submissionsRes.data);
        } catch (e) {
          // Submissions might not exist yet
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
    return p?.is_completed || false;
  };
  
  const getSubmissionForAssignment = (assignmentId) => {
    return submissions.find(s => s.assignment_id === assignmentId);
  };
  
  const getSubmissionStatus = (assignment) => {
    const submission = getSubmissionForAssignment(assignment.id);
    if (!submission) {
      // Check if overdue
      if (assignment.due_date && new Date(assignment.due_date) < new Date()) {
        return { status: 'overdue', label: 'Overdue', color: 'red' };
      }
      return { status: 'not_submitted', label: 'Not Submitted', color: 'yellow' };
    }
    
    switch (submission.status) {
      case 'graded':
        return { 
          status: 'graded', 
          label: `Graded: ${submission.score}/${assignment.max_score || 100}`, 
          color: submission.score >= (assignment.max_score || 100) * 0.6 ? 'green' : 'orange',
          submission 
        };
      case 'submitted':
        return { status: 'submitted', label: 'Submitted - Pending Grade', color: 'blue', submission };
      default:
        return { status: submission.status, label: submission.status, color: 'gray', submission };
    }
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
                      ? Math.round((progress.filter(p => p.is_completed).length / lessons.length) * 100)
                      : 0}%
                  </p>
                  <p className="text-sm text-primary-600">
                    {progress.filter(p => p.is_completed).length} / {lessons.length} lessons
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
                          {lesson.description || lesson.content_text?.substring(0, 150)}...
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
              assignments.map(assignment => {
                const statusInfo = getSubmissionStatus(assignment);
                return (
                  <div key={assignment.id} className="card hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-lg font-semibold">{assignment.title}</h3>
                          {isStudent && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              statusInfo.color === 'green' ? 'bg-green-100 text-green-800' :
                              statusInfo.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                              statusInfo.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                              statusInfo.color === 'orange' ? 'bg-orange-100 text-orange-800' :
                              statusInfo.color === 'red' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {statusInfo.label}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm mb-3">{assignment.description}</p>
                        
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          {assignment.due_date && (
                            <span className={`flex items-center ${
                              new Date(assignment.due_date) < new Date() 
                                ? 'text-red-600' 
                                : 'text-gray-500'
                            }`}>
                              <Clock className="h-4 w-4 mr-1" />
                              Due: {new Date(assignment.due_date).toLocaleDateString()} {new Date(assignment.due_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          )}
                          <span className="text-gray-500">
                            Max Score: {assignment.max_score || 100}
                          </span>
                          {assignment.allow_late_submission && (
                            <span className="text-orange-600 text-xs">
                              Late submissions allowed
                            </span>
                          )}
                          {statusInfo.submission?.is_late && (
                            <span className="text-orange-600 text-xs">
                              Submitted late
                            </span>
                          )}
                          {statusInfo.submission?.submitted_at && (
                            <span className="text-gray-500 text-xs">
                              Submitted: {new Date(statusInfo.submission.submitted_at).toLocaleDateString()} {new Date(statusInfo.submission.submitted_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                          )}
                          {statusInfo.submission?.graded_at && (
                            <span className="text-gray-500 text-xs">
                              Graded: {new Date(statusInfo.submission.graded_at).toLocaleDateString()}
                            </span>
                          )}
                          {assignment.audio_url && (
                            <span className="flex items-center text-primary-600">
                              <Volume2 className="h-4 w-4 mr-1" />
                              TTS Available
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2">
                        {isStudent && statusInfo.status === 'graded' && (
                          <div className="text-right">
                            <span className={`text-lg font-bold ${
                              statusInfo.submission.score >= (assignment.max_score || 100) * 0.6 
                                ? 'text-green-600' 
                                : 'text-orange-600'
                            }`}>
                              {statusInfo.submission.score}/{assignment.max_score || 100}
                            </span>
                            <p className="text-xs text-gray-500">
                              {Math.round((statusInfo.submission.score / (assignment.max_score || 100)) * 100)}%
                            </p>
                          </div>
                        )}
                        <Link
                          to={`${basePath}/courses/${courseId}/assignments/${assignment.id}`}
                          className="btn btn-primary"
                        >
                          {isStudent 
                            ? (statusInfo.status === 'not_submitted' || statusInfo.status === 'overdue' 
                                ? 'Submit' 
                                : 'View Submission') 
                            : 'View'}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
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
