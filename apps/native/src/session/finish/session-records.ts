import { recordCount, recordFlags, type SessionHistory } from "@workspace/shared";

/** Records on this session’s sets, measured against the history of its exercises. */
export function sessionRecords(input: {
  history: readonly SessionHistory[];
  session: SessionHistory;
  bodyweightKg: number | null;
}) {
  const { history, session, bodyweightKg } = input;
  const started = Date.parse(session.started_at);
  const earlier = history.filter((item) => {
    if (item.id === session.id) return false;
    const at = Date.parse(item.started_at);
    return at < started || (at === started && item.id < session.id);
  });
  const flags = recordFlags([session], bodyweightKg, earlier);
  return { flags, total: recordCount(flags, session.sets) };
}
