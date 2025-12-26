import { useState, useEffect } from 'react';
import { 
  Users, Book, Settings, BarChart3, UserPlus, Trash2, 
  Edit2, Shield, Search, Download, RefreshCw 
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalAdmins: 0,
    totalCourses: 0,
    totalEnrollments: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'student',
    is_blind: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, coursesRes] = await Promise.all([
        api.get('/users/'),
        api.get('/courses/')
      ]);
      
      setUsers(usersRes.data);
      setCourses(coursesRes.data);
      
      // Calculate stats
      const students = usersRes.data.filter(u => u.role === 'student');
      const teachers = usersRes.data.filter(u => u.role === 'teacher');
      const admins = usersRes.data.filter(u => u.role === 'admin');
      
      setStats({
        totalUsers: usersRes.data.length,
        totalStudents: students.length,
        totalTeachers: teachers.length,
        totalAdmins: admins.length,
        totalCourses: coursesRes.data.length,
        totalEnrollments: coursesRes.data.reduce((sum, c) => sum + (c.enrollment_count || 0), 0)
      });
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users/', newUser);
      toast.success('User created successfully!');
      setShowCreateUserModal(false);
      setNewUser({
        email: '',
        password: '',
        full_name: '',
        role: 'student',
        is_blind: false
      });
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${selectedUser.id}`, {
        full_name: selectedUser.full_name,
        role: selectedUser.role,
        is_active: selectedUser.is_active,
        is_blind: selectedUser.is_blind
      });
      toast.success('User updated successfully!');
      setShowEditUserModal(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/users/${userId}`);
      toast.success('User deleted successfully!');
      loadData();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const handleToggleUserStatus = async (user) => {
    try {
      await api.put(`/users/${user.id}`, { is_active: !user.is_active });
      toast.success(user.is_active ? 'User deactivated' : 'User activated');
      loadData();
    } catch (error) {
      toast.error('Failed to update user status');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'courses', label: 'Courses', icon: Book },
    { id: 'settings', label: 'Settings', icon: Settings }
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <button onClick={loadData} className="btn btn-secondary flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-100 p-1 rounded-lg overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-primary-600 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <div className="card bg-blue-50 border-blue-200">
                <div className="flex items-center">
                  <Users className="h-10 w-10 text-blue-600 mr-4" />
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Total Users</p>
                    <p className="text-3xl font-bold text-blue-900">{stats.totalUsers}</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-green-50 border-green-200">
                <div className="flex items-center">
                  <Users className="h-10 w-10 text-green-600 mr-4" />
                  <div>
                    <p className="text-sm text-green-600 font-medium">Students</p>
                    <p className="text-3xl font-bold text-green-900">{stats.totalStudents}</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-purple-50 border-purple-200">
                <div className="flex items-center">
                  <Users className="h-10 w-10 text-purple-600 mr-4" />
                  <div>
                    <p className="text-sm text-purple-600 font-medium">Teachers</p>
                    <p className="text-3xl font-bold text-purple-900">{stats.totalTeachers}</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-yellow-50 border-yellow-200">
                <div className="flex items-center">
                  <Book className="h-10 w-10 text-yellow-600 mr-4" />
                  <div>
                    <p className="text-sm text-yellow-600 font-medium">Total Courses</p>
                    <p className="text-3xl font-bold text-yellow-900">{stats.totalCourses}</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-pink-50 border-pink-200">
                <div className="flex items-center">
                  <BarChart3 className="h-10 w-10 text-pink-600 mr-4" />
                  <div>
                    <p className="text-sm text-pink-600 font-medium">Total Enrollments</p>
                    <p className="text-3xl font-bold text-pink-900">{stats.totalEnrollments}</p>
                  </div>
                </div>
              </div>
              
              <div className="card bg-indigo-50 border-indigo-200">
                <div className="flex items-center">
                  <Shield className="h-10 w-10 text-indigo-600 mr-4" />
                  <div>
                    <p className="text-sm text-indigo-600 font-medium">Admins</p>
                    <p className="text-3xl font-bold text-indigo-900">{stats.totalAdmins}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
              <h2 className="text-xl font-bold mb-4">Recent Courses</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Teacher</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {courses.slice(0, 5).map(course => (
                      <tr key={course.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{course.title}</td>
                        <td className="px-4 py-3 text-gray-600">{course.teacher?.full_name || 'N/A'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            course.is_published 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {course.is_published ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(course.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input pl-10"
                    aria-label="Search users"
                  />
                </div>
                
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="input"
                  aria-label="Filter by role"
                >
                  <option value="all">All Roles</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                  <option value="admin">Admins</option>
                </select>
              </div>
              
              <button
                onClick={() => setShowCreateUserModal(true)}
                className="btn btn-primary flex items-center whitespace-nowrap"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </button>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Role</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Accessibility</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{user.full_name}</td>
                        <td className="px-4 py-3 text-gray-600">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded capitalize ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                            user.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            user.is_active 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {user.is_blind && (
                            <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">
                              Visually Impaired
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setSelectedUser({ ...user });
                                setShowEditUserModal(true);
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              aria-label={`Edit ${user.full_name}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleUserStatus(user)}
                              className={`p-1 rounded ${
                                user.is_active 
                                  ? 'text-yellow-600 hover:bg-yellow-50' 
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              aria-label={user.is_active ? 'Deactivate user' : 'Activate user'}
                            >
                              <Shield className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              aria-label={`Delete ${user.full_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Courses Tab */}
        {activeTab === 'courses' && (
          <div>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Title</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Code</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Teacher</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {courses.map(course => (
                      <tr key={course.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{course.title}</td>
                        <td className="px-4 py-3 text-gray-600">{course.subject_code || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-600">{course.teacher?.full_name || 'N/A'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${
                            course.is_published 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {course.is_published ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(course.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="card">
            <h2 className="text-xl font-bold mb-6">Platform Settings</h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">General Settings</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-600">Platform settings will be available here.</p>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Accessibility Settings</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center space-x-3">
                    <input type="checkbox" className="w-5 h-5 rounded" defaultChecked />
                    <span>Enable TTS for all visually impaired users by default</span>
                  </label>
                </div>
              </div>
              
              <div>
                <h3 className="font-semibold mb-2">Export Data</h3>
                <div className="flex gap-4">
                  <button className="btn btn-secondary flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Export Users
                  </button>
                  <button className="btn btn-secondary flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Export Courses
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create User Modal */}
        {showCreateUserModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Create New User</h2>
              
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="input w-full"
                    required
                    minLength={8}
                  />
                </div>
                
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    id="role"
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="input w-full"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                <div>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={newUser.is_blind}
                      onChange={(e) => setNewUser({ ...newUser, is_blind: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm">Visually Impaired (Enable TTS features)</span>
                  </label>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateUserModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create User
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditUserModal && selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Edit User</h2>
              
              <form onSubmit={handleUpdateUser} className="space-y-4">
                <div>
                  <label htmlFor="edit_full_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="edit_full_name"
                    value={selectedUser.full_name}
                    onChange={(e) => setSelectedUser({ ...selectedUser, full_name: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="edit_role" className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    id="edit_role"
                    value={selectedUser.role}
                    onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
                    className="input w-full"
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                <div>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedUser.is_active}
                      onChange={(e) => setSelectedUser({ ...selectedUser, is_active: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm">Active</span>
                  </label>
                </div>
                
                <div>
                  <label className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedUser.is_blind}
                      onChange={(e) => setSelectedUser({ ...selectedUser, is_blind: e.target.checked })}
                      className="w-5 h-5 rounded"
                    />
                    <span className="text-sm">Visually Impaired</span>
                  </label>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditUserModal(false);
                      setSelectedUser(null);
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Save Changes
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
