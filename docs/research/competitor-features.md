# Competitor features worth adding to Sigil

Source review, 23 November 2026. The Sigil baseline comes from `CONTEXT.md`, the ADRs, the
specs and the Native routes and modules in this checkout. Competitor claims come from each app's
own site or help center, with no hands-on testing. Fitbod's site refused automated fetches, so
its claims come from its help center and blog. Priorities are product judgments. This document
extends [sigil-roadmap.md](sigil-roadmap.md) and does not repeat its reasoning. Where the two
overlap, the earlier document has the detail.

## Sigil vs competitors

✓ = has it · ~ = partial · — = not advertised. Sigil cells are from code, not a feature page.

| Feature                                    | Sigil                                    | Hevy | Strong | Fitbod | Liftosaur | Boostcamp | JEFIT | Alpha | Lyfta |
| ------------------------------------------ | ---------------------------------------- | ---- | ------ | ------ | --------- | --------- | ----- | ----- | ----- |
| Workouts, Programs, Rotation, supersets    | ✓                                        | ✓    | ✓      | ~      | ✓         | ✓         | ✓     | ✓     | ✓     |
| Previous/Ghost values, set kinds, RPE/RIR  | ✓                                        | ✓    | ✓      | ✓      | ✓         | ✓         | ✓     | ✓     | ✓     |
| Rest timer, notification, per-set timer    | ✓                                        | ✓    | ✓      | ✓      | ✓         | ✓         | ✓     | ✓     | ✓     |
| Warm-up and plate calculators              | ✓                                        | ✓    | ✓      | —      | ✓         | ✓         | —     | ✓     | ~     |
| Records, live record on tick               | ✓                                        | ✓    | ✓      | ✓      | ✓         | ✓         | ✓     | ✓     | ✓     |
| Auto progression, stalls, deload           | ✓ (reps then load, Lighter week)         | —    | —      | ✓      | ✓         | ~         | ✓     | ✓     | —     |
| Weekly muscle volume and goals             | ✓                                        | ✓    | ~      | ✓      | ✓         | ✓         | ✓     | ~     | ~     |
| Monthly and yearly reports, streak         | ✓                                        | ✓    | —      | ✓      | —         | ✓         | —     | ✓     | —     |
| Body weight, measurements, progress photos | ✓ (trend weight, comparison)             | ✓    | ✓      | —      | ✓         | ✓         | ✓     | ✓     | ✓     |
| Share cards                                | ✓                                        | ✓    | ✓      | ✓      | —         | —         | —     | ✓     | ✓     |
| CSV import / export                        | ✓ (Strong, Hevy in; Strong CSV out)      | ✓    | ✓      | —      | ✓         | —         | —     | ✓     | ✓     |
| Android ongoing workout notification       | ✓                                        | ✓    | —      | —      | —         | —         | —     | ✓     | —     |
| Bundled program library                    | —                                        | ✓    | —      | —      | ✓         | ✓         | ✓     | ✓     | ✓     |
| %1RM / training max / AMRAP sets           | —                                        | —    | —      | —      | ✓         | ✓         | —     | —     | —     |
| Week-by-week targets (periodization)       | —                                        | —    | —      | —      | ✓         | —         | ✓     | ✓     | —     |
| Equipment / gym profiles                   | ~ (bars and plates only)                 | —    | —      | ✓      | —         | ~         | ✓     | ✓     | —     |
| Health Connect / Apple Health              | —                                        | ✓    | ✓      | ✓      | —         | —         | —     | ✓     | —     |
| Home-screen widget                         | — (removed, ADR 0054)                    | ✓    | —      | —      | —         | —         | —     | —     | —     |
| Watch logging (Wear OS / Apple Watch)      | —                                        | ✓    | ✓ (AW) | ✓      | —         | —         | ✓     | —     | ✓     |
| Plan share links / import                  | — (cards only)                           | ✓    | ✓      | —      | ✓         | ✓         | ✓     | ✓     | ✓     |
| Routine folders                            | —                                        | ✓    | ✓      | —      | —         | —         | —     | —     | —     |
| Workout / plan generator                   | —                                        | ✓    | —      | ✓      | —         | ✓         | ✓     | ✓     | ✓     |
| Social feed, leaderboards, coach           | —                                        | ✓    | —      | —      | ~         | —         | ~     | —     | ✓     |

