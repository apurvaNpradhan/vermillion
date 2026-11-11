import { describe, expect, it } from "vitest";

import {
  REST_CHANNEL_SILENT,
  REST_CHANNEL_WITH_SOUND,
  REST_SOUND_FILE,
  RETIRED_REST_CHANNELS,
  restChannelId,
  restNotificationSound,
  shouldChimeInForeground,
} from "./rest-sound";

describe("rest sound", () => {
  it("picks the sound channel only when the sound is on", () => {
    expect(restChannelId(true)).toBe(REST_CHANNEL_WITH_SOUND);
    expect(restChannelId(false)).toBe(REST_CHANNEL_SILENT);
    expect(REST_CHANNEL_WITH_SOUND).not.toBe(REST_CHANNEL_SILENT);
  });
  it("never reuses a retired channel id", () => {
    expect(RETIRED_REST_CHANNELS).not.toContain(REST_CHANNEL_WITH_SOUND);
    expect(RETIRED_REST_CHANNELS).not.toContain(REST_CHANNEL_SILENT);
  });
  it("gives the notification the chime file, or no sound", () => {
    expect(restNotificationSound(true)).toBe(REST_SOUND_FILE);
    expect(restNotificationSound(false)).toBe(false);
  });
  it("chimes a foreground notification only away from the logging screen", () => {
    expect(shouldChimeInForeground({ soundOn: true, surfaceVisible: false })).toBe(true);
    expect(shouldChimeInForeground({ soundOn: true, surfaceVisible: true })).toBe(false);
    expect(shouldChimeInForeground({ soundOn: false, surfaceVisible: false })).toBe(false);
  });
});
