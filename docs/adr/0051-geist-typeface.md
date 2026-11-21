# 0051. Geist as the app typeface

Status: accepted, 2026-11-20. Builds on [0048](0048-theme-engine-and-nord.md).

## Context

Inter felt too generic for the app's Linear-style design and Nord palette. The replacement needs
tabular figures for set tables, timers and stat tiles, and the four weights already in use.

## Decision

Use the Expo packages for Geist 400, 500, 600 and 700 and Geist Mono 400 and 500. Geist fits the
visual direction and ships the `tnum` OpenType feature in all four faces. Geist Mono sets inline
code. Expo registers the static faces at startup and the shared tokens map them to native classes.

DM Sans lacks `tnum`. Schibsted Grotesk's `tnum` widens punctuation such as decimal points and
colons. Mona Sans at the expanded widths we considered would require font files outside the Expo
package.

## Consequences

Geist Regular's x-height is 0.530 em compared with Inter's 0.546 em. Keep the existing sizes, line
heights and tracking until device checks show where spacing or readability needs adjustment.
Verify tabular figures and dense layouts on iOS and Android.
