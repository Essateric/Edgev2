import React, { createContext, useContext, useState } from "react";

const BookingContext = createContext();

export function useBooking() {
  return useContext(BookingContext);
}

export function BookingProvider({ children }) {
  const [bookings, setBookings] = useState([]);

  function addBooking(newBooking) {
    setBookings(prev => [...prev, newBooking]);
  }

  function updateBooking(updatedBooking) {
    setBookings(prev =>
      prev.map(b => (b.id === updatedBooking.id ? updatedBooking : b))
    );
  }

  function deleteBooking(id) {
    setBookings(prev => prev.filter(b => b.id !== id));
  }

  const value = {
    bookings,
    addBooking,
    updateBooking,
    deleteBooking,
  };

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
}
