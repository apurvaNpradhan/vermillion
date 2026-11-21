type Watch = { loading: boolean; failed: boolean; retry: () => void };

export type ReportWatchState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready" };

export function reportWatchState(sources: {
  history: Watch;
  muscles: Watch;
  records: Watch;
  weight: Watch;
}): ReportWatchState {
  const watches = Object.values(sources);
  const failed = watches.filter((watch) => watch.failed);
  if (failed.length > 0) {
    return {
      status: "error",
      retry: () => failed.forEach((watch) => watch.retry()),
    };
  }
  return watches.some((watch) => watch.loading) ? { status: "loading" } : { status: "ready" };
}
