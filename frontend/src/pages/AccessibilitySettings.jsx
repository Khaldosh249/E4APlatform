import { useState, useEffect } from 'react';
import { 
  Eye, Volume2, Type, Moon, Sun, 
  Check, Monitor, Accessibility
} from 'lucide-react';
import Navbar from '../components/Navbar';
import api from '../lib/api';
import toast from 'react-hot-toast';
import useAccessibilityStore from '../store/accessibilityStore';
import useAuthStore from '../store/authStore';

export default function AccessibilitySettings() {
  const { user, updateUser } = useAuthStore();
  const { 
    highContrast, 
    setHighContrast, 
    fontSize, 
    setFontSize,
    autoPlayTTS,
    setAutoPlayTTS,
    reduceMotion,
    setReduceMotion
  } = useAccessibilityStore();
  
  const [saving, setSaving] = useState(false);
  const [isVisuallyImpaired, setIsVisuallyImpaired] = useState(user?.is_visually_impaired || false);

  useEffect(() => {
    // Apply reduce motion preference
    if (reduceMotion) {
      document.documentElement.classList.add('reduce-motion');
    } else {
      document.documentElement.classList.remove('reduce-motion');
    }
  }, [reduceMotion]);

  const handleSavePreferences = async () => {
    setSaving(true);
    try {
      await api.put('/auth/profile', {
        is_visually_impaired: isVisuallyImpaired
      });
      
      if (updateUser) {
        updateUser({ is_visually_impaired: isVisuallyImpaired });
      }
      
      toast.success('Preferences saved successfully!');
    } catch (error) {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const fontSizeOptions = [
    { value: 'normal', label: 'Normal', description: 'Default text size' },
    { value: 'large', label: 'Large', description: '12.5% larger text' },
    { value: 'xlarge', label: 'Extra Large', description: '25% larger text' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center mb-8">
          <Accessibility className="h-8 w-8 text-primary-600 mr-3" />
          <h1 className="text-3xl font-bold text-gray-900">Accessibility Settings</h1>
        </div>

        {/* Visual Impairment Setting */}
        <div className="card mb-6">
          <div className="flex items-start">
            <Eye className="h-6 w-6 text-primary-600 mr-4 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Visual Accessibility</h2>
              <p className="text-gray-600 mb-4">
                Enable enhanced accessibility features for visually impaired users. 
                This will automatically enable Text-to-Speech for all lessons and content.
              </p>
              
              <label className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVisuallyImpaired}
                  onChange={(e) => setIsVisuallyImpaired(e.target.checked)}
                  className="w-6 h-6 rounded"
                />
                <div>
                  <span className="font-medium">I am visually impaired</span>
                  <p className="text-sm text-gray-500">
                    Enable all visual accessibility features
                  </p>
                </div>
              </label>
              
              <button
                onClick={handleSavePreferences}
                disabled={saving}
                className="mt-4 btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save Preference'}
              </button>
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div className="card mb-6">
          <div className="flex items-start">
            <Monitor className="h-6 w-6 text-primary-600 mr-4 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Display Settings</h2>
              
              {/* High Contrast Mode */}
              <div className="mb-6">
                <h3 className="font-medium mb-2">Color Contrast</h3>
                <p className="text-sm text-gray-600 mb-3">
                  High contrast mode increases text and element visibility.
                </p>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setHighContrast(false)}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      !highContrast 
                        ? 'border-primary-500 bg-primary-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    aria-pressed={!highContrast}
                  >
                    <Sun className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
                    <p className="font-medium">Normal</p>
                    <p className="text-xs text-gray-500">Standard colors</p>
                  </button>
                  
                  <button
                    onClick={() => setHighContrast(true)}
                    className={`flex-1 p-4 rounded-lg border-2 transition-colors ${
                      highContrast 
                        ? 'border-primary-500 bg-primary-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    aria-pressed={highContrast}
                  >
                    <Moon className="h-6 w-6 mx-auto mb-2 text-gray-700" />
                    <p className="font-medium">High Contrast</p>
                    <p className="text-xs text-gray-500">Enhanced visibility</p>
                  </button>
                </div>
              </div>
              
              {/* Font Size */}
              <div>
                <h3 className="font-medium mb-2">Text Size</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Adjust the default text size across the platform.
                </p>
                
                <div className="grid grid-cols-3 gap-3">
                  {fontSizeOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setFontSize(option.value)}
                      className={`p-4 rounded-lg border-2 transition-colors text-center ${
                        fontSize === option.value 
                          ? 'border-primary-500 bg-primary-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      aria-pressed={fontSize === option.value}
                    >
                      <Type className={`mx-auto mb-2 ${
                        option.value === 'normal' ? 'h-5 w-5' :
                        option.value === 'large' ? 'h-6 w-6' : 'h-7 w-7'
                      }`} />
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs text-gray-500">{option.description}</p>
                      {fontSize === option.value && (
                        <Check className="h-4 w-4 text-primary-600 mx-auto mt-2" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Settings */}
        <div className="card mb-6">
          <div className="flex items-start">
            <Volume2 className="h-6 w-6 text-primary-600 mr-4 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Audio & TTS Settings</h2>
              <p className="text-gray-600 mb-4">
                Configure Text-to-Speech and audio preferences.
              </p>
              
              <div className="space-y-4">
                <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                  <div>
                    <span className="font-medium">Auto-play TTS Audio</span>
                    <p className="text-sm text-gray-500">
                      Automatically play lesson audio when opening a lesson
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoPlayTTS}
                    onChange={(e) => setAutoPlayTTS(e.target.checked)}
                    className="w-6 h-6 rounded"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Motion Settings */}
        <div className="card mb-6">
          <div className="flex items-start">
            <Accessibility className="h-6 w-6 text-primary-600 mr-4 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Motion & Animation</h2>
              <p className="text-gray-600 mb-4">
                Control animations and motion effects.
              </p>
              
              <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <span className="font-medium">Reduce Motion</span>
                  <p className="text-sm text-gray-500">
                    Minimize animations for those sensitive to motion
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                  className="w-6 h-6 rounded"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Keyboard Navigation Info */}
        <div className="card bg-blue-50">
          <h2 className="text-xl font-semibold mb-3">Keyboard Navigation</h2>
          <p className="text-gray-600 mb-4">
            This platform fully supports keyboard navigation:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border mr-2">Tab</kbd>
              Move between interactive elements
            </li>
            <li className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border mr-2">Enter</kbd>
              Activate buttons and links
            </li>
            <li className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border mr-2">Space</kbd>
              Toggle checkboxes and buttons
            </li>
            <li className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border mr-2">Esc</kbd>
              Close modals and menus
            </li>
            <li className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border mr-2">↑</kbd>
              <kbd className="px-2 py-1 bg-white rounded border mr-2">↓</kbd>
              Navigate within lists and menus
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
