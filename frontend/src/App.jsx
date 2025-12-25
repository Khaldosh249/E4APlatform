import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import Register from './pages/Register';
import StudentDashboard from './pages/StudentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import AdminDashboard from './pages/AdminDashboard';
import CourseDetail from './pages/CourseDetail';
import LessonView from './pages/LessonView';
import QuizTaking from './pages/QuizTaking';
import AssignmentSubmission from './pages/AssignmentSubmission';
import TeacherCourseManagement from './pages/TeacherCourseManagement';
import QuizQuestionManagement from './pages/QuizQuestionManagement';
import GradingInterface from './pages/GradingInterface';
import ProgressTracking from './pages/ProgressTracking';
import AccessibilitySettings from './pages/AccessibilitySettings';
import ProtectedRoute from './components/ProtectedRoute';
import VoiceAssistantButton from './components/VoiceAssistantButton';
import useAccessibilityStore from './store/accessibilityStore';
import { useEffect } from 'react';

function App() {
  const { highContrast, fontSize } = useAccessibilityStore();

  useEffect(() => {
    // Apply accessibility settings to body
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }

    // Apply font size
    if (fontSize === 'large') {
      document.body.style.fontSize = '1.125rem';
    } else if (fontSize === 'xlarge') {
      document.body.style.fontSize = '1.25rem';
    } else {
      document.body.style.fontSize = '1rem';
    }
  }, [highContrast, fontSize]);

  return (
    <Router>
      <div className="App">
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: highContrast ? '#1f2937' : '#ffffff',
              color: highContrast ? '#ffffff' : '#1f2937',
            },
          }}
        />
        
        {/* Voice Assistant for visually impaired students */}
        <VoiceAssistantButton />
        
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Student Routes */}
          <Route 
            path="/student" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/student/courses/:courseId" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <CourseDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/student/courses/:courseId/lessons/:lessonId" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <LessonView />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/student/courses/:courseId/quizzes/:quizId" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <QuizTaking />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/student/courses/:courseId/assignments/:assignmentId" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <AssignmentSubmission />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/student/progress" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <ProgressTracking />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/student/accessibility" 
            element={
              <ProtectedRoute allowedRoles={['student']}>
                <AccessibilitySettings />
              </ProtectedRoute>
            } 
          />
          
          {/* Teacher Routes */}
          <Route 
            path="/teacher" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <TeacherDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <CourseDetail />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId/manage" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <TeacherCourseManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId/lessons/:lessonId" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <LessonView />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId/quizzes/:quizId" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <QuizTaking />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId/quizzes/:quizId/manage" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <QuizQuestionManagement />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId/assignments/:assignmentId" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <AssignmentSubmission />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/courses/:courseId/assignments/:assignmentId/grade" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <GradingInterface />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/teacher/accessibility" 
            element={
              <ProtectedRoute allowedRoles={['teacher', 'admin']}>
                <AccessibilitySettings />
              </ProtectedRoute>
            } 
          />
          
          {/* Admin Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/accessibility" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AccessibilitySettings />
              </ProtectedRoute>
            } 
          />
          
          <Route path="/unauthorized" element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-4">403 - Unauthorized</h1>
                <p className="text-gray-600">You do not have permission to access this page.</p>
              </div>
            </div>
          } />
          
          <Route path="*" element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-4">404 - Not Found</h1>
                <p className="text-gray-600">The page you are looking for does not exist.</p>
              </div>
            </div>
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
