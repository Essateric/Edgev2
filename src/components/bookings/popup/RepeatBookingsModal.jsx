import React, { useState, useEffect, useMemo, useRef } from "react";

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

function patternLabel(pattern, dayOfMonth) {
  switch (pattern) {
    case "weekly": return "Weekly";
    case "fortnightly": return "Fortnightly";
    case "monthly": return "Monthly";
    case "yearly": return "Yearly";
    case "monthly_nth_day": return `Monthly (day ${dayOfMonth})`;
    default: return pattern;
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
  const [repeatPattern, setRepeatPattern] = React.useState("weekly");
  const [repeatCount, setRepeatCount] = React.useState(6);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = React.useState(
    booking?.start ? asLocalDate(booking.start).getDate() : 1
  );

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
        const nextMonth = addMonthsPreserveDay(base, index + 1, repeatDayOfMonth);
        return setHMS(nextMonth, h, m);
      }
      default:
        return setHMS(addDays(base, 7 * (index + 1)), h, m);
    }
  };

  const createRepeatSet = async () => {
    if (!blueprint || !stylist) {
      alert("Missing service blueprint or stylist.");
      return;
    }
    const created = [];
    const skipped = [];

    for (let i = 0; i < Math.max(1, Number(repeatCount) || 0); i++) {
      const occBase = generateOccurrenceBase(i);

      // overlap check (start < newEnd AND end > newStart)
      let conflict = false;
      for (const item of blueprint.items) {
        const sStart = new Date(occBase.getTime() + item.offsetMin * 60000);
        const sEnd = new Date(sStart.getTime() + item.duration * 60000);
        const { data: overlaps, error: overlapErr } = await supabaseClient
          .from("bookings")
          .select("id")
          .eq("resource_id", booking.resource_id)
          .lt("start", toLocalSQL(sEnd))
          .gt("end", toLocalSQL(sStart));
        if (overlapErr || overlaps?.length) {
          conflict = true;
          break;
        }
      }
      if (conflict) {
        skipped.push(occBase);
        continue;
      }

      // create rows
      const newBookingId = uuidv4();
      const rows = blueprint.items.map((item) => {
        const sStart = new Date(occBase.getTime() + item.offsetMin * 60000);
        const sEnd = new Date(sStart.getTime() + item.duration * 60000);
        return {
          booking_id: newBookingId,
          client_id: booking.client_id,
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

      const { data: inserted, error: insErr } = await supabaseClient
        .from("bookings")
        .insert(rows)
        .select("*");

      if (insErr) {
        skipped.push(occBase);
        continue;
      }
      created.push({ when: occBase, rows: inserted });

      try {
        const firstItem = blueprint.items[0];
        await SaveBookingsLog({
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
        });
      } catch { /* non-fatal */ }
    }

    onClose();
    const msg = [
      `${created.length} repeat ${created.length === 1 ? "booking" : "bookings"} created.`,
      skipped.length ? `${skipped.length} skipped due to conflicts.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    alert(msg || "Done.");
    window.dispatchEvent(new CustomEvent("bookings:changed", {
      detail: { type: "repeat-created" },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg p-4 w-[95vw] h-[90vh] sm:w-[80vw] sm:h-[80vh] lg:w-[60vw] lg:h-[60vh] overflow-auto">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Repeat bookings</h3>

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
                setRepeatCount(Math.max(1, Math.min(52, Number(e.target.value) || 1)))
              }
            />
          </label>

          {blueprint && (
            <p className="text-xs text-gray-600">
              First new booking will be on{" "}
              <b>{format(generateOccurrenceBase(0), "eee dd MMM yyyy, HH:mm")}</b>
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={onClose} className="bg-gray-200 text-gray-800">
            Cancel
          </Button>
          <Button onClick={createRepeatSet} className="bg-purple-600 text-white hover:bg-purple-700">
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}
