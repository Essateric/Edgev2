// src/onlinebookings/config.js
import edgeLogo from "../assets/EdgeLogo.png";

export const MIN_NOTICE_HOURS = 24;

export const LOGO_SRC = edgeLogo || "/edge-logo.png";

export const BUSINESS = {
  name: "The Edge HD Salon",
  address: "9 Claremont Road, Sale, M33 7DZ",
  timezone: "Europe/London",
  logoSrc: LOGO_SRC,
  notifyEmail: "edgehd.salon@gmail.com",
};
