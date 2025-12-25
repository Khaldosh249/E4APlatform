import { useEffect, useState } from 'react';
import { Book, Award, TrendingUp, Mic } from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

export default function StudentDashboard() {
  const [enrollments, setEnrollments] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [enrollmentsRes, coursesRes] = await Promise.all([
        api.get('/courses/enrolled/my-enrollments'),
        api.get('/courses/?published_only=true')
      ]);
      
      setEnrollments(enrollmentsRes.data);
      setAvailableCourses(coursesRes.data);
    } catch (error) {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async (courseId) => {
    try {
      await api.post(`/courses/${courseId}/enroll`);
      toast.success('Enrolled successfully!');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Enrollment failed');
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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Student Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <Book className="h-8 w-8 text-primary-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Enrolled Courses</p>
                <p className="text-2xl font-bold">{enrollments.length}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Average Progress</p>
                <p className="text-2xl font-bold">
                  {enrollments.length > 0
                    ? Math.round(enrollments.reduce((sum, e) => sum + e.progress_percentage, 0) / enrollments.length)
                    : 0}%
                </p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <Award className="h-8 w-8 text-yellow-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold">
                  {enrollments.filter(e => e.completed).length}
                </p>
              </div>
            </div>
          </div>

          <Link 
            to="/voice-assistant"
            className="card hover:shadow-lg transition-shadow bg-gradient-to-r from-primary-500 to-primary-600 text-white"
          >
            <div className="flex items-center">
              <Mic className="h-8 w-8 text-white mr-3" />
              <div>
                <p className="text-sm text-primary-100">Voice Assistant</p>
                <p className="text-lg font-bold">Start Voice Mode</p>
              </div>
            </div>
          </Link>
        </div>

        {/* My Courses */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">My Courses</h2>
          {enrollments.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-600">You have not enrolled in any courses yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrollments.map(enrollment => (
                <div key={enrollment.id} className="card hover:shadow-lg transition-shadow">
                  <h3 className="text-xl font-semibold mb-2">{enrollment.course.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">{enrollment.course.description}</p>
                  
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{enrollment.progress_percentage}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary-600 h-2 rounded-full" 
                        style={{ width: `${enrollment.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                  
                  <Link 
                    to={`/student/courses/${enrollment.course.id}`}
                    className="btn btn-primary w-full"
                  >
                    Continue Learning
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Available Courses */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Available Courses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableCourses
              .filter(course => !enrollments.some(e => e.course.id === course.id))
              .map(course => (
                <div key={course.id} className="card hover:shadow-lg transition-shadow">
                  <h3 className="text-xl font-semibold mb-2">{course.title}</h3>
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">{course.description}</p>
                  <p className="text-xs text-gray-500 mb-4">Code: {course.subject_code || 'N/A'}</p>
                  
                  <button 
                    onClick={() => handleEnroll(course.id)}
                    className="btn btn-primary w-full"
                  >
                    Enroll Now
                  </button>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
