# Sessions: device verification checklist

The Android device was unavailable while the Sessions slices were built. Before calling them done, run every item below on a device with a dev-client build that includes `expo-notifications` and `expo-keep-awake` (rebuild first). Tick an item only after you have seen it on the device; note failures inline.

## Slice 2: logging screen

- [ ] Start a Workout from its menu; the Session opens on the first exercise, expanded.
- [ ] Start an empty session from Train → Create; the title updates as exercises are added.
- [ ] Ticking with empty cells adopts the muted ghost values; ticking a cell with no ghost shakes it and is refused.
- [ ] Tapping a Previous cell copies that set.
- [ ] Last set of an exercise collapses it to "4/4 · …" and opens the next; "+ Add set" stays on the collapsed row during rest.
- [ ] Superset: ticking A1 moves the highlight to B1; rest starts only after the last member.
- [ ] Keypad: digits, decimal, −/+ steps (2.5 kg barbell, 1 kg otherwise; 5/2.5 lb), Next order weight → reps → next set, Done; TalkBack reads every key.
- [ ] No system keyboard appears on any set cell.
- [ ] Exercise menu: replace (same type keeps sets, ghosts refresh), superset in/out, pinned note, log effort on/off, remove; badge changes set kind; grip reorders.
- [ ] Chevron minimises; Resume bar above the tab pill on every tab shows the title, elapsed time and current exercise.
- [ ] Kill the app mid-session, reopen: ticked sets and the Session are intact.
- [ ] Start a second Workout while one is active: Resume / Discard and start sheet.
- [ ] Two devices: take over moves ownership; the old device shows "Continued on another device", read-only.
- [ ] Two sessions started offline on two devices: both appear, chooser lets you finish/discard/resume each.
- [ ] Forgotten session: with the last tick more than 3 h ago (adjust device clock), the three-choice sheet appears.
- [ ] Basic Finish drops unticked sets and states the count.

## Slice 3: rest, timers, awake, haptics

- [ ] Rest starts on tick; −15 / +15 / Skip work; the progress line moves.
- [ ] Rest notification fires once, on time, with the app backgrounded, killed, and with the screen locked.
- [ ] +15 then Skip cancels the notification.
- [ ] Permission pre-prompt appears at the first rest; denying still shows the in-app bar; Settings → Training links to OS settings.
- [ ] Duration set with a target counts down and auto-ticks; without a target it is a stopwatch; both survive backgrounding.
- [ ] Screen stays on during a session; turning off Keep awake lets it sleep.
- [ ] Haptics: light on tick, stronger at rest end, success on a Record.

## Slice 4: finish, detail, history

- [ ] Finish summary edits title, note, start and duration.
- [ ] Update Workout? appears only when the Session differs; Structure and Targets apply independently; both off changes nothing.
- [ ] Delete the source Workout mid-session: Finish offers "Save as new Workout".
- [ ] Celebration shows Record cards; Share as text opens the share sheet.
- [ ] History groups by week with correct week totals; Log past workout creates a finished Session at the chosen date.
- [ ] Edit an old Session; its Records and the exercise page update.
- [ ] Delete a Session and Undo.

## Slice 5: records, charts, exercise page, preview

- [ ] Exercise page hero runs under the header; the header fades in on scroll; the camera cutout overlaps only the image.
- [ ] Chart scrubbing shows values; 3M / 1Y / All switch; empty and one-point states look right.
- [ ] Records list matches the session data; the help sheet explains warm-up exclusion.
- [ ] No-history exercise: How to first, numbers collapsed to one line.
- [ ] Muscle distribution sheet from the session header and in Session detail.
- [ ] Workout card opens the preview; Start begins a Session; Edit opens the editor.

Device unavailable during implementation. Pending checks:

- [ ] Exercise hero extends behind the camera cutout. Header canvas and title fade over the
      first 120 pt, with no frosted header, in light and dark themes.
- [ ] Scrub LineChart and BarChart horizontally inside the vertical scroll. Readout follows the
      nearest point; vertical scrolling remains usable. Try 3M, 1Y, All, empty and one-point ranges.
- [ ] Check VoiceOver/TalkBack point values, range/metric selection, large text and Reduce Motion.
- [ ] New exercise history puts How to first and collapses numbers to one line. Loading and
      failed history remain distinct from empty history.
- [ ] With finished history, verify per-session metrics, weight units, record values and dates,
      and help definitions against known sets. Warm-ups appear in Recent but change no totals.
- [ ] See all opens exercise history; verify its body intensity, ranked set bars and half-set
      secondary-muscle contributions. Edit/delete old sessions and confirm recomputed numbers.

## Slice 6: plates

Device unavailable during implementation; the following checks remain pending.

- [ ] Settings → Training → Plate calculator opens the 60 kg preview; Manage equipment is reachable.
- [ ] Swipe-delete bars and plates, Undo, restart offline, then reconnect; restored ids persist.
- [ ] Toggle every bar off, retry after a storage error, and check large text and screen readers.
- [ ] Add a custom lb item while using lb, then switch to kg; both kits remain available.
- [ ] Disable the 0.5 kg plates: 61 kg offers neighbours. Re-enable them: 61 kg is exact.

Spec correction: a 1.25 kg pair changes a load by 2.5 kg, not 1 kg. The default 0.5 kg
pairs already make 61 kg loadable with a 20 kg bar. Check the custom pair at 62.5 kg.

- [ ] Plate chip on barbell exercises opens the calculator with the current target.
- [ ] 60, 61 and 142.5 kg loads draw correctly; inexact targets offer closest below/above with Use.
- [ ] Add a custom 1.25 kg pair; 61 kg becomes loadable. Add a custom bar.
- [ ] Bar choice is remembered per exercise. kg ↔ lb kits switch.

## Slice 7: programs, Home, Train

- [ ] Set a Program active; Train card shows week, Cycle dots, Next up; Start from it.
- [ ] Train a full Cycle out of order; dots and Next up follow.
- [ ] Reaching the planned weeks shows the end-of-Run sheet on the next Train visit; Run again keeps old dates.
- [ ] Home: Resume, Next up, This week, Muscles this week, Recent; a new account sees only the first-workout card.
