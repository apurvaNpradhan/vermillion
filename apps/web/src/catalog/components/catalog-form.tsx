import { useForm } from "@tanstack/react-form";
import { errorMessageKey } from "@workspace/client/orpc-error";
import {
  catalogExerciseInput,
  EQUIPMENT,
  EQUIPMENT_KEYS,
  EXERCISE_MEDIA_LIMITS,
  EXERCISE_TYPE_KEYS,
  EXERCISE_TYPES,
  MUSCLE_GROUP_KEYS,
  MUSCLE_GROUPS,
  type CatalogExerciseFields,
  type ExerciseMediaSlot,
} from "@workspace/shared";
import { useState } from "react";

import { FieldRow, SelectField } from "@/admin";
import { useT, type SiteKey } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Input } from "@/platform/ui/input";
import { Textarea } from "@/platform/ui/textarea";

import { useCatalogActions, useCatalogExercise, type UploadProblem } from "../use-catalog";

const EMPTY: CatalogExerciseFields = {
  title: "",
  primaryMuscle: "chest",
  secondaryMuscles: [],
  equipment: "barbell",
  exerciseType: "weight_reps",
  isFullBodyweight: false,
  aka: null,
  searchTerms: null,
  instructions: null,
  rank: 0,
};

const PROBLEM_KEYS: Record<UploadProblem, SiteKey> = {
  type: "catalog__media_wrong_type",
  size: "catalog__media_too_large",
  empty: "catalog__media_empty",
  failed: "catalog__media_failed",
};

/** A thumbnail or video picker: checks the file before uploading, then previews what is attached. */
function MediaField({
  slot,
  url,
  exerciseId,
  onUploaded,
}: {
  slot: ExerciseMediaSlot;
  url: string | null;
  exerciseId: string | undefined;
  onUploaded: (key: string, previewUrl: string) => void;
}) {
  const t = useT();
  const { upload } = useCatalogActions();
  const [problem, setProblem] = useState<UploadProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const limits = EXERCISE_MEDIA_LIMITS[slot];
  const id = `catalog-${slot}`;
  return (
    <FieldRow
      label={t(slot === "thumbnail" ? "catalog__thumbnail" : "catalog__video")}
      htmlFor={id}
      error={problem ? t(PROBLEM_KEYS[problem], { max: Math.round(limits.maxBytes / 1024) }) : null}
    >
      {url ? (
        slot === "thumbnail" ? (
          <img src={url} alt="" className="h-32 w-32 rounded-lg bg-surface-control object-cover" />
        ) : (
          <video src={url} controls muted className="max-h-48 rounded-lg bg-surface-control" />
        )
      ) : null}
      <input
        id={id}
        type="file"
        accept={limits.types.join(",")}
        disabled={busy}
        className="text-sm text-text-secondary"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          setProblem(null);
          setBusy(true);
          const result = await upload(slot, file, exerciseId);
          setBusy(false);
          if ("key" in result) onUploaded(result.key, URL.createObjectURL(file));
          else setProblem(result.problem);
        }}
      />
      <p className="text-text-muted text-xs">
        {t(slot === "thumbnail" ? "catalog__thumbnail_hint" : "catalog__video_hint", {
          max: Math.round(limits.maxBytes / 1024),
        })}
      </p>
    </FieldRow>
  );
}