Sigil already matches or beats most competitors on the core logging loop. Its progression, stall
detection, Lighter week and trend-weight body tracking go further than Hevy or Strong. The gaps
are around the loop: getting a plan in, getting data out, and logging from somewhere other than
the open app.

## Missing features, prioritized

### Now-ish

1. **Starter program library.** Most new users want a proven plan, not a blank editor. Bundled
   plans also work offline and need no public routes. Hevy, Boostcamp, Liftosaur, JEFIT, Alpha
   and Lyfta have one. (Roadmap item 1.)
2. **Training max, %1RM and AMRAP planned sets.** Without these, 5/3/1, GZCLP, nSuns and Texas
   Method cannot be expressed, so they cannot ship as starter plans. Liftosaur and Boostcamp
   have this.
3. **Health Connect export of finished Sessions.** On Android this is the main way training
   reaches the rest of a user's health data and its calorie totals. Write only, with no backfill
   at first. Hevy, Strong, Fitbod and Alpha have it.
4. **Equipment profiles and ranked swaps.** A "Home" or "Hotel" equipment list makes the
   existing swap picker suggest exercises the user can actually do. Fitbod, Alpha (multiple gym
   profiles) and JEFIT have it. (Roadmap item 2.)
5. **Full local backup and restore.** Export currently covers logged sets only, as a
   kilogram-only Strong CSV. An offline-first app should let users save and restore everything
   (plans, body data, preferences) as one file, and export in the user's own unit. Strong, Hevy
   and Alpha have CSV export. No competitor offers full restore, which makes it a cheap
   differentiator.
6. **Launcher app shortcuts.** Long-pressing the icon could offer "Start next workout",
   "Resume session" and "Log weight". This is cheap, Android-native and needs no widget surface.
   Strong (Siri Shortcuts) and Hevy (widgets that start routines) have the iOS equivalent.

### Later

7. **Week-by-week targets in a Program (periodization).** This lets a block ramp effort, reps or
   load across weeks and schedule a planned deload, instead of relying on reactive stall
   detection only. Liftosaur, JEFIT (mesocycles) and Alpha (RIR periodization, deloads) have it.
8. **Shareable plan links and import.** This lets users copy a Workout or Program, which
   matters for training partners and for importing community plans. Hevy, Liftosaur, Alpha,
   Lyfta, JEFIT and Strong have it. (Roadmap item 4.)
9. **Home-screen widget, done again.** It would show the next workout and week progress, and tap
   to start. Revisit after ADR 0054 using current Expo widget tooling. Hevy ships eight widget
   kinds.
10. **Within-session load adjustment.** Suggest holding or reducing load when today's earlier
    sets miss the target reps or effort. Alpha and Fitbod have it. (Roadmap item 6.)
11. **Wear OS set logging.** Log a set and run the rest timer from the wrist, with the phone in
    the bag. It is large, and has to respect device ownership of the Active session. Hevy,
    Fitbod, JEFIT and Lyfta have it.
12. **Routine folders or tags.** Long-term users accumulate Workouts. Add folders once libraries
    outgrow a screen, as the training decisions already note. Hevy and Strong have them.
13. **Standalone tools.** A 1RM, percentage and plate calculator reachable outside a Session, for
    planning. Lyfta and Liftosaur offer these on the web, and Strong and Alpha have them in the
    app.
14. **Interval and custom timers.** EMOM, Tabata and countdown blocks for conditioning
    finishers. Strong has custom timers.

### Maybe

