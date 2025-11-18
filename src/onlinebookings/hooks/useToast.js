// src/onlinebookings/hooks/useToast.js
import { useCallback, useRef, useState } from "react";

export default function useToast() {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    console.log("[useToast] hideToast called");
    clearTimer();
    setToast(null); // this removes the popup
  }, [clearTimer]);

  const showToast = useCallback((message, options = {}) => {
    const { type = "success", ms = 4000 } = options;

    // clear any previous timer
    clearTimer();

    const next = {
      id: Date.now(),
      message,
      type,
    };

    setToast(next);

    // auto-hide unless ms === 0
    if (ms && ms > 0) {
      timeoutRef.current = setTimeout(() => {
        setToast((current) =>
          current && current.id === next.id ? null : current
        );
        timeoutRef.current = null;
      }, ms);
    }
  }, [clearTimer]);

  // 👇 this object is what PublicBookingPage will destructure
  return { toast, showToast, hideToast };
}
