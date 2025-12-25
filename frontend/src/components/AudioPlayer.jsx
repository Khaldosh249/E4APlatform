import { useEffect, useRef } from 'react';
import useAccessibilityStore from '../store/accessibilityStore';

export default function AudioPlayer({ src, autoPlay = false, onEnded }) {
  const audioRef = useRef(null);
  const { ttsSpeed } = useAccessibilityStore();

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = ttsSpeed;
    }
  }, [ttsSpeed]);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch(err => console.log('Audio autoplay prevented:', err));
    }
  }, [autoPlay, src]);

  return (
    <audio
      ref={audioRef}
      src={src}
      controls
      className="w-full mt-2"
      onEnded={onEnded}
      aria-label="Audio player"
    />
  );
}
