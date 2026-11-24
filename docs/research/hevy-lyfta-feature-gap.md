# Hevy and Lyfta feature inventory and Sigil gap list

Researched 24 November 2026. Not committed.

## How this was done, and what it does not cover

- **Hevy (Android, `com.hevy`)** was driven read-only on the user's motorola edge 60 pro through `agent-device`. Citations of the form *(device: Profile > Settings > …)* are screens I opened and read. Anything marked *(web)* comes from hevyapp.com feature pages, because I did not reach that screen.
- **Lyfta (`com.lyfta`) was installed**, so it was inspected on the device too, but less deeply than Hevy: Settings, the live-workout menus, the in-workout Workout Settings page and the exercise library. Everything else is from lyfta.app pages, marked *(web)*. The Lyfta site had no working help center (`help.lyfta.app` does not resolve; `/features`, `/premium` and `/faq` return 404), so web coverage is thinner than for Hevy.
- **Not visited on device, so web or inference only:** Hevy Account sub-pages (only their rows were read), Contacts & Discovery, Default Workout Visibility options, the Hevy filter pickers (equipment, muscle), Create Exercise, the Statistics sub-screens (all are listed, none were opened beyond their index), the Hevy Pro paywall beyond its price list, Lyfta Home/Explore/Progress/Workout tabs, Lyfta Graph Settings, Push Notifications, Privacy Controls, Beta Features.
- **Both phone apps already had a workout in progress** (Hevy: "Inverted Row", Lyfta: "Bench Press … Reverse Curl"). I only viewed them. Nothing was saved, finished, discarded, posted or changed. In Lyfta one tap hit a "discard this workout?" dialog; I dismissed it without confirming and the workout was still listed afterwards. The Hevy routine editor was opened and left with Cancel.
- Hevy's own features guide on help.hevyapp.com returned 403, and `/pricing` is a 404. Free-tier limits come from a search summary of the Play listing and help pages, so treat them as likely, not confirmed.
- Sigil status comes from `apps/native/src`, `packages/shared/src/preferences.ts` and the i18n strings in `packages/i18n/src/locales/en.json`. **Correction to `docs/research/sigil-roadmap.md`**: it says Copyable Workout and Program links are a "Next" item, but the code already has share links (`apps/native/src/share/links`, a "Shared links" settings page and an "Enter code" entry in `settings-screen.tsx`). I did not read the link implementation, so "has" below means it exists, not that it matches Hevy's flow.

---

## (a) Hevy inventory

### Navigation
- Bottom tabs: Home, Workout, Profile. *(device: tab bar)*
- A persistent mini-bar for a workout in progress sits above the tabs, with an expand chevron, a live timer and a discard (trash) button. *(device: Workout tab)*

### Home / feed
- Social feed of followed users' workouts with duration, volume, records count and exercise summary. *(device: Home)*
- Search (users) at the top of Home. *(device: Home)*
- "Suggested Athletes" row with Featured badges and Follow buttons. *(device: Home)* Can be hidden (see Privacy & Social).
- "Invite a friend" card. *(device: Home)*
- Likes and comments on workouts. *(web: hevyapp.com/features/ — Social Feed)*
- Discovery feed, athlete workouts, user profiles, compare performance and stats. *(web: /features/)*

### Workout tab
- **Start Empty Workout** button. *(device: Workout tab)*
- **Routines** header with "Add new folder" icon. *(device: Workout tab)*
- **New Routine** and **Explore** buttons. *(device: Workout tab)*
- Folders, collapsible, with a count and a "…" menu; a "My Routines" folder with an "Add new routine" dashed button. *(device: Workout tab)*
- Routine card: name, exercise summary, **Start Routine**, "…" menu. *(device: Workout tab)*
- Routine menu: **Share Routine, Duplicate Routine, Edit Routine, Delete Routine**. *(device: Workout tab > "…" on a routine)*
- A refresh icon and a PRO badge sit in the Workout tab header. *(device: Workout tab)*
- Share folders and routines. *(web: /features/share-folders-routines)*

