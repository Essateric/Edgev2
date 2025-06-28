import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import Button from "./Button";
import SaveRetainedBooking from "../utils/SaveRetainedBooking";

// Fallback data
const fallbackCategories = ["Cut and Finish", "Gents", "Highlights"];
const fallbackServices = [
  { id: 1, name: "Dry Cut", category: "Cut and Finish", base_price: 20, base_duration: 30 },
  { id: 2, name: "Wet Cut", category: "Gents", base_price: 15, base_duration: 20 },
  { id: 3, name: "Half Head Highlights", category: "Highlights", base_price: 50, base_duration: 60 },
];

export default function NewBooking({
  stylistName,
  stylistId,
  selectedSlot,
  onCancel,
  onConfirm,
}) {
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState(null);

  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [basket, setBasket] = useState([]);

  const [staffServiceOverrides, setStaffServiceOverrides] = useState([]);

  const [loading, setLoading] = useState(false);

  // Fetch clients
  useEffect(() => {
    let mounted = true;
    supabase.from("clients").select("*").then(({ data, error }) => {
      if (!mounted) return;
      if (error) setClients([]);
      else setClients(data);
      setClientsLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  // Fetch services
  useEffect(() => {
    let mounted = true;
    async function fetch() {
      const { data, error } = await supabase.from("services").select("*");
      if (!mounted) return;
      if (error || !data) {
        setServices(fallbackServices);
        setCategories(fallbackCategories);
      } else {
        setServices(data);
        const unique = [...new Set(data.map(s => s.category))].filter(Boolean);
        setCategories(unique.length ? unique : fallbackCategories);
        setSelectedCategory(unique[0] || fallbackCategories[0]);
      }
    }
    fetch();
    return () => { mounted = false; };
  }, []);

  // Fetch staff service overrides
  useEffect(() => {
    if (!stylistId) return;
    supabase
      .from("staff_services")
      .select("*")
      .eq("staff_id", stylistId)
      .then(({ data, error }) => {
        if (error) setStaffServiceOverrides([]);
        else setStaffServiceOverrides(data || []);
      });
  }, [stylistId]);

  const filteredServices = useMemo(() => {
    return services.filter(
      s => s.category === selectedCategory &&
        (!s.stylist || s.stylist.includes(stylistName))
    );
  }, [services, selectedCategory, stylistName]);

  const getPriceAndDuration = (service) => {
    const override = staffServiceOverrides.find(s => s.service_id === service.id);
    return {
      price: override?.price ?? service.base_price,
      duration: override?.duration ?? service.base_duration,
    };
  };

  const addToBasket = (service) => {
    const { price, duration } = getPriceAndDuration(service);
    setBasket([...basket, {
      ...service,
      displayPrice: price,
      displayDuration: duration,
    }]);
  };

  const removeFromBasket = (index) => {
    setBasket(basket.filter((_, i) => i !== index));
  };

  const totalCost = basket.reduce((sum, s) => sum + (s.displayPrice || 0), 0);
  const totalDuration = basket.reduce((sum, s) => sum + (s.displayDuration || 0), 0);

  const client = clients.find(c => c.id === selectedClient);

  const handleConfirm = async () => {
    if (!selectedSlot || basket.length === 0 || !selectedClient) return;
    setLoading(true);

    try {
      const bookingId = crypto.randomUUID();
      let currentTime = new Date(selectedSlot.start);

      for (const item of basket) {
        const endTime = new Date(currentTime.getTime() + (item.displayDuration || 0) * 60000);

        const newEvent = {
          bookingId,
          clientName: client ? `${client.first_name} ${client.last_name}` : "Unknown",
          title: item.name,
          category: item.category,
          start: new Date(currentTime),
          end: endTime,
          resourceId: stylistId,
          price: item.displayPrice,
          duration: item.displayDuration,
          clientId: client?.id,
          createdAt: new Date().toISOString(),
        };

        await supabase.from("bookings").insert([newEvent]);
        await SaveRetainedBooking({
          clientId: client?.id,
          clientName: newEvent.clientName,
          stylistId,
          stylistName,
          service: item,
          start: newEvent.start,
          end: newEvent.end,
        });

        currentTime = endTime;
      }

      setBasket([]);
      onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden p-6 rounded shadow-xl max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-bronze mb-4">
        {step === 1 && "Select Client"}
        {step === 2 && "Select Services"}
        {step === 3 && "Review Booking"}
      </h2>

      {/* ✅ Step 1: Client Select */}
      {step === 1 && (
        <>
          {clientsLoading ? (
            <div>Loading clients…</div>
          ) : (
            <select
              value={selectedClient || ""}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full border rounded px-3 py-2 text-lg"
            >
              <option value="">Choose a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.first_name} ${c.last_name} - ${c.mobile || "No number"}`}
                </option>
              ))}
            </select>
          )}
          <div className="mt-6 flex justify-between">
            <Button onClick={onCancel} className="bg-red-500 text-white">Cancel</Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedClient}
              className="bg-bronze text-white"
            >
              Next
            </Button>
          </div>
        </>
      )}

      {/* ✅ Step 2: Service Selection */}
      {step === 2 && (
        <div className="grid grid-cols-3 gap-4 h-[70vh]">
          {/* Category List */}
          <div className="overflow-y-auto border-r pr-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`block w-full text-left px-3 py-2 rounded border mb-2 ${
                  selectedCategory === cat
                    ? "bg-bronze text-white"
                    : "border-bronze text-bronze hover:bg-bronze/10"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Service List */}
          <div className="overflow-y-auto">
            {filteredServices.map((service, i) => {
              const { price, duration } = getPriceAndDuration(service);
              const mins = duration % 60;
              const hrs = Math.floor(duration / 60);
              return (
                <div
                  key={i}
                  className="border rounded p-3 flex justify-between items-center mb-3"
                >
                  <div>
                    <p className="font-medium text-bronze">{service.name}</p>
                    <p className="text-sm text-gray-600">
                      £{price} • {hrs > 0 ? `${hrs}h ` : ""}
                      {mins > 0 || hrs === 0 ? `${mins}m` : ""}
                    </p>
                  </div>
                  <Button onClick={() => addToBasket(service)}>Add</Button>
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
              <p className="text-sm text-gray-500">No services selected.</p>
            ) : (
              <ul className="space-y-3">
                {basket.map((item, index) => {
                  const mins = item.displayDuration % 60;
                  const hrs = Math.floor(item.displayDuration / 60);
                  return (
                    <li
                      key={index}
                      className="flex justify-between items-center border rounded px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-bronze">{item.name}</p>
                        <p className="text-sm text-gray-600">
                          £{item.displayPrice} • {hrs > 0 ? `${hrs}h ` : ""}
                          {mins > 0 || hrs === 0 ? `${mins}m` : ""}
                        </p>
                      </div>
                      <button
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
                  Total: £{totalCost} • {Math.floor(totalDuration / 60)}h{" "}
                  {totalDuration % 60}m
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ✅ Step 3: Review */}
      {step === 3 && (
        <>
          <div className="space-y-4">
            <div className="border p-3 rounded">
              <h3 className="text-bronze font-semibold mb-2">Client</h3>
              <p>{`${client?.first_name} ${client?.last_name} - ${client?.mobile}`}</p>
            </div>
            <div className="border p-3 rounded">
              <h3 className="text-bronze font-semibold mb-2">Services</h3>
              {basket.map((b, i) => (
                <p key={i}>
                  {b.name} — £{b.displayPrice} — {Math.floor(b.displayDuration / 60)}h {b.displayDuration % 60}m
                </p>
              ))}
              <p className="mt-2 font-semibold">
                Total: £{totalCost} • {Math.floor(totalDuration / 60)}h {totalDuration % 60}m
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <Button onClick={() => setStep(2)}>Back</Button>
            <Button
              onClick={handleConfirm}
              className="bg-green-600 text-white"
              disabled={loading}
            >
              {loading ? "Booking..." : "Confirm Booking"}
            </Button>
          </div>
        </>
      )}

      {/* Bottom Cancel */}
      {step !== 3 && (
        <div className="mt-6 text-right">
          <Button
            onClick={onCancel}
            className="bg-red-500 text-white"
            disabled={loading}
          >
            Cancel
          </Button>
          {step === 2 && (
            <Button
              onClick={() => setStep(3)}
              className="bg-bronze text-white ml-2"
              disabled={basket.length === 0}
            >
              Review
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
