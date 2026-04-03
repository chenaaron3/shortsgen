"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useSceneAudio(voiceUrl?: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceInitialLoadPending, setVoiceInitialLoadPending] = useState(
    () => !!voiceUrl,
  );

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      void audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [voiceUrl]);

  useEffect(() => {
    setVoiceInitialLoadPending(!!voiceUrl);
  }, [voiceUrl]);

  return {
    audioRef,
    isPlaying,
    handlePlayPause,
    voiceInitialLoadPending,
    setVoiceInitialLoadPending,
  };
}
