import type { SessionDetail } from "@workspace/sync";

import { nudged, restKey } from "./optimistic";

type Rest = SessionDetail["rest"];
type Saved = Pick<NonNullable<Rest>, "startedAt" | "endsAt"> | null;

/** Owns the immediate target while one burst is saved and the database watch catches up. */
export class RestNudges {
  // undefined follows the watch; null previews an ended rest.
  private target: Rest | undefined;
  private base: Rest = null;
  private delta = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<void> | undefined;

  constructor(
    private save: (delta: number) => Promise<{ rest: Saved } | null>,
    private show: (rest: Rest | undefined) => void,
  ) {}

  observe(rest: Rest) {
    if (!this.saving && this.delta === 0 && restKey(rest) === restKey(this.target ?? null)) {
      this.target = undefined;
      this.show(undefined);
    }
  }

  add(rest: Rest, delta: number, now: number) {
    if (this.target === undefined) {
      this.base = rest;
      this.target = rest;
    }
    const next = nudged(this.target, delta, now);
    if (!this.target) return;
    this.delta += ((next ? Date.parse(next.endsAt) : now) - Date.parse(this.target.endsAt)) / 1000;
    this.target = next;
    this.show(next);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 500);
    // Ending a rest has always been immediate.
    if (!next) void this.flush();
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.saving) {
      await this.saving;
      return this.flush();
    }
    const delta = this.delta;
    if (delta === 0) return;
    this.delta = 0;
    const base = this.base;
    const commit = async () => {
      const saved = await this.save(delta);
      this.base = saved ? (saved.rest && base ? { ...base, ...saved.rest } : null) : base;
      if (!saved) {
        this.target = this.delta === 0 ? this.base : nudged(this.base, this.delta, Date.now());
        this.show(this.target);
      } else if (this.delta === 0) {
        this.target = this.base;
        this.show(this.target);
      }
    };
    this.saving = commit();
    try {
      await this.saving;
    } finally {
      this.saving = undefined;
    }
  }

  /** Flush before a different action replaces or clears this rest. */
  async release() {
    await this.flush();
    this.target = undefined;
    this.show(undefined);
  }
}
