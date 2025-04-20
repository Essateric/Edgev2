import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase"; // Adjust if needed
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function ManageServices({ staffId }) {
  const [serviceList, setServiceList] = useState([
    { id: "1", name: "Haircut" },
    { id: "2", name: "Color" },
    { id: "3", name: "Blow Dry" },
  ]);
  const [newServiceName, setNewServiceName] = useState("");
  const [firebaseServices, setFirebaseServices] = useState([]);
  const [customData, setCustomData] = useState({});
  const [saving, setSaving] = useState(false);

  function handleAddService() {
    if (!newServiceName.trim()) return;
    const newService = { id: Date.now().toString(), name: newServiceName };
    setServiceList(prev => [...prev, newService]);
    setNewServiceName("");
  }

  useEffect(() => {
    const fetchServices = async () => {
      const querySnapshot = await getDocs(collection(db, "services"));
      const services = [];
      querySnapshot.forEach((doc) => {
        services.push({ id: doc.id, ...doc.data() });
      });
      setFirebaseServices(services);
    };
    fetchServices();
  }, []);

  const handleDurationChange = (serviceId, duration, basePrice) => {
    const durationNum = Number(duration);
    const price =
      durationNum < 90
        ? Math.round(basePrice * 1.2)
        : durationNum > 90
        ? Math.round(basePrice * 0.85)
        : basePrice;

    setCustomData((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        duration: durationNum,
        price: prev[serviceId]?.manual ? prev[serviceId].price : price,
        manual: false,
      },
    }));
  };

  const handleManualPriceChange = (serviceId, price) => {
    setCustomData((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        price: Number(price),
        manual: true,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const updates = Object.entries(customData);
    for (const [serviceId, { duration, price }] of updates) {
      const ref = doc(db, "services", serviceId);
      await updateDoc(ref, {
        [`pricing.${staffId}`]: { duration, price },
      });
    }
    setSaving(false);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-chrome mb-4">Manage Services</h1>

      <Card className="mb-4">
        <h2 className="text-lg text-bronze font-semibold mb-2">Add New Service</h2>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            placeholder="Service Name"
            className="rounded p-2 flex-1"
          />
          <Button onClick={handleAddService}>Add</Button>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-2 text-bronze">Current Services</h2>
        <ul className="list-disc pl-6 text-bronze">
          {serviceList.map((service) => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2 text-bronze">Assign Staff-Specific Pricing</h2>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto ">
          {firebaseServices.map((service) => {
            const base = service.basePrice;
            const selected = customData[service.id] || {};
            return (
              <div
                key={service.id}
                className="bg-gray-100 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <h3 className="text-bronze font-semibold">{service.name}</h3>
                  <p className="text-sm text-gray-500">
                    Base: £{base} | {service.baseDuration} mins
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <label className="text-sm text-gray-600">Custom Duration</label>
                    <input
                      type="number"
                      className="border p-1 rounded w-20"
                      value={selected.duration || ""}
                      onChange={(e) =>
                        handleDurationChange(service.id, e.target.value, base)
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-600">Custom Price</label>
                    <input
                      type="number"
                      className="border p-1 rounded w-20"
                      value={selected.price || ""}
                      onChange={(e) =>
                        handleManualPriceChange(service.id, e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-white py-4 mt-6 border-t flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-pink-600 text-white px-4 py-2 rounded-lg shadow hover:bg-pink-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </Card>
    </div>
  );
}
