import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Book, Award, TrendingUp, CheckCircle, 
  XCircle, MessageSquare, FileText, ClipboardList
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function ProgressTracking() {
  
  const [enrollments, setEnrollments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [quizAttempts, setQuizAttempts] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadProgressData();
  }, []);

  const loadProgressData = async () => {
    try {
      const [enrollmentsRes, feedbackRes] = await Promise.all([
        api.get('/courses/enrolled/my-enrollments'),
        api.get('/feedback/my-feedback')
      ]);
      
      setEnrollments(enrollmentsRes.data);
      setFeedback(feedbackRes.data);

      // Load submissions and quiz attempts for each enrollment
      const allSubmissions = [];
      const allAttempts = [];
      
      for (const enrollment of enrollmentsRes.data) {
        try {
          // Get assignments and submissions
          const assignmentsRes = await api.get(`/assignments/course/${enrollment.course.id}`);
          for (const assignment of assignmentsRes.data) {
            try {
              const subRes = await api.get(`/assignments/${assignment.id}/my-submission`);
              allSubmissions.push({
                ...subRes.data,
                assignment,
                course: enrollment.course
              });
            } catch (e) {
              // No submission for this assignment
            }
          }
          
          // Get quizzes and attempts
          const quizzesRes = await api.get(`/quizzes/course/${enrollment.course.id}`);
          for (const quiz of quizzesRes.data) {
            try {
              const attemptsRes = await api.get(`/quizzes/${quiz.id}/attempts`);
              attemptsRes.data.forEach(attempt => {
                allAttempts.push({
                  ...attempt,
                  quiz,
                  course: enrollment.course
                });
              });
            } catch (e) {
              // No attempts for this quiz
            }
          }
        } catch (e) {
          // Course data unavailable
        }
      }
      
      setSubmissions(allSubmissions);
      setQuizAttempts(allAttempts);
    } catch (error) {
      toast.error('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate overall stats
  const totalCourses = enrollments.length;
  const avgProgress = totalCourses > 0 
    ? Math.round(enrollments.reduce((sum, e) => sum + (e.progress_percentage || 0), 0) / totalCourses)
    : 0;
  
  const gradedSubmissions = submissions.filter(s => s.is_graded);
  const avgAssignmentScore = gradedSubmissions.length > 0
    ? Math.round(gradedSubmissions.reduce((sum, s) => sum + ((s.score / s.assignment.max_score) * 100), 0) / gradedSubmissions.length)
    : 0;
    
  const avgQuizScore = quizAttempts.length > 0
    ? Math.round(quizAttempts.reduce((sum, a) => sum + a.score, 0) / quizAttempts.length)
    : 0;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'assignments', label: 'Assignments', icon: FileText, count: submissions.length },
    { id: 'quizzes', label: 'Quizzes', icon: ClipboardList, count: quizAttempts.length },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare, count: feedback.length }
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8">My Progress</h1>

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
              {tab.count !== undefined && (
                <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="card bg-blue-50">
                <div className="flex items-center">
                  <Book className="h-10 w-10 text-blue-600 mr-4" />
                  <div>
                    <p className="text-sm text-blue-600">Enrolled Courses</p>
                    <p className="text-3xl font-bold text-blue-900">{totalCourses}</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-green-50">
                <div className="flex items-center">
                  <TrendingUp className="h-10 w-10 text-green-600 mr-4" />
                  <div>
                    <p className="text-sm text-green-600">Avg. Progress</p>
                    <p className="text-3xl font-bold text-green-900">{avgProgress}%</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-purple-50">
                <div className="flex items-center">
                  <FileText className="h-10 w-10 text-purple-600 mr-4" />
                  <div>
                    <p className="text-sm text-purple-600">Avg. Assignment Score</p>
                    <p className="text-3xl font-bold text-purple-900">{avgAssignmentScore}%</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-yellow-50">
                <div className="flex items-center">
                  <Award className="h-10 w-10 text-yellow-600 mr-4" />
                  <div>
                    <p className="text-sm text-yellow-600">Avg. Quiz Score</p>
                    <p className="text-3xl font-bold text-yellow-900">{avgQuizScore}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Course Progress */}
            <div className="card">
              <h2 className="text-xl font-bold mb-4">Course Progress</h2>
              
              <div className="space-y-4">
                {enrollments.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No courses enrolled yet</p>
                ) : (
                  enrollments.map(enrollment => (
                    <div key={enrollment.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Link 
                          to={`/student/courses/${enrollment.course.id}`}
                          className="font-semibold text-primary-600 hover:underline"
                        >
                          {enrollment.course.title}
                        </Link>
                        {enrollment.completed ? (
                          <span className="flex items-center text-green-600 text-sm">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Completed
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">
                            {enrollment.progress_percentage}% complete
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            enrollment.completed ? 'bg-green-500' : 'bg-primary-600'
                          }`}
                          style={{ width: `${enrollment.progress_percentage}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Assignments Tab */}
        {activeTab === 'assignments' && (
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Assignment Submissions</h2>
            
            {submissions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No submissions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Assignment</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Course</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Submitted</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {submissions.map(submission => (
                      <tr key={submission.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link 
                            to={`/student/courses/${submission.course.id}/assignments/${submission.assignment.id}`}
                            className="text-primary-600 hover:underline font-medium"
                          >
                            {submission.assignment.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{submission.course.title}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(submission.submitted_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            submission.is_graded 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {submission.is_graded ? 'Graded' : 'Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {submission.is_graded 
                            ? `${submission.score} / ${submission.assignment.max_score}`
                            : '-'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Quizzes Tab */}
        {activeTab === 'quizzes' && (
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Quiz Attempts</h2>
            
            {quizAttempts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No quiz attempts yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Quiz</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Course</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Score</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {quizAttempts.map(attempt => (
                      <tr key={attempt.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link 
                            to={`/student/courses/${attempt.course.id}/quizzes/${attempt.quiz.id}`}
                            className="text-primary-600 hover:underline font-medium"
                          >
                            {attempt.quiz.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{attempt.course.title}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(attempt.started_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-medium">{attempt.score}%</td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center ${
                            attempt.passed ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {attempt.passed ? (
                              <><CheckCircle className="h-4 w-4 mr-1" /> Passed</>
                            ) : (
                              <><XCircle className="h-4 w-4 mr-1" /> Failed</>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Feedback Tab */}
        {activeTab === 'feedback' && (
          <div className="card">
            <h2 className="text-xl font-bold mb-4">Teacher Feedback</h2>
            
            {feedback.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No feedback received yet</p>
            ) : (
              <div className="space-y-4">
                {feedback.map(fb => (
                  <div key={fb.id} className="p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-medium text-blue-900">
                          {fb.teacher?.full_name || 'Teacher'}
                        </span>
                        <span className="text-blue-600 text-sm ml-2">
                          ({fb.feedback_type})
                        </span>
                      </div>
                      <span className="text-sm text-blue-600">
                        {new Date(fb.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-blue-800">{fb.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
