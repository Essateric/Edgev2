const bcrypt = require("bcryptjs");

const test = async () => {
  const match = await bcrypt.compare("1234", "$2b$10$LYb5oZzgjdvVVQmD41gbUOLOs/YUGwHkbT2MIu3X4WqWoTOe9TrHS");
  console.log("Matched?", match);
};

test();
