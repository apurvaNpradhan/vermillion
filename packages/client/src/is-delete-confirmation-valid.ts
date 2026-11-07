/** The typed text matches the account email, ignoring case and surrounding spaces. */
export function isDeleteConfirmationValid(typed: string, email: string | undefined): boolean {
  return Boolean(email) && typed.trim().toLowerCase() === email?.toLowerCase();
}
