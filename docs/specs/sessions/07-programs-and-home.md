# Sessions, slice 7: Active program, Runs, Cycles, Home and Train

Status: ready after slice 4. Decisions: [ADR 0036](../../adr/0036-training-plans.md) (Program structure), [ADR 0038](../../adr/0038-sessions.md) (Programs; Data).

## Goal

A Program can be made active. Training from it advances a Cycle in any order, and Runs track progress and end deliberately. Home and Train show Resume, Next up and real completed training.

## Work

- **Data**: a `program_run` table, upload rules, the stream, a client table and store operations: `activateProgram` (finishes any other unfinished Run as `stopped`), `stopProgram`, `finishRun`, `keepGoing` and `runAgain`. Starting a Session from the Active program writes `run_id`, `slot_id` and `cycle`, and sets the Run's `started_at` on the first Session. If two devices activate different Programs offline, the client treats the latest `activated_at` as active and stops the other on the next write.
- **Cycle state** (`packages/shared/src/training/cycle.ts`, pure): from the Rotation and the Run's Sessions, compute the trained Slots of the current Cycle (marking the first untrained Slot for each Workout), Next up, Cycle completion and the week count. Deleting a Session un-trains its Slot.
- **Train**:
  - Active program card: cover, title, "Week n of m", Cycle dots (Rest dimmed), Next up with Start, and Change.
  - "Set as active" and "Stop" in the Program header and menu, with a confirmation when switching.
  - The end-of-Run sheet on the first Train visit after the planned weeks.
  - "Empty session" added to the Create menu.
- **Home** (replacing the temporary dashboard), with each section hidden when empty:
  - Resume
  - Next up
  - This week: sessions, sets and volume against last week, plus an 8-week volume bar chart
  - Muscles this week: a heat map
  - Recent sessions: 3 rows and See all, which opens History

  A brand-new account sees one "Start your first workout" card.

## Tests

- Unit: the cycle function (out of order, repeated Workouts in several Slots, Rest Slots, deleting a Session, a Rotation edited mid-Cycle), week counting across timezones, and the conflicting-activation rule.
- Seam 1: Run ownership and a Session's `slot_id` from another Program refused.
- Seam 3: activating on one device shows as active on the other.
- Manual: a full cycle trained out of order; reaching the planned weeks; Run again keeping the earlier Run's dates.

## Done

The standard checks pass and the manual checks are recorded.
