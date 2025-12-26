import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Edit2, Trash2, Save, X, 
  BookOpen, FileText, ClipboardList, Users, 
  Volume2, Eye, GripVertical, Loader2
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function TeacherCourseManagement() {
  const { courseId } = useParams();
  
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [enrolledStudents, setEnrolledStudents] = useState([]);
  const [activeTab, setActiveTab] = useState('lessons');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Modal states
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Form states
  const [lessonForm, setLessonForm] = useState({
    title: '',
    content_text: '',
    content_type: 'text',
    order_index: 0,
    duration_minutes: 10,
    is_published: false
  });
  
  const [assignmentForm, setAssignmentForm] = useState({
    title: '',
    description: '',
    due_date: '',
    max_score: 100,
    instructions: '',
    is_published: false
  });
  
  const [quizForm, setQuizForm] = useState({
    title: '',
    description: '',
    pass_score: 60,
    is_auto_graded: true,
    time_limit: null,
    is_published: false
  });

  const loadCourseData = async () => {
    try {
      const [courseRes, lessonsRes, assignmentsRes, quizzesRes, enrollmentsRes] = await Promise.all([
        api.get(`/courses/${courseId}`),
        api.get(`/lessons/course/${courseId}`),
        api.get(`/assignments/course/${courseId}`),
        api.get(`/quizzes/course/${courseId}`),
        api.get(`/courses/${courseId}/enrollments`)
      ]);
      
      setCourse(courseRes.data);
      setLessons(lessonsRes.data);
      setAssignments(assignmentsRes.data);
      setQuizzes(quizzesRes.data);
      setEnrolledStudents(enrollmentsRes.data);
    } catch (error) {
      toast.error('Failed to load course data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);
  
  // Auto-refresh when there are lessons with TTS processing
  useEffect(() => {
    const hasProcessing = lessons.some(l => l.tts_status === 'processing');
    if (hasProcessing) {
      const interval = setInterval(() => {
        // Silently refresh lessons only
        api.get(`/lessons/course/${courseId}`).then(res => {
          setLessons(res.data);
        }).catch(() => {});
      }, 5000); // Poll every 5 seconds
      return () => clearInterval(interval);
    }
  }, [lessons, courseId]);

  // Lesson CRUD
  const handleLessonSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingItem) {
        await api.put(`/lessons/${editingItem.id}`, lessonForm);
        toast.success('Lesson updated! TTS audio is being regenerated...');
      } else {
        await api.post(`/lessons/`, {
          ...lessonForm,
          order_index: lessons.length,
          course_id: courseId
        });
        toast.success('Lesson created! TTS audio is being generated in background...');
      }
      setShowLessonModal(false);
      resetLessonForm();
      loadCourseData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save lesson');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLesson = async (lessonId) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return;
    try {
      await api.delete(`/lessons/${lessonId}`);
      toast.success('Lesson deleted');
      loadCourseData();
    } catch (error) {
      toast.error('Failed to delete lesson');
    }
  };

  const resetLessonForm = () => {
    setLessonForm({
      title: '',
      content_text: '',
      content_type: 'text',
      order_index: 0,
      duration_minutes: 10,
      is_published: false
    });
    setEditingItem(null);
  };

  // Assignment CRUD
  const handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...assignmentForm,
        due_date: assignmentForm.due_date || null,
        instructions: assignmentForm.instructions || ''
      };
      
      if (editingItem) {
        await api.put(`/assignments/${editingItem.id}`, payload);
        toast.success('Assignment updated!');
      } else {
        await api.post(`/assignments/`, {
          ...payload,
          course_id: courseId
        });
        toast.success('Assignment created!');
      }
      setShowAssignmentModal(false);
      resetAssignmentForm();
      loadCourseData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save assignment');
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await api.delete(`/assignments/${assignmentId}`);
      toast.success('Assignment deleted');
      loadCourseData();
    } catch (error) {
      toast.error('Failed to delete assignment');
    }
  };

  const resetAssignmentForm = () => {
    setAssignmentForm({
      title: '',
      description: '',
      due_date: '',
      max_score: 100,
      instructions: '',
      is_published: false
    });
    setEditingItem(null);
  };

  // Quiz CRUD
  const handleQuizSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingItem) {
        await api.put(`/quizzes/${editingItem.id}`, quizForm);
        toast.success('Quiz updated!');
      } else {
        await api.post(`/quizzes/`, 
            {
                ...quizForm,
                course_id: courseId
            }
        );
        toast.success('Quiz created!');
      }
      setShowQuizModal(false);
      resetQuizForm();
      loadCourseData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save quiz');
    }
  };

  const handleDeleteQuiz = async (quizId) => {
    if (!confirm('Are you sure you want to delete this quiz?')) return;
    try {
      await api.delete(`/quizzes/${quizId}`);
      toast.success('Quiz deleted');
      loadCourseData();
    } catch (error) {
      toast.error('Failed to delete quiz');
    }
  };

  const resetQuizForm = () => {
    setQuizForm({
      title: '',
      description: '',
      pass_score: 60,
      is_auto_graded: true,
      time_limit: null,
      is_published: false
    });
    setEditingItem(null);
  };

  const tabs = [
    { id: 'lessons', label: 'Lessons', icon: BookOpen, count: lessons.length },
    { id: 'assignments', label: 'Assignments', icon: FileText, count: assignments.length },
    { id: 'quizzes', label: 'Quizzes', icon: ClipboardList, count: quizzes.length },
    { id: 'students', label: 'Students', icon: Users, count: enrolledStudents.length }
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link 
              to="/teacher"
              className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{course?.title}</h1>
            <p className="text-gray-600">{course?.description}</p>
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
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Lessons</h2>
              <button
                onClick={() => {
                  resetLessonForm();
                  setShowLessonModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Lesson
              </button>
            </div>

            <div className="space-y-3">
              {lessons.length === 0 ? (
                <div className="card text-center py-12">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No lessons yet. Create your first lesson!</p>
                </div>
              ) : (
                lessons.map((lesson, index) => (
                  <div key={lesson.id} className="card flex items-center justify-between">
                    <div className="flex items-center">
                      <GripVertical className="h-5 w-5 text-gray-400 mr-3" />
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold mr-3">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="font-semibold">{lesson.title}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span>{lesson.content_type}</span>
                          <span>{lesson.duration_minutes} min</span>
                          {lesson.tts_status === 'processing' && (
                            <span className="flex items-center text-yellow-600">
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Generating TTS...
                            </span>
                          )}
                          {lesson.tts_status === 'ready' && lesson.audio_url && (
                            <span className="flex items-center text-green-600">
                              <Volume2 className="h-4 w-4 mr-1" />
                              TTS Ready
                            </span>
                          )}
                          {lesson.tts_status === 'error' && (
                            <span className="flex items-center text-red-600">
                              <X className="h-4 w-4 mr-1" />
                              TTS Failed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/teacher/courses/${courseId}/lessons/${lesson.id}`}
                        className="btn btn-secondary p-2"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => {
                          setEditingItem(lesson);
                          setLessonForm({
                            title: lesson.title,
                            content_text: lesson.content_text,
                            content_type: lesson.content_type,
                            order_index: lesson.order_index,
                            duration_minutes: lesson.duration_minutes,
                            is_published: lesson.is_published || false
                          });
                          setShowLessonModal(true);
                        }}
                        className="btn btn-secondary p-2"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteLesson(lesson.id)}
                        className="btn btn-secondary p-2 text-red-600 hover:bg-red-50"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Assignments</h2>
              <button
                onClick={() => {
                  resetAssignmentForm();
                  setShowAssignmentModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Assignment
              </button>
            </div>

            <div className="space-y-3">
              {assignments.length === 0 ? (
                <div className="card text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No assignments yet. Create your first assignment!</p>
                </div>
              ) : (
                assignments.map(assignment => (
                  <div key={assignment.id} className="card flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{assignment.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        {assignment.due_date && (
                          <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                        )}
                        <span>Max Score: {assignment.max_score}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/teacher/courses/${courseId}/assignments/${assignment.id}/grade`}
                        className="btn btn-secondary text-sm"
                      >
                        Grade Submissions
                      </Link>
                      <button
                        onClick={() => {
                          setEditingItem(assignment);
                          setAssignmentForm({
                            title: assignment.title,
                            description: assignment.description,
                            due_date: assignment.due_date?.split('T')[0] || '',
                            max_score: assignment.max_score,
                            is_published: assignment.is_published || false
                          });
                          setShowAssignmentModal(true);
                        }}
                        className="btn btn-secondary p-2"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAssignment(assignment.id)}
                        className="btn btn-secondary p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Quizzes Tab */}
        {activeTab === 'quizzes' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Quizzes</h2>
              <button
                onClick={() => {
                  resetQuizForm();
                  setShowQuizModal(true);
                }}
                className="btn btn-primary flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Quiz
              </button>
            </div>

            <div className="space-y-3">
              {quizzes.length === 0 ? (
                <div className="card text-center py-12">
                  <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No quizzes yet. Create your first quiz!</p>
                </div>
              ) : (
                quizzes.map(quiz => (
                  <div key={quiz.id} className="card flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{quiz.title}</h3>
                      <div className="flex items-center gap-3 text-sm text-gray-500">
                        <span>Pass Score: {quiz.passing_score || quiz.pass_score}%</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          quiz.is_auto_graded 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {quiz.is_auto_graded ? 'Auto-graded' : 'Manual'}
                        </span>
                        {quiz.time_limit && <span>{quiz.time_limit} min limit</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/teacher/courses/${courseId}/quizzes/${quiz.id}/grade`}
                        className="btn btn-primary text-sm"
                      >
                        Grade Submissions
                      </Link>
                      <Link
                        to={`/teacher/courses/${courseId}/quizzes/${quiz.id}/manage`}
                        className="btn btn-secondary text-sm"
                      >
                        Manage Questions
                      </Link>
                      <button
                        onClick={() => {
                          setEditingItem(quiz);
                          setQuizForm({
                            title: quiz.title,
                            description: quiz.description || '',
                            pass_score: quiz.passing_score || quiz.pass_score,
                            is_auto_graded: quiz.is_auto_graded ?? true,
                            time_limit: quiz.time_limit,
                            is_published: quiz.is_published || false
                          });
                          setShowQuizModal(true);
                        }}
                        className="btn btn-secondary p-2"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteQuiz(quiz.id)}
                        className="btn btn-secondary p-2 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div>
            <h2 className="text-xl font-bold mb-4">Enrolled Students</h2>
            
            {enrolledStudents.length === 0 ? (
              <div className="card text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No students enrolled yet.</p>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Student</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Progress</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Enrolled</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {enrolledStudents.map(enrollment => (
                      <tr key={enrollment.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          {enrollment.student?.full_name}
                          {enrollment.student?.is_visually_impaired && (
                            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                              VI
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{enrollment.student?.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center">
                            <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                              <div 
                                className="bg-primary-600 h-2 rounded-full" 
                                style={{ width: `${enrollment.progress_percentage || 0}%` }}
                              />
                            </div>
                            <span className="text-sm">{enrollment.progress_percentage || 0}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(enrollment.enrolled_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/teacher/students/${enrollment.student?.id}/progress?course=${courseId}`}
                            className="text-primary-600 hover:underline text-sm"
                          >
                            View Progress
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Lesson Modal */}
        {showLessonModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  {editingItem ? 'Edit Lesson' : 'Create Lesson'}
                </h2>
                <button onClick={() => setShowLessonModal(false)} className="p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <form onSubmit={handleLessonSubmit} className="space-y-4">
                <div>
                  <label htmlFor="lesson_title" className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    id="lesson_title"
                    value={lessonForm.title}
                    onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="lesson_content" className="block text-sm font-medium text-gray-700 mb-1">
                    Content
                  </label>
                  <textarea
                    id="lesson_content"
                    value={lessonForm.content_text}
                    onChange={(e) => setLessonForm({ ...lessonForm, content_text: e.target.value })}
                    rows={10}
                    className="input w-full"
                    required
                    placeholder="Write your lesson content here. TTS audio will be automatically generated."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="content_type" className="block text-sm font-medium text-gray-700 mb-1">
                      Content Type
                    </label>
                    <select
                      id="content_type"
                      value={lessonForm.content_type}
                      onChange={(e) => setLessonForm({ ...lessonForm, content_type: e.target.value })}
                      className="input w-full"
                    >
                      <option value="text">Text</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      id="duration"
                      value={lessonForm.duration_minutes}
                      onChange={(e) => setLessonForm({ ...lessonForm, duration_minutes: parseInt(e.target.value) })}
                      className="input w-full"
                      min="1"
                    />
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="lesson_published"
                    checked={lessonForm.is_published}
                    onChange={(e) => setLessonForm({ ...lessonForm, is_published: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="lesson_published" className="ml-2 block text-sm text-gray-700">
                    Publish immediately (visible to students)
                  </label>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowLessonModal(false)}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary flex items-center"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        {editingItem ? 'Update' : 'Create'} Lesson
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assignment Modal */}
        {showAssignmentModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  {editingItem ? 'Edit Assignment' : 'Create Assignment'}
                </h2>
                <button onClick={() => setShowAssignmentModal(false)} className="p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <form onSubmit={handleAssignmentSubmit} className="space-y-4">
                <div>
                  <label htmlFor="assignment_title" className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    id="assignment_title"
                    value={assignmentForm.title}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, title: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="assignment_description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="assignment_description"
                    value={assignmentForm.description}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, description: e.target.value })}
                    rows={4}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="datetime-local"
                      id="due_date"
                      value={assignmentForm.due_date}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, due_date: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="max_score" className="block text-sm font-medium text-gray-700 mb-1">
                      Max Score
                    </label>
                    <input
                      type="number"
                      id="max_score"
                      value={assignmentForm.max_score}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, max_score: parseInt(e.target.value) })}
                      className="input w-full"
                      min="1"
                    />
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="assignment_published"
                    checked={assignmentForm.is_published}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, is_published: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="assignment_published" className="ml-2 block text-sm text-gray-700">
                    Publish immediately (visible to students)
                  </label>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAssignmentModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary flex items-center">
                    <Save className="h-4 w-4 mr-2" />
                    {editingItem ? 'Update' : 'Create'} Assignment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quiz Modal */}
        {showQuizModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  {editingItem ? 'Edit Quiz' : 'Create Quiz'}
                </h2>
                <button onClick={() => setShowQuizModal(false)} className="p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <form onSubmit={handleQuizSubmit} className="space-y-4">
                <div>
                  <label htmlFor="quiz_title" className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    id="quiz_title"
                    value={quizForm.title}
                    onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="quiz_description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="quiz_description"
                    value={quizForm.description}
                    onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })}
                    rows={3}
                    className="input w-full"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pass_score" className="block text-sm font-medium text-gray-700 mb-1">
                      Pass Score (%)
                    </label>
                    <input
                      type="number"
                      id="pass_score"
                      value={quizForm.pass_score}
                      onChange={(e) => setQuizForm({ ...quizForm, pass_score: parseInt(e.target.value) })}
                      className="input w-full"
                      min="0"
                      max="100"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="time_limit" className="block text-sm font-medium text-gray-700 mb-1">
                      Time Limit (minutes)
                    </label>
                    <input
                      type="number"
                      id="time_limit"
                      value={quizForm.time_limit || ''}
                      onChange={(e) => setQuizForm({ ...quizForm, time_limit: e.target.value ? parseInt(e.target.value) : null })}
                      className="input w-full"
                      placeholder="No limit"
                      min="1"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={quizForm.is_auto_graded}
                      onChange={(e) => setQuizForm({ ...quizForm, is_auto_graded: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm">Auto-grade quiz (MCQ and True/False questions)</span>
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="quiz_published"
                    checked={quizForm.is_published}
                    onChange={(e) => setQuizForm({ ...quizForm, is_published: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="quiz_published" className="ml-2 block text-sm text-gray-700">
                    Publish immediately (visible to students)
                  </label>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowQuizModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary flex items-center">
                    <Save className="h-4 w-4 mr-2" />
                    {editingItem ? 'Update' : 'Create'} Quiz
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