/** Add or edit a catalog exercise. The id is never editable; the type locks once sets use it. */
export function CatalogForm({ id, onDone }: { id: string | null; onDone: () => void }) {
  const t = useT();
  const { exercise, loading } = useCatalogExercise(id);
  const { create, update, saving } = useCatalogActions();
  const [media, setMedia] = useState<{ thumbnailKey?: string; videoKey?: string }>({});
  const [previews, setPreviews] = useState<{ thumbnail?: string; video?: string }>({});
  const [retired, setRetired] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const initial: CatalogExerciseFields = exercise
    ? {
        title: exercise.title,
        primaryMuscle: exercise.primaryMuscle,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipment,
        exerciseType: exercise.exerciseType,
        isFullBodyweight: exercise.isFullBodyweight,
        aka: exercise.aka,
        searchTerms: exercise.searchTerms,
        instructions: exercise.instructions,
        rank: exercise.rank,
      }
    : EMPTY;

  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: catalogExerciseInput },
    onSubmit: async ({ value }) => {
      setFailure(null);
      try {
        const parsed = catalogExerciseInput.parse(value);
        if (id) await update({ id, patch: { ...parsed, ...media } });
        else await create({ exercise: parsed, retired, ...media });
        onDone();
      } catch (error) {
        setFailure(t(errorMessageKey(error instanceof Error ? error : null)));
      }
    },
  });

  if (id && loading) return <p className="text-text-muted">{t("admin__loading")}</p>;
  const options = <Key extends string>(values: readonly Key[], keys: Record<Key, SiteKey>) =>
    values.map((value) => ({ value, label: t(keys[value]) }));

  return (
    <form
      key={exercise?.updatedAt ?? "new"}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="title">
        {(field) => (
          <FieldRow
            label={t("catalog__title")}
            htmlFor="catalog-title"
            error={field.state.meta.errors[0]?.message ?? null}
          >
            <Input
              id="catalog-title"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.currentTarget.value)}
            />
          </FieldRow>
        )}
      </form.Field>
      <form.Field name="primaryMuscle">
        {(field) => (
          <FieldRow label={t("catalog__primary")} htmlFor="catalog-primary">
            <SelectField
              id="catalog-primary"
              value={field.state.value}
              onChange={(value) => {
                const next = MUSCLE_GROUPS.find((muscle) => muscle === value);
                if (next) field.handleChange(next);
              }}
              options={options(MUSCLE_GROUPS, MUSCLE_GROUP_KEYS)}
            />
          </FieldRow>
        )}
      </form.Field>
      <form.Field name="secondaryMuscles">
        {(field) => (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 font-medium text-sm text-text-primary">
              {t("catalog__secondary")}
            </legend>
            <div className="grid grid-cols-2 gap-1 text-sm text-text-secondary">
              {MUSCLE_GROUPS.map((muscle) => (
                <label key={muscle} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={field.state.value.includes(muscle)}
                    onChange={(e) =>
                      field.handleChange(
                        e.currentTarget.checked
                          ? [...field.state.value, muscle]
                          : field.state.value.filter((value) => value !== muscle),
                      )
                    }
                  />
                  {t(MUSCLE_GROUP_KEYS[muscle])}
                </label>
              ))}
            </div>
            {field.state.meta.errors[0] ? (
              <p className="text-danger text-xs">{t("catalog__secondary_invalid")}</p>
            ) : null}
          </fieldset>
        )}
      </form.Field>
      <form.Field name="equipment">
        {(field) => (
          <FieldRow label={t("catalog__equipment")} htmlFor="catalog-equipment">
            <SelectField
              id="catalog-equipment"
              value={field.state.value}
              onChange={(value) => {
                const next = EQUIPMENT.find((item) => item === value);
                if (next) field.handleChange(next);
              }}
              options={options(EQUIPMENT, EQUIPMENT_KEYS)}
            />
          </FieldRow>
        )}
      </form.Field>
      <form.Field name="exerciseType">
        {(field) => (
          <FieldRow
            label={t("catalog__type")}
            htmlFor="catalog-type"
            error={exercise?.typeLocked ? t("catalog__type_locked") : null}
          >
            <SelectField
              id="catalog-type"
              value={field.state.value}
              onChange={(value) => {
                const next = EXERCISE_TYPES.find((type) => type === value);
                if (next && !exercise?.typeLocked) field.handleChange(next);
              }}
              options={options(EXERCISE_TYPES, EXERCISE_TYPE_KEYS)}
            />
          </FieldRow>
        )}
      </form.Field>
      <form.Field name="isFullBodyweight">
        {(field) => (
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={field.state.value}
              onChange={(e) => field.handleChange(e.currentTarget.checked)}
            />
            {t("catalog__full_bodyweight")}
          </label>
        )}
      </form.Field>
      {(["aka", "searchTerms"] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <FieldRow
              label={t(name === "aka" ? "catalog__aka" : "catalog__search_terms")}
              htmlFor={`catalog-${name}`}
            >
              <Input
                id={`catalog-${name}`}
                value={field.state.value ?? ""}
                onChange={(e) => field.handleChange(e.currentTarget.value)}
              />
            </FieldRow>
          )}
        </form.Field>
      ))}
      <form.Field name="instructions">
        {(field) => (
          <FieldRow label={t("catalog__instructions")} htmlFor="catalog-instructions">
            <Textarea
              id="catalog-instructions"
              rows={6}
              value={field.state.value ?? ""}
              onChange={(e) => field.handleChange(e.currentTarget.value)}
            />
          </FieldRow>
        )}
      </form.Field>
      <form.Field name="rank">
        {(field) => (
          <FieldRow label={t("catalog__rank")} htmlFor="catalog-rank">
            <Input
              id="catalog-rank"
              type="number"
              min={0}
              value={field.state.value}
              onChange={(e) => field.handleChange(Number(e.currentTarget.value))}
            />
          </FieldRow>
        )}
      </form.Field>
      <MediaField
        slot="thumbnail"
        exerciseId={id ?? undefined}
        url={previews.thumbnail ?? exercise?.thumbnailUrl ?? null}
        onUploaded={(key, preview) => (
          setMedia((m) => ({ ...m, thumbnailKey: key })),
          setPreviews((p) => ({ ...p, thumbnail: preview }))
        )}
      />
      <MediaField
        slot="video"
        exerciseId={id ?? undefined}
        url={previews.video ?? exercise?.videoUrl ?? null}
        onUploaded={(key, preview) => (
          setMedia((m) => ({ ...m, videoKey: key })),
          setPreviews((p) => ({ ...p, video: preview }))
        )}
      />
      {!id ? (
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={retired}
            onChange={(e) => setRetired(e.currentTarget.checked)}
          />
          {t("catalog__create_retired")}
        </label>
      ) : null}
      {failure ? (
        <p role="alert" className="text-danger text-sm">
          {failure}
        </p>
      ) : null}
      <Button type="submit" loading={saving}>
        {id ? t("catalog__save") : t("catalog__create")}
      </Button>
    </form>
  );
}
