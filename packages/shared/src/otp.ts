/** One-time sign-in codes: the server issues them, the email copy and the clients read these. */
export const OTP_LENGTH = 6;
/** How long a code works, in seconds. The email says it in minutes. */
export const OTP_EXPIRY_SECONDS = 5 * 60;
/** Wrong guesses allowed before the code is burned. */
export const OTP_ALLOWED_ATTEMPTS = 3;
/** Seconds a client waits before offering "send a new code". */
export const OTP_RESEND_SECONDS = 60;
