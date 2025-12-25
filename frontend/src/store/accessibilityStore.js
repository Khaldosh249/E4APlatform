import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAccessibilityStore = create(
  persist(
    (set) => ({
      isBlind: false,
      highContrast: false,
      fontSize: 'normal', // normal, large, xlarge
      ttsEnabled: true,
      ttsSpeed: 1, // 0.5 to 2
      keyboardNavEnabled: true,
      autoPlayTTS: false,
      reduceMotion: false,

      setBlindMode: (enabled) => set({ isBlind: enabled }),
      setHighContrast: (enabled) => set({ highContrast: enabled }),
      setFontSize: (size) => set({ fontSize: size }),
      setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),
      setTTSSpeed: (speed) => set({ ttsSpeed: speed }),
      setKeyboardNav: (enabled) => set({ keyboardNavEnabled: enabled }),
      setAutoPlayTTS: (enabled) => set({ autoPlayTTS: enabled }),
      setReduceMotion: (enabled) => set({ reduceMotion: enabled }),
    }),
    {
      name: 'e4a-accessibility-settings',
    }
  )
);

export default useAccessibilityStore;
