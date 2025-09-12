import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./../../supabaseClient.js";
import Button from "../Button";

const CHEMICAL_GAP_MIN = 30;

// Robust chemical detector: DB flag, category hint, plus keywords fallback
const isChemicalService = (svc) => {
  const cat = String(svc?.category || "").toLowerCase();
  const name = String(svc?.name || "").toLowerCase();
  if (svc?.is_chemical) return true;
  if (cat.includes("treat")) return true; // e.g. “Treatments”
  const kw = [
    "tint", "colour", "color", "bleach", "toner", "gloss",
    "highlights", "balayage", "foils", "perm", "relaxer",
    "keratin", "chemical", "straightening"
  ];
  return kw.some((k) => name.includes(k) || cat.includes(k));
};

export default function NewBooking({
  stylistName,
  stylistId,
  selectedSlot,
  clients,
  selectedClient,
  clientObj,
  basket,
  setBasket,
  onBack,
  onCancel,
  onNext,
}) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");

  const [staffServiceOverrides, setStaffServiceOverrides] = useState([]);

  useEffect(() => {
    async function fetchServices() {
      const { data } = await supabase.from("services").select("*");
      setServices(data || []);
      const cats = [...new Set((data || []).map((s) => s.category))].filter(Boolean);
      setCategories(cats);
      setSelectedCategory(cats[0] || "");
    }
    fetchServices();
  }, []);

  useEffect(() => {
    if (!stylistId) return;
    let cancelled = false;
    async function loadOverrides() {
      const { data: overrides, error } = await supabase
        .from("staff_services")
        .select("*")
        .eq("staff_id", stylistId);
      if (!cancelled) setStaffServiceOverrides(overrides || []);
      if (error) console.error("staff_services fetch error:", error.message);
    }
    loadOverrides();
    return () => { cancelled = true; };
  }, [stylistId]);

  const filteredServices = useMemo(() => {
    return services.filter(
      (s) =>
        s.category === selectedCategory &&
        (!s.stylist || s.stylist.includes(stylistName))
    );
  }, [services, selectedCategory, stylistName]);

  const getPriceAndDuration = (service) => {
    const override = staffServiceOverrides.find((o) => o.service_id === service.id);
    return {
      price: override?.price ?? service.base_price,
      duration: override?.duration ?? service.base_duration,
    };
  };

  const addToBasket = (service) => {
    const { price, duration } = getPriceAndDuration(service);
    setBasket((prev) => [
      ...prev,
      {
        ...service,
        displayPrice: Number(price) || 0,
        displayDuration: Number(duration) || 0,
      },
    ]);
  };

  const removeFromBasket = (index) => {
    setBasket(basket.filter((_, i) => i !== index));
  };

  // ---- TIMELINE with 30m gap after any chemical service ----
  // Each item: { offsetMin, duration, svc }
  const { timeline, sumActiveDuration, hasChemical, sumPrice } = useMemo(() => {
    if (!basket?.length) {
      return { timeline: [], sumActiveDuration: 0, hasChemical: false, sumPrice: 0 };
    }

    let offset = 0;
    let anyChem = false;
    let priceSum = 0;
    const items = [];

    for (const svc of basket) {
      const dur = Number(svc.displayDuration || 0);
      const price = Number(svc.displayPrice || 0);

      items.push({ offsetMin: offset, duration: dur, svc });

      priceSum += price;
      offset += dur;

      if (isChemicalService(svc)) {
        anyChem = true;
        offset += CHEMICAL_GAP_MIN; // ← add the 30m processing gap (not a row)
      }
    }

    return {
      timeline: items,
      sumActiveDuration: items.reduce((acc, it) => acc + it.duration, 0),
      hasChemical: anyChem,
      sumPrice: priceSum,
    };
  }, [basket]);

  // Chair time (what you need to block in the diary) = last item's end offset
  const totalSpanMins = useMemo(() => {
    if (!timeline.length) return 0;
    const last = timeline[timeline.length - 1];
    return last.offsetMin + last.duration;
  }, [timeline]);

  // UI helpers
  const minsToHrsMins = (mins) => {
    const m = Number(mins) || 0;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return { h, mm };
  };
  const { h: activeH, mm: activeM } = minsToHrsMins(sumActiveDuration);
  const { h: chairH, mm: chairM } = minsToHrsMins(totalSpanMins);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-bold text-bronze">
          Booking for {clientObj?.first_name} {clientObj?.last_name}
        </h2>
        <p className="text-sm text-gray-700">Stylist: {stylistName || "Unknown"}</p>
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
              <p className="text-sm text-gray-500">No services in this category.</p>
            )}
            {filteredServices.map((service) => {
              const { price, duration } = getPriceAndDuration(service);
              const mins = (Number(duration) || 0) % 60;
              const hrs = Math.floor((Number(duration) || 0) / 60);
              const chem = isChemicalService(service);

              return (
                <div
                  key={service.id}
                  className="border border-gray-300 rounded p-3 flex justify-between items-center mb-3"
                >
                  <div>
                    <p className="font-medium text-bronze">
                      {service.name}
                      {chem && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-600/20 text-amber-700 align-middle">
                          chemical (+30m gap)
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      £{Number(price || 0)} • {hrs > 0 ? `${hrs}h ` : ""}
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
            <h4 className="font-semibold text-lg text-bronze mb-2">Selected Services</h4>

            {basket.length === 0 ? (
              <p className="text-sm text-gray-500">No services selected yet.</p>
            ) : (
              <ul className="space-y-3 flex-1 overflow-y-auto">
                {basket.map((item, index) => {
                  const mins = (Number(item.displayDuration) || 0) % 60;
                  const hrs = Math.floor((Number(item.displayDuration) || 0) / 60);
                  const chem = isChemicalService(item);
                  return (
                    <li
                      key={index}
                      className="flex justify-between items-center border border-gray-300 rounded px-3 py-2"
                    >
                      <div>
                        <p className="font-medium text-bronze">
                          {item.name}
                          {chem && (
                            <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-amber-600/20 text-amber-700">
                              chemical (+30m)
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-600">
                          £{Number(item.displayPrice || 0)} • {hrs > 0 ? `${hrs}h ` : ""}
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
              <div className="mt-4 space-y-1">
                <p className="font-semibold text-sm text-bronze">
                  Active service time: {activeH}h {activeM}m
                </p>
                <p className="font-semibold text-sm text-bronze">
                  Chair time (incl. processing): {chairH}h {chairM}m
                </p>
                {hasChemical && (
                  <p className="text-xs text-amber-700">
                    A 30-minute processing gap is applied after chemical services.
                  </p>
                )}
                <p className="font-semibold text-sm text-bronze">
                  Total: £{Number(sumPrice).toFixed(2)}
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
          <Button onClick={onCancel} className="bg-red-500 text-white hover:bg-red-600">
            Cancel
          </Button>
        </div>
        <Button
          onClick={() =>
            onNext?.({
              timeline,               // [{offsetMin, duration, svc}]
              hasChemical,
              sumActiveDuration,      // minutes (no gaps)
              totalSpanMins,          // minutes (includes 30m gaps)
              basket,                 // original items
            })
          }
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={basket.length === 0}
        >
          Review Booking
        </Button>
      </div>
    </div>
  );
}
