// src/utils/isMobileOrTablet.js
export const isMobileOrTablet = () => {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const hasTouch =
    navigator.maxTouchPoints > 0 ||
    (typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches);

  // iPadOS can pretend to be Mac, so detect it this way too:
  const isIpad =
    /iPad/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  return /Android|iPhone|iPod/i.test(ua) || isIpad || hasTouch;
};
