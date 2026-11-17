import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  exerciseMediaProblem,
  type CatalogExerciseFields,
  type Equipment,
  type ExerciseMediaSlot,
  type ExerciseType,
  type MuscleGroup,
} from "@workspace/shared";

import { getRpc } from "@/platform/orpc";

export type CatalogSearch = {
  search?: string | undefined;
  primaryMuscle?: MuscleGroup | undefined;
  equipment?: Equipment | undefined;
  exerciseType?: ExerciseType | undefined;
  retired: "live" | "retired" | "all";
  page: number;
};

export const CATALOG_PAGE = 50;

export function useCatalogList(search: CatalogSearch) {
  const query = useQuery(
    getRpc().orpc.admin.catalog.list.queryOptions({ input: { ...search, limit: CATALOG_PAGE } }),
  );
  return {
    rows: query.data?.exercises ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
  };
}

export function useCatalogExercise(id: string | null) {
  const query = useQuery({
    ...getRpc().orpc.admin.catalog.get.queryOptions({ input: { id: id ?? "" } }),
    enabled: Boolean(id),
  });
  return { exercise: query.data ?? null, loading: query.isLoading };
}

export type UploadProblem = "type" | "size" | "empty" | "failed";

/**
 * Checks a file against the slot's limits before anything is sent, then uploads it to a
 * presigned URL. Returns the key to save with create or update.
 */
async function uploadMedia(
  slot: ExerciseMediaSlot,
  file: File,
  exerciseId: string | undefined,
): Promise<{ key: string } | { problem: UploadProblem }> {
  const problem = exerciseMediaProblem(slot, file);
  if (problem) return { problem };
  try {
    const { client } = getRpc();
    const input = { exerciseId, contentLength: file.size };
    const signed =
      slot === "thumbnail"
        ? await client.admin.catalog.mediaUploadUrl({
            ...input,
            slot,
            contentType: file.type === "image/webp" ? "image/webp" : "image/jpeg",
          })
        : await client.admin.catalog.mediaUploadUrl({ ...input, slot, contentType: "video/mp4" });
    const response = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: file,
    });
    return response.ok ? { key: signed.key } : { problem: "failed" };
  } catch {
    return { problem: "failed" };
  }
}

type Media = { thumbnailKey?: string | null; videoKey?: string | null };

/** Every catalog write; each refreshes the list and the detail. */
export function useCatalogActions() {
  const queryClient = useQueryClient();
  const { client, orpc } = getRpc();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.admin.catalog.key() });
  const done = { onSuccess: refresh };
  const create = useMutation({
    mutationFn: (input: { exercise: CatalogExerciseFields; retired: boolean } & Media) =>
      client.admin.catalog.create({
        exercise: input.exercise,
        retired: input.retired,
        thumbnailKey: input.thumbnailKey ?? null,
        videoKey: input.videoKey ?? null,
      }),
    ...done,
  });
  const update = useMutation({
    mutationFn: (input: { id: string; patch: Partial<CatalogExerciseFields> & Media }) => {
      const { thumbnailKey, ...rest } = input.patch;
      return client.admin.catalog.update({
        id: input.id,
        patch: thumbnailKey ? { ...rest, thumbnailKey } : rest,
      });
    },
    ...done,
  });
  const retire = useMutation({
    mutationFn: (id: string) => client.admin.catalog.retire({ id }),
    ...done,
  });
  const restore = useMutation({
    mutationFn: (id: string) => client.admin.catalog.restore({ id }),
    ...done,
  });
  return {
    create: create.mutateAsync,
    update: update.mutateAsync,
    retire: retire.mutateAsync,
    restore: restore.mutateAsync,
    upload: uploadMedia,
    saving: create.isPending || update.isPending,
  };
}

/** Downloads the catalog as the seed file (`exercises.json`), formatted like the committed one. */
export async function downloadCatalogExport() {
  const rows = await getRpc().client.admin.catalog.export();
  const blob = new Blob([`${JSON.stringify(rows, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "exercises.json";
  link.click();
  URL.revokeObjectURL(link.href);
}