15. **Strength standards / strength score.** Show a lift relative to bodyweight-based norms.
    This motivates beginners, but the norms need a source with a licence. Boostcamp, Lyfta and
    Alpha have it.
16. **Achievements and milestones.** Cheap engagement on top of existing Records and streaks.
    It risks becoming noise. Alpha has it, and Hevy has streak milestones.
17. **Use without an account.** This removes onboarding friction for privacy-minded lifters.
    It conflicts with account-first onboarding (ADR 0029) and with device ownership. Alpha has
    it.
18. **AI / MCP connector to the user's own data.** "Ask about my training" through the existing
    API. It is a niche feature, and it raises privacy and auth questions. Hevy has ChatGPT and
    Claude connectors.
19. **iOS Live Activity.** Only worth it if iOS becomes a real target, since Sigil is
    Android-first. Hevy, Boostcamp and Alpha have it. (Roadmap item 3.)

## Deliberately skip

- **Social feed, leaderboards, gym communities, discovery feed** (Hevy, Lyfta). They bring
  moderation, abuse handling and server-side public data, all against the private, offline-first
  model. Share cards and plan links cover the need to show off and to train together.
- **Coach platform and chat** (Hevy, JEFIT). This is a separate B2B product with messaging and
  multi-tenant permissions.
- **Fully generated workouts each day** (Fitbod, JEFIT Adaptive Plan, Alpha, Boostcamp
  Personalized, Hevy Trainer, Lyfta). Sigil's model is a deliberate Program plus progression.
  A black-box generator undermines Previous values and comparable history. Starter plans,
  equipment-aware swaps and a "short workout" option get most of the value.
- **Muscle recovery percentages** (Fitbod). This is pseudo-precise physiology. Weekly muscle
  volume against goals is more honest and already shipped.
- **Liftoscript-style program scripting** (Liftosaur). It is powerful for a niche, but it is a
  language to support forever. Covering %1RM, AMRAP and weekly targets as structured fields
  serves most programs.
- **Heart rate and calorie estimates** (JEFIT, Fitbod). They need a watch and give dubious
  numbers for lifting. Leave calories to Health Connect and the wearable.
- **Strava integration** (Hevy). Strava is cardio-centric. Health Connect covers the Android
  data path.
- **Nutrition tracking** (Strong via Health, the README's "future" note). This is a separate
  product. Nothing in this comparison justifies it before the items above.

## Sources

- Hevy: [features index](https://www.hevyapp.com/features/),
  [workout settings](https://www.hevyapp.com/features/workout-settings/),
  [programming options](https://www.hevyapp.com/features/exercise-programming-options/),
  [widgets](https://www.hevyapp.com/features/home-screen-widgets/),
  [live PR](https://www.hevyapp.com/features/live-pr/),
  [folders](https://www.hevyapp.com/features/gym-routines/),
  [streak](https://www.hevyapp.com/features/gym-consistency/),
  [Health Connect](https://help.hevyapp.com/hc/en-us/articles/34204824335255-How-to-Connect-Hevy-to-Google-Fit-Using-Health-Connect)
- Lyfta: [home](https://lyfta.app/), [vs JEFIT](https://lyfta.app/vs/jefit) (wearables)
- Strong: [home](https://www.strong.app/),
  [Health Connect](https://help.strongapp.io/article/254-google-fit-health-connect-integration)
- Fitbod: [how workouts are created](https://help.fitbod.me/hc/en-us/articles/360004429814-How-Fitbod-Creates-Your-Workout),
  [algorithm](https://fitbod.me/blog/fitbod-algorithm/),
  [volume and recovery](https://fitbod.me/blog/tracking-volume-intensity-and-recovery-with-fitbod/)
- Liftosaur: [home](https://www.liftosaur.com/),
  [progressions](https://www.liftosaur.com/features/progressions)
- Boostcamp: [home](https://www.boostcamp.app/)
- JEFIT: [home](https://www.jefit.com/)
- Alpha Progression: [home](https://alphaprogression.com/en)
