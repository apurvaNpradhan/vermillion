import type { ReactNode } from "react";

import { useT } from "@/platform/i18n";
import { Input } from "@/platform/ui/input";

/** A labelled row of an admin form. */
export function FieldRow({
  label,
  htmlFor,
  children,
  error,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-medium text-sm text-text-primary">
        {label}
      </label>
      {children}
      {error ? <p className="text-danger text-xs">{error}</p> : null}
    </div>
  );
}

/** A native select, styled to the field look; options carry their own labels. */
export function SelectField({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-text-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** The search box of a list; the value lives in the URL. */
export function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <Input
      type="search"
      aria-label={t("admin__search")}
      placeholder={t("admin__search")}
      defaultValue={value}
      onKeyDown={(event) => {
        if (event.key === "Enter") onChange(event.currentTarget.value.trim());
      }}
      onBlur={(event) => onChange(event.currentTarget.value.trim())}
      className="sm:max-w-xs"
    />
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-semibold text-2xl text-text-primary">{title}</h1>
      {children}
    </div>
  );
}

/** The date part of an ISO time, in the visitor's locale. */
export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

export function formatDateTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";
}