### Explore (routine and program library)
- Tabs: **Programs**, **Routines**. *(device: Workout > Explore)*
- 26 programs, "Show all 26 programs", cards such as Beginner/Intermediate Push/Pull/Legs (Gym Equipment) and Full-Body, each with a routine count. *(device: Workout > Explore)*
- Filters: **Level, Goal, Equipment**. *(device: Workout > Explore)*
- Quick collections: At home, Travel, Dumbbells Only, Band. *(device: Workout > Explore)*
- **Trainer**: "Program based on your needs and goals", "Explore now" (the plan generator). *(device: Workout > Explore; web: /features/workout-plan-generator)*
- Saved programs appear as a folder in Routines; any routine in it can be edited. *(web: /features/track-workouts/)*

### Routine editor
- Header: **Cancel**, title "Edit Routine", **Update**. Routine title field with a clear button. *(device: Routine > Edit)*
- Per exercise: thumbnail, name (opens detail), "⋮" menu, **Rest chip**, **Note chip**, set table. *(device: Edit Routine)*
- Exercise menu: **Reorder Exercises, Replace Exercise, Add To Superset, Remove Exercise**. *(device: Edit Routine > ⋮)*
- Rest chip opens a "Rest Timer" wheel picker for that exercise (steps of 5 s; "off" at the end; a warning icon when a rest time is set but the global default is off). Range 5 s to 5 min. *(device: Edit Routine > Rest chip; web: /features/workout-rest-timer)*
- Notes on an exercise show each time the routine is used; a clickable link is allowed. Pinned notes follow the exercise everywhere. *(device: routine note visible; web: /features/track-workouts)*
- Set table with a **REPS ▾** header: **Reps** or **Rep Range**. *(device: Edit Routine > REPS header)*
- Tap the set number: **Warm Up Set, Normal Set, Failure Set, Drop Set, Remove Set**, each with a "?" explainer. *(device: Edit Routine > set number)*
- **Add Set** button; swipe left to delete a set. *(device + web)*
- Timed exercises use a TIME column instead of REPS. *(device: Warm Up exercise)*
- Warm-up sets can be added from the exercise menu once the Warm-up Calculator is on (Pro). *(web: /features/warm-up-set-calculator)*

### Live workout
- Header: collapse chevron, "Log Workout" title, **clock/timer button**, **Finish**. *(device: live workout)*
- Stats bar: Duration, Volume, Sets, plus a small **live muscle map** that fills as you work. *(device: live workout)*
- Per exercise: same chips and "⋮" menu as the routine editor (Reorder, Replace, Add To Superset, Remove). *(device: live workout > ⋮)*
- Columns: SET, **PREVIOUS**, weight/reps inputs, **completion checkbox**; the completed row tints green. *(device: live workout)*
- Clock sheet: **Timer** and **Stopwatch** tabs, a countdown dial, **−15s / +15s**, **Start**, and a settings icon. *(device: live workout > clock)*
- Auto rest timer starts when a set is checked; inline timer option. *(device: Workouts settings; web)*
- Plate calculator button above the keyboard for barbell, short bar and EZ bar; "Manage" available equipment (bars and plates); suggests the closest reachable weight. *(web: /features/weight-plate-calculator)*
- Live personal-record notification (1RM, most reps, best duration) as sets complete. *(device: Workouts > Sounds > Live Personal Record Volume; web: /features/track-workouts)*
- **Update Bodyweight** from a bodyweight exercise's menu. *(web: /features/track-body-measurements)*
- Edit duration, start date and time; pause and restart the stopwatch. *(web: /features/track-workouts)*
- Live Activity on iOS and Android lock screen. *(web: /features/live-activity)*
- Save screen: name, volume, sets, editable duration and start time, up to three photos or two photos plus a video, a note (with user tags), a private toggle. *(web: /features/track-workouts)*
- Post-save: workout ordinal ("472nd"), weekly streak, PR highlights, shareable graphics with transparent, light or dark backgrounds. *(web: /features/track-workouts)*
- Edit or delete a saved workout from Profile "⋮". *(web)*

### Exercise library
- Opened from Profile > Exercises (and from the add-exercise picker). *(device: Profile > Exercises)*
- **Create** button (custom exercises), search field, **All Equipment** and **All Muscles** filters, "Recent Exercises" section, alphabetical "All Exercises" list with primary muscle under each name. *(device: Profile > Exercises)*
- Exercise detail with tabs **Summary, History, How to**. *(device: tap an exercise name)*
- Summary: name, **Primary** and **Secondary** muscles, "Also known as", chart with a period selector (Last 3 months), **Personal Records** (e.g. Most Session Reps, Best Set, Session Reps, Most Reps (Set)). *(device: exercise detail)*
- Custom exercises; free tier is capped (see Pro). *(web: /features/custom-exercises)*
- Exercise programming options. *(web: /features/exercise-programming-options)*

