import React, { useState } from "react";
import Button from "../../Button";
import { format } from "date-fns";
import {
  addDays,
  addMonthsPreserveDay,
  addYearsPreserveDay,
  setHMS,
  toLocalSQL,
  asLocalDate,
} from "../../../lib/dates";
import { v4 as uuidv4 } from "uuid";
import SaveBookingsLog from "../SaveBookingsLog";
import { createPortal } from "react-dom";

const DEFAULT_TIMEOUT_MS = 15000;

const withTimeout = async (promiseOrBuilder, label, ms = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();

  // If this is a Supabase/PostgREST builder, attach an AbortSignal
  let runner = promiseOrBuilder;
  if (runner && typeof runner.abortSignal === "function") {
    runner = runner.abortSignal(controller.signal);
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(
        new Error(`${label} timed out. Please check your connection and try again.`)
      );
    }, ms);
  });

  return await Promise.race([runner, timeoutPromise]);
};



function patternLabel(pattern, dayOfMonth) {
  switch (pattern) {
    case "weekly":
      return "Weekly";
    case "fortnightly":
      return "Fortnightly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "monthly_nth_day":
      return `Monthly (day ${dayOfMonth})`;
    default:
      return pattern;
  }
}

export default function RepeatBookingsModal({
  open,
  onClose,
  booking,
  blueprint,
  stylist,
  supabaseClient,
}) {
  const [repeatPattern, setRepeatPattern] = useState("weekly");
  const [repeatCount, setRepeatCount] = useState(6);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState(
    booking?.start ? asLocalDate(booking.start).getDate() : 1
  );

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const generateOccurrenceBase = (index) => {
    const base = blueprint?.baseStart ?? asLocalDate(booking.start);
    const h = blueprint?.baseHour ?? asLocalDate(booking.start).getHours();
    const m = blueprint?.baseMin ?? asLocalDate(booking.start).getMinutes();

    switch (repeatPattern) {
      case "weekly":
        return setHMS(addDays(base, 7 * (index + 1)), h, m);
      case "fortnightly":
        return setHMS(addDays(base, 14 * (index + 1)), h, m);
      case "monthly":
        return setHMS(addMonthsPreserveDay(base, index + 1), h, m);
      case "yearly":
        return setHMS(addYearsPreserveDay(base, index + 1), h, m);
      case "monthly_nth_day": {
        const nextMonth = addMonthsPreserveDay(
          base,
          index + 1,
          repeatDayOfMonth
        );
        return setHMS(nextMonth, h, m);
      }
      default:
        return setHMS(addDays(base, 7 * (index + 1)), h, m);
    }
  };

  const createRepeatSet = async () => {
    setErrorMsg("");

    if (!supabaseClient) {
      setErrorMsg("Not signed in. Please refresh and sign in again.");
      return;
    }
    if (!booking?.start) {
      setErrorMsg("Missing booking start time.");
      return;
    }
    if (!blueprint || !stylist) {
      setErrorMsg("Missing service blueprint or stylist.");
      return;
    }

    if (!Array.isArray(blueprint.items) || blueprint.items.length === 0) {
      setErrorMsg("No services found to repeat for this booking.");
      return;
    }
    setSaving(true);
    @@ -101,125 +101,151 @@ export default function RepeatBookingsModal({
    }
  };

  const createRepeatSet = async () => {
    setErrorMsg("");

    if (!supabaseClient) {
      setErrorMsg("Not signed in. Please refresh and sign in again.");
      return;
    }
    if (!booking?.start) {
      setErrorMsg("Missing booking start time.");
      return;
    }
    if (!blueprint || !stylist) {
      setErrorMsg("Missing service blueprint or stylist.");
      return;
    }

    if (!Array.isArray(blueprint.items) || blueprint.items.length === 0) {
      setErrorMsg("No services found to repeat for this booking.");
      return;
    }
    setSaving(true);

    const repeatSeriesId = booking?.repeat_series_id || uuidv4();
    const bookingGroupId = booking?.booking_id || null;
    const clientId = booking?.client_id || null;

    // Ensure the original booking rows are tagged with the same repeat series id
    if (bookingGroupId && !booking?.repeat_series_id) {
      try {
        await withTimeout(
          supabaseClient
            .from("bookings")
            .update({ repeat_series_id: repeatSeriesId })
            .eq("booking_id", bookingGroupId),
          "Update original booking repeat series id"
        );
      } catch (e) {
        console.warn(
          "[RepeatBookings] failed to tag original booking with repeat_series_id",
          e
        );
        // keep going; inserts below will still use repeatSeriesId
      }
    }


    const created = [];
    const skipped = [];
     const failed = [];

    try {
      const total = Math.max(1, parseInt(String(repeatCount), 10) || 0);


      for (let i = 0; i < total; i++) {
        const occBase = generateOccurrenceBase(i);

        // overlap check (start < newEnd AND end > newStart)
        let conflict = false;

        try {
          for (const item of blueprint.items || []) {
            const sStart = new Date(occBase.getTime() + item.offsetMin * 60000);
            const sEnd = new Date(sStart.getTime() + item.duration * 60000);

            const { data: overlaps, error: overlapErr } = await withTimeout(
              supabaseClient
                .from("bookings")
                .select("id")
                .eq("resource_id", booking.resource_id)
                .lt("start", toLocalSQL(sEnd))
                .gt("end", toLocalSQL(sStart)),
              "Check for conflicts"
            );

            if (overlapErr) throw overlapErr;

            if (overlaps?.length) {
              conflict = true;
              break;
            }
          }
        } catch (e) {
          failed.push({
            when: occBase,
            reason: e?.message || "Conflict check failed",
          });
          continue;
        }

        if (conflict) {
          skipped.push(occBase);
          continue;
        }

        // create rows
        const newBookingId = uuidv4();
        const rows = (blueprint.items || []).map((item) => {
          const sStart = new Date(occBase.getTime() + item.offsetMin * 60000);
          const sEnd = new Date(sStart.getTime() + item.duration * 60000);

          return {
            booking_id: newBookingId,
             repeat_series_id: repeatSeriesId,
            client_id: clientId,
            client_name: booking.client_name,
            resource_id: booking.resource_id,
            start: toLocalSQL(sStart),
            end: toLocalSQL(sEnd),
            title: item.title,
            price: item.price,
            duration: item.duration,
            category: item.category,
            status: "confirmed",
          };
        });
 try {
          const { data: inserted, error: insErr } = await withTimeout(
            supabaseClient.from("bookings").insert(rows).select("*"),
            "Create repeat bookings"
          );

        if (insErr) throw insErr;

      created.push({ when: occBase, rows: inserted });
        } catch (e) {
          failed.push({ when: occBase, reason: e?.message || "Insert failed" });
          continue;
        }

        // non-fatal logging
        try {
          const firstItem = blueprint.items?.[0];
          if (firstItem && rows[0]) {
            SaveBookingsLog({
  action: "created",
  booking_id: newBookingId,
  client_id: booking.client_id,
  client_name: booking.client_name,
  stylist_id: booking.resource_id,
  stylist_name: stylist?.title || stylist?.name || "Unknown",
  service: {
    name: firstItem.title,
    category: firstItem.category,
    price: firstItem.price,
    duration: firstItem.duration,
  },
  start: rows[0].start,
  end: rows[0].end,
  logged_by: null,
  reason: `Repeat Booking: ${patternLabel(repeatPattern, repeatDayOfMonth)}`,
  before_snapshot: null,
  after_snapshot: rows[0],
}).catch(() => {});

          }
        } catch (err) {
          /* non-fatal */
        }
      }

      onClose();

      const msg = [
        `${created.length} repeat ${
          created.length === 1 ? "booking" : "bookings"
        } created.`,
        skipped.length ? `${skipped.length} skipped due to conflicts.` : "",
         failed.length
          ? `${failed.length} not created due to errors: ${failed
              .map((f) => f.reason)
              .filter(Boolean)
              .join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      alert(msg || "Done.");

      window.dispatchEvent(
        new CustomEvent("bookings:changed", {
          detail: { type: "repeat-created" },
        })
      );
    } catch (e) {
      console.error("Repeat booking failed:", e?.message || e);
      setErrorMsg(
        e?.message || "Failed to create repeat bookings. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40"
      style={{ zIndex: 5000 }}
    >
      <div className="bg-white rounded-lg p-4 w-[95vw] h-[90vh] sm:w-[80vw] sm:h-[80vh] lg:w-[60vw] lg:h-[60vh] overflow-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Repeat bookings
        </h3>

        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm text-gray-700">
            Pattern
            <select
              className="block w-full border rounded px-2 py-1 mt-1"
              value={repeatPattern}
              onChange={(e) => setRepeatPattern(e.target.value)}
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly (same date)</option>
              <option value="monthly_nth_day">Monthly (choose day)</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>

          {repeatPattern === "monthly_nth_day" && (
            <label className="text-sm text-gray-700">
              Day of month (1–31)
              <input
                type="number"
                min={1}
                max={31}
                className="block w-full border rounded px-2 py-1 mt-1"
                value={repeatDayOfMonth}
                onChange={(e) =>
                  setRepeatDayOfMonth(
                    Math.max(1, Math.min(31, Number(e.target.value) || 1))
                  )
                }
              />
            </label>
          )}

          <label className="text-sm text-gray-700">
            Number of future occurrences
            <input
              type="number"
              min={1}
              max={52}
              className="block w-full border rounded px-2 py-1 mt-1"
              value={repeatCount}
              onChange={(e) =>
                setRepeatCount(
                  Math.max(1, Math.min(52, Number(e.target.value) || 1))
                )
              }
            />
          </label>

          {blueprint && booking?.start && (
            <p className="text-xs text-gray-600">
              First new booking will be on{" "}
              <b>{format(generateOccurrenceBase(0), "eee dd MMM yyyy, HH:mm")}</b>
            </p>
          )}
        </div>

        {errorMsg && <p className="text-sm text-red-600 mt-2">{errorMsg}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            Cancel
          </Button>

          <Button
            onClick={createRepeatSet}
            disabled={saving}
            className="bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
