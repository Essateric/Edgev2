import React, { useEffect, useMemo, useState } from "react";
import Button from "../Button";
import { useAuth } from "../../contexts/AuthContext.jsx";

const CHEMICAL_GAP_MIN = 30;

const clean = (v) => String(v ?? "").trim();

const isChemicalService = (svc) => {
  const cat = clean(svc?.category).toLowerCase();
  const name = clean(svc?.name).toLowerCase();
  if (svc?.is_chemical) return true;
  if (cat.includes("treat")) return true;
  const kw = [
    "tint",
    "colour",
    "color",
    "bleach",
    "toner",
    "gloss",
    "highlights",
    "balayage",
    "foils",
    "perm",
    "relaxer",
    "keratin",
    "chemical",
    "straightening",
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
  const { supabaseClient, currentUser } = useAuth();
  const db = supabaseClient;

  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [staffLinks, setStaffLinks] = useState([]);

  const [loading, setLoading] = useState(false);
  const [warnFallbackAll, setWarnFallbackAll] = useState(false);
  const [loadError, setLoadError] = useState("");

  // ✅ If stylistId prop is missing, fallback to slot.resourceId (because that IS the staff id)
  const effectiveStylistId = useMemo(() => {
    return stylistId || selectedSlot?.resourceId || null;
  }, [stylistId, selectedSlot?.resourceId]);

  // ✅ If clientObj is missing (or not the same id), fetch the client by id so we ALWAYS have a name
  const [fetchedClient, setFetchedClient] = useState(null);

  useEffect(() => {
    let alive = true;

    async function fetchClient() {
      if (!db || !selectedClient) {
        if (alive) setFetchedClient(null);
        return;
      }

      // if the parent already gave us the correct client row, don’t fetch
      if (clientObj?.id && clientObj.id === selectedClient) {
        if (alive) setFetchedClient(null);
        return;
      }

      // if it exists in clients[] already, don’t fetch
      const fromList = (clients || []).find((c) => c.id === selectedClient);
      if (fromList) {
        if (alive) setFetchedClient(fromList);
        return;
      }

      const { data, error } = await db
        .from("clients")
        .select("id, first_name, last_name, email, mobile, dob")
        .eq("id", selectedClient)
        .maybeSingle();

      if (!alive) return;
      if (error) {
        console.warn("[NewBooking] fetch client by id failed:", error);
        setFetchedClient(null);
        return;
      }

      setFetchedClient(data || null);
    }

    fetchClient();
    return () => {
      alive = false;
    };
  }, [db, selectedClient, clientObj?.id, clients]);

  // ✅ single “truth” for client
  const effectiveClient = useMemo(() => {
    if (clientObj?.id) return clientObj;
    if (fetchedClient?.id) return fetchedClient;
    if (selectedClient) return (clients || []).find((c) => c.id === selectedClient) || null;
    return null;
  }, [clientObj, fetchedClient, clients, selectedClient]);

  const effectiveClientId = effectiveClient?.id ?? selectedClient ?? null;

  const effectiveClientName = useMemo(() => {
    if (effectiveClient) {
      const nm = `${effectiveClient.first_name ?? ""} ${effectiveClient.last_name ?? ""}`.trim();
      return nm || "Unknown Client";
    }
    return "Unknown Client";
  }, [effectiveClient]);

  // quick sanity log
  useEffect(() => {
    console.log("[NewBooking] currentUser", {
      hasUser: !!currentUser,
      hasToken: !!currentUser?.token,
      offline: !!currentUser?.offline,
      stylistIdProp: stylistId,
      effectiveStylistId,
      selectedClient,
      hasClientObj: !!clientObj,
      hasEffectiveClient: !!effectiveClient,
    });
  }, [currentUser, stylistId, effectiveStylistId, selectedClient, clientObj, effectiveClient]);

  useEffect(() => {
    let cancelled = false;

    const buildCats = (svcs) => {
      const cats = Array.from(new Set((svcs || []).map((s) => clean(s.category))))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return cats;
    };

    async function loadServicesForModal() {
      setLoading(true);
      setLoadError("");
      setWarnFallbackAll(false);

      try {
        // 1) If stylist selected: try staff_services join
        if (effectiveStylistId) {
          const { data: linkRows, error: linkErr } = await db
            .from("staff_services")
            .select(
              `
              service_id,
              price,
              duration,
              active,
              services (
                id,
                category,
                name,
                is_chemical,
                base_price,
                base_duration
              )
            `
            )
            .eq("staff_id", effectiveStylistId)
            .eq("active", true);

          if (linkErr) {
            console.warn("[NewBooking] staff_services join error:", linkErr);
          }

          const rows = linkRows || [];
          const linkedServices = rows.map((r) => r.services).filter(Boolean);

          if (!cancelled && linkedServices.length > 0) {
            setStaffLinks(rows);
            setServices(linkedServices);

            const cats = buildCats(linkedServices);
            setCategories(cats);
            setSelectedCategory((prev) => (prev && cats.includes(prev) ? prev : cats[0] || ""));
            return;
          }

          if (!cancelled) {
            setStaffLinks(rows);
            setWarnFallbackAll(true);
          }
        }

        // 2) Fallback: load all services
        const { data: allSvcs, error: svcErr } = await db
          .from("services")
          .select("id,category,name,is_chemical,base_price,base_duration")
          .order("category", { ascending: true })
          .order("name", { ascending: true });

        console.log("[NewBooking] services fetch result", {
          count: allSvcs?.length ?? 0,
          error: svcErr?.message ?? null,
        });

        if (svcErr) {
          console.warn("[NewBooking] services fetch error:", svcErr);
          if (!cancelled) setLoadError(svcErr.message || "Failed to load services");
        }

        const list = (allSvcs || []).map((s) => ({
          ...s,
          category: clean(s.category),
          name: clean(s.name),
        }));

        if (cancelled) return;

        setServices(list);
        const cats = buildCats(list);
        setCategories(cats);
        setSelectedCategory((prev) => (prev && cats.includes(prev) ? prev : cats[0] || ""));
      } catch (e) {
        console.warn("[NewBooking] loadServicesForModal crash:", e);
        if (!cancelled) setLoadError(e?.message || "Failed to load services");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!db) {
      setLoadError("No Supabase client available");
      setLoading(false);
      return;
    }

    loadServicesForModal();
    return () => {
      cancelled = true;
    };
  }, [db, effectiveStylistId]);

  const getPriceAndDuration = (service) => {
    const row = staffLinks.find((o) => o.service_id === service.id);
    return {
      price: Number(row?.price ?? service.base_price ?? 0),
      duration: Number(row?.duration ?? service.base_duration ?? 0),
    };
  };

  const filteredServices = useMemo(() => {
    const cat = clean(selectedCategory);
    if (!cat) return [];
    return services.filter((s) => clean(s.category) === cat);
  }, [services, selectedCategory]);

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
    setBasket((prev) => prev.filter((_, i) => i !== index));
  };

  const { timeline, sumActiveDuration, hasChemical, sumPrice } = useMemo(() => {
    if (!basket?.length) {
      return { timeline: [], sumActiveDuration: 0, hasChemical: false, sumPrice: 0 };
    }

    let offset = 0;
    let anyChem = false;
    let priceSum = 0;
    const items = [];

    for (const svc of basket) {
      const dur = Math.max(1, Number(svc.displayDuration || 0));
      const price = Number(svc.displayPrice || 0);

      items.push({ offsetMin: offset, duration: dur, svc });
      priceSum += price;
      offset += dur;

      if (isChemicalService(svc)) {
        anyChem = true;
        offset += CHEMICAL_GAP_MIN;
      }
    }

    return {
      timeline: items,
      sumActiveDuration: items.reduce((acc, it) => acc + it.duration, 0),
      hasChemical: anyChem,
      sumPrice: priceSum,
    };
  }, [basket]);

  const totalSpanMins = useMemo(() => {
    if (!timeline.length) return 0;
    const last = timeline[timeline.length - 1];
    return last.offsetMin + last.duration;
  }, [timeline]);

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
      <div className="mb-4">
        <h2 className="text-lg font-bold text-bronze">
          Booking for {effectiveClientName}
        </h2>

        <p className="text-sm text-gray-700">Stylist: {stylistName || "Unknown"}</p>

        <p className="text-[11px] text-gray-400 mt-1">
          dbg: services={services.length} cats={categories.length} staffLinks={staffLinks.length}
        </p>

        {warnFallbackAll && (
          <p className="text-xs text-amber-700 mt-1">
            No active services are linked to {stylistName}. Showing all services as a fallback.
          </p>
        )}

        {!!loadError && (
          <p className="text-xs text-red-600 mt-1">Services load error: {loadError}</p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
          <div className="border border-bronze rounded p-2 bg-white overflow-y-auto">
            {loading && categories.length === 0 ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-gray-500">No categories found.</p>
            ) : (
              categories.map((cat) => (
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
              ))
            )}
          </div>

          <div className="border border-bronze rounded p-2 bg-white overflow-y-auto">
            {loading ? (
              <p className="text-sm text-gray-500">Loading services…</p>
            ) : filteredServices.length === 0 ? (
              <p className="text-sm text-gray-500">No services in this category.</p>
            ) : (
              filteredServices.map((service) => {
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
                      type="button"
                      onClick={() => addToBasket(service)}
                      className="bg-bronze text-white text-sm px-3 py-1 rounded hover:bg-bronze/90"
                    >
                      Add
                    </button>
                  </div>
                );
              })
            )}
          </div>

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

      <div className="flex justify-between border-t border-gray-300 px-4 py-3">
        <div className="flex gap-2">
          <Button type="button" onClick={onBack}>
            Back
          </Button>
          <Button
            type="button"
            onClick={onCancel}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            Cancel
          </Button>
        </div>

        <Button
          type="button"
          onClick={() => {
            console.log("[NewBooking] Review Booking clicked", {
              hasOnNext: typeof onNext === "function",
              basketLen: basket?.length ?? 0,
              selectedClient: effectiveClientId,
              effectiveClientName,
              effectiveStylistId,
            });

            if (typeof onNext !== "function") {
              console.warn("[NewBooking] onNext is missing or not a function");
              return;
            }

            // ✅ FIX: include client id + name (+client row) in the payload
            onNext({
              timeline,
              hasChemical,
              sumActiveDuration,
              totalSpanMins,
              basket,
              client_id: effectiveClientId,
              client_name: effectiveClientName,
              client: effectiveClient,
              stylist_id: effectiveStylistId,
              stylist_name: stylistName || "Unknown",
            });
          }}
          className="bg-green-600 text-white hover:bg-green-700"
          disabled={basket.length === 0}
        >
          Review Booking
        </Button>
      </div>
    </div>
  );
}