### Profile, stats, calendar, measures
- Profile header: avatar, username, **Workouts count, Followers, Following**, "Your profile is 80% finished" nudge, **Settings** (gear). *(device: Profile)*
- Dashboard: "this week" hours, **Workouts** chart with a period selector (Last 3 months), metric toggle (**Volume / Reps / Duration**). *(device: Profile)*
- Profile buttons: **Statistics, Exercises, Measures, Calendar**. *(device: Profile)*
- **Statistics** (Last 7 days body graph on top, then "Advanced statistics"): **Set count per muscle group, Muscle distribution (Chart), Muscle distribution (Body) (weekly heat map), Main exercises, Leaderboard Exercises, Monthly Report**. *(device: Profile > Statistics)*
- **Measures**: empty state with **Add Measurement** and **Add Progress Picture**. *(device: Profile > Measures)*
- Measurement metrics: body weight, body fat %, neck, shoulders, chest, waist, abdomen, hips, biceps (L/R), forearm, thigh, calf, each with a graph; edit later; attach photos. *(web: /features/track-body-measurements)*
- **Calendar**: Month view, "0 week streak", "14 rest days", scrolling months with the workout name on trained days. *(device: Profile > Calendar)*
- Recent workouts list on the profile. *(device: Profile)*
- Year in Review, Monthly Report, workout consistency and streak. *(web: /features/)*
- Social media shareables. *(web: /features/shareable)*
- Leaderboards (per exercise; per gym). *(web: /features/gym-leaderboard, /features/gyms)*
- Coach product: assigned workouts and chat. *(web: /features/strength-coach)*

### Settings (Profile > gear) — top level
Rows, in order: **Account, Manage Subscription, Notifications, Workouts, Privacy & Social, Units, Language, Integrations, Theme, Export & Import Data**, then **Preferences / Guides / Getting Started Guide**. *(device: Profile > Settings)*

**Account** — Change Username, Change Email, Update Password, Delete Account. *(device: Settings > Account)*

**Manage Subscription** — "Free Subscription · free access forever"; offers: Lifetime ₹5,900 (pay once), Yearly ₹1,999, Monthly ₹249; Restore Purchases; Terms & Conditions; Privacy Policy; "More information"; contact hello@hevyapp.com. *(device: Settings > Manage Subscription)*

**Notifications** — a banner when phone notifications are off, then toggles: General group: **Rest Timer, Follows, Monthly Report** ("when your monthly report is ready"); **Subscribe to Hevy emails** (tips, features, offers); then **Likes** (on your workouts / on your comments), **Comments** (on your workouts), **Comment Replies**, **Comment Mentions**. *(device: Settings > Notifications)*

**Workouts** (Workout Settings) *(device: Settings > Workouts)*
- Wearable Sensor (page: heart-rate sensor, one at a time, **Connect**).
- Sounds (page: Timer Sound, Timer Volume, Check Set, Live Personal Record Volume; values seen: Default, High, Off, High).
- Default Rest Timer (wheel picker; "Off", then 5 s steps).
- First day of the week (Sunday … Saturday; also drives graphs).
- Previous Workout Values: **Same Routine** or **Any workout**.
- Warm-up Calculator — **PRO**-badged.
- Warm-up Sets (page: "Include warm-up sets in workout stats" toggle; changing it affects past and future workouts).
- Keep Awake During Workout (off), Plate Calculator (on), RPE Tracking (off), Smart Superset Scrolling (off), Inline Timer (on).

**Privacy & Social** — Private Profile (follow requests), Hide Suggested Users, Contacts & Discovery (sub-page), Default Workout Visibility (Everyone; also whether gym-tagged workouts show on the gym profile). *(device: Settings > Privacy & Social)*

**Units** — kg, lbs, kilometers, miles, cm, in. *(device: Settings > Units)*

