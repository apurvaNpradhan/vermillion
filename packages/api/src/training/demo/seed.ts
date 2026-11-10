import { z } from "zod";
import { createDb } from "@workspace/db";
import { uuidv7 } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { EXERCISE_TYPES, plannedSetsSchema, TRAINING_LIMITS } from "@workspace/shared";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import { exercise } from "../../exercise";
import { program, programSlot, workout, workoutExercise } from "../tables";
import { demoPrograms, demoWorkouts, type DemoWorkout } from "./plans";

/** Local development only. Adds owned fixtures atomically; existing demo titles are never overwritten. */
export async function runTrainingDemo(databaseUrl: string, userId: string) {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname))
    throw new Error("Demos require a local database");
  const { db, pool } = createDb(databaseUrl);
  try {
    const users = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(2);
    if (users.length !== 1 || !users[0]) throw new Error("Choose an existing account id");
    return await db.transaction(async (tx) => {
      // Serializes concurrent fixture runs without adding a production schema table.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`training-demo:${userId}`}))`);
      const catalog = await tx
        .select()
        .from(exercise)
        .where(and(isNull(exercise.userId), isNull(exercise.retiredAt)));
      const byTitle = new Map(catalog.map((row) => [row.title, row]));
      let createdWorkouts = 0;
      let createdPrograms = 0;
      const [workoutCount] = await tx
        .select({ value: count() })
        .from(workout)
        .where(and(eq(workout.userId, userId), isNull(workout.deletedAt)));
      const [programCount] = await tx
        .select({ value: count() })
        .from(program)
        .where(and(eq(program.userId, userId), isNull(program.deletedAt)));
      const addWorkout = async (plan: DemoWorkout, programId: string | null) => {
        const title = programId === null ? `Demo · ${plan.title}` : plan.title;
        const [existing] = await tx
          .select({ id: workout.id })
          .from(workout)
          .where(
            and(
              eq(workout.userId, userId),
              eq(workout.title, title),
              programId === null ? isNull(workout.programId) : eq(workout.programId, programId),
              isNull(workout.deletedAt),
            ),
          )
          .limit(1);
        if (existing) return existing.id;
        if ((workoutCount?.value ?? 0) + createdWorkouts >= TRAINING_LIMITS.liveWorkouts)
          throw new Error("Workout limit reached");
        const id = uuidv7();
        const groups = new Map<string, string>();
        const rows = plan.exercises.map((item, index) => {
          const catalogRow = byTitle.get(item.title);
          if (!catalogRow) throw new Error(`Demo exercise is missing: ${item.title}`);
          const sets = plannedSetsSchema(
            z.enum(EXERCISE_TYPES).parse(catalogRow.exerciseType),
          ).parse(item.sets);
          let group: string | null = null;
          if (item.superset) {
            group = groups.get(item.superset) ?? uuidv7();
            groups.set(item.superset, group);
          }
          return {
            id: uuidv7(),
            userId,
            workoutId: id,
            exerciseId: catalogRow.id,
            position: `a${index}`,
            sets,
            restSeconds: item.restSeconds,
            note: item.note,
            supersetGroup: group,
          };
        });
        await tx.insert(workout).values({ id, userId, programId, title, note: plan.note });
        await tx.insert(workoutExercise).values(rows);
        createdWorkouts += 1;
        return id;
      };
      for (const plan of [demoWorkouts.fullA, demoWorkouts.push, demoWorkouts.recovery])
        await addWorkout(plan, null);
      for (const plan of demoPrograms) {
        const [existing] = await tx
          .select({ id: program.id })
          .from(program)
          .where(
            and(
              eq(program.userId, userId),
              eq(program.title, plan.title),
              isNull(program.deletedAt),
            ),
          )
          .limit(1);
        if (existing) continue;
        if ((programCount?.value ?? 0) + createdPrograms >= TRAINING_LIMITS.livePrograms)
          throw new Error("Program limit reached");
        const id = uuidv7();
        await tx.insert(program).values({
          id,
          userId,
          title: plan.title,
          description: plan.description,
          plannedWeeks: plan.plannedWeeks,
        });
        const copies = new Map<string, string>();
        for (const child of plan.workouts) copies.set(child.key, await addWorkout(child, id));
        await tx.insert(programSlot).values(
          plan.rotation.map((key, index) => {
            const workoutId = key === null ? null : copies.get(key);
            if (workoutId === undefined)
              throw new Error("Demo rotation references a missing workout");
            return { id: uuidv7(), userId, programId: id, workoutId, position: `a${index}` };
          }),
        );
        createdPrograms += 1;
      }
      return { createdPrograms, createdWorkouts };
    });
  } finally {
    await pool.end();
  }
}
