import { describe, expect, it, vi } from "vitest";

import { reportWatchState } from "./report-watch-state";

describe("report watch state", () => {
  it("reports a weigh-in failure and retries the failed watch", () => {
    const ready = { loading: false, failed: false, retry: vi.fn() };
    const weight = { ...ready, failed: true, retry: vi.fn() };

    const sources = { history: ready, muscles: ready, records: ready, weight };
    const state = reportWatchState(sources);
    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("Expected the weigh-in read to fail");
    state.retry();
    expect(weight.retry).toHaveBeenCalledOnce();
    expect(ready.retry).not.toHaveBeenCalled();

    expect(
      reportWatchState({ ...sources, weight: { ...weight, loading: true, failed: false } }),
    ).toEqual({
      status: "loading",
    });
    expect(reportWatchState({ ...sources, weight: { ...weight, failed: false } })).toEqual({
      status: "ready",
    });
  });
});
