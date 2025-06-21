
import React, { useEffect, useState, useMemo } from "react";
import Button from "./Button";
import SaveRetainedBooking from "../utils/SaveRetainedBooking";
import { supabase } from "../supabaseClient";

const fallbackCategories = ["Cut and Finish", "Gents", "Highlights"];
const fallbackServices = [
  { name: "Dry Cut", category: "Cut and Finish", basePrice: 20, baseDuration: 30, stylist: ["Martin", "Darren"] },
  { name: "Wet Cut", category: "Gents", basePrice: 15, baseDuration: 20, stylist: ["Annalise"] },
  { name: "Half Head Highlights", category: "Highlights", basePrice: 50, baseDuration: 60, stylist: ["Daisy"] },
];

export default function NewBooking({ stylistName, stylistId, selectedSlot, onBack, onCancel, onConfirm, selectedClient, clients }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("Cut and Finish");
  const [basket, setBasket] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data, error } = await supabase.from("services").select("*");
        if (error) throw error;

        setServices(data);
        const uniqueCategories = [...new Set(data.map(s => s.category))];
        setCategories(uniqueCategories);
      } catch (err) {
        console.warn("Using fallback data due to Supabase read error:", err.message);
        setServices(fallbackServices);
        setCategories(fallbackCategories);
      }
    }
    fetchData();
  }, []);

  const filteredServices = useMemo(() => {
    return services.filter(
      (s) =>
        s.category === selectedCategory &&
        (!s.stylist || s.stylist.includes(stylistName))
    );
  }, [selectedCategory, services, stylistName]);

  const addToBasket = (service) => setBasket([...basket, service]);
  const removeFromBasket = (index) => setBasket(basket.filter((_, i) => i !== index));

  const totalCost = basket.reduce((sum, s) => sum + (s.basePrice || 0), 0);
  const totalDuration = basket.reduce((sum, s) => sum + (s.baseDuration || 0), 0);

  const handleConfirm = async () => {
    if (!selectedSlot || basket.length === 0) return;

    const events = [];
    const bookingId = crypto.randomUUID();
    let currentTime = new Date(selectedSlot.start);

    for (const service of basket) {
      const endTime = new Date(currentTime.getTime() + (service.baseDuration || 0) * 60000);

      const client = clients.find((c) => c.id === selectedClient);
      const clientName = `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim();

      const newEvent = {
        bookingId,
        clientName,
        title: service.name,
        category: service.category || "Uncategorised",
        start: new Date(currentTime),
        end: new Date(endTime),
        resourceId: stylistId,
        duration: service.baseDuration,
        price: service.basePrice,
        clientId: selectedClient,
        createdAt: new Date().toISOString(),
      };

      events.push(newEvent);

      await SaveRetainedBooking({
        clientId: selectedClient,
        clientName,
        stylistId,
        stylistName,
        service,
        start: newEvent.start,
        end: newEvent.end,
      });

      const { error } = await supabase.from("bookings").insert([newEvent]);
      if (error) {
        console.error("Error saving booking:", error.message);
      }

      currentTime = endTime;
    }

    onConfirm(events);
  };

 return (
  <div className="fixed inset-0 bg-white z-50 overflow-hidden p-6 rounded shadow-xl max-w-7xl mx-auto">
    <h2 className="text-2xl font-bold text-bronze mb-4">Select Services</h2>

    <div className="grid grid-cols-3 gap-4 h-[70vh]">
      {/* Category List */}
      <div className="overflow-y-auto border-r pr-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`block w-full text-left px-3 py-2 rounded border mb-2 transition ${
              selectedCategory === cat
                ? "bg-bronze text-white"
                : "border-bronze text-bronze hover:bg-bronze/10"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Services */}
      <div className="overflow-y-auto col-span-1">
        {filteredServices.length === 0 ? (
          <p className="text-sm text-gray-500">
            No services available for this stylist in this category.
          </p>
        ) : (
          filteredServices.map((service, i) => (
            <div
              key={i}
              className="border border-gray-300 rounded p-3 flex justify-between items-center mb-3"
            >
              <div>
                <p className="font-medium text-bronze">{service.name}</p>
                <p className="text-sm text-gray-600">
                  £{service.basePrice} • {service.baseDuration} mins
                </p>
              </div>
              <Button
                onClick={() => addToBasket(service)}
                className="text-sm px-3 py-1"
              >
                Add
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Basket */}
      <div className="border-l pl-4 overflow-y-auto">
        <h4 className="font-semibold text-lg text-bronze mb-2">
          Selected Services
        </h4>
        {basket.length === 0 ? (
          <p className="text-sm text-gray-500">No services selected yet.</p>
        ) : (
          <ul className="space-y-3">
            {basket.map((item, index) => (
              <li
                key={index}
                className="flex justify-between items-center border border-gray-300 rounded px-3 py-2"
              >
                <div>
                  <p className="font-medium text-bronze">{item.name}</p>
                  <p className="text-sm text-gray-600">
                    £{item.basePrice} • {item.baseDuration} mins
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromBasket(index)}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {basket.length > 0 && (
          <div className="mt-4">
            <p className="font-semibold text-sm text-bronze">
              Total: £{totalCost} • {Math.floor(totalDuration / 60)}h {totalDuration % 60}m
            </p>
            <div className="flex justify-between mt-4">
              <Button
                onClick={onBack}
                className="bg-gray-300 text-black hover:bg-gray-400"
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Confirm Booking
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Cancel at bottom */}
    <div className="mt-6 text-right">
      <Button
        onClick={onCancel}
        className="bg-red-500 text-white hover:bg-red-600"
      >
        Cancel
      </Button>
    </div>
  </div>
);
}
