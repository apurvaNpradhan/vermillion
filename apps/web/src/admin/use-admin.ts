import { useQuery } from "@tanstack/react-query";
import type { AuditAction, AuditTargetType } from "@workspace/shared";

import { getRpc } from "@/platform/orpc";

export function useOverview() {
  const query = useQuery(getRpc().orpc.admin.overview.queryOptions());
  return { overview: query.data ?? null, loading: query.isLoading };
}

export type AuditFilters = {
  action?: AuditAction | undefined;
  targetType?: AuditTargetType | undefined;
  targetId?: string | undefined;
  page: number;
};

export const AUDIT_PAGE = 50;

export function useAuditLog(filters: AuditFilters) {
  const query = useQuery(
    getRpc().orpc.admin.audit.list.queryOptions({ input: { ...filters, limit: AUDIT_PAGE } }),
  );
  return {
    entries: query.data?.entries ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
  };
}
