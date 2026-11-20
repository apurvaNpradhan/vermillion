// Assembles the three proposal files from the source dataset and the current catalog.
import { buildBackfill, indexByMovement, matchRows, rowMovement } from "./backfill.ts";
import type { SeedRow } from "./catalog.ts";
import { buildCandidates } from "./candidates.ts";
import type { SourceExercise } from "./dataset.ts";
import type { BackfillItem, Candidate, RankItem } from "./proposals.ts";
import { proposeTier, TIER_RANK } from "./ranks.ts";

export type Proposals = {
  backfill: BackfillItem[];
  candidates: Candidate[];
  ranks: RankItem[];
};

/** Tier for every catalog row and candidate; a non-zero existing rank stays and is flagged. */
export function buildRanks(seed: readonly SeedRow[], candidates: readonly Candidate[]): RankItem[] {
  const fromCatalog = seed.map((row): RankItem => {
    const tier = proposeTier(row.title, row.equipment);
    const disagrees = row.rank !== 0 && row.rank !== TIER_RANK[tier];
    return {
      id: row.id,
      source: "catalog",
      title: row.title,
      tier,
      rank: row.rank === 0 ? TIER_RANK[tier] : row.rank,
      current_rank: row.rank,
      flags: disagrees ? ["rank_disagrees"] : [],
    };
  });
  const fromCandidates = candidates.map((candidate): RankItem => {
    const tier = proposeTier(candidate.title, candidate.equipment);
    return {
      id: candidate.id,
      source: "candidate",
      title: candidate.title,
      tier,
      rank: TIER_RANK[tier],
      current_rank: 0,
      flags: [],
    };
  });
  return [...fromCatalog, ...fromCandidates];
}

export function propose(source: readonly SourceExercise[], seed: readonly SeedRow[]): Proposals {
  const index = indexByMovement(source);
  const matches = matchRows(seed, index);
  const matchedMovements = new Set(
    seed.flatMap((row) => {
      const movement = rowMovement(row);
      return movement === null ? [] : [movement];
    }),
  );
  const candidates = buildCandidates(source, seed, matchedMovements);
  return {
    backfill: buildBackfill(matches),
    candidates,
    ranks: buildRanks(seed, candidates),
  };
}

function countBy<Item>(items: readonly Item[], key: (item: Item) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].toSorted(([a], [b]) => a.localeCompare(b));
}

/** Human-readable counts, printed by the CLI. */
export function summarise(proposals: Proposals): string {
  const { backfill, candidates, ranks } = proposals;
  const details = backfill.filter((item) => item.kind === "details");
  const unmatched = details.filter((item) => item.flags.includes("unmatched")).length;
  const lines = [
    `backfill: ${details.length} rows, ${details.length - unmatched} matched, ${unmatched} unmatched`,
    `  with details: ${details.filter((item) => item.kind === "details" && (item.primary_detail.length > 0 || item.secondary_detail.length > 0)).length}`,
    `  retags: ${backfill.filter((item) => item.kind === "equipment").length} (${countBy(
      backfill.filter((item) => item.kind === "equipment"),
      (item) => `${item.current_equipment}->${item.kind === "equipment" ? item.equipment : ""}`,
    )
      .map(([kind, count]) => `${kind} ${count}`)
      .join(", ")})`,
    `  full_body primaries: ${backfill.filter((item) => item.kind === "primary").length}`,
    `  backfill flags: ${countBy(
      backfill.flatMap((item) => item.flags),
      (flag) => flag,
    )
      .map(([flag, count]) => `${flag} ${count}`)
      .join(", ")}`,
    `candidates: ${candidates.length}`,
    `  by group: ${countBy(candidates, (item) => item.primary_muscle)
      .map(([group, count]) => `${group} ${count}`)
      .join(", ")}`,
    `  by equipment: ${countBy(candidates, (item) => item.equipment)
      .map(([equipment, count]) => `${equipment} ${count}`)
      .join(", ")}`,
    `  flags: ${countBy(
      candidates.flatMap((item) => item.flags),
      (flag) => flag,
    )
      .map(([flag, count]) => `${flag} ${count}`)
      .join(", ")}`,
    `ranks: ${ranks.length} (catalog ${ranks.filter((item) => item.source === "catalog").length}, candidates ${ranks.filter((item) => item.source === "candidate").length})`,
    `  tiers: ${countBy(ranks, (item) => `tier ${item.tier}`)
      .map(([tier, count]) => `${tier} ${count}`)
      .join(", ")}`,
    `  rank_disagrees: ${ranks.filter((item) => item.flags.includes("rank_disagrees")).length}`,
  ];
  return lines.join("\n");
}