**Language** — 16: English, Español, Deutsch, Français, Italiano, Português (PT), Türkçe, 简体中文, 繁體中文, Русский, 日本語, 한국어, Português (BR), العربية, Català, हिन्दी. *(device: Settings > Language)*

**Integrations** — **Health Connect** (write workouts; read body measurements, heart rate, calories), **Strava**, **ChatGPT** (Hevy plugin to create plans, analyse training, save routines), Wearable Sensors. *(device: Settings > Integrations)* Also a Claude connector and a public API. *(web: /features/, api.hevyapp.com/docs)*

**Theme** — "Use OS setting" (picker). *(device: Settings > Theme)*

**Export & Import Data** — Export Data → "Export Workouts": whole workout and measurement history as CSV, "can not be imported back into Hevy". Import Data → "Import Strong CSV" only, one import allowed, can be reverted. *(device: Settings > Export & Import Data)*

**Guides / Getting Started Guide** — in-app how-to text ("Start Empty Workout", routines). *(device: Settings > Getting Started Guide)*

**Home-screen widgets** — a Streak widget showed in the launcher. *(device: launcher widget "Streak"; web: /features/home-screen-widgets)*

### Hevy Pro and free tier
- Pro-badged on device: Warm-up Calculator row, Workout tab header badge. *(device)*
- Free tier reportedly limited to 4 routines, 7 custom exercises and 3 months of history/statistics; Pro removes the caps and adds extra body measurements, all-time stats, advanced stats such as set count per muscle group, Progressive Overload Recommendations and Trainer Progress Reports. *(web: search summary of help.hevyapp.com features guide and the Play listing — unconfirmed, see caveats)*
- Routine library, social, supersets, rest timer and basic body weight/waist tracking are free. *(web: /features/ FAQ, same summary)*

---

## (b) Lyfta inventory

### Navigation and home
- Bottom tabs: **Home, Explore, Workout, Progress, You**. *(device: tab bar)*
- Home: "Ready to start lifting, <name>?" with START WORKOUT, **Suggested Challenges**, **Your weekly snapshot** (workouts, duration, volume). *(device: Home)*
- **Monthly challenges**: total-volume (150k/200k/500k kg) and single-session volume (15k/20k/50k kg) challenges with **Join**. *(device: You)*
- A "Workout in Progress" bar with **Resume** and **Discard**. *(device: bottom bar)*

### Explore / exercise library
- **Exercises** screen: bookmark (favorites) filter, a **body-map strip to pick a muscle**, search, filter, add (+); list with illustration and primary muscle; grid/list toggle. *(device: Explore)*
- 5,000+ exercises with HD video guides; muscle group filters (Chest, Back, Biceps, …, Neck), Favorites. *(web: lyfta.app/exercises)*
- Custom exercise creation is Premium. *(web: lyfta.app/subscription)*

### Workout tab and live workout
- Workout in progress shows duration, volume and sets, an exercise list with "x/y done", a **stopwatch/timer** icon, **Finish**, **Add Exercises**, **More**. *(device: live workout)*
- **More** sheet: **Share Workout, Pause Workout, Add Photo, Add Notes, Workout Settings, Discard Workout**. *(device: live workout > More)*
- Exercise "⋮": **Add warm-up sets, Add pinned note, Add to superset, Replace exercise, Unit (kg), Remove exercise** — note the **per-exercise unit** switch. *(device: live workout > ⋮)*
- Exercise names can be renamed to custom entries (e.g. a custom "Sanity Flaps" exercise with a photo). *(device: live workout list)*
- Workout programs and routines, goal and level discovery, personal library of saved routines. *(web: lyfta.app/subscription)*
- **AI Workout Generator** (equipment, goal, time). *(web: lyfta.app/tools)*
- Warm-up auto-insert and plate calculator are Premium. *(web: lyfta.app/subscription)*

