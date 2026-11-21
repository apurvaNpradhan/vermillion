/**
 * When a link initializes a tab's stack, insert its first screen below the destination so Back
 * goes to the tab root. An already-mounted stack uses its existing history. Each tab declares
 * its first screen in `unstable_settings.initialRouteName`.
 */
export const ANCHORED = { withAnchor: true } as const;
