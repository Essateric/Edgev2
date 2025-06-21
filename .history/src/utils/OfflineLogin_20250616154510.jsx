import { getStaffPins } from './pinCache';

export async function tryOfflineLogin(enteredPin) {
  const cachedStaff = await getStaffPins();

  const match = cachedStaff.find((staff) => staff.pin === enteredPin);
  if (match) {
    return {
      success: true,
      user: {
        id: match.id,
        name: match.name,
        role: match.role,
        offline: true,
      },
    };
  }

  return { success: false, error: 'Invalid PIN (offline)' };
}