### Settings (You > gear) *(device: Settings)*
- **Account**: Your Lyfta Subscription (Premium), Restore Purchases, Profile, **Gift a friend 14 days of Premium**, **Synchronize Workout Data**.
- **Integrations**: Strava, Health Connect (Not Connected), Google Fit, Samsung Health (the last two "Learn more"), **Import Data**, **Export Data**.
- **Preferences** (rows seen): Units (kg/km/cm), Privacy Controls, Push Notifications, First Day of Week, **Workout Settings**, Graph Settings, Theme, Language, Beta Features.
- **More**: Get Help.
- **Workout Settings page** *(device: live workout > More > Workout Settings)*:
  - Rest Timer Settings: Sound (Default), Volume (Medium), **Vibration** (Medium), Default Rest Time (Off, with a "?" help).
  - Preferences: **RPE or RIR Tracking** (RIR), Previous Workout Values (Any Workout), Keep Awake, **Detailed Workout View**, Auto-Scroll Supersets (on), **Connect to Spotify** (button on the log screen), **Connect to YouTube Music**, **AI Exercise Suggestions**, **Personal Record Notification** (on).

### Stats, body, social (web)
- Free: basic progress, unlimited routines, library with video. Premium: extended history, exercise graphs, volume over time, calendar, PR summaries, muscle split and radar, rep-range/training-zone breakdown, heart-rate charts, weekly and monthly recaps with muscle maps, shareable stats, strength rankings by age and bodyweight, strength comparisons. *(web: lyfta.app/subscription)*
- Body measurement tracker (gating inconsistent between the home page and /subscription). *(web)*
- Connect with friends, share routines, follow. *(web: lyfta.app)*
- Free web tools: 1RM calculator, strength level calculator, exercise comparison. *(web: lyfta.app/tools)*
- Apple Watch app (March 2024); Strava integration. *(web: lyfta.app/blog)*
- Plans: monthly, annual, 14-day trial, lifetime ("Lyfta for Life"), referral rewards; no prices published on the site. *(web: lyfta.app/subscription)*
- Separate Lyfta Coach product and a shop. *(web: lyfta.app/tools, lyfta.app)*

---

## (c) Gap table

Status key — **has**: shipped in Sigil; **partial**: exists but narrower; **missing**: not found in code. File references are under `apps/native/src` unless noted. Verdict: **now / later / skip**.

### Account and data

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Change email | Yes (Account) | Not seen | **has** — `account/use-change-email.ts`, `account/components/change-email-section.tsx` | n/a |
| Change username | Yes | Profile page | **partial** — display name only (`settings__profile_name`) | skip: no public handle without social |
| Change password | Yes | Not seen | **n/a** — email-code and Google sign-in only (`auth/`) | skip: no passwords by design |
| Delete account | Yes | Not seen | **has** — `account/components/delete-account-screen.tsx` | n/a |
| Export history | Whole history incl. measurements, CSV, not re-importable | Export Data (format not seen) | **partial** — sets only, Strong CSV (`settings/export-data.ts`) | later: add measurements and a JSON export so nothing is stranded |
| Import history | Strong CSV only, once, revertible | Import Data (formats not seen) | **has, ahead** — Strong and Hevy (`history-import/`) | n/a; revert-an-import is worth checking |
| Revert an import | Yes | Unknown | **missing** (not found) | later: cheap trust feature if imports are re-runnable |
| Language | 16 languages | Language setting | **partial** — English only, i18n ready (`settings/` Language row) | later: translations once the beta stabilises |
| Subscription, restore purchases, gift Premium | Yes | Yes | **missing** (no paywall) | skip: no monetisation planned |
| Profile-completeness nudge | "80% finished" | n/a | **missing** | skip |
| Synchronize Workout Data (manual sync) | n/a | Row in Account | **partial** — automatic PowerSync, no manual button | skip: sync status is automatic |
| Public API / ChatGPT / Claude connectors | Yes | n/a | **missing** | skip: revisit only if users ask |

### Notifications

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Rest timer notification | Toggle | Sound/vibration | **has** — `session/notifications/rest-notification.ts` | n/a |
| Training-day reminder | Not seen (none in toggles) | Push Notifications page (contents not seen) | **missing** — only body reminders exist (`body/reminders/`) | **now**: "today is Upper A" reminder tied to the Run; pairs with cycle strip |
| Monthly report ready | Toggle | n/a | **missing** (reports exist, `session/report/`) | later: cheap once reminders exist |
| Weigh-in and check-in reminders | Not seen | n/a | **has** — `body/reminders/` | n/a |
| Social notifications (likes, comments, follows, mentions) | 6 toggles | n/a | **missing** | skip: no feed |
| Marketing email opt-in | Toggle | n/a | **missing** | skip |

