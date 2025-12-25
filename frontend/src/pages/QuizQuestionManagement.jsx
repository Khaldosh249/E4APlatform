import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Edit2, Trash2, Save, X, 
  CheckCircle, HelpCircle, ListChecks
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function QuizQuestionManagement() {
  const { courseId, quizId } = useParams();
  
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  
  const [questionForm, setQuestionForm] = useState({
    question_text: '',
    question_type: 'mcq',
    options: ['', '', '', ''],
    correct_answer: '',
    points: 1
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const loadData = async () => {
    try {
      const [quizRes, questionsRes] = await Promise.all([
        api.get(`/quizzes/${quizId}`),
        api.get(`/quizzes/${quizId}/questions`)
      ]);
      
      setQuiz(quizRes.data);
      setQuestions(questionsRes.data);
    } catch (error) {
      toast.error('Failed to load quiz data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate
    if (questionForm.question_type === 'mcq') {
      const validOptions = questionForm.options.filter(o => o.trim());
      if (validOptions.length < 2) {
        toast.error('Please provide at least 2 options');
        return;
      }
      if (!validOptions.includes(questionForm.correct_answer)) {
        toast.error('Correct answer must be one of the options');
        return;
      }
    }
    
    try {

      const options = questionForm.question_type === 'mcq'
        ? questionForm.options.filter(o => o.trim()).map(o => o.toString())
        : [];

      const payload = {
        ...questionForm,
        options: JSON.stringify(options)
      };
      
      if (editingQuestion) {
        await api.put(`/quizzes/questions/${editingQuestion.id}`, payload);
        toast.success('Question updated!');
      } else {
        await api.post(`/quizzes/${quizId}/questions`, payload);
        toast.success('Question added!');
      }
      
      setShowModal(false);
      resetForm();
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save question');
    }
  };

  const handleDelete = async (questionId) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    
    try {
      await api.delete(`/quizzes/questions/${questionId}`);
      toast.success('Question deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete question');
    }
  };

  const resetForm = () => {
    setQuestionForm({
      question_text: '',
      question_type: 'mcq',
      options: ['', '', '', ''],
      correct_answer: '',
      points: 1
    });
    setEditingQuestion(null);
  };

  const openEditModal = (question) => {
    setEditingQuestion(question);
    const parsedOptions = parseOptions(question.options);
    setQuestionForm({
      question_text: question.question_text,
      question_type: question.question_type,
      options: parsedOptions.length > 0 ? parsedOptions : ['', '', '', ''],
      correct_answer: question.correct_answer || '',
      points: question.points || 1
    });
    setShowModal(true);
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
        // Replace single quotes with double quotes for JSON compatibility
        const jsonString = options.replace(/'/g, '"');
        return JSON.parse(jsonString);
      } catch {
        // If all parsing fails, return empty array
        console.error('Failed to parse options:', options);
        return [];
      }
    }
  };

  const getQuestionTypeIcon = (type) => {
    switch (type) {
      case 'mcq':
        return <ListChecks className="h-4 w-4" />;
      case 'true_false':
        return <CheckCircle className="h-4 w-4" />;
      case 'short_answer':
        return <HelpCircle className="h-4 w-4" />;
      default:
        return <HelpCircle className="h-4 w-4" />;
    }
  };

  const getQuestionTypeLabel = (type) => {
    switch (type) {
      case 'mcq':
        return 'Multiple Choice';
      case 'true_false':
        return 'True/False';
      case 'short_answer':
        return 'Short Answer';
      default:
        return type;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link 
            to={`/teacher/courses/${courseId}/manage`}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Course Management
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{quiz?.title}</h1>
          <p className="text-gray-600">{quiz?.description}</p>
          
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span>Pass Score: {quiz?.pass_score}%</span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              quiz?.is_auto_graded 
                ? 'bg-green-100 text-green-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {quiz?.is_auto_graded ? 'Auto-graded' : 'Manual grading'}
            </span>
          </div>
        </div>

        {/* Add Question Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">
            Questions ({questions.length})
          </h2>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Question
          </button>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="card text-center py-12">
              <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No questions yet. Add your first question!</p>
            </div>
          ) : (
            questions.map((question, index) => (
              <div key={question.id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start flex-1">
                    <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold mr-3 flex-shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-medium mb-2">{question.question_text}</p>
                      
                      <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                        <span className="flex items-center gap-1">
                          {getQuestionTypeIcon(question.question_type)}
                          {getQuestionTypeLabel(question.question_type)}
                        </span>
                        <span>{question.points} point{question.points !== 1 ? 's' : ''}</span>
                      </div>
                      
                      {/* Show options for MCQ */}
                      {question.question_type === 'mcq' && question.options && (
                        <div className="space-y-1">
                          {parseOptions(question.options).map((option, optIdx) => (
                            <div 
                              key={optIdx}
                              className={`flex items-center text-sm px-3 py-1 rounded ${
                                option === question.correct_answer
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {option === question.correct_answer && (
                                <CheckCircle className="h-4 w-4 mr-2" />
                              )}
                              {option}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Show correct answer for True/False */}
                      {question.question_type === 'true_false' && (
                        <div className="text-sm">
                          <span className="text-gray-500">Correct Answer: </span>
                          <span className="font-medium text-green-600">{question.correct_answer}</span>
                        </div>
                      )}
                      
                      {/* Show correct answer for Short Answer */}
                      {question.question_type === 'short_answer' && question.correct_answer && (
                        <div className="text-sm">
                          <span className="text-gray-500">Expected Answer: </span>
                          <span className="font-medium">{question.correct_answer}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => openEditModal(question)}
                      className="btn btn-secondary p-2"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(question.id)}
                      className="btn btn-secondary p-2 text-red-600 hover:bg-red-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Question Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  {editingQuestion ? 'Edit Question' : 'Add Question'}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="question_text" className="block text-sm font-medium text-gray-700 mb-1">
                    Question
                  </label>
                  <textarea
                    id="question_text"
                    value={questionForm.question_text}
                    onChange={(e) => setQuestionForm({ ...questionForm, question_text: e.target.value })}
                    rows={3}
                    className="input w-full"
                    required
                    placeholder="Enter your question..."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="question_type" className="block text-sm font-medium text-gray-700 mb-1">
                      Question Type
                    </label>
                    <select
                      id="question_type"
                      value={questionForm.question_type}
                      onChange={(e) => {
                        const type = e.target.value;
                        setQuestionForm({ 
                          ...questionForm, 
                          question_type: type,
                          options: type === 'mcq' ? ['', '', '', ''] : [],
                          correct_answer: type === 'true_false' ? 'True' : ''
                        });
                      }}
                      className="input w-full"
                    >
                      <option value="mcq">Multiple Choice</option>
                      <option value="true_false">True/False</option>
                      <option value="short_answer">Short Answer</option>
                    </select>
                  </div>
                  
                  <div>
                    <label htmlFor="points" className="block text-sm font-medium text-gray-700 mb-1">
                      Points
                    </label>
                    <input
                      type="number"
                      id="points"
                      value={questionForm.points}
                      onChange={(e) => setQuestionForm({ ...questionForm, points: parseInt(e.target.value) })}
                      className="input w-full"
                      min="1"
                    />
                  </div>
                </div>
                
                {/* Multiple Choice Options */}
                {questionForm.question_type === 'mcq' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Options (select the correct answer)
                    </label>
                    <div className="space-y-2">
                      {questionForm.options.map((option, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="correct_option"
                            checked={questionForm.correct_answer === option && option !== ''}
                            onChange={() => setQuestionForm({ ...questionForm, correct_answer: option })}
                            className="w-4 h-4"
                            disabled={!option.trim()}
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...questionForm.options];
                              newOptions[idx] = e.target.value;
                              setQuestionForm({ ...questionForm, options: newOptions });
                            }}
                            className="input flex-1"
                            placeholder={`Option ${idx + 1}`}
                          />
                          {questionForm.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newOptions = questionForm.options.filter((_, i) => i !== idx);
                                setQuestionForm({ ...questionForm, options: newOptions });
                              }}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      {questionForm.options.length < 6 && (
                        <button
                          type="button"
                          onClick={() => setQuestionForm({ 
                            ...questionForm, 
                            options: [...questionForm.options, '']
                          })}
                          className="text-sm text-primary-600 hover:underline flex items-center"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Option
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* True/False */}
                {questionForm.question_type === 'true_false' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Correct Answer
                    </label>
                    <div className="flex gap-4">
                      {['True', 'False'].map(option => (
                        <label 
                          key={option}
                          className={`flex-1 flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors ${
                            questionForm.correct_answer === option 
                              ? 'border-primary-500 bg-primary-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="true_false"
                            value={option}
                            checked={questionForm.correct_answer === option}
                            onChange={(e) => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}
                            className="mr-2"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Short Answer */}
                {questionForm.question_type === 'short_answer' && (
                  <div>
                    <label htmlFor="correct_answer" className="block text-sm font-medium text-gray-700 mb-1">
                      Expected Answer (for auto-grading)
                    </label>
                    <input
                      type="text"
                      id="correct_answer"
                      value={questionForm.correct_answer}
                      onChange={(e) => setQuestionForm({ ...questionForm, correct_answer: e.target.value })}
                      className="input w-full"
                      placeholder="Enter expected answer..."
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave empty for manual grading only
                    </p>
                  </div>
                )}
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary flex items-center">
                    <Save className="h-4 w-4 mr-2" />
                    {editingQuestion ? 'Update' : 'Add'} Question
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
