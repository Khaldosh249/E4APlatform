import { useState, useEffect } from 'react';
import { Book, Plus, FileText, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
  const [courses, setCourses] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', subject_code: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      const res = await api.get('/courses/my-courses');
      setCourses(res.data);
    } catch (error) {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/courses/', formData);
      toast.success('Course created successfully!');
      setShowCreateModal(false);
      setFormData({ title: '', description: '', subject_code: '' });
      loadCourses();
    } catch (error) {
      toast.error('Failed to create course');
    }
  };

  const handlePublish = async (courseId, isPublished) => {
    try {
      await api.put(`/courses/${courseId}`, { is_published: !isPublished });
      toast.success(isPublished ? 'Course unpublished' : 'Course published');
      loadCourses();
    } catch (error) {
      toast.error('Failed to update course');
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Teacher Dashboard</h1>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Course
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center">
              <Book className="h-8 w-8 text-primary-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total Courses</p>
                <p className="text-2xl font-bold">{courses.length}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <Book className="h-8 w-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Published</p>
                <p className="text-2xl font-bold">
                  {courses.filter(c => c.is_published).length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <Book className="h-8 w-8 text-yellow-600 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Drafts</p>
                <p className="text-2xl font-bold">
                  {courses.filter(c => !c.is_published).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Courses List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map(course => (
            <div key={course.id} className="card">
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-semibold">{course.title}</h3>
                <span className={`px-2 py-1 text-xs rounded ${course.is_published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {course.is_published ? 'Published' : 'Draft'}
                </span>
              </div>
              
              <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>
              <p className="text-xs text-gray-500 mb-4">Code: {course.subject_code || 'N/A'}</p>
              
              <div className="flex gap-2 mb-3">
                <button 
                  onClick={() => handlePublish(course.id, course.is_published)}
                  className="btn btn-secondary flex-1 text-sm"
                >
                  {course.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <Link 
                  to={`/teacher/courses/${course.id}/manage`}
                  className="btn btn-secondary p-2"
                  title="Manage Content"
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </div>
              
              <div className="flex gap-2">
                <Link 
                  to={`/teacher/courses/${course.id}`}
                  className="btn btn-primary flex-1 text-sm flex items-center justify-center"
                >
                  <Book className="h-4 w-4 mr-1" />
                  View
                </Link>
                <Link 
                  to={`/teacher/courses/${course.id}/assignments/all/grade`}
                  className="btn btn-secondary flex-1 text-sm flex items-center justify-center"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Grade
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Create Course Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Create New Course</h2>
              
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course Title
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="input"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="input"
                    rows="3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject Code
                  </label>
                  <input
                    type="text"
                    value={formData.subject_code}
                    onChange={(e) => setFormData({...formData, subject_code: e.target.value})}
                    className="input"
                  />
                </div>
                
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary flex-1">
                    Create
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
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
