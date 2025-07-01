import React from "react";

export default function PageLoader() {
  return (
    <div className="fixed inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-[9999]">
      <div className="w-16 h-16 border-4 border-bronze border-dashed rounded-full animate-spin"></div>
      <p className="mt-4 text-lg font-semibold text-bronze">
        Page is loading... Please wait.
      </p>
    </div>
  );
}
