import { useMemo } from "react";
import { HTML5Backend } from "react-dnd-html5-backend";
import { TouchBackend } from "react-dnd-touch-backend";
import { isMobileOrTablet } from "../../utils/isMobileOrTablet";

export const useCalendarDndBackend = () => {
  const useTouchDnD = useMemo(() => isMobileOrTablet(), []);

  return useMemo(() => {
    return {
      useTouchDnD,
      backend: useTouchDnD ? TouchBackend : HTML5Backend,
      options: useTouchDnD
        ? {
            enableMouseEvents: true,
            delayTouchStart: 0,   // ✅ no long press
      touchSlop: 8, 
            ignoreContextMenu: true,
          }
        : undefined,
      longPressThreshold: useTouchDnD ? 0 : 0,
    };
  }, [useTouchDnD]);
};
