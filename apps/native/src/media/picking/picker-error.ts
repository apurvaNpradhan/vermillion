/** Camera access needs Settings guidance rather than a retry. */
export class CameraDeniedError extends Error {
  constructor() {
    super("The camera permission was refused");
    this.name = "CameraDeniedError";
  }
}
export function pickerErrorKey(error: Error) {
  return error instanceof CameraDeniedError ? "body__camera_denied" : "media__save_failed";
}
