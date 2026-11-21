/**
 * Options for a push that enters another tab's nested route (profile from the menu, a history
 * detail from Home, the weight page from Settings). With the anchor, that tab's stack is built as
 * its first screen with the page on top, so Back lands on the tab's own first screen instead of
 * leaving the page alone in its stack. Needs `unstable_settings.initialRouteName` on the tab's
 * layout; `tab-stacks.test.ts` checks every tab has one.
 */
export const ANCHORED = { withAnchor: true } as const;
