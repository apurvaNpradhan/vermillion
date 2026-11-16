import { expect, it } from "vitest";
import { CameraDeniedError, pickerErrorKey } from "./picker-error";

it("offers permission guidance for camera denial, and retry for other picker failures", () => {
  expect(pickerErrorKey(new CameraDeniedError())).toBe("body__camera_denied");
  expect(pickerErrorKey(new Error("File operation failed"))).toBe("media__save_failed");
});
