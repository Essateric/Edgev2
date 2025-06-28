import React, { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "../supabaseClient";
import SaveRetainedBooking from "../utils/SaveRetainedBooking";
import Button from "./Button";

export default function NewBooking({
  stylistName,
  stylistId,
  selectedSlot,
  selectedClient,
  clients,
  onBack,
  onCancel,
  onConfirm,
}) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  const [basket, setBasket] = useState([]);
  const [loading, setLoading] = useState(false);

  const [staffServiceOverrides, setStaffServiceOverrides] = useState([]);

  const client = clients.find((c) => c.id === selectedClient);
  const clientLabel = client
    ? `${client.first_name} ${client.last_name}`
    : "Unknown Client";

const timeLabel = selectedSlot
  ? `${format(selectedSlot.start, "eeee dd MMM yyyy")} ${format(
      selectedSlot.start,
      "HH:mm"
    )} - ${format(selectedSlot.end, "HH:mm")}`
  : "No Time Selected";

  // Fetch services
  useEffect(() => {
    async function fetchServices() {
      const { data } = await supabase.from("services").select("*");
      setServices(data || []);
      const cats = [...new Set(data.map((s) => s.category))].filter(Boolean);
      setCategories(cats);
      setSelectedCategory(cats[0] || "");
    }
    fetchServices();
  }, []);

  // Fetch overrides
  useEffect(() => {
    if (!stylistId) return;
    supabase
      .from("staff_services")
      .select("*")
      .eq("staff_id", stylistId)
      .then(({ data }) => {
        setStaffServiceOverrides(data || []);
      });
  }, [stylistId]);

  const filteredServices = useMemo(() => {
    return services.filter(
      (s) =>
        s.category === selectedCategory &&
        (!s.stylist || s.stylist.includes(stylistName))
    );
  }, [selectedCategory, services, stylistName]);

  const getPriceAndDuration = (service) => {
    const override = staffServiceOverrides.find(
      (o) => o.service_id === service.id
    );
    return {
      price: override?.price ?? service.base_price,
      duration: override?.duration ?? service.base_duration,
    };
  };

  const addToBasket = (service) => {
    const { price, duration } = getPriceAndDuration(service);
    setBasket([
      ...basket,
      {
        ...service,
        displayPrice: price,
        displayDuration: duration,
      },
    ]);
  };

  const removeFromBasket = (index) =>
    setBasket(basket.filter((_, i) => i !== index));

  const totalCost = basket.reduce(
    (sum, s) => sum + (Number(s.displayPrice) || 0),
    0
  );
  const totalDuration = basket.reduce(
    (sum, s) => sum + (Number(s.displayDuration) || 0),
    0
  );

  const handleConfirm = async () => {
    if (!selectedSlot || basket.length === 0 || !selectedClient) return;
    setLoading(true);
    try {
      const bookingId = crypto.randomUUID();
      const clientName = client.first_name;
      let currentTime = new Date(selectedSlot.start);

      const events = [];
      for (const item of basket) {
        const endTime = new Date(
          currentTime.getTime() + (item.displayDuration || 0) * 60000
        );

        const event = {
          bookingId,
          clientName,
          title: item.name,
          category: item.category,
          start: currentTime,
          end: endTime,
          resourceId: stylistId,
          duration: item.displayDuration,
          price: item.displayPrice,
          clientId: selectedClient,
          createdAt: new Date().toISOString(),
        };

        await supabase.from("bookings").insert([event]);
        await SaveRetainedBooking({
          clientId: selectedClient,
          clientName,
          stylistId,
          stylistName,
          service: item,
          start: event.start,
          end: event.end,
        });

        events.push(event);
        currentTime = endTime;
      }

      onConfirm(events);
      setBasket([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-300 px-4 py-3">
        <h2 className="text-lg font-semibold text-bronze">
          Booking for {clientLabel}
        </h2>
        <p className="text-sm text-gray-600">{timeLabel}</p>
        <p className="text-sm text-gray-600">Stylist: {stylistName}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
          {/* Categories */}
          <div className="border border-bronze rounded p-2 bg-white overflow-y-auto">
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
          <div className="border border-bronze rounded p-2 bg-white overflow-y-auto">
            {filteredServices.length === 0 && (
              <p className="text-sm text-gray-500">
                No services in this category.
              </p>
            )}
            {filteredServices.map((service) => {
              const { price, duration } = getPriceAndDuration(service);
              const mins = duration % 60;
              const hrs = Math.floor(duration / 60);

              return (
                <div
                  key={service.id}
                  className="border border-gray-300 rounded p-3 flex justify-between items-center mb-3"
                >
                  <div>
                    <p className="font-medium text-bronze">{service.name}</p>
                    <p className="text-sm text-gray-600">
                      £{price} • {hrs > 0 ? `${hrs}h ` : ""}
                      {mins > 0 || hrs === 0 ? `${mins}m` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => addToBasket(service)}
                    className="bg-bronze text-white text-sm px-3 py-1 rounded hover:bg-bronze/90"
                  >
                    Add
                  </button>
                </div>
              );
            })}
          </div>

          {/* Basket */}
          <div className="border border-bronze rounded p-2 bg-white flex flex-col">
            <h4 className="font-semibold text-lg text-bronze mb-2">
              Selected Services
            </h4>
            {basket.length === 0 ? (
              <p className="text-sm text-gray-500">No services selected yet.</p>
            ) : (
              <ul className="space-y-3 flex-1 overflow-y-auto">
                {basket.map((item, index) => {
                  const mins = item.displayDuration % 60;
                  const hrs = Math.floor(item.displayDuration / 60);
                  return (
                    <li
                      key={index}
                      className="flex justify-between items-center border border-gray-300 rounded px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-bronze">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          £{item.displayPrice} • {hrs > 0 ? `${hrs}h ` : ""}
                          {mins > 0 || hrs === 0 ? `${mins}m` : ""}
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
                  );
                })}
              </ul>
            )}

            {basket.length > 0 && (
              <div className="mt-4">
                <p className="font-semibold text-sm text-bronze">
                  Total: £{totalCost.toFixed(2)} •{" "}
                  {Math.floor(totalDuration / 60)}h {totalDuration % 60}m
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="flex justify-between border-t border-gray-300 px-4 py-3">
        <div className="flex gap-2">
          <Button onClick={onBack}>Back</Button>
          <Button
            onClick={onCancel}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            Cancel
          </Button>
        </div>
        <Button
          onClick={handleConfirm}
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={basket.length === 0 || loading}
        >
          {loading ? "Booking..." : "Confirm Booking"}
        </Button>
      </div>
    </div>
  );
}
