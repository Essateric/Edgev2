import bcrypt from "bcryptjs";

const test = async () => {
  const plainPin = "1234";
  const hash = "$2b$10$LYb5oZzgjdvVVQmD41gbUOLOs/YUGwHkbT2MIu3X4WqWoTOe9TrHS";

  const match = await bcrypt.compare(plainPin, hash);
  console.log("Matched?", match); // should log: true
};

test();
