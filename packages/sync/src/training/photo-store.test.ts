import { describe, expect, it } from "vitest";
import { setupSessions } from "./session-fixtures";
import { startSession } from "./session-store";
import { addSessionPhoto, moveSessionPhoto, removeSessionPhoto } from "./photo-store";
const image = { width: 512, height: 512, bytes: 1000, thumbBytes: 100 };
describe("Session photos", () => {
  it("limits a Session to four, reorders photos, and deletes their media atomically", async () => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle: "Photos" });
    for (let i = 0; i < 4; i++) await addSessionPhoto(s.training, id, image, s.installId);
    await expect(addSessionPhoto(s.training, id, image)).rejects.toThrow("limit");
    expect(s.all("media")).toHaveLength(4);
    const [row] = s.all("session_photo");
    const photo = String(row?.id);
    await moveSessionPhoto(s.training, id, photo, -1, s.installId);
    expect(s.one("session_photo", photo)).toMatchObject({ position: -1 });
    await removeSessionPhoto(s.training, photo, s.installId);
    expect(s.all("media")).toHaveLength(3);
    expect(s.all("session_photo")).toHaveLength(3);
    await expect(addSessionPhoto(s.training, id, image, "stale")).rejects.toThrow(
      "device account changed",
    );
    await expect(addSessionPhoto(s.training, "missing", image)).rejects.toThrow(
      "Session not found",
    );
    expect(s.all("media")).toHaveLength(3);
  });
});
