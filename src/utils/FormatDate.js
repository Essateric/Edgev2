// utils/formatDate.js
export const formatDayMonth = (dateStr) => {
  return dateStr ? format(new Date(dateStr), "dd MMM") : "N/A";
};
