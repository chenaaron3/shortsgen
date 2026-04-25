"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

interface TypewriterPlaceholderProps {
  words: string[];
  prefix?: string;
  suffix?: string;
}

export function TypewriterPlaceholder({
  words,
  prefix = "",
  suffix = "",
}: TypewriterPlaceholderProps) {
  const separator = "\u00A0";
  const reduceMotion = useReducedMotion();
  const [wordIndex, setWordIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const currentWord = useMemo(() => words[wordIndex] ?? "", [wordIndex, words]);
  const animatedWord = currentWord.slice(0, charCount);

  useEffect(() => {
    if (words.length === 0) return;

    if (reduceMotion) {
      setCharCount((words[wordIndex] ?? "").length);
      const id = window.setInterval(() => {
        setWordIndex((prev) => (prev + 1) % words.length);
      }, 2200);
      return () => window.clearInterval(id);
    }

    let timeoutMs = 70;
    if (!isDeleting && charCount < currentWord.length) {
      timeoutMs = 55;
    } else if (!isDeleting && charCount === currentWord.length) {
      timeoutMs = 1200;
    } else if (isDeleting && charCount > 0) {
      timeoutMs = 35;
    } else {
      timeoutMs = 220;
    }

    const id = window.setTimeout(() => {
      if (!isDeleting && charCount < currentWord.length) {
        setCharCount((prev) => prev + 1);
        return;
      }

      if (!isDeleting && charCount === currentWord.length) {
        setIsDeleting(true);
        return;
      }

      if (isDeleting && charCount > 0) {
        setCharCount((prev) => prev - 1);
        return;
      }

      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % words.length);
    }, timeoutMs);

    return () => window.clearTimeout(id);
  }, [charCount, currentWord.length, isDeleting, reduceMotion, wordIndex, words]);

  useEffect(() => {
    if (words.length === 0) return;
    setWordIndex(0);
    setCharCount(reduceMotion ? (words[0] ?? "").length : 0);
    setIsDeleting(false);
  }, [reduceMotion, words]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-4 top-1/2 z-10 flex -translate-y-1/2 items-center text-base text-muted-foreground"
    >
      {prefix ? <span>{prefix}{separator}</span> : null}
      <span>{reduceMotion ? currentWord : animatedWord}</span>
      {suffix ? <span>{separator}{suffix}</span> : null}
      {!reduceMotion && (
        <motion.span
          className="ml-0.5 inline-block"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        >
          |
        </motion.span>
      )}
    </div>
  );
}
