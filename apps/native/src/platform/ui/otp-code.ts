/** Default number of cells in a one-time code. */
export const OTP_LENGTH = 6;

/**
 * Reduces whatever the keyboard, autofill or a paste delivered to the digits a code can hold:
 * everything that is not 0-9 is dropped (so "123 456" and "123-456" paste cleanly), then the
 * result is cut to `length`. The hidden input has no `maxLength` on purpose: a native cap would
 * truncate "123 456" to "123 45" before this runs.
 */
export function sanitizeOtp(raw: string, length: number = OTP_LENGTH): string {
  return raw.replace(/\D/g, "").slice(0, Math.max(length, 0));
}

/** Whether `code` fills every cell. */
export function isOtpComplete(code: string, length: number = OTP_LENGTH): boolean {
  return length > 0 && code.length === length;
}

/** The cell that receives the next digit; the last cell once the code is full. */
export function activeOtpCell(code: string, length: number = OTP_LENGTH): number {
  return Math.min(code.length, Math.max(length - 1, 0));
}

/** Whether a divider belongs before cell `index` when cells are grouped (3-3 for a 6-digit code). */
export function startsOtpGroup(index: number, groupSize: number | undefined): boolean {
  return groupSize !== undefined && groupSize > 0 && index > 0 && index % groupSize === 0;
}
