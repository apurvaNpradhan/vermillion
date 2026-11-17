import type { ReactNode } from "react";

import { appConfig } from "@/platform/app-config";

/** A centred card for the admin's sign-in steps. */
export function AuthCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-surface p-6">
        <p className="font-semibold text-text-muted text-sm">{appConfig.displayName}</p>
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl text-text-primary">{title}</h1>
          <p className="text-text-secondary text-sm">{body}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function FormMessage({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-danger text-sm">
      {message}
    </p>
  ) : null;
}
