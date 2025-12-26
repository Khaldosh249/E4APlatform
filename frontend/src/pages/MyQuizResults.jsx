import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import { 
  CheckCircle, 
  XCircle,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export default function MyQuizResults() {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedAttempt, setExpandedAttempt] = useState(null);
  const [attemptDetails, setAttemptDetails] = useState({});

  useEffect(() => {
    loadAttempts();
  }, []);

  const loadAttempts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/quizzes/my-attempts/all');
      setAttempts(response.data);
    } catch (error) {
      console.error('Error loading attempts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAttemptDetails = async (attemptId) => {
    if (attemptDetails[attemptId]) return;
    
    try {
      const response = await api.get(`/quizzes/attempts/${attemptId}`);
      setAttemptDetails(prev => ({
        ...prev,
        [attemptId]: response.data
      }));
    } catch (error) {
      console.error('Error loading attempt details:', error);
    }
  };

  const toggleExpand = async (attemptId) => {
    if (expandedAttempt === attemptId) {
      setExpandedAttempt(null);
    } else {
      setExpandedAttempt(attemptId);
      await loadAttemptDetails(attemptId);
    }
  };

  const getStatusBadge = (attempt) => {
    if (!attempt.is_graded) {
      return (
        <span className="px-3 py-1 rounded-full text-sm bg-yellow-100 text-yellow-700">
          Pending Grading
        </span>
      );
    }
    if (attempt.passed) {
      return (
        <span className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-700 flex items-center">
          <CheckCircle className="h-4 w-4 mr-1" />
          Passed
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-700 flex items-center">
        <XCircle className="h-4 w-4 mr-1" />
        Not Passed
      </span>
    );
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
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link 
            to="/student"
            className="text-primary-600 hover:text-primary-700 text-sm mb-2 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">My Quiz Results</h1>
          <p className="text-gray-600 mt-1">View your quiz submissions and scores</p>
        </div>

        {attempts.length === 0 ? (
          <div className="card text-center py-12">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Quiz Attempts Yet</h3>
            <p className="text-gray-600">You haven&apos;t taken any quizzes yet.</p>
            <Link to="/student" className="btn btn-primary mt-4">
              Browse Courses
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {attempts.map(attempt => (
              <div key={attempt.id} className="card">
                <button
                  onClick={() => toggleExpand(attempt.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        Quiz #{attempt.quiz_id}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                        <span className="flex items-center">
                          <Clock className="h-4 w-4 mr-1" />
                          {attempt.time_submitted 
                            ? new Date(attempt.time_submitted).toLocaleDateString()
                            : 'In Progress'
                          }
                        </span>
                        {attempt.time_taken && (
                          <span>
                            Duration: {Math.floor(attempt.time_taken / 60)}m {attempt.time_taken % 60}s
                          </span>
                        )}
                        <span>Attempt #{attempt.attempt_number}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {attempt.is_graded && (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">
                            {attempt.percentage.toFixed(0)}%
                          </p>
                          <p className="text-sm text-gray-500">
                            {attempt.score} / {attempt.max_score}
                          </p>
                        </div>
                      )}
                      
                      {getStatusBadge(attempt)}
                      
                      {expandedAttempt === attempt.id ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </button>
                
                {/* Expanded Details */}
                {expandedAttempt === attempt.id && (
                  <div className="mt-4 pt-4 border-t">
                    {!attemptDetails[attempt.id] ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {attemptDetails[attempt.id].answers?.map((answer, idx) => (
                          <div 
                            key={answer.id}
                            className={`p-4 rounded-lg border ${
                              answer.is_correct === null
                                ? 'border-gray-200 bg-gray-50'
                                : answer.is_correct
                                ? 'border-green-200 bg-green-50'
                                : 'border-red-200 bg-red-50'
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className="font-medium text-gray-700">
                                Question {idx + 1}
                              </span>
                              {answer.is_correct !== null && (
                                <span className={`text-sm ${
                                  answer.is_correct ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {answer.points_earned} pts
                                </span>
                              )}
                            </div>
                            
                            <p className="text-gray-600 mb-2">
                              Your answer: <strong>{answer.answer_text || 'No answer'}</strong>
                            </p>
                            
                            {answer.is_correct !== null && (
                              <div className="flex items-center text-sm">
                                {answer.is_correct ? (
                                  <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600 mr-1" />
                                )}
                                <span className={answer.is_correct ? 'text-green-600' : 'text-red-600'}>
                                  {answer.is_correct ? 'Correct' : 'Incorrect'}
                                </span>
                              </div>
                            )}
                            
                            {answer.teacher_feedback && (
                              <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                                <p className="text-sm text-gray-500 mb-1">Teacher Feedback:</p>
                                <p className="text-gray-700">{answer.teacher_feedback}</p>
                              </div>
                            )}
                          </div>
                        ))}
                        
                        {!attempt.is_graded && (
                          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                            <p className="text-yellow-800">
                              This quiz is pending grading by your teacher. You&apos;ll see your results once it&apos;s graded.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
