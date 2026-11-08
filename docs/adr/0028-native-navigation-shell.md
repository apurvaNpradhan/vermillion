# 0028. Native navigation shell: floating tab pill, page header, session guards

Status: accepted (2026-11-08).

## Context

The native app used Expo Router's stock tab bar, default stack headers and inline `Stack.Protected` conditions in the root layout. The template is meant to grow into a phone-first fitness app (DESIGN.md) whose tab count will change, and the stock bar and headers looked like a default scaffold. Earlier projects had a Linear-style pill and a collapsing header worth keeping, with known faults (no keyboard hiding, no `tabPress`, JS-thread scroll tracking).

## Decision

- **Tab bar.** A custom `tabBar` (`apps/native/src/platform/navigation`): a floating, icon-only pill with the first two tabs, then a switcher whose menu holds the rest, up to five tabs in all (`tab-slots.ts`). Tap the switcher to open the menu, or press and slide up to pick a row. Each tab may register one action with `useTabAction`; it shows as a round button beside the pill (New note on Notes). The bar emits `tabPress` and `tabLongPress`, hides with the keyboard, closes its menu on Android back, and respects Reduce Motion.
- **Page header.** Signed-in screens draw their own header through `Page` / `ScrollPage` (`platform/ui/page.tsx`): a large title in the content that hands over to a compact centred title on a bar once scrolled. Scroll is tracked on the UI thread; the compact title and a second tab press scroll to the top. Navigator headers are off.
- **Floating depth.** The pill, its menu, the action button and header capsules use `FloatingSurface`: `surface-floating` with a `hairline-strong` edge and the overlay shadow; blur on iOS only, because Android's blur is unreliable.
- **Session guards.** `toSessionState` and `routeGuards` (`src/auth/session-state.ts`) turn the session and device owner (ADR 0021) into the `Stack.Protected` guards, as a tested pure function. A device owner without a session still reaches both groups for the sign-in banner.
- **Signed out.** `(auth)/index` is a welcome screen; sign-in and sign-up are pushed from it.

## Consequences

- Adding a tab is one `Tabs.Screen` with a `tabBarIcon`; the third to fifth appear in the switcher. Declaration order is the slot order.
- Screens must use `Page` or `ScrollPage` (or spread `PageScroll` into an animated list) to get the header and the bottom clearance for the pill.
- `expo-blur` and `expo-haptics` are native modules: `NATIVE_STACK_REVISION` is 2.
- Haptics go through `platform/haptics` (`tick`, `confirm`, `success`, `alert`), the four DESIGN.md tokens.
