// src/onlinebookings/hooks/useTimeline.js
import { useMemo } from "react";
import { isChemicalService } from "../helpers";

/**
 * Computes:
 * - timeline (adds a 30m processing gap *between* chemical services)
 * - sums & labels
 * - getEffectivePD(svc) => { duration, price } using staff overrides
 *
 * Params:
 *  - selectedServices: Service[]
 *  - selectedProvider: { id: string } | null
 *  - providerOverrides: Array<{ service_id, price, duration }>
 */
export default function useTimeline({
  selectedServices = [],
  selectedProvider = null,
  providerOverrides = [],
}) {
  // Always work with an array to avoid .find on undefined
  const overrides = Array.isArray(providerOverrides) ? providerOverrides : [];

  // Safe price/duration resolver
  const getEffectivePD = (svc) => {
    if (!selectedProvider || !svc) return { duration: null, price: null };

    const o = overrides.find((x) => x?.service_id === svc?.id) || null;

    const baseDuration = Number(svc?.base_duration ?? 0) || 0;
    const overrideDuration = Number(o?.duration);
    const duration =
      Number.isFinite(overrideDuration) && overrideDuration > 0
        ? overrideDuration
        : baseDuration;
    const price = o?.price != null ? Number(o.price) : null;

    return {
      duration: Number.isFinite(duration) ? duration : 0,
      price,
    };
  };

  const calc = useMemo(() => {
    if (!selectedServices.length || !selectedProvider) {
      return {
        timeline: [],
        hasChemical: false,
        serviceNameForEmail: "",
        hasUnknownPrice: true,
        sumActiveDuration: 0,
        sumPrice: 0,
      };
    }

    let offset = 0;
    let anyChem = false;
    let unknown = false;
    let priceSum = 0;
    const items = [];

    for (const svc of selectedServices) {
      const { duration, price } = getEffectivePD(svc);
      const dur = Number(duration || 0);

      items.push({ offsetMin: offset, duration: dur, svc });

      // price accumulation / unknown flag
      if (price == null || price === "" || Number(price) === 0 || Number.isNaN(Number(price))) {
        unknown = true;
      } else {
        priceSum += Number(price || 0);
      }

      // advance by active duration
      offset += dur;

      // add processing gap after chemical services
      if (isChemicalService(svc)) {
        anyChem = true;
        offset += 30; // processing gap (not counted in sumActiveDuration)
      }
    }

    const nameForEmail =
      selectedServices.map((s) => s.name).join(", ") +
      (anyChem ? " (+processing gap)" : "");

    return {
      timeline: items,
      hasChemical: anyChem,
      serviceNameForEmail: nameForEmail,
      hasUnknownPrice: unknown,
      // Sum ONLY active service time (exclude processing gaps)
      sumActiveDuration: items.reduce((acc, it) => acc + (it.duration || 0), 0),
      sumPrice: priceSum,
    };
  }, [selectedServices, selectedProvider, overrides]);

  return {
    ...calc,
    getEffectivePD,
  };
}
