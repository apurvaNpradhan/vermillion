import type { Services } from "../../platform/services";

export type ListUsersInput = { search?: string | undefined; page: number; limit: number };

/** One page of users, optionally filtered by email. */
export async function listUsers(services: Services, headers: Headers, input: ListUsersInput) {
  const result = await services.auth.api.listUsers({
    headers,
    query: {
      limit: input.limit,
      offset: (input.page - 1) * input.limit,
      sortBy: "createdAt",
      sortDirection: "desc",
      ...(input.search
        ? {
            searchValue: input.search,
            searchField: "email" as const,
            searchOperator: "contains" as const,
          }
        : {}),
    },
  });
  return {
    total: result.total,
    users: result.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role ?? null,
      banned: Boolean(user.banned),
      banReason: user.banReason ?? null,
      banExpires: user.banExpires ? new Date(user.banExpires).toISOString() : null,
      createdAt: new Date(user.createdAt).toISOString(),
    })),
  };
}
