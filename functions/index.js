const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.verifyPinLogin = functions.https.onCall(async (data, context) => {
  // Debugging the raw PIN value received in the request
  console.log("🔥 Function Called: verifyPinLogin");

  // Only log the specific fields we need, avoiding circular structures.
  console.log("📦 Received data (PIN):", data?.data?.pin);

  const enteredPin = data?.data?.pin;  // Correct reference to get pin

  // Debugging the PIN value received in the request
  console.log("🔐 Received PIN:", enteredPin);

  if (!enteredPin) {
    throw new functions.https.HttpsError("invalid-argument", "PIN is required");
  }

  // Query Firestore to match the pin
  const snapshot = await db.collection("staff")
    .where("pin", "==", enteredPin)
    .limit(1)
    .get();

  // If no matching pin, throw an error
  if (snapshot.empty) {
    throw new functions.https.HttpsError("not-found", "Invalid PIN");
  }

  // Extract staff data from Firestore document
  const staffDoc = snapshot.docs[0];
  const staffData = staffDoc.data();
  const uid = staffDoc.id;

  // Attempt to get the user from Firebase Authentication, or create the user if not found
  try {
    await admin.auth().getUser(uid);
  } catch {
    await admin.auth().createUser({
      uid,
      displayName: staffData.name || "Staff",
      email: staffData.email || `${uid}@placeholder.com`,
    });
  }

  // Set custom user claims (role) in Firebase Auth
  await admin.auth().setCustomUserClaims(uid, {
    role: staffData.role || "staff",
  });

  // Generate a custom Firebase Auth token for the user
  const token = await admin.auth().createCustomToken(uid);

  return {
    token,
    uid,
    name: staffData.name,
    role: staffData.role,
  };
});
