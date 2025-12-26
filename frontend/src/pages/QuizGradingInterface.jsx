import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { 
  ArrowLeft, 
  User, 
  CheckCircle, 
  XCircle,
  Clock,
  Save,
  FileText
} from 'lucide-react';

export default function QuizGradingInterface() {
  const { courseId, quizId } = useParams();
  
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  
  const [gradeForm, setGradeForm] = useState({});
  
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);

  useEffect(() => {
    loadQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (quizId && quizId !== 'all') {
      loadData(quizId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const loadQuizzes = async () => {
    try {
      const response = await api.get(`/quizzes/course/${courseId}`);
      setQuizzes(response.data);
      if (response.data.length > 0 && (!quizId || quizId === 'all')) {
        setSelectedQuiz(response.data[0]);
        loadData(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading quizzes:', error);
    }
  };

  const loadData = async (qId) => {
    try {
      setLoading(true);
      const [quizRes, questionsRes, attemptsRes] = await Promise.all([
        api.get(`/quizzes/${qId}`),
        api.get(`/quizzes/${qId}/questions`),
        api.get(`/quizzes/${qId}/all-attempts-detail`)
      ]);
      
      setQuiz(quizRes.data);
      setSelectedQuiz(quizRes.data);
      setQuestions(questionsRes.data);
      setAttempts(attemptsRes.data);
      setSelectedAttempt(null);
      setGradeForm({});
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuizChange = (quiz) => {
    setSelectedQuiz(quiz);
    setLoading(true);
    loadData(quiz.id);
  };

  const selectAttempt = (attempt) => {
    setSelectedAttempt(attempt);
    
    // Initialize grade form with existing grades
    const initialGrades = {};
    attempt.answers?.forEach(answer => {
      const question = questions.find(q => q.id === answer.question_id);
      initialGrades[answer.id] = {
        is_correct: answer.is_correct ?? false,
        points_earned: answer.points_earned ?? 0,
        feedback: answer.teacher_feedback || '',
        max_points: question?.points || 1
      };
    });
    setGradeForm(initialGrades);
  };

  const handleGradeChange = (answerId, field, value) => {
    setGradeForm(prev => ({
      ...prev,
      [answerId]: {
        ...prev[answerId],
        [field]: value
      }
    }));
  };

  const handleGrade = async (e) => {
    e.preventDefault();
    if (!selectedAttempt) return;
    
    setGrading(true);
    try {
      const grades = Object.entries(gradeForm).map(([answerId, grade]) => ({
        answer_id: parseInt(answerId),
        is_correct: grade.is_correct,
        points_earned: parseFloat(grade.points_earned) || 0,
        feedback: grade.feedback || null
      }));
      
      await api.post(`/quizzes/attempts/${selectedAttempt.id}/grade`, {
        answers: grades
      });
      
      // Reload attempts
      await loadData(quiz.id);
      alert('Grades saved successfully!');
    } catch (error) {
      console.error('Error grading:', error);
      alert('Failed to save grades');
    } finally {
      setGrading(false);
    }
  };

  const getStatusColor = (attempt) => {
    if (!attempt.is_completed) return 'bg-gray-100 text-gray-600';
    if (!attempt.is_graded) return 'bg-yellow-100 text-yellow-600';
    if (attempt.passed) return 'bg-green-100 text-green-600';
    return 'bg-red-100 text-red-600';
  };

  const getQuestionById = (questionId) => {
    return questions.find(q => q.id === questionId);
  };

  const parseOptions = (options) => {
    if (!options) return [];
    if (Array.isArray(options)) return options;
    try {
      const parsed = JSON.parse(options);
      return Array.isArray(parsed) ? parsed : Object.values(parsed);
    } catch {
      try {
        return JSON.parse(options.replace(/'/g, '"'));
      } catch {
        return [];
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex justify-center items-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link 
            to={`/teacher/courses/${courseId}/manage`}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Course Management
          </Link>
          
          {/* Quiz Selector */}
          {quizzes.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Quiz
              </label>
              <select
                value={selectedQuiz?.id || ''}
                onChange={(e) => {
                  const q = quizzes.find(quiz => quiz.id === parseInt(e.target.value));
                  if (q) handleQuizChange(q);
                }}
                className="input max-w-md"
              >
                {quizzes.map(q => (
                  <option key={q.id} value={q.id}>{q.title}</option>
                ))}
              </select>
            </div>
          )}
          
          <h1 className="text-3xl font-bold text-gray-900">{quiz?.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
            <span>Max Score: {quiz?.max_score || 100}</span>
            <span>Pass Score: {quiz?.passing_score || 60}%</span>
            <span className={`px-2 py-1 rounded ${quiz?.is_auto_graded ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {quiz?.is_auto_graded ? 'Auto-Graded' : 'Manual Grading'}
            </span>
            <span>{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Attempts List */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-lg font-bold mb-4">Attempts</h2>
              
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2 bg-green-50 rounded text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {attempts.filter(a => a.is_graded).length}
                  </p>
                  <p className="text-xs text-green-600">Graded</p>
                </div>
                <div className="p-2 bg-yellow-50 rounded text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {attempts.filter(a => !a.is_graded && a.is_completed).length}
                  </p>
                  <p className="text-xs text-yellow-600">Pending</p>
                </div>
              </div>
              
              {/* Attempts */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {attempts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No attempts yet</p>
                ) : (
                  attempts.map(attempt => (
                    <button
                      key={attempt.id}
                      onClick={() => selectAttempt(attempt)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedAttempt?.id === attempt.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="font-medium text-sm">
                            {attempt.student?.full_name || 'Student'}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(attempt)}`}>
                          {!attempt.is_completed 
                            ? 'In Progress'
                            : !attempt.is_graded 
                            ? 'Pending'
                            : `${attempt.score}/${quiz?.max_score || 100}`
                          }
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {attempt.time_submitted 
                          ? `Submitted: ${new Date(attempt.time_submitted).toLocaleString()}`
                          : `Started: ${new Date(attempt.time_started).toLocaleString()}`
                        }
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Grading Panel */}
          <div className="lg:col-span-2">
            {selectedAttempt ? (
              <div className="space-y-6">
                {/* Student Info */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3">
                        <User className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{selectedAttempt.student?.full_name}</h3>
                        <p className="text-sm text-gray-500">{selectedAttempt.student?.email}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center text-sm text-gray-500">
                        <Clock className="h-4 w-4 mr-1" />
                        {selectedAttempt.time_taken 
                          ? `${Math.floor(selectedAttempt.time_taken / 60)}m ${selectedAttempt.time_taken % 60}s`
                          : 'N/A'
                        }
                      </div>
                      <p className="text-sm text-gray-500">
                        Attempt #{selectedAttempt.attempt_number}
                      </p>
                    </div>
                  </div>
                  
                  {selectedAttempt.is_graded && (
                    <div className={`flex items-center p-3 rounded-lg ${
                      selectedAttempt.passed ? 'bg-green-50' : 'bg-red-50'
                    }`}>
                      {selectedAttempt.passed ? (
                        <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600 mr-2" />
                      )}
                      <span className={selectedAttempt.passed ? 'text-green-800' : 'text-red-800'}>
                        Score: {selectedAttempt.score} / {quiz?.max_score || 100} ({selectedAttempt.percentage.toFixed(1)}%)
                        {selectedAttempt.passed ? ' - Passed' : ' - Not Passed'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Answers & Grading */}
                <form onSubmit={handleGrade} className="space-y-4">
                  {selectedAttempt.answers?.map((answer, idx) => {
                    const question = getQuestionById(answer.question_id);
                    const grade = gradeForm[answer.id] || {};
                    
                    return (
                      <div key={answer.id} className="card">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-medium text-gray-900">
                            Question {idx + 1}
                            <span className="text-sm text-gray-500 ml-2">
                              ({question?.points || 1} point{(question?.points || 1) !== 1 ? 's' : ''})
                            </span>
                          </h4>
                          <span className={`px-2 py-1 text-xs rounded ${
                            grade.is_correct 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {grade.points_earned || 0} / {question?.points || 1}
                          </span>
                        </div>
                        
                        <p className="text-gray-800 mb-3">{question?.question_text}</p>
                        
                        {/* Show options for MCQ */}
                        {question?.question_type === 'mcq' && question.options && (
                          <div className="mb-3 space-y-2">
                            {parseOptions(question.options).map((opt, optIdx) => (
                              <div 
                                key={optIdx}
                                className={`p-2 rounded border ${
                                  answer.answer_text === String.fromCharCode(65 + optIdx)
                                    ? grade.is_correct
                                      ? 'border-green-500 bg-green-50'
                                      : 'border-red-500 bg-red-50'
                                    : question.correct_answer === String.fromCharCode(65 + optIdx)
                                    ? 'border-green-300 bg-green-25'
                                    : 'border-gray-200'
                                }`}
                              >
                                <span className="font-medium mr-2">{String.fromCharCode(65 + optIdx)}.</span>
                                {opt}
                                {question.correct_answer === String.fromCharCode(65 + optIdx) && (
                                  <span className="ml-2 text-green-600 text-sm">(Correct)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Student's answer for non-MCQ */}
                        {question?.question_type !== 'mcq' && (
                          <div className="mb-3 p-3 bg-gray-50 rounded">
                            <p className="text-sm text-gray-500 mb-1">Student&apos;s Answer:</p>
                            <p className="text-gray-800">{answer.answer_text || 'No answer provided'}</p>
                          </div>
                        )}
                        
                        {/* Grading Controls */}
                        {!quiz?.is_auto_graded && (
                          <div className="border-t pt-3 mt-3 space-y-3">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={grade.is_correct || false}
                                  onChange={(e) => {
                                    handleGradeChange(answer.id, 'is_correct', e.target.checked);
                                    if (e.target.checked) {
                                      handleGradeChange(answer.id, 'points_earned', question?.points || 1);
                                    } else {
                                      handleGradeChange(answer.id, 'points_earned', 0);
                                    }
                                  }}
                                  className="mr-2"
                                />
                                Mark as Correct
                              </label>
                              
                              <div className="flex items-center">
                                <label className="text-sm text-gray-600 mr-2">Points:</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={question?.points || 1}
                                  step="0.5"
                                  value={grade.points_earned || 0}
                                  onChange={(e) => handleGradeChange(answer.id, 'points_earned', parseFloat(e.target.value))}
                                  className="input w-20"
                                />
                                <span className="text-sm text-gray-500 ml-1">/ {question?.points || 1}</span>
                              </div>
                            </div>
                            
                            <div>
                              <label className="text-sm text-gray-600 mb-1 block">Feedback:</label>
                              <textarea
                                value={grade.feedback || ''}
                                onChange={(e) => handleGradeChange(answer.id, 'feedback', e.target.value)}
                                rows={2}
                                className="input w-full"
                                placeholder="Add feedback for this answer..."
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Show existing feedback for auto-graded */}
                        {quiz?.is_auto_graded && answer.teacher_feedback && (
                          <div className="border-t pt-3 mt-3">
                            <p className="text-sm text-gray-500 mb-1">Feedback:</p>
                            <p className="text-gray-700">{answer.teacher_feedback}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Submit Button */}
                  {!quiz?.is_auto_graded && (
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={grading}
                        className="btn btn-primary flex items-center"
                      >
                        {grading ? (
                          <>Saving...</>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Grades
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            ) : (
              <div className="card text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select an attempt to grade</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
