import React, { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import toast from "react-hot-toast";

export default function ManageServices({ staffId }) {
  const [firebaseServices, setFirebaseServices] = useState([]);
  const [customData, setCustomData] = useState({});
  const [saving, setSaving] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newCategory, setNewCategory] = useState("Uncategorized");
  const [newBasePrice, setNewBasePrice] = useState(0);
  const [newBaseDuration, setNewBaseDuration] = useState(30);
  const [openCategories, setOpenCategories] = useState({});
  const [selectedService, setSelectedService] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [staffList, setStaffList] = useState([]);

  const categories = [
    "Cut and Finish",
    "Highlights",
    "Tints",
    "Blow Dry",
    "Gents",
    "Children",
    "Uncategorized",
  ];

  const fetchServices = async () => {
    const querySnapshot = await getDocs(collection(db, "services"));
    const services = [];
    querySnapshot.forEach((doc) => {
      services.push({ id: doc.id, ...doc.data() });
    });
    setFirebaseServices(services);
  };

  const fetchStaff = async () => {
    const querySnapshot = await getDocs(collection(db, "staff"));
    const staff = [];
    querySnapshot.forEach((doc) => {
      staff.push({ id: doc.id, ...doc.data() });
    });
    setStaffList(staff);
  };

  useEffect(() => {
    fetchServices();
    fetchStaff();
  }, []);

  const handleAddService = async () => {
    if (!newServiceName.trim()) {
      toast.error("Service name is required");
      return;
    }

    const newService = {
      name: newServiceName,
      category: newCategory,
      basePrice: Number(newBasePrice),
      baseDuration: Number(newBaseDuration),
      pricing: {},
    };

    try {
      await addDoc(collection(db, "services"), newService);
      toast.success("Service added successfully");
      setNewServiceName("");
      setNewCategory("Uncategorized");
      setNewBasePrice(0);
      setNewBaseDuration(30);
      await fetchServices();
    } catch (error) {
      toast.error("Failed to add service");
      console.error(error);
    }
  };

  const handleStylistChange = (stylistId, field, value) => {
    setSelectedService((prev) => {
      const existing = prev.pricing?.[stylistId] || {
        basePrice: 0,
        duration: { hours: 0, minutes: 0 },
      };

      const updated =
        field === "duration"
          ? {
              ...existing,
              duration: { ...existing.duration, ...value },
            }
          : {
              ...existing,
              [field]: Number(value),
            };

      return {
        ...prev,
        pricing: {
          ...prev.pricing,
          [stylistId]: updated,
        },
      };
    });
  };

  const handleSaveStylist = async () => {
    if (!selectedService?.id) return;
  
    const cleanedPricing = {};
  
    for (const [staffId, pricing] of Object.entries(selectedService.pricing || {})) {
      if (!pricing) continue;
  
      // Convert old format to new
      if (typeof pricing.duration === "number" && pricing.price != null) {
        const hours = Math.floor(pricing.duration / 60);
        const minutes = pricing.duration % 60;
  
        cleanedPricing[staffId] = {
          basePrice: pricing.price,
          duration: { hours, minutes },
        };
      } else {
        // Use new format if already correct
        cleanedPricing[staffId] = {
          basePrice: pricing.basePrice ?? 0,
          duration: {
            hours: pricing.duration?.hours ?? 0,
            minutes: pricing.duration?.minutes ?? 0,
          },
        };
      }
    }
  
    try {
      const ref = doc(db, "services", selectedService.id);
      await updateDoc(ref, { pricing: cleanedPricing });
      toast.success("Stylist pricing saved!");
      setShowModal(false);
      fetchServices();
    } catch (err) {
      console.error("Error saving stylist pricing:", err);
      toast.error("Failed to save");
    }
  };
  
  const handleDeleteStylist = (stylistId) => {
    const updated = { ...selectedService.pricing };
    delete updated[stylistId];
    setSelectedService((prev) => ({
      ...prev,
      pricing: updated,
    }));
  };

  const groupedServices = firebaseServices.reduce((acc, service) => {
    const cat = service.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(service);
    return acc;
  }, {});

  const handleServiceClick = (service) => {
    setSelectedService(service);
    setShowModal(true);
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-chrome mb-4">Manage Services</h1>

      {/* Add Service */}
      <Card className="mb-4">
        <h2 className="text-lg text-bronze font-semibold mb-3">Add New Service</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Service Name</label>
            <input
              type="text"
              placeholder="Service Name"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Select Category</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Base Price (£)</label>
            <input
              type="number"
              placeholder="Base Price (£)"
              value={newBasePrice}
              onChange={(e) => setNewBasePrice(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-700 mb-1">Base Duration (mins)</label>
            <input
              type="number"
              placeholder="Base Duration (mins)"
              value={newBaseDuration}
              onChange={(e) => setNewBaseDuration(e.target.value)}
              className="w-full border-2 border-gray-500 rounded p-2 text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#cd7f32]"
            />
          </div>
        </div>
        <Button
          onClick={handleAddService}
          className="bg-[#cd7f32] text-white hover:bg-[#b36c2c]"
        >
          Add Service
        </Button>
      </Card>

      {/* Grouped Services */}
      <Card className="mb-4">
        <h2 className="text-lg font-semibold mb-4 text-bronze">Current Services</h2>
        {Object.entries(groupedServices).map(([category, services]) => (
          <div key={category} className="mb-4 border border-gray-200  placeholder:rounded-lg">
            <button
              onClick={() =>
                setOpenCategories((prev) => ({
                  ...prev,
                  [category]: !prev[category],
                }))
              }
              className="w-full text-left px-4 py-3 font-semibold text-chrome bg-bronze hover:text-white hover:bg-amber-600 rounded-t-md"
            >
              {category}
              <span className="float-right text-gray-400">
                {openCategories[category] ? "−" : "+"}
              </span>
            </button>

            <div
              className={`transition-all duration-300 overflow-hidden ${
                openCategories[category] ? "max-h-[1000px] p-4" : "max-h-0 p-0"
              }`}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => handleServiceClick(service)}
                    className="bg-white text-left border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition"
                  >
                    <p className="text-sm text-bronze font-medium">{service.name}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* Modal */}
      {showModal && selectedService && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-semibold text-chrome mb-4">
              {selectedService.name} — Stylist Pricing
            </h3>
            <div className="space-y-4">
              {staffList
                .filter((stylist) =>
                  Array.isArray(stylist.services)
                    ? stylist.services.some((s) => s.id === selectedService.id)
                    : false
                )
                .map((stylist) => {
                  const current = selectedService?.pricing?.[stylist.id] || {
                    basePrice: 0,
                    duration: { hours: 0, minutes: 0 },
                  };

                  return (
                    <div
                      key={stylist.id}
                      className="text-gray-700 border p-4 rounded-lg bg-gray-50 grid grid-cols-4 gap-4 items-center"
                    >
                      <p className="text-sm font-semibold text-bronze">{stylist.name}</p>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-700 mb-1">Base Price (£)</label>
                        <input
                          type="number"
                          value={current.basePrice}
                          onChange={(e) =>
                            handleStylistChange(stylist.id, "basePrice", e.target.value)
                          }
                          placeholder="Price"
                          className="border rounded p-1 w-full"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-700 mb-1">Hours</label>
                        <input
                          type="number"
                          value={current.duration?.hours ?? 0}
                          onChange={(e) =>
                            handleStylistChange(stylist.id, "duration", {
                              hours: Number(e.target.value),
                            })
                          }
                          placeholder="Hours"
                          className="border rounded p-1 w-full"
                        />
                      </div>
                      <div className="flex flex-col">
                        <label className="text-xs text-gray-700 mb-1">Minutes</label>
                        <input
                          type="number"
                          value={current.duration?.minutes ?? 0}
                          onChange={(e) =>
                            handleStylistChange(stylist.id, "duration", {
                              minutes: Number(e.target.value),
                            })
                          }
                          placeholder="Minutes"
                          className="border rounded p-1 w-full"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
            <div className="flex justify-end mt-6 gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-400 text-white px-4 py-2 rounded-lg shadow hover:bg-gray-500"
              >
                Cancel
              </button>
              <Button
                onClick={handleSaveStylist}
                className="bg-[#cd7f32] text-white"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}