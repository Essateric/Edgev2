// src/utils/OfflineLogin.jsx
import { getStaffPins } from './pinCache';

// Used when offline to check local cached PINs
export async function tryOfflineLogin(enteredPin) {
  try {
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
  } catch (error) {
    return { success: false, error: 'Offline PIN lookup failed' };
  }
}
