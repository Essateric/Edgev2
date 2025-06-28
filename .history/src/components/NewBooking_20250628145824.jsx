import React, { useEffect, useState, useMemo } from "react";
import Button from "./Button";
import SaveRetainedBooking from "../utils/SaveRetainedBooking";
import { supabase } from "../supabaseClient";
import { format } from "date-fns";

export default function NewBooking({
  stylistName,
  stylistId,
  selectedSlot,
  onBack,
  onCancel,
  onConfirm,
}) {
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState("");

  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  const [basket, setBasket] = useState([]);
  const [loading, setLoading] = useState(false);

  const [showReview, setShowReview] = useState(false);
  const [showServiceStep, setShowServiceStep] = useState(false);

  const [staffServiceOverrides, setStaffServiceOverrides] = useState([]);

  const client = clients.find((c) => c.id === selectedClient);
  const clientLabel = client
    ? `${client.first_name} ${client.last_name} - ${client.mobile}`
    : "Unknown Client";

  // Fetch clients
  useEffect(() => {
    supabase.from("clients").select("*").then(({ data }) => {
      setClients(data || []);
      setClientsLoading(false);
    });
  }, []);

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

  // ⛔ Review Step
  if (showReview) {
    const start = new Date(selectedSlot.start);
    const end = new Date(start.getTime() + totalDuration * 60000);
    return (
      <div className="bg-white rounded p-6 max-w-md mx-auto shadow">
        <h2 className="text-lg font-semibold text-bronze mb-3">
          Review Details
        </h2>
        <p>Client: {clientLabel}</p>
        <p>Phone: {client?.mobile || "N/A"}</p>
        <p>
          Time: {format(start, "dd/MM/yyyy HH:mm")} – {format(end, "HH:mm")}
        </p>
        <p>Stylist: {stylistName}</p>

        <div className="flex justify-between mt-4">
          <Button onClick={() => setShowReview(false)}>Back</Button>
          <Button
            onClick={handleConfirm}
            className="bg-green-600 text-white hover:bg-green-700"
            disabled={loading}
          >
            {loading ? "Booking..." : "Confirm Booking"}
          </Button>
        </div>
      </div>
    );
  }

  // 🔸 Client Select Step
  if (!showServiceStep) {
    return (
      <div className="bg-white rounded p-6 max-w-md mx-auto shadow">
        <h2 className="text-xl font-semibold text-bronze mb-4">
          Select Client
        </h2>
        {clientsLoading ? (
          <p className="text-gray-500">Loading clients…</p>
        ) : (
          <select
            value={selectedClient || ""}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full border rounded px-3 py-2 text-lg"
          >
            <option value="">Choose a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {`${c.first_name} ${c.last_name} - ${c.mobile}`}
              </option>
            ))}
          </select>
        )}

        <div className="flex justify-between mt-4">
          <Button onClick={onBack}>Back</Button>
          <Button
            onClick={() => setShowServiceStep(true)}
            className="bg-blue-600 text-white hover:bg-blue-700"
            disabled={!selectedClient}
          >
            Next
          </Button>
        </div>
      </div>
    );
  }

  // 🔸 Service Select Step
  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden p-6 rounded shadow-xl max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-bronze mb-4">
        Select Services for {clientLabel}
      </h2>

      <div className="grid grid-cols-3 gap-4 h-[70vh]">
        {/* Categories */}
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
                <Button
                  onClick={() => addToBasket(service)}
                  className="text-sm px-3 py-1"
                >
                  Add
                </Button>
              </div>
            );
          })}
        </div>

        {/* Basket */}
        <div className="border-l pl-4 overflow-y-auto">
          <h4 className="font-semibold text-lg text-bronze mb-2">
            Selected Services
          </h4>
          {basket.length === 0 ? (
            <p className="text-sm text-gray-500">
              No services selected yet.
            </p>
          ) : (
            <ul className="space-y-3">
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
                        £{item.displayPrice} •{" "}
                        {hrs > 0 ? `${hrs}h ` : ""}
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
              <div className="flex justify-between mt-4">
                <Button onClick={() => setShowServiceStep(false)}>Back</Button>
                <Button
                  onClick={() => setShowReview(true)}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

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
