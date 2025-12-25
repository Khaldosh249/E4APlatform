import { create } from 'zustand';
import api from '../lib/api';

const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
    
    // Get user profile
    const userResponse = await api.get('/auth/me');
    set({
      token: access_token,
      user: userResponse.data,
      isAuthenticated: true,
    });
    
    return userResponse.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  updateProfile: async (userData) => {
    const response = await api.put('/users/me/update', userData);
    set({ user: response.data });
    return response.data;
  },
}));

export default useAuthStore;
