import { format } from "date-fns";
import { asLocalDate } from "../../../lib/dates";
import { formatGBP } from "../../../lib/money";

export default function ServicesList({ displayServices, serviceTotal }) {
  return (
    <div className="mt-4 px-2 flex-1 overflow-auto">
      <p className="text-md font-semibold text-gray-800 mb-1">Services</p>

      {!displayServices?.length ? (
        <p className="text-sm text-gray-500 italic">No services found.</p>
      ) : (
        <div className="space-y-1">
          {displayServices.map((service, index) => {
            const startTime = asLocalDate(service.start);
            const formattedTime = !isNaN(startTime) ? format(startTime, "HH:mm") : "--:--";
            return (
              <div key={index} className="flex flex-col text-sm text-gray-700 border-b py-1">
                <div className="flex justify-between items-center">
                  <span className="w-1/4">{formattedTime}</span>
                  <span className="w-2/4 font-medium">
                    {service.category || "Uncategorised"}: {service.title || ""}
                  </span>
                  <span className="w-1/4 text-right">{formatGBP(service.price)}</span>
                </div>
                {service.notes && (
                  <div className="text-xs text-gray-500 italic mt-1">
                    Notes: {service.notes}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex justify-between items-center pt-2 border-t mt-2 text-sm text-gray-800">
            <span className="w-3/4 text-right font-semibold">Total</span>
            <span className="w-1/4 text-right font-semibold text-gray-900">
              {formatGBP(serviceTotal)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
