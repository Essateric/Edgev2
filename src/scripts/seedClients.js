// Delay between batches (ms)
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Bulk seed clients with Firestore batching + throttle
 * @param {Array} clientSeedData - Array of client objects
 */
export async function seedClients(clientSeedData, batchSize = 100, throttleDelay = 1500) {
  const ref = collection(db, "clients");
  let added = 0;
  const total = clientSeedData.length;

  for (let i = 0; i < total; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = clientSeedData.slice(i, i + batchSize);

    for (const client of chunk) {
      const exists = await getDocs(query(ref, where("email", "==", client.email)));
      if (!exists.empty) continue;

      const newDoc = doc(ref);
      batch.set(newDoc, client);
      added++;
    }

    await batch.commit();
    console.log(`✅ Uploaded batch ${i / batchSize + 1}`);
    await wait(throttleDelay);
  }

  console.log(`🎉 All done! Total clients added: ${added}`);
}
