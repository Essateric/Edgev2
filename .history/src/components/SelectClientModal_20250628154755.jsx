import React from "react";
import Modal from "./Modal";
import Select from "react-select";
import { format } from "date-fns";

export default function SelectClientModal({
  isOpen,
  onClose,
  clients,
  selectedSlot,
  selectedClient,
  setSelectedClient,
  onNext,
}) {
  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} - ${c.mobile}`,
  }));

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div>
        <h3 className="text-lg font-bold mb-2 text-bronze">
          Select Client
        </h3>

        {selectedSlot && (
          <p className="text-sm text-gray-700 mb-2">
            Time: {format(selectedSlot.start, "eeee dd MMMM yyyy")}{" "}
            {format(selectedSlot.start, "HH:mm")} -{" "}
            {format(selectedSlot.end, "HH:mm")}
          </p>
        )}

        <Select
          options={clientOptions}
          value={clientOptions.find((opt) => opt.value === selectedClient) || null}
          onChange={(selected) => setSelectedClient(selected?.value)}
          placeholder="-- Select Client --"
          styles={{
            control: (base) => ({
              ...base,
              backgroundColor: "white",
              color: "black",
            }),
            singleValue: (base) => ({ ...base, color: "black" }),
            option: (base, { isFocused, isSelected }) => ({
              ...base,
              backgroundColor: isSelected
                ? "#9b611e"
                : isFocused
                ? "#f1e0c5"
                : "white",
              color: "black",
            }),
          }}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="text-gray-500">
            Cancel
          </button>
          <button
            onClick={onNext}
            className="bg-bronze text-white px-4 py-2 rounded"
            disabled={!selectedClient}
          >
            Next
          </button>
        </div>
      </div>
    </Modal>
  );
}
