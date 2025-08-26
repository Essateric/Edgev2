import React from "react";

export default function Stepper({ step, setStep, selectedService, selectedProvider, selectedDate, selectedTime }) {
  const steps = [
    { n: 1, label: "Service" },
    { n: 2, label: "Provider" },
    { n: 3, label: "Time" },
    { n: 4, label: "Client" },
  ];

  const canGoTo = (n) => {
    if (n === 1) return true;
    if (n === 2) return !!selectedService;
    if (n === 3) return !!selectedService && !!selectedProvider;
    if (n === 4) return !!selectedService && !!selectedProvider && !!selectedDate && !!selectedTime;
    return false;
  };

  const goTo = (n) => {
    if (!canGoTo(n)) return;
    if (n <= 1) { /* clear deeper */ }
    setStep(n);
  };

  return (
    <nav className="sticky top-20 space-y-4 text-[15px]">
      {steps.map((s) => {
        const enabled = canGoTo(s.n);
        const active = step === s.n;
        return (
          <button
            key={s.n}
            type="button"
            onClick={() => goTo(s.n)}
            disabled={!enabled}
            className={`w-full text-left pl-3 border-l-4 py-1 ${active ? "border-amber-400" : "border-gray-700"} ${enabled ? "cursor-pointer hover:bg-neutral-800 rounded-sm" : "cursor-not-allowed opacity-40"}`}
          >
            <div className={`text-lg font-semibold ${active ? "text-white" : "text-gray-300"}`}>{s.label}</div>
          </button>
        );
      })}
    </nav>
  );
}
