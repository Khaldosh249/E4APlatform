import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, CheckCircle, 
  MessageSquare, Save, FileText, Download, User
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function GradingInterface() {
  const { courseId, assignmentId } = useParams();
  
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState(false);
  
  const [gradeForm, setGradeForm] = useState({
    score: 0,
    feedback: ''
  });

  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);

  useEffect(() => {
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (assignmentId && assignmentId !== 'all') {
      loadData(assignmentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const loadAssignments = async () => {
    try {
      const res = await api.get(`/assignments/course/${courseId}`);
      setAssignments(res.data);
      
      // If assignmentId is 'all' or not specified, select first assignment
      if (assignmentId === 'all' && res.data.length > 0) {
        setSelectedAssignment(res.data[0]);
        loadData(res.data[0].id);
      }
    } catch (error) {
      console.error('Failed to load assignments:', error);
    }
  };

  const loadData = async (assId) => {
    try {
      const [assignmentRes, submissionsRes] = await Promise.all([
        api.get(`/assignments/${assId}`),
        api.get(`/assignments/${assId}/submissions`)
      ]);
      
      setAssignment(assignmentRes.data);
      setSelectedAssignment(assignmentRes.data);
      setSubmissions(submissionsRes.data);
      
      // Select first ungraded submission if any
      const ungraded = submissionsRes.data.find(s => !s.is_graded);
      if (ungraded) {
        selectSubmission(ungraded);
      } else if (submissionsRes.data.length > 0) {
        selectSubmission(submissionsRes.data[0]);
      } else {
        setSelectedSubmission(null);
      }
    } catch (error) {
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignmentChange = (assignment) => {
    setSelectedAssignment(assignment);
    setLoading(true);
    loadData(assignment.id);
  };

  const selectSubmission = (submission) => {
    setSelectedSubmission(submission);
    setGradeForm({
      score: submission.score || 0,
      feedback: ''
    });
  };

  const handleGrade = async (e) => {
    e.preventDefault();
    if (!selectedSubmission) return;
    
    setGrading(true);
    try {
      // Update submission with grade
      await api.post(`/assignments/grade/${selectedSubmission.id}`, {
        score: gradeForm.score,
        is_graded: true
      });
      
      // Add feedback if provided
      if (gradeForm.feedback.trim()) {
        await api.post('/feedback/', {
          submission_id: selectedSubmission.id,
          student_id: selectedSubmission.student_id,
          content: gradeForm.feedback,
          feedback_type: 'assignment'
        });
      }
      
      toast.success('Grade saved successfully!');
      if (selectedAssignment) {
        loadData(selectedAssignment.id);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save grade');
    } finally {
      setGrading(false);
    }
  };

  const getStatusColor = (submission) => {
    if (submission.is_graded) {
      const percentage = (submission.score / (assignment?.max_score || 100)) * 100;
      if (percentage >= 70) return 'text-green-600 bg-green-50';
      if (percentage >= 50) return 'text-yellow-600 bg-yellow-50';
      return 'text-red-600 bg-red-50';
    }
    return 'text-blue-600 bg-blue-50';
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
          
          {/* Assignment Selector */}
          {assignments.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Assignment
              </label>
              <select
                value={selectedAssignment?.id || ''}
                onChange={(e) => {
                  const ass = assignments.find(a => a.id === parseInt(e.target.value));
                  if (ass) handleAssignmentChange(ass);
                }}
                className="input max-w-md"
              >
                {assignments.map(ass => (
                  <option key={ass.id} value={ass.id}>{ass.title}</option>
                ))}
              </select>
            </div>
          )}
          
          <h1 className="text-3xl font-bold text-gray-900">{assignment?.title}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
            <span>Max Score: {assignment?.max_score || 100}</span>
            {assignment?.due_date && (
              <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
            )}
            <span>{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Submissions List */}
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="text-lg font-bold mb-4">Submissions</h2>
              
              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="p-2 bg-green-50 rounded text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {submissions.filter(s => s.is_graded).length}
                  </p>
                  <p className="text-xs text-green-600">Graded</p>
                </div>
                <div className="p-2 bg-yellow-50 rounded text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {submissions.filter(s => !s.is_graded).length}
                  </p>
                  <p className="text-xs text-yellow-600">Pending</p>
                </div>
              </div>
              
              {/* List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {submissions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No submissions yet</p>
                ) : (
                  submissions.map(submission => (
                    <button
                      key={submission.id}
                      onClick={() => selectSubmission(submission)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedSubmission?.id === submission.id
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="font-medium text-sm">
                            {submission.student?.full_name || 'Student'}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(submission)}`}>
                          {submission.is_graded 
                            ? `${submission.score}/${assignment?.max_score || 100}`
                            : 'Pending'
                          }
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Submitted: {new Date(submission.submitted_at).toLocaleString()}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Submission Detail & Grading */}
          <div className="lg:col-span-2">
            {selectedSubmission ? (
              <div className="space-y-6">
                {/* Student Info */}
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3">
                        <User className="h-5 w-5 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{selectedSubmission.student?.full_name}</h3>
                        <p className="text-sm text-gray-500">{selectedSubmission.student?.email}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Submitted</p>
                      <p className="font-medium">
                        {new Date(selectedSubmission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  {selectedSubmission.is_graded && (
                    <div className="flex items-center p-3 bg-green-50 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                      <span className="text-green-800">
                        Graded: {selectedSubmission.score} / {assignment?.max_score || 100}
                      </span>
                    </div>
                  )}
                </div>

                {/* Submission Content */}
                <div className="card">
                  <h3 className="font-semibold mb-4">Submission Content</h3>
                  
                  {selectedSubmission.text_answer ? (
                    <div className="prose max-w-none bg-gray-50 p-4 rounded-lg">
                      <p className="whitespace-pre-wrap">{selectedSubmission.text_answer}</p>
                    </div>
                  ) : (
                    <p className="text-gray-500">No text content submitted</p>
                  )}
                  
                  {selectedSubmission.file_url && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                      <a 
                        href={selectedSubmission.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-primary-600 hover:underline"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download Submitted File
                      </a>
                    </div>
                  )}
                </div>

                {/* Grading Form */}
                <div className="card">
                  <h3 className="font-semibold mb-4 flex items-center">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    Grade & Feedback
                  </h3>
                  
                  <form onSubmit={handleGrade} className="space-y-4">
                    <div>
                      <label htmlFor="score" className="block text-sm font-medium text-gray-700 mb-1">
                        Score (out of {assignment?.max_score || 100})
                      </label>
                      <input
                        type="number"
                        id="score"
                        value={gradeForm.score}
                        onChange={(e) => setGradeForm({ ...gradeForm, score: parseInt(e.target.value) || 0 })}
                        className="input w-32"
                        min="0"
                        max={assignment?.max_score || 100}
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-1">
                        Feedback (optional)
                      </label>
                      <textarea
                        id="feedback"
                        value={gradeForm.feedback}
                        onChange={(e) => setGradeForm({ ...gradeForm, feedback: e.target.value })}
                        rows={4}
                        className="input w-full"
                        placeholder="Provide feedback to the student..."
                      />
                    </div>
                    
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
                            Save Grade
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="card text-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Select a submission to grade</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
