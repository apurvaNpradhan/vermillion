import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import {
  PHOTO_PAGE_SIZE,
  POSE_DATES_SQL,
  POSE_SUMMARY_SQL,
  parsePoseDates,
  parsePoseSummaries,
  progressPhotosSql,
} from "./photo-watch";

function setup() {
  const fake = createFakeDatabase();
  const insert = fake.sqlite.prepare(
    `INSERT INTO progress_photo (id, user_id, media_id, pose, taken_at, local_date, created_at)
     VALUES (?, 'owner', ?, ?, ?, ?, 'now')`,
  );
  let n = 0;
  const add = (pose: string, date: string) =>
    insert.run(`p${n}`, `m${n++}`, pose, `${date}T08:00:00Z`, date);
  return { ...fake, add };
}

describe("progress photo watches", () => {
  it("pages the gallery newest first and never cuts off the oldest photo from the table", () => {
    const s = setup();
    // 120 days of front photos: more than a page.
    for (let day = 1; day <= 120; day++) {
      const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
      s.add("front", date);
    }
    const page = s.sqlite.prepare(progressPhotosSql(false, PHOTO_PAGE_SIZE)).all();
    expect(page).toHaveLength(PHOTO_PAGE_SIZE);
    const bigger = s.sqlite.prepare(progressPhotosSql(false, PHOTO_PAGE_SIZE * 2)).all();
    expect(bigger).toHaveLength(120);
    expect((bigger.at(-1) as { local_date: string }).local_date).toBe("2026-01-01");
  });

  it("can read beyond the old 500-photo cutoff", () => {
    const s = setup();
    for (let n = 0; n < 610; n++) s.add("front", "2026-01-01");
    expect(s.sqlite.prepare(progressPhotosSql(false, 631)).all()).toHaveLength(610);
    expect(parsePoseSummaries(s.sqlite.prepare(POSE_SUMMARY_SQL).all())).toEqual([
      { pose: "front", first: "2026-01-01", last: "2026-01-01", dates: 1 },
    ]);
  });

  it("filters the gallery by pose", () => {
    const s = setup();
    s.add("front", "2026-01-01");
    s.add("side", "2026-01-01");
    expect(s.sqlite.prepare(progressPhotosSql(true, 10)).all("side")).toHaveLength(1);
  });

  it("reports the first and last date of each pose from the table, past any page", () => {
    const s = setup();
    for (let day = 1; day <= 120; day++) {
      s.add("front", new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10));
    }
    s.add("front", "2026-01-03");
    s.add("side", "2026-02-01");
    const summaries = parsePoseSummaries(s.sqlite.prepare(POSE_SUMMARY_SQL).all());
    expect(summaries).toEqual(
      expect.arrayContaining([
        { pose: "front", first: "2026-01-01", last: "2026-04-30", dates: 120 },
        { pose: "side", first: "2026-02-01", last: "2026-02-01", dates: 1 },
      ]),
    );
  });

  it("lists each date of a pose once, oldest first", () => {
    const s = setup();
    s.add("front", "2026-03-01");
    s.add("front", "2026-03-01");
    s.add("front", "2026-01-01");
    s.add("side", "2026-02-01");
    expect(parsePoseDates(s.sqlite.prepare(POSE_DATES_SQL).all("front"))).toEqual([
      "2026-01-01",
      "2026-03-01",
    ]);
  });
});
