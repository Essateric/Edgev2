import { format } from "date-fns";
import { asLocalDate } from "../../../lib/dates";
import { formatGBP } from "../../../lib/money";

export default function ServicesList({
  displayServices,
  serviceTotal,
  getStylistName,
}) {
  return (
    <div className="mt-4 px-2 flex-1 overflow-auto">
      <p className="text-md font-semibold text-gray-800 mb-1">Services</p>

      {!displayServices?.length ? (
        <p className="text-sm text-gray-500 italic">No services found.</p>
      ) : (
        <div className="space-y-1">
           <div className="grid grid-cols-[80px_minmax(0,1fr)_160px_90px] gap-2 text-xs font-semibold text-gray-500 border-b pb-1">
            <span>Time</span>
            <span>Service</span>
            <span>Stylist</span>
            <span className="text-right">Price</span>
          </div>
          {displayServices.map((service, index) => {
            const startTime = asLocalDate(service.start);
            const formattedTime = !isNaN(startTime) ? format(startTime, "HH:mm") : "--:--";
              const stylistName =
              typeof getStylistName === "function"
                ? getStylistName(service.resource_id)
                : "—";
            return (
              <div key={index} className="flex flex-col text-sm text-gray-700 border-b py-1">
               <div className="grid grid-cols-[80px_minmax(0,1fr)_160px_90px] gap-2 items-center">
                  <span>{formattedTime}</span>
                  <span className="font-medium">
                    {service.category || "Uncategorised"}: {service.title || ""}
                  </span>
                <span className="text-gray-600">{stylistName}</span>
                  <span className="text-right">{formatGBP(service.price)}</span>
                </div>
                {service.notes && (
                  <div className="text-xs text-gray-500 italic mt-1">
                    Notes: {service.notes}
                  </div>
                )}
              </div>
            );
          })}
          <div className="grid grid-cols-[80px_minmax(0,1fr)_160px_90px] gap-2 items-center pt-2 border-t mt-2 text-sm text-gray-800">
            <span className="col-span-3 text-right font-semibold">Total</span>
            <span className="text-right font-semibold text-gray-900">
              {formatGBP(serviceTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
