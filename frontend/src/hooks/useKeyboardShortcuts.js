import { useEffect, useCallback } from 'react';

export default function useKeyboardShortcuts(shortcuts) {
  const handleKeyDown = useCallback((event) => {
    // Check for each registered shortcut
    for (const shortcut of shortcuts) {
      const { key, ctrl, alt, shift, action, preventDefault = true } = shortcut;
      
      const keyMatch = event.key.toLowerCase() === key.toLowerCase();
      const ctrlMatch = ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
      const altMatch = alt ? event.altKey : !event.altKey;
      const shiftMatch = shift ? event.shiftKey : !event.shiftKey;
      
      if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
        if (preventDefault) {
          event.preventDefault();
        }
        action(event);
        break;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
