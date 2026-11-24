import type { ShareSnapshot, ShareWorkout } from "@workspace/shared";

import { en, site } from "../content/en.ts";
import type { ShareResult } from "./load-share.ts";
import { summariseSets } from "./summary.ts";

function WorkoutList({ workout }: { workout: ShareWorkout }) {
  return (
    <ol className="share-exercises">
      {workout.exercises.map((entry, index) => (
        <li key={`${entry.exercise.name}-${index}`}>
          <span className="share-exercise-name">{entry.exercise.name}</span>
          <span className="share-exercise-sets">{summariseSets(entry.sets)}</span>
        </li>
      ))}
    </ol>
  );
}

function Details({ snapshot }: { snapshot: ShareSnapshot }) {
  if (snapshot.format === "sigil.workout/v1") {
    return (
      <section
        className="share-workout"
        aria-label={snapshot.workout.title ?? en.shareUntitledWorkout}
      >
        <p className="meta">{en.shareExercises(snapshot.workout.exercises.length)}</p>
        <WorkoutList workout={snapshot.workout} />
      </section>
    );
  }
  const { rotation, workouts } = snapshot.program;
  return (
    <>
      {rotation.map((index, day) => {
        const workout = index === null ? null : workouts[index];
        return (
          <section
            key={`${day}-${index}`}
            className="share-workout"
            aria-label={`${en.shareDayN(day + 1)}`}
          >
            <p className="label">{en.shareDayN(day + 1)}</p>
            <h2>{workout ? (workout.title ?? en.shareUntitledWorkout) : en.shareRestDay}</h2>
            {workout ? <WorkoutList workout={workout} /> : null}
          </section>
        );
      })}
    </>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <article className="page narrow">
      <h1>{title}</h1>
      <p className="lede">{body}</p>
    </article>
  );
}

/** The web preview of a Share link: what the plan holds, and a way to get the app. */
export function SharePage({ code, result }: { code: string; result: ShareResult }) {
  if (result.status === "missing") {
    return <Notice title={en.shareMissingTitle} body={en.shareMissingBody} />;
  }
  if (result.status === "gone") return <Notice title={en.shareGoneTitle} body={en.shareGoneBody} />;
  if (result.status === "error") {
    return <Notice title={en.shareErrorTitle} body={en.shareErrorBody} />;
  }
  const { snapshot } = result;
  const program = snapshot.format === "sigil.program/v1" ? snapshot.program : null;
  const title = program
    ? program.title
    : (snapshot.format === "sigil.workout/v1" && snapshot.workout.title) || en.shareUntitledWorkout;
  const facts = program
    ? [
        program.planned_weeks ? en.shareWeeks(program.planned_weeks) : null,
        program.sessions_per_week ? en.shareDays(program.sessions_per_week) : null,
      ].flatMap((fact) => (fact ? [fact] : []))
    : [];
  return (
    <article className="page narrow share">
      <p className="label">{program ? en.shareProgramLabel : en.shareWorkoutLabel}</p>
      <h1>{title}</h1>
      {facts.length > 0 ? <p className="meta">{facts.join(" · ")}</p> : null}
      {program?.description ? <p className="lede">{program.description}</p> : null}
      <div className="actions">
        <a className="button" href={site.latestReleaseUrl} rel="noreferrer">
          {en.download}
        </a>
        <p className="share-code">
          <span className="label">{en.shareCode}</span> <code>{code}</code>
        </p>
      </div>
      <p className="meta">{en.shareOpenHint}</p>
      <Details snapshot={snapshot} />
    </article>
  );
}
