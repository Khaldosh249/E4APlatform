import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Upload, Clock, CheckCircle, 
  FileText, Volume2, Send, Download, AlertCircle
} from 'lucide-react';
import Navbar from '../components/Navbar';
import AudioPlayer from '../components/AudioPlayer';
import api from '../lib/api';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function AssignmentSubmission() {
  const { courseId, assignmentId } = useParams();
  const { user } = useAuthStore();
  
  const [assignment, setAssignment] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState([]);

  const isStudent = user?.role === 'student';
  const basePath = isStudent ? '/student' : '/teacher';

  useEffect(() => {
    loadAssignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  const loadAssignment = async () => {
    try {
      const assignmentRes = await api.get(`/assignments/${assignmentId}`);
      setAssignment(assignmentRes.data);

      // Load existing submission for students
      if (isStudent) {
        try {
          const submissionRes = await api.get(`/assignments/${assignmentId}/my-submission`);
          setSubmission(submissionRes.data);
          setContent(submissionRes.data.content || '');
          
          // Load feedback for this submission
          if (submissionRes.data.id) {
            try {
              const feedbackRes = await api.get(`/feedback/submission/${submissionRes.data.id}`);
              setFeedback(feedbackRes.data);
            } catch (e) {
              // No feedback yet
            }
          }
        } catch (e) {
          // No submission yet
        }
      }
    } catch (error) {
      toast.error('Failed to load assignment');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && !file) {
      toast.error('Please provide content or upload a file');
      return;
    }

    setSubmitting(true);
    try {
      // const formData = new FormData();
      // formData.append('content', content);
      // if (file) {
      //   formData.append('file', file);
      // }
      // formData.append('assignment_id', assignmentId);

      var jsonData = { text_answer: content, assignment_id: assignmentId };
      if (file) {
        jsonData.file = file;
      }

      if (submission) {
        // Update existing submission
        await api.put(`/assignments/submit`, jsonData, {
          headers: {'Content-Type': 'application/json'}
        });
        toast.success('Submission updated!');
      } else {
        // New submission
        await api.post(`/assignments/submit`, jsonData, {
          headers: { 'Content-Type': 'application/json' }
        });
        toast.success('Assignment submitted successfully!');
      }
      
      loadAssignment();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit assignment');
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = assignment?.due_date && new Date(assignment.due_date) < new Date();
  const canSubmit = !submission?.is_graded && (!isOverdue || !submission);

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

  if (!assignment) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <p>Assignment not found</p>
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

        {/* Assignment Details */}
        <div className="card mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{assignment.title}</h1>
              
              <div className="flex flex-wrap gap-4 text-sm mb-4">
                {assignment.due_date && (
                  <span className={`flex items-center ${isOverdue ? 'text-red-600' : 'text-gray-600'}`}>
                    <Clock className="h-4 w-4 mr-1" />
                    Due: {new Date(assignment.due_date).toLocaleString()}
                    {isOverdue && ' (Overdue)'}
                  </span>
                )}
                <span className="text-gray-600">
                  Max Score: {assignment.max_score || 100}
                </span>
              </div>
            </div>
            
            {submission && (
              <div className={`text-center p-3 rounded-lg ${
                submission.is_graded 
                  ? 'bg-green-50' 
                  : 'bg-yellow-50'
              }`}>
                <p className="text-sm font-medium">
                  {submission.is_graded ? 'Graded' : 'Submitted'}
                </p>
                {submission.is_graded && (
                  <p className="text-2xl font-bold text-green-600">
                    {submission.score} / {assignment.max_score || 100}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Assignment Description */}
          <div className="prose max-w-none mb-4">
            <p className="text-gray-700">{assignment.description}</p>
          </div>

          {/* TTS Audio */}
          {assignment.audio_url && (
            <div className="p-4 bg-primary-50 rounded-lg">
              <span className="flex items-center text-primary-700 font-medium mb-2">
                <Volume2 className="h-5 w-5 mr-2" />
                Listen to Assignment Instructions
              </span>
              <AudioPlayer 
                src={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${assignment.audio_url}`}
              />
            </div>
          )}

          {/* Attachments */}
          {assignment.file_url && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <a 
                href={assignment.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-primary-600 hover:underline"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Assignment Files
              </a>
            </div>
          )}
        </div>

        {/* Submission Form (Students Only) */}
        {isStudent && (
          <div className="card mb-6">
            <h2 className="text-xl font-bold mb-4">
              {submission ? 'Your Submission' : 'Submit Assignment'}
            </h2>
            
            {!canSubmit && submission?.is_graded && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-center text-green-700">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  This assignment has been graded. You cannot modify your submission.
                </div>
              </div>
            )}

            {isOverdue && !submission && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-center text-red-700">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  This assignment is past due. Late submissions may not be accepted.
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Answer
                </label>
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="input w-full"
                  placeholder="Write your answer here..."
                  disabled={!canSubmit}
                />
              </div>

              <div>
                <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-1">
                  Upload File (Optional)
                </label>
                <div className="flex items-center gap-4">
                  <label className={`flex items-center justify-center px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    canSubmit 
                      ? 'border-gray-300 hover:border-primary-500' 
                      : 'border-gray-200 cursor-not-allowed'
                  }`}>
                    <Upload className="h-5 w-5 mr-2 text-gray-500" />
                    <span className="text-gray-600">Choose file</span>
                    <input
                      type="file"
                      id="file"
                      onChange={(e) => setFile(e.target.files[0])}
                      className="hidden"
                      disabled={!canSubmit}
                    />
                  </label>
                  {file && (
                    <span className="text-sm text-gray-600">{file.name}</span>
                  )}
                  {submission?.file_url && !file && (
                    <a 
                      href={submission.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-primary-600 text-sm"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View submitted file
                    </a>
                  )}
                </div>
              </div>

              {canSubmit && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary flex items-center"
                  >
                    {submitting ? (
                      <>Submitting...</>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        {submission ? 'Update Submission' : 'Submit'}
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Feedback Section */}
        {feedback.length > 0 && (
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Teacher Feedback</h2>
            
            <div className="space-y-4">
              {feedback.map(fb => (
                <div key={fb.id} className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-blue-900">
                      {fb.teacher?.full_name || 'Teacher'}
                    </span>
                    <span className="text-sm text-blue-600">
                      {new Date(fb.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-blue-800">{fb.content}</p>
                  
                  {fb.audio_url && (
                    <div className="mt-3">
                      <span className="flex items-center text-blue-700 text-sm mb-2">
                        <Volume2 className="h-4 w-4 mr-1" />
                        Audio Feedback
                      </span>
                      <AudioPlayer 
                        src={`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${fb.audio_url}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* For Teachers - View All Submissions */}
        {!isStudent && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Student Submissions</h2>
              <Link 
                to={`/teacher/courses/${courseId}/assignments/${assignmentId}/grade`}
                className="btn btn-primary"
              >
                View & Grade Submissions
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