### Workout logging options

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Set kinds | Warm-up, normal, failure, drop | Not seen | **has, ahead** — `SET_KINDS` has 7 (adds top, back-off, myo), `packages/shared/src/training/vocabulary/vocabulary.ts` | n/a |
| Previous values; source toggle | Same routine / any workout | Any workout / same | **has** — `previousSource` pref | n/a |
| RPE (and RIR) tracking | RPE toggle, per set in live only | RPE or RIR picker | **has** — `effortScale`, `session/sets/effort-sheet.tsx` | n/a |
| Default rest, per-exercise rest | Yes | Default rest | **has** — `defaultRestSeconds`; per exercise `session/rest/rest-rules.ts` | n/a |
| Timer ±15 s, stopwatch tab | Yes | Timer icon | **partial** — countdown timer exists (`session/timer/`); no confirmed stopwatch tab | later: stopwatch is small |
| Rest sound type, volume, vibration | Sound picker, volume, check-set sound, PR volume | Sound, volume, vibration | **partial** — three on/off groups only (`session/settings/session-settings-sheet.tsx`) | later: volume and vibration; sound choice is low value |
| Keep awake | Toggle (default off) | Toggle | **has** — `keepAwake` (default on) | n/a |
| Plate calculator, custom bars and plates | Yes | Premium | **has** — `session/plates/` | n/a |
| Warm-up calculator (editable ramp, rounding) | Pro | Premium | **has** — `settings/components/warmup-settings-screen.tsx` | n/a |
| Count warm-ups in stats | Toggle | n/a | **has** — `countWarmups` | n/a |
| Smart superset scrolling | Toggle | Auto-scroll supersets | **has** — `supersetScroll` pref | n/a |
| Live PR alert | Sound and notification | Toggle | **has** — `recordAlerts`, `session/sets/record-chip.tsx` | n/a |
| Pinned exercise notes | Yes | "Add pinned note" | **has** — `exercise/components/pinned-note-sheet.tsx` | n/a |
| Session notes and photos | Notes, 3 photos or video | Add Photo, Add Notes | **partial** — photos and notes exist (`session/screen/session-photos.tsx`, `note-sheet.tsx`); no video | later: video only if sharing wants it |
| Edit duration, start date and time | Yes | Unknown | **partial** — past-date logging exists (`session/history/log-past-screen.tsx`), editing a live start time unconfirmed | later |
| Per-exercise unit (kg or lb per exercise) | Not seen | **Yes** — "Unit (kg)" | **missing** — one account unit (`weightUnit`) | later: handy for mixed kg/lb gyms and machines |
| Pause workout | Stopwatch pause (web) | Pause Workout | **missing** (not found) | later: long gym sessions |
| Update bodyweight from a live exercise | Yes | Not seen | **partial** — weight logging exists (`body/weight/`), no in-session shortcut | later |
| Heart-rate sensor (Bluetooth) | Yes | Heart-rate charts (Premium) | **missing** | skip: hardware support cost |
| Music button on the logging screen | n/a | Spotify, YouTube Music | **missing** | skip: system media controls cover it |
| AI exercise suggestions | n/a | Toggle | **missing** | skip |
| Lock-screen live activity | Yes (iOS and Android) | n/a | **partial** — Android live notification (`session/notifications/workout-live-host.tsx`); iOS missing | later, per roadmap item 3 |
| Detailed workout view | n/a | Toggle | **missing** | skip: Sigil already has an accordion |
| Replace exercise, reorder, superset, remove | Menu | Menu | **has** — `session/screen/session-screen.tsx` | n/a |

### Routines and programs

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Routine library (explore, filters, 26 programs) | Level, goal, equipment filters; free | Programs, partly Premium | **missing** — planned as starter Programs in the roadmap | **now**: roadmap priority 1 |
| Quick collections (at home, travel, dumbbells, band) | Yes | n/a | **missing** | now: fold into starter Programs as equipment tags |
| Folders for routines | Yes | n/a | **has** — Programs group Workouts (`training/programs/`) | n/a |
| Duplicate and share routine | Yes | Share routines | **partial** — duplicate and share links exist; verify flow (`share/links`, `training/programs/use-program-actions.ts`) | n/a |
| Rep range targets | Yes | n/a | **has** — Planned sets (`packages/shared/src/training/plans/planned-sets.ts`) | n/a |
| Trainer-style plan generator | Hevy Trainer | AI Workout Generator | **missing** | skip: roadmap defers a generator |
| Routine updates after a session | "Update Routine" prompt | n/a | **has** — `session/finish/update-routine-sheet.tsx` | n/a |
| Per-week targets / deload phases | n/a | n/a | **missing**, roadmap item 7 and planned week phases | later, already planned |

