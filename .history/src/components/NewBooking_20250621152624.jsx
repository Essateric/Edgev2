import React, { useEffect, useState, useMemo } from "react";
import Button from "./Button";
import SaveRetainedBooking from "../utils/SaveRetainedBooking";
import { supabase } from "../supabaseClient";

// Fallback data
const fallbackCategories = ["Cut and Finish", "Gents", "Highlights"];
const fallbackServices = [
  { name: "Dry Cut", category: "Cut and Finish", basePrice: 20, baseDuration: 30, stylist: ["Martin", "Darren"] },
  { name: "Wet Cut", category: "Gents", basePrice: 15, baseDuration: 20, stylist: ["Annalise"] },
  { name: "Half Head Highlights", category: "Highlights", basePrice: 50, baseDuration: 60, stylist: ["Daisy"] },
];

export default function NewBooking({
  stylistName,
  stylistId,
  selectedSlot,
  onBack,
  onCancel,
  onConfirm,
  selectedClient,
  setSelectedClient,
}) {
  console.log("NewBooking modal mounted!");
  // Clients state, loaded on mount
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  // Services/categories
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(fallbackCategories[0]);
  const [basket, setBasket] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch clients ONCE when modal mounts
  useEffect(() => {
    let isMounted = true;
    setClientsLoading(true);
    supabase
      .from("clients")
      .select("*")
      .then(({ data, error }) => {
        console.log("Fetched clients from Supabase:", data); 
        if (!isMounted) return;
        if (error) {
          console.error("Error fetching clients:", error);
          setClients([]);
        } else {
          setClients(data || []);
        }
        setClientsLoading(false);
      });
    return () => { isMounted = false; };
  }, []);

  // Fetch services on mount
  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        const { data, error } = await supabase.from("services").select("*");
        if (!isMounted) return;
        if (error) throw error;
        setServices(data);
        const uniqueCategories = [
          ...new Set(data.map((s) => s.category)),
        ].filter(Boolean);
        setCategories(uniqueCategories.length ? uniqueCategories : fallbackCategories);
      } catch (err) {
        if (!isMounted) return;
        console.warn("Using fallback data due to Supabase read error:", err.message);
        setServices(fallbackServices);
        setCategories(fallbackCategories);
      }
    }
    fetchData();
    return () => { isMounted = false; };
  }, []);

  // Filter services by selected category and stylist
  const filteredServices = useMemo(() => {
    return services.filter(
      (s) =>
        s.category === selectedCategory &&
        (!s.stylist || s.stylist.includes(stylistName))
    );
  }, [selectedCategory, services, stylistName]);

  // Basket logic
  const addToBasket = (service) => setBasket([...basket, service]);
  const removeFromBasket = (index) => setBasket(basket.filter((_, i) => i !== index));
  const clearBasket = () => setBasket([]);

  // Totals
  const totalCost = basket.reduce((sum, s) => sum + (s.basePrice || 0), 0);
  const totalDuration = basket.reduce((sum, s) => sum + (s.baseDuration || 0), 0);

  // Helper: bulletproof client label
  const formatClientLabel = (client) => {
    if (!client) return "Unknown Client - No number";
    const first = typeof client.first_name === "string" && client.first_name.trim() ? client.first_name.trim() : "No First Name";
    const last = typeof client.last_name === "string" && client.last_name.trim() ? client.last_name.trim() : "";
    const mobile = typeof client.mobile === "string" && client.mobile.trim() ? client.mobile.trim() : "No number";
    return `${first} ${last} - ${mobile}`;
  };

  // Handle booking confirmation
  const handleConfirm = async () => {
    if (!selectedSlot || basket.length === 0 || !selectedClient) return;
    setLoading(true);
    try {
      const events = [];
      const bookingId = crypto.randomUUID();
      let currentTime = new Date(selectedSlot.start);

      const client = clients.find((c) => c.id === selectedClient);
      const clientName = formatClientLabel(client).split(" - ")[0];

      for (const service of basket) {
        const endTime = new Date(currentTime.getTime() + (service.baseDuration || 0) * 60000);

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

      clearBasket();
      onConfirm(events);
    } finally {
      setLoading(false);
    }
  };

  // CLIENT SELECT DROPDOWN (with defensive rendering)
  const renderClientSelect = () => (
    <div className="mb-4">
      <label className="block font-medium mb-1 text-bronze">
        Select Client
      </label>
      {clientsLoading ? (
        <div className="text-gray-500">Loading clients…</div>
      ) : (
        <select
          value={selectedClient || ""}
          onChange={e => setSelectedClient && setSelectedClient(e.target.value)}
          className="w-full border rounded px-3 py-2 text-lg"
        >
          <option value="">Choose a client...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {formatClientLabel(c)}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  // For booking summary
  const client = clients.find((c) => c.id === selectedClient);
  const basketClientLabel = formatClientLabel(client);

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden p-6 rounded shadow-xl max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-bronze mb-4">
        Select Services
      </h2>
      {/* CLIENT SELECT */}
      {renderClientSelect()}

      {selectedClient && (
        <div className="mb-3 px-2 py-2 bg-bronze/10 rounded text-bronze font-semibold">
          Booking for: {basketClientLabel}
        </div>
      )}

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
            <p className="text-sm text-gray-500">
              No services selected yet.
            </p>
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
                Total: £{totalCost} • {Math.floor(totalDuration / 60)}h{" "}
                {totalDuration % 60}m
              </p>
              <div className="flex justify-between mt-4">
                <Button
                  onClick={onBack}
                  className="bg-gray-300 text-black hover:bg-gray-400"
                  disabled={loading}
                >
                  Back
                </Button>
                <Button
                  onClick={handleConfirm}
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={loading}
                >
                  {loading ? "Booking..." : "Confirm Booking"}
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
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
