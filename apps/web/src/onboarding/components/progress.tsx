import { cn } from "@workspace/ui/lib/utils";

/** One segment per step; the steps up to and including the current one are filled. */
export function OnboardingProgress({
  current,
  total,
  label,
}: {
  /** 1-based index of the step being asked. */
  current: number;
  total: number;
  label: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      className="flex gap-1.5"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn("h-1 flex-1 rounded-full", index < current ? "bg-foreground" : "bg-muted")}
        />
      ))}
    </div>
  );
}