### Exercise library

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Search, filter by muscle and equipment | Yes | Body-map, filters | **has** — `exercise/library/filter-state.ts` | n/a |
| Create custom exercise | Yes (capped on free) | Premium | **has** — `exercise/form/` | n/a |
| Exercise detail: records, history, chart | Summary, History, How to | Video, instructions | **has** — `exercise/detail/` (adds progression and swaps) | n/a |
| Muscle picker by body map | n/a | Yes | **partial** — body map exists for muscles (`body-map/`), not confirmed as a library filter | later: strong visual filter |
| Favorites | n/a | Yes | **missing** (not found) | later: pairs with a long catalog |
| Primary and secondary muscles, aliases | Yes ("Also known as") | n/a | **partial** — muscles shown; aliases unconfirmed | later |
| HD video per exercise | Image or video | HD video | **has** — `exercise/detail/components/video-hero.tsx` | n/a |

### Stats and progress

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Per-exercise records | Yes | Premium | **has** — `session/finish/session-records.ts` | n/a |
| Muscle volume (sets/week, heat map, distribution) | Pro for set count | Premium radar | **has** — `training/muscles/` with goals | n/a |
| Monthly and year-in-review reports | Yes | Weekly and monthly recaps (Premium) | **has** — `session/report/` | n/a |
| Workout calendar and streak | Calendar, week streak | Calendar | **has** — `session/history/history-calendar-view.tsx`, week strip | n/a |
| Leaderboard exercises / strength rankings | Yes | Strength rankings (Premium) | **missing** | skip: needs a population |
| Progressive overload recommendations | Pro | Premium progression tools | **has, ahead** — `packages/shared/src/training/progress/progression.ts` | n/a |
| Compare performance with others | Yes | n/a | **missing** | skip |
| Heart-rate and calorie charts | Via Health Connect | Premium | **missing** | later, with Health Connect |

### Body

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Body weight and trend | Yes | Yes | **has, ahead** — `body/weight/` | n/a |
| Circumference measurements | 14 metrics | Yes | **has** — `body/measurements/` with chosen metrics | n/a |
| Body fat % | Yes | Unknown | **partial** — verify `BODY_METRICS` in `packages/shared/src/body.ts` | later |
| Progress photos | Yes | Unknown | **has** — `body/photos/` with compare and privacy | n/a |
| Measurement reminders | n/a | n/a | **has** — `body/reminders/` | n/a |

### Social and sharing

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Follow, feed, likes, comments | Core | Friends | **missing** | skip: roadmap defers; moderation cost |
| Private profile, hide suggested users, default visibility | 4 settings | Privacy Controls | **missing** | skip with the feed |
| Share cards for sessions | Shareables | Share Workout | **has** — `share/`, `session/share/` | n/a |
| Share routine or folder | Link | Share routines | **has** — `share/links` (verify against roadmap item 4) | n/a |
| Monthly challenges | n/a | Yes (volume goals) | **missing** | skip: low retention value without friends |
| Referral rewards, gift Premium | n/a | Yes | **missing** | skip |
| Coach product | Hevy Coach | Lyfta Coach | **missing** | skip |

### Integrations

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Health Connect (write workouts, read body, HR, calories) | Yes | Yes | **missing** | **now/next**: roadmap item 5 (write finished sessions, opt-in) |
| Apple Health | Yes | Yes | **missing** | next, same item |
| Strava | Yes | Yes | **missing** | skip: low demand for strength |
| Samsung Health, Google Fit | n/a | Rows (Learn more) | **missing** | skip: Health Connect covers it |
| Apple Watch / Wear OS app | Watch images (web) | Apple Watch app (2024) | **missing** | later: roadmap defers watches |
| Home-screen widgets | Streak widget | n/a | **missing** (no widget code found) | later: a "next workout" widget |
| ChatGPT / Claude plugins | Yes | n/a | **missing** | skip |

