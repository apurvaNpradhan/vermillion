# PanelUI patterns for Vermillion

Reviewed 2026-11-10 against the [component inventory](https://panelui.dev/docs/components)
and the connected Android app. Keep HeroUI Native as the component base and adapt useful patterns
with Vermillion tokens. Installing a second UI provider would duplicate sheets, buttons and themes.

## Applied to target editing

- [TimePicker](https://panelui.dev/docs/components/time-picker): adapted its snapping wheel pattern
  to a rest **duration**, with minutes and seconds, a 10-minute bound, presets and Off. A time-of-day
  clock face or AM/PM is inappropriate here. Uses HeroUI sheet/buttons. Source attribution and the
  MIT notice are in `rest-picker.tsx` and `docs/licenses/panelui-MIT.txt`.
- [ToggleButton](https://panelui.dev/docs/components/toggle-button): separate Exact reps and Rep range
  choices show the selected mode. The old word between the range endpoints read like a unit rather
  than an action. Rep values in the table now open one labelled picker and never contain a mode button.
- [NumberInput](https://panelui.dev/docs/components/number-input): retain bounded, repeat-on-hold
  count controls. The inline editor labels the count as sets. Weight and reps remain numeric inputs
  or an explicit target picker, rather than steppers requiring many presses.
- [Frame](https://panelui.dev/docs/components/frame) and
  [Item](https://panelui.dev/docs/components/item): one labelled Rest row with the value and chevron.
  Keep actions aligned and large enough to press. No bare duration text field.
- [Badge](https://panelui.dev/docs/components/badge): short set badges with category tokens and text
  cues. W is a warm-up, D a drop set and T to failure. Non-warm-up sets count in one sequence:
  W, 1D, 2, 3T. Changing a set type cannot make the next training set become number 1.
- [BottomSheet](https://panelui.dev/docs/components/bottom-sheet): use focused pickers with one
  decision and a Done button. Rest and reps are drafts until Done; dismissal cancels. Set type is
  a short choice that applies on tap. Remove the disabled "All sets alike" action from custom sets.

## Best candidates for later work

- [Sortable](https://panelui.dev/docs/components/sortable): the explicit handle and accessibility
  controls are useful for workouts and rotations. Keep our existing fractional-order writes and
  superset repair rules; a visual reordering library cannot replace those domain rules.
- [Countdown](https://panelui.dev/docs/components/countdown): useful for the live Session rest display.
  Derive it from persisted end timestamps as ADR 0037 requires. A visual countdown is not a reliable
  background scheduler or notification implementation.
- [Collapsible](https://panelui.dev/docs/components/collapsible): useful for optional exercise notes
  and warm-up details. Main set targets must remain visible. Avoid nested accordions during logging.
- [Menu](https://panelui.dev/docs/components/menu) and [Swipe](https://panelui.dev/docs/components/swipe):
  retain visible overflow actions alongside swipe. ContextMenu can be an extra shortcut, never the
  only route to replace, duplicate or remove.
- [SearchBar](https://panelui.dev/docs/components/search-bar),
  [Chip](https://panelui.dev/docs/components/chip) and
  [SelectionMode](https://panelui.dev/docs/components/selection-mode): useful for exercise search,
  clearable muscle/equipment filters and a persistent selected-exercise count in pick mode.
- [EmptyState](https://panelui.dev/docs/components/empty-state),
  [Skeleton](https://panelui.dev/docs/components/skeleton),
  [Alert](https://panelui.dev/docs/components/alert) and [Toast](https://panelui.dev/docs/components/toast):
  keep distinct first-sync, offline, empty and failed states; Undo belongs in a toast, while a sync
  rejection needing action belongs in a persistent alert. Existing HeroUI-based equivalents suffice.
- LineChart, BarChart and HeatmapChart become useful after completed Sessions exist. Prefer a clear
  exercise trend and weekly volume to dashboard decoration. Timeline fits completed Session history.
- [ImageViewer](https://panelui.dev/docs/components/image-viewer) could enlarge exercise media;
  media rights still need resolution first. Do not introduce a new image cache alongside expo-image.

## Keep out of the current editor

Calendar/Planner/WeekStrip would imply a fixed weekly schedule, conflicting with the rotation model.
Tours and tooltips cannot repair unclear primary controls. SlideButton and ProgressButton add friction
for frequent set completion; use ordinary completion controls and reserve confirmation for finishing
or discarding a Session. Leaderboards, social feeds, decorative text effects, AI chat and canvas tools
have no current training task. Form and MarkdownEditor would duplicate the established form model
and description editor without solving a demonstrated issue.

These are pattern recommendations from the documented APIs, not claims that all PanelUI components
have been tested on this app's React Native version. Only the adapted editor controls were exercised
on the connected device.

## Verification

On the connected Android phone: switched an inline 8–12 target to exact 8 and restored 8–12;
confirmed that an inverted range disables Done; changed one detailed set to 8–10 without changing
its siblings; scrolled rest seconds to 2:03, saved, and restored 2:00 through a preset; changed the
third training set to T; added and removed a warm-up; checked W1/W2 for multiple warm-ups; and
added a training set and removed it through the swipe action. Original targets were restored.

Lint/format, typecheck, knip, unit/API tests and both i18n checks passed. The first full test run
had two API workers killed while Metro rebuilt; the rerun with `--maxWorkers=2` passed. Token tests
also check the set-category text colors for contrast on light and dark canvas/surface colors.

## Follow-up from device use

All exercise rows now expand inline, with custom targets rendered by the same component as the
detailed screen. The explicit Edit sets action still opens the detailed screen. Rep chevrons,
the set-type instructional caption and trailing trash icons were removed. Left swipe reveals
Remove; a full swipe removes directly, except for the final set. The badge exposes the same
remove action to screen readers. Reordering is confined to the visible grip, away from inputs.

Train uses Workouts/Programs tabs with counts and named creation actions. The Program details
card and workout order are grouped, and Add day opens the creation choices. The reuse explanation
is kept in the reuse picker rather than repeated below the entire program. Both views were
inspected on Android; an added rest slot was removed after checking the Add day flow.

Follow-up verification also covered a mixed warm-up/drop/failure exercise expanding inline, the
explicit Edit sets route, full-swipe removal of an added set, and dragging from the grip. The test
set, temporary rest slot and exercise-order changes were restored. All required repository checks
passed again after the follow-up changes.
