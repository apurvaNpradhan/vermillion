import { createAuth, reconcileAdminRoles, type Auth } from "@workspace/auth";
import type { Database } from "@workspace/db";
import type { EmailTransport } from "@workspace/email";

import { deleteAccountData } from "../account/index";
import { hasPendingEmails, queueEmail, resumeEmailOutbox, sendEmailQueue } from "../auth/index";
import { createBackgroundTasks, type BackgroundTasks } from "./background-tasks";
import type { ApiConfig } from "./config";
import { createJobs, type Jobs, type JobsOptions } from "./jobs/index";
import { queues } from "./jobs/queues";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

/** Everything a procedure or job may use. Built once per process (or once per test). */
export type Services = {
  config: ApiConfig;
  db: Database;
  auth: Auth;
  jobs: Jobs;
  emailTransport: EmailTransport;
  background: BackgroundTasks;
  rateLimiter: RateLimiter;
  /** Runs the work that needs a migrated database: admin role reconciliation, job workers. */
  start(): Promise<void>;
  /** Waits (bounded) for pending background work, then stops job workers. */
  stop(timeoutMs?: number): Promise<{ drained: boolean }>;
};

export type CreateServicesOptions = {
  config: ApiConfig;
  db: Database;
  emailTransport: EmailTransport;
  /** pg-boss connection and queue tuning. */
  jobs: Pick<JobsOptions, "boss" | "defaults">;
  /** Replaces `fetch` for the CAPTCHA provider (tests). */
  fetch?: typeof fetch;
};

export function createServices(options: CreateServicesOptions): Services {
  const { config, db } = options;
  const background = createBackgroundTasks();
  const jobs = createJobs({ ...options.jobs, queues });

  // The auth hooks and job handlers need `services`, which holds them: resolved lazily.
  const lateServices = () => services;

  const auth = createAuth({
    db,
    baseUrl: config.appUrl,
    secret: config.authSecret,
    isProduction: config.isProduction,
    openApi: config.openApiReference,
    appScheme: config.appScheme,
    nativePort: config.nativePort,
    passkey: { ...config.passkey, rpName: config.appName },
    registrationOpen: config.registrationOpen,
    adminEmails: config.adminEmails,
    turnstileSecret: config.turnstileSecret,
    google: config.google,
    github: config.github,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    queueEmail: (email) => queueEmail(lateServices(), email),
    beforeDeleteUser: (user) => deleteAccountData(lateServices(), user.id),
    runInBackground: (promise) => background.run(promise),
  });

  const services: Services = {
    config,
    db,
    auth,
    jobs,
    emailTransport: options.emailTransport,
    background,
    rateLimiter: createRateLimiter(),
    async start() {
      await reconcileAdminRoles(db, config.adminEmails);
      await jobs.start(services);
      await resumeEmailOutbox(services);
    },
    async stop(timeoutMs = 10_000) {
      // Pending background work may still enqueue jobs, so it drains first.
      const deadline = Date.now() + timeoutMs;
      const remaining = () => Math.max(0, deadline - Date.now());
      const backgroundDrained = await background.drain(remaining());
      const emailsDrained =
        backgroundDrained && (await jobs.drain([sendEmailQueue.name], remaining()));
      await jobs.stop(remaining());
      const outboxEmpty = !(await hasPendingEmails(db));
      return { drained: backgroundDrained && emailsDrained && outboxEmpty };
    },
  };
  return services;
}
