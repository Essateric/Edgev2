const { data: staffList, error } = await supabase.from('staff').select('*');
if (error || !staffList) {
  console.error("❌ Error fetching staff list:", error);
  return null;
}

console.log("👥 Staff count:", staffList.length);

for (const staff of staffList) {
  console.log("Checking:", staff.name);
  const isMatch = await bcrypt.compare(pin, staff.pin_hash);
  if (isMatch) {
    console.log("✅ Matched with", staff.name);
    return staff;
  }
}

console.warn("❌ No match found for PIN:", pin);
return null;
