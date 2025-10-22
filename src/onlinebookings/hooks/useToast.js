// src/onlinebookings/hooks/useToast.js
import { useCallback, useEffect, useRef, useState } from "react";

export default function useToast() {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showToast = useCallback((message, { type = "success", ms = 5000 } = {}) => {
    setToast({ message, type, ts: Date.now() });
    clearTimer();

    if (ms > 0) {
      timeoutRef.current = setTimeout(() => {
        setToast(null);
        timeoutRef.current = null;
      }, ms);
    }
  }, [clearTimer]);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  // Clean up on unmount (and avoids duplicate timers under React Strict Mode)
  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast, dismiss, setToast };
}
