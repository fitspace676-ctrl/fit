/** Sender accepts nine-digit Georgian mobile numbers only. */
export function normalizeGeorgianMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let phone = input.trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('+995')) phone = phone.slice(4);
  else if (phone.startsWith('995')) phone = phone.slice(3);
  else if (phone.startsWith('0')) phone = phone.slice(1);
  return /^5\d{8}$/.test(phone) ? phone : null;
}
