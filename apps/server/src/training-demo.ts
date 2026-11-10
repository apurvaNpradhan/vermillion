import { runTrainingDemo } from "@workspace/api";
import { env } from "@workspace/env/server";

if (env.NODE_ENV === "production") throw new Error("Demo fixtures are development-only");
const userId = process.argv[2];
if (!userId) throw new Error('Usage: pnpm --filter server training:demo "account-id"');
const result = await runTrainingDemo(env.DATABASE_URL, userId);
console.log(
  `Added ${result.createdPrograms} demo programs and ${result.createdWorkouts} demo workouts.`,
);
