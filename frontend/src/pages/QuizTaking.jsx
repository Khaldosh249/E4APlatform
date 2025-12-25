import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Clock, CheckCircle, XCircle, 
  AlertCircle, Send, RotateCcw
} from 'lucide-react';
import Navbar from '../components/Navbar';
import AudioPlayer from '../components/AudioPlayer';
import api from '../lib/api';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function QuizTaking() {
  const { courseId, quizId } = useParams();
  const { user } = useAuthStore();
  
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(null);
  const [previousAttempts, setPreviousAttempts] = useState([]);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const isStudent = user?.role === 'student';
  const basePath = isStudent ? '/student' : '/teacher';

  useEffect(() => {
    loadQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  useEffect(() => {
    // Timer countdown
    if (timeRemaining !== null && timeRemaining > 0 && quizStarted) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmit(true); // Auto-submit when time runs out
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRemaining, quizStarted]);

  const loadQuiz = async () => {
    try {
      const [quizRes, questionsRes] = await Promise.all([
        api.get(`/quizzes/${quizId}`),
        api.get(`/quizzes/${quizId}/questions`)
      ]);
      
      setQuiz(quizRes.data);
      setQuestions(questionsRes.data);

      // Load previous attempts
      if (isStudent) {
        try {
          const attemptsRes = await api.get(`/quizzes/${quizId}/attempts`);
          setPreviousAttempts(attemptsRes.data);
        } catch (e) {
          // No attempts yet
        }
      }
    } catch (error) {
      toast.error('Failed to load quiz');
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = () => {
    setQuizStarted(true);
    const response = api.post(`/quizzes/${quizId}/start`, );
    if (quiz.time_limit) {
      setTimeRemaining(quiz.time_limit * 60); // Convert minutes to seconds
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async (autoSubmit = false) => {
    if (!autoSubmit && !confirm('Are you sure you want to submit your quiz?')) return;
    
    setSubmitting(true);
    try {
      // Format answers for API
      const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
        question_id: parseInt(questionId),
        answer: answer
      }));

      const response = await api.post(`/quizzes/${quizId}/submit`, {
        answers: formattedAnswers
      });
      
      setAttempt(response.data);
      setShowResults(true);
      toast.success('Quiz submitted successfully!');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit quiz');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper function to safely parse options (handles both JSON and Python list format)
  const parseOptions = (options) => {
    if (!options) return [];
    if (Array.isArray(options)) return options;
    
    try {
      // Try standard JSON parse first
      return JSON.parse(options);
    } catch {
      // Handle Python-style list format: ['a', 'b'] -> convert to proper JSON
      try {
        const jsonString = options.replace(/'/g, '"');
        return JSON.parse(jsonString);
      } catch {
        console.error('Failed to parse options:', options);
        return [];
      }
    }
  };

  const renderQuestion = (question, index) => {
    const currentAnswer = answers[question.id] || '';
    const options = parseOptions(question.options);

    return (
      <div key={question.id} className="card mb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start">
            <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold mr-3">
              {index + 1}
            </span>
            <div className="flex-1">
              <p className="text-lg font-medium">{question.question_text}</p>
              {question.audio_url && (
                <div className="mt-2">
                  <AudioPlayer 
                    src={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${question.audio_url}`}
                  />
                </div>
              )}
            </div>
          </div>
          <span className="text-sm text-gray-500">
            {question.points} point{question.points !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Multiple Choice (mcq) */}
        {(question.question_type === 'mcq' || question.question_type === 'multiple_choice') && (
          <div className="space-y-2 ml-11">
            {options.map((option, optIndex) => (
              <label 
                key={optIndex}
                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                  currentAnswer === option 
                    ? 'border-primary-500 bg-primary-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option}
                  checked={currentAnswer === option}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  className="mr-3"
                  disabled={showResults}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}

        {/* True/False */}
        {question.question_type === 'true_false' && (
          <div className="flex gap-4 ml-11">
            {['True', 'False'].map(option => (
              <label 
                key={option}
                className={`flex-1 flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors ${
                  currentAnswer === option 
                    ? 'border-primary-500 bg-primary-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option}
                  checked={currentAnswer === option}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  className="mr-2"
                  disabled={showResults}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}

        {/* Short Answer */}
        {question.question_type === 'short_answer' && (
          <div className="ml-11">
            <textarea
              value={currentAnswer}
              onChange={(e) => handleAnswerChange(question.id, e.target.value)}
              placeholder="Type your answer here..."
              className="input w-full min-h-24"
              disabled={showResults}
            />
          </div>
        )}

        {/* Show correct answer after submission */}
        {showResults && attempt && (
          <div className="mt-4 ml-11">
            {question.correct_answer && (
              <p className={`flex items-center text-sm ${
                currentAnswer?.toLowerCase() === question.correct_answer?.toLowerCase()
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {currentAnswer?.toLowerCase() === question.correct_answer?.toLowerCase() ? (
                  <CheckCircle className="h-4 w-4 mr-1" />
                ) : (
                  <XCircle className="h-4 w-4 mr-1" />
                )}
                Correct answer: {question.correct_answer}
              </p>
            )}
          </div>
        )}
      </div>
    );
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

  if (!quiz) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p>Quiz not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link 
          to={`${basePath}/courses/${courseId}`}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Course
        </Link>

        {/* Quiz Header */}
        <div className="card mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{quiz.title}</h1>
              <p className="text-gray-600 mb-4">{quiz.description}</p>
              
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center text-gray-600">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {questions.length} Questions
                </span>
                <span className="text-gray-600">
                  Pass Score: {quiz.pass_score}%
                </span>
                {quiz.time_limit && (
                  <span className="flex items-center text-gray-600">
                    <Clock className="h-4 w-4 mr-1" />
                    {quiz.time_limit} minutes
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs ${
                  quiz.is_auto_graded 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {quiz.is_auto_graded ? 'Auto-graded' : 'Manual grading'}
                </span>
              </div>
            </div>
            
            {/* Timer */}
            {quizStarted && timeRemaining !== null && (
              <div className={`text-center p-3 rounded-lg ${
                timeRemaining < 60 ? 'bg-red-100' : 'bg-gray-100'
              }`}>
                <Clock className={`h-6 w-6 mx-auto mb-1 ${
                  timeRemaining < 60 ? 'text-red-600' : 'text-gray-600'
                }`} />
                <span className={`text-xl font-mono font-bold ${
                  timeRemaining < 60 ? 'text-red-600' : 'text-gray-900'
                }`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Previous Attempts */}
        {previousAttempts.length > 0 && !quizStarted && !showResults && (
          <div className="card mb-6 bg-blue-50">
            <h3 className="font-semibold mb-3">Previous Attempts</h3>
            <div className="space-y-2">
              {previousAttempts.map((att, index) => (
                <div key={att.id} className="flex items-center justify-between bg-white p-3 rounded">
                  <span>Attempt {index + 1}</span>
                  <div className="flex items-center gap-4">
                    <span className={`font-bold ${att.passed ? 'text-green-600' : 'text-red-600'}`}>
                      {att.score}%
                    </span>
                    <span className={`px-2 py-1 text-xs rounded ${
                      att.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {att.passed ? 'Passed' : 'Failed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start Quiz Button */}
        {!quizStarted && !showResults && isStudent && (
          <div className="card text-center py-8">
            <h3 className="text-xl font-semibold mb-4">Ready to begin?</h3>
            <p className="text-gray-600 mb-6">
              Once you start, {quiz.time_limit ? `you will have ${quiz.time_limit} minutes to complete the quiz.` : 'take your time to answer all questions.'}
            </p>
            <button
              onClick={startQuiz}
              className="btn btn-primary text-lg px-8 py-3"
            >
              Start Quiz
            </button>
          </div>
        )}

        {/* Questions */}
        {(quizStarted || showResults || !isStudent) && (
          <>
            <div className="space-y-4">
              {questions.map((question, index) => renderQuestion(question, index))}
            </div>

            {/* Submit Button */}
            {!showResults && isStudent && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={submitting || Object.keys(answers).length === 0}
                  className="btn btn-primary flex items-center text-lg px-8"
                >
                  {submitting ? (
                    <>
                      <RotateCcw className="h-5 w-5 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Submit Quiz
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}

        {/* Results */}
        {showResults && attempt && (
          <div className="card mt-6 text-center">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
              attempt.passed ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {attempt.passed ? (
                <CheckCircle className="h-10 w-10 text-green-600" />
              ) : (
                <XCircle className="h-10 w-10 text-red-600" />
              )}
            </div>
            
            <h2 className="text-2xl font-bold mb-2">
              {attempt.passed ? 'Congratulations!' : 'Quiz Completed'}
            </h2>
            
            <p className="text-4xl font-bold mb-2 text-primary-600">
              {attempt.score}%
            </p>
            
            <p className={`text-lg ${attempt.passed ? 'text-green-600' : 'text-red-600'}`}>
              {attempt.passed ? 'You passed!' : `You need ${quiz.pass_score}% to pass`}
            </p>
            
            <div className="mt-6 flex justify-center gap-4">
              <Link
                to={`${basePath}/courses/${courseId}`}
                className="btn btn-secondary"
              >
                Back to Course
              </Link>
              {!attempt.passed && (
                <button
                  onClick={() => {
                    setShowResults(false);
                    setQuizStarted(false);
                    setAnswers({});
                    setAttempt(null);
                    if (quiz.time_limit) {
                      setTimeRemaining(quiz.time_limit * 60);
                    }
                  }}
                  className="btn btn-primary"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