### Settings and preferences

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Units: weight, distance, length | 6 options | kg/km/cm | **has** — `weightUnit`, `distanceUnit`, `lengthUnit` | n/a |
| Theme | OS setting | Theme | **has, ahead** — mode plus 6 accents (`theme__accent_*`) | n/a |
| First day of week | Yes (drives graphs) | Yes | **has** — `weekStart` | n/a |
| Duration format | n/a | n/a | **has, ahead** — `durationFormat` | n/a |
| Keyboard choice | n/a | n/a | **has, ahead** — `systemKeyboard` | n/a |
| Crash reports, feedback | n/a | Get Help | **has** — `settings/components/feedback-sheet.tsx`, `crash-reports-row.tsx` | n/a |
| In-app guides / getting started | Guide pages | Get Help | **partial** — onboarding only | later: short tips page |
| Beta features switch | n/a | Yes | **missing** | skip |
| Graph settings | n/a | Yes | **missing** | skip |

### Paywall

| Feature | Hevy | Lyfta | Sigil | Worth adding? |
| --- | --- | --- | --- | --- |
| Free tier caps (routines, custom exercises, history) | 4 / 7 / 3 months (unconfirmed) | Premium analytics and programs | **has** — none, everything free | n/a |
| Pro gates: warm-up calculator, advanced stats, overload recommendations | Yes | Plate calculator, warm-up, custom exercises, analytics | **has** — all free | n/a |
| Lifetime / yearly / monthly plans | ₹5,900 / ₹1,999 / ₹249 (device) | Monthly, annual, lifetime, 14-day trial | **missing** | skip: no billing in scope |

---

## (d) Prioritised top 15

1. **Editable starter Programs and an Explore-style picker with level, goal and equipment filters** — the largest gap in the whole inventory and already roadmap priority 1; Hevy's free library is its main onboarding path. *(Hevy: Workout > Explore; roadmap)*
2. **Training-day reminder notification** — Sigil has body reminders and a Run schedule but no push that says "today is Upper A". Ties directly to the planned cycle strip. *(neither app's toggles show it clearly; Hevy has only rest and report pushes)*
3. **Health Connect write for finished Sessions (then Apple Health)** — both competitors ship it; roadmap item 5. *(Hevy: Settings > Integrations; Lyfta: Settings > Integrations)*
4. **Equipment-aware swaps with named Gyms** — already planned; matches Hevy's gym tagging and Lyfta's "Replace exercise" flow. *(device: both live-workout menus)*
5. **Export measurements and a JSON backup alongside the CSV** — Hevy exports measurements; Sigil's CSV carries sets only. *(Hevy: Export Data page)*
6. **Rest-timer sound volume and vibration** — small settings, both rivals have them; Sigil's sounds are three on/off groups. *(Lyfta: Workout Settings; Hevy: Sounds)*
7. **Per-exercise unit (kg or lb on one exercise)** — Lyfta exposes it in the exercise menu; useful for machines and travel. *(Lyfta: live workout > ⋮ > Unit)*
8. **Pause Workout** — long sessions with breaks distort duration and pace; Lyfta has it in the live menu. *(Lyfta: More > Pause Workout)*
9. **iOS Live Activity** — Hevy ships lock-screen controls; roadmap item 3, depends on the beta's device mix. *(Hevy web: /features/live-activity)*
10. **Home-screen widget (next workout and streak)** — Hevy ships a Streak widget; cheap to read from local data. *(device: Hevy launcher widget)*
11. **Favorites and a body-map muscle filter in the exercise library** — Lyfta's library leads with both. *(Lyfta: Explore)*
12. **Stopwatch tab and ±15 s on the timer sheet** — Hevy's clock sheet has both; verify what Sigil's timer sheet already does. *(device: Hevy live workout > clock)*
13. **Revert-an-import and import confirmations** — Hevy lets users undo an import; protects users who try an import with the wrong mapping. *(Hevy: Import Data)*
14. **Monthly report ready notification** — one push on top of the existing reports. *(Hevy: Notifications > Monthly Report)*
15. **Translations beyond English** — Hevy ships 16 languages; Sigil's i18n is ready but English only. *(Hevy: Settings > Language)*

Deliberately skipped: social feed, follows, leaderboards, challenges, coach products, paywall, Strava, heart-rate sensors, AI suggestions, music buttons.
