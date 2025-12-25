import { Link, useNavigate } from 'react-router-dom';
import { Menu, LogOut, User, Settings, Volume2, BookOpen, BarChart3, GraduationCap, Home } from 'lucide-react';
import useAuthStore from '../store/authStore';
import useAccessibilityStore from '../store/accessibilityStore';
import { useState } from 'react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { highContrast, setHighContrast } = useAccessibilityStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getDashboardLink = () => {
    if (user?.role === 'admin') return '/admin';
    if (user?.role === 'teacher') return '/teacher';
    return '/student';
  };

  const getAccessibilityLink = () => {
    if (user?.role === 'admin') return '/admin/accessibility';
    if (user?.role === 'teacher') return '/teacher/accessibility';
    return '/student/accessibility';
  };

  return (
    <nav className={`shadow-md ${highContrast ? 'bg-black text-white' : 'bg-white'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link to={getDashboardLink()} className="flex items-center space-x-2">
              <Volume2 className="h-8 w-8 text-primary-600" />
              <span className="text-xl font-bold">E4A Platform</span>
            </Link>
            
            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-4">
              <Link 
                to={getDashboardLink()} 
                className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
              >
                <Home className="h-4 w-4" />
                <span>Dashboard</span>
              </Link>
              
              {user?.role === 'student' && (
                <Link 
                  to="/student/progress" 
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span>Progress</span>
                </Link>
              )}
              
              {(user?.role === 'teacher' || user?.role === 'admin') && (
                <Link 
                  to="/teacher" 
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Courses</span>
                </Link>
              )}
              
              {user?.role === 'admin' && (
                <Link 
                  to="/admin" 
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                >
                  <GraduationCap className="h-4 w-4" />
                  <span>Admin</span>
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setHighContrast(!highContrast)}
              className="btn btn-secondary text-sm"
              aria-label="Toggle high contrast mode"
            >
              {highContrast ? 'Normal' : 'High Contrast'}
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center space-x-2 btn btn-secondary"
                aria-label="Open user menu"
              >
                <User className="h-5 w-5" />
                <span className="hidden sm:block">{user?.full_name}</span>
                <Menu className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div className={`absolute right-0 mt-2 w-48 rounded-md shadow-lg ${highContrast ? 'bg-gray-900' : 'bg-white'} ring-1 ring-black ring-opacity-5 z-50`}>
                  <div className="py-1">
                    {/* Mobile Navigation Links */}
                    <div className="md:hidden border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                      <Link
                        to={getDashboardLink()}
                        className={`block px-4 py-2 text-sm ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                        onClick={() => setMenuOpen(false)}
                      >
                        <Home className="inline h-4 w-4 mr-2" />
                        Dashboard
                      </Link>
                      {user?.role === 'student' && (
                        <Link
                          to="/student/progress"
                          className={`block px-4 py-2 text-sm ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                          onClick={() => setMenuOpen(false)}
                        >
                          <BarChart3 className="inline h-4 w-4 mr-2" />
                          Progress
                        </Link>
                      )}
                    </div>
                    
                    <Link
                      to={getAccessibilityLink()}
                      className={`block px-4 py-2 text-sm ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Settings className="inline h-4 w-4 mr-2" />
                      Accessibility
                    </Link>
                    <button
                      onClick={handleLogout}
                      className={`w-full text-left px-4 py-2 text-sm ${highContrast ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                    >
                      <LogOut className="inline h-4 w-4 mr-2" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
