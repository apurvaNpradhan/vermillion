/**
 * Whether leaving a changed cell asks "Check this set". A set that is not ticked in a live Session
 * is checked when it is ticked; every other edit is saved as typed, so leaving the cell is when it
 * is looked at.
 */
export function reviewsEditedSet(input: { sessionFinished: boolean; setTicked: boolean }): boolean {
  return input.sessionFinished || input.setTicked;
}
