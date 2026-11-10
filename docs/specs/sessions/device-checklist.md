# Sessions: device verification checklist

## Run on 2026-11-10 (motorola edge 60 pro, Android dev build)

Fixed while checking: fast keypad presses lost digits; a tick took about 2 s to show (one
history query per exercise, and the tick and its Rest were two writes; ticks and Rest changes now
show at once); the plate calculator sheet never opened from the keypad; 61 kg loaded 41 × 0.5 kg
plates; every plate drew black. On the exercise page: the selected metric and range chips looked unselected, volume read
"305 kg × reps", and the status bar vanished over the white picture (a top shade fixes it).
Known development-only issue: a Fast Refresh of a `packages/*`
file leaves the Session screen frozen until the app restarts.

The Android device was unavailable while the Sessions slices were built. Before calling them done, run every item below on a device with a dev-client build that includes `expo-notifications` and `expo-keep-awake` (rebuild first). Tick an item only after you have seen it on the device; note failures inline.

## Slice 2: logging screen

- [x] Start a Workout from its menu; the Session opens on the first exercise, expanded.
- [ ] Start an empty session from Train → Create; the title updates as exercises are added.
- [ ] Ticking with empty cells adopts the muted ghost values; ticking a cell with no ghost shakes it and is refused.
- [ ] Tapping a Previous cell copies that set.
- [x] Last set of an exercise collapses it to "4/4 · …" and opens the next; "+ Add set" stays on the collapsed row during rest.
- [ ] Superset: ticking A1 moves the highlight to B1; rest starts only after the last member.
- [ ] Keypad: digits, decimal, −/+ steps (2.5 kg barbell, 1 kg otherwise; 5/2.5 lb), Next order weight → reps → next set, Done; TalkBack reads every key.
- [ ] No system keyboard appears on any set cell.
- [ ] Exercise menu: replace (same type keeps sets, ghosts refresh), superset in/out, pinned note, log effort on/off, remove; badge changes set kind; grip reorders.
- [ ] Chevron minimises; Resume bar above the tab pill on every tab shows the title, elapsed time and current exercise.
- [x] Kill the app mid-session, reopen: ticked sets and the Session are intact.
- [ ] Start a second Workout while one is active: Resume / Discard and start sheet.
- [ ] Two devices: take over moves ownership; the old device shows "Continued on another device", read-only.
- [ ] Two sessions started offline on two devices: both appear, chooser lets you finish/discard/resume each.
- [ ] Forgotten session: with the last tick more than 3 h ago (adjust device clock), the three-choice sheet appears.
- [ ] Basic Finish drops unticked sets and states the count.
- [ ] Hardware keyboard (adb/USB keyboard): digits, `.`/`,`, Backspace edit the cell, Tab moves to the next cell, Enter closes the keypad; no soft keyboard shows.
- [ ] Duration cells type like a microwave (1, 3, 0 reads 1:30); reps typed as 0 leaves the cell empty with no error toast.
- [ ] The cell being edited stays visible above the keypad on a small phone, including the last set of a long exercise; Back closes the keypad first, then minimises.
- [ ] Opening another exercise scrolls it to the top; a superset opens as one block and its bracket spans both members.
- [ ] Long-press the grip: every row collapses to one line, the drop position is right, and the open block comes back afterwards; no drag starts from a cell.
- [ ] Set badge sheet changes the kind (warm-up shows W and records no effort); swipe a set to remove it; the effort sheet shows RPE or RIR by preference and clears.
- [ ] Removing an exercise that has ticked sets asks first; with none it just removes.
- [ ] Finishing with no ticked set offers to discard instead; discarding offers Undo.
- [ ] The Session modal rises over the tabs; swipe-down (iOS) or Back (Android) minimises it; the exercise picker and "create exercise" open above it and return to it.
- [ ] Resume bar: pages on every tab scroll clear of it, it steps aside with the keyboard, the switcher menu opens over it, and it vanishes after Finish; the summary's Done closes the modal.
- [ ] A Session owned by another device has every cell, tick and menu disabled; Take over makes it editable.
- [ ] Forgotten sheet: Keep going does not ask again for 3 h; Discard offers Undo; Finish at … uses the last tick plus its rest.

## Slice 3: rest, timers, awake, haptics

- [x] Rest starts on tick; −15 / +15 / Skip work; the progress line moves.
- [ ] Rest notification fires once, on time, with the app backgrounded, killed, and with the screen locked.
- [ ] +15 then Skip cancels the notification.
- [ ] Permission pre-prompt appears at the first rest; denying still shows the in-app bar; Settings → Training links to OS settings.
- [ ] Duration set with a target counts down and auto-ticks; without a target it is a stopwatch; both survive backgrounding.
- [ ] Screen stays on during a session; turning off Keep awake lets it sleep.
- [ ] Haptics: light on tick, stronger at rest end, success on a Record.
- [ ] Superset rest: ticking A1 starts nothing, ticking B1 starts the group's rest; a warm-up tick rests 1:00; an exercise with rest Off starts nothing.
- [ ] A new tick replaces the running rest and the notification time follows; unticking the set that started it removes the bar and cancels the notification.
- [ ] After the first rest the "Get a buzz when rest is over" sheet appears once; Turn on shows the system dialog, Not now never asks again; on Android 12 and below no prompt appears.
- [ ] Settings → Training: "Rest notifications" shows On / Off in system settings / Not set up; denied and granted open the system settings, not set up asks; returning from the OS settings refreshes the status.
- [ ] Notification text reads "Rest is over" with the workout title; with the session screen open there is no banner, only the haptic; minimised on another tab, the banner shows.
- [ ] The Android channel "Rest timer" exists in system settings with high importance and vibration, and the alert makes no sound.
- [ ] Take over the Session on a second device while a rest runs: the first device's notification does not fire.
- [ ] Rest +15 stops at 10:00; −15 near zero ends the rest; the end haptic plays once, and not when opening the screen after a rest already ended.
- [ ] "+ Add set" on the collapsed row disappears when its rest ends.
- [ ] Setting the device clock back or forward mid-rest never shows more than the rest's length or a negative time.
- [ ] Duration with a target: typing a value instead cancels the timer; a stopwatch Stop ticks with the counted time; a countdown that ended while the app was killed ticks (with the target) when the app opens.
- [ ] A countdown on a set that cannot be ticked (distance missing) stops with the duration saved and shakes the missing cell.
- [ ] Keep awake: on a locked-down device the screen stays on only while the Session screen is in front (not under the picker), and Settings → Training → Keep screen awake turns it off.

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

- [x] Plate chip on barbell exercises opens the calculator with the current target.
- [x] 60, 61 and 142.5 kg loads draw correctly; inexact targets offer closest below/above with Use.
- [ ] Add a custom 1.25 kg pair; 61 kg becomes loadable. Add a custom bar.
- [ ] Bar choice is remembered per exercise. kg ↔ lb kits switch.

## Slice 7: programs, Home, Train

- [ ] Set a Program active; Train card shows week, Cycle dots, Next up; Start from it.
- [ ] Train a full Cycle out of order; dots and Next up follow.
- [ ] Reaching the planned weeks shows the end-of-Run sheet on the next Train visit; Run again keeps old dates.
- [ ] Home: Resume, Next up, This week, Muscles this week, Recent; a new account sees only the first-workout card.
