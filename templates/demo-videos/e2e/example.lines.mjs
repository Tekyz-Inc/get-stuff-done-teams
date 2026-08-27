/**
 * TEMPLATE — the narration for one walkthrough. Nothing but sentences.
 *
 * A BEAT IS ONE IDEA BEING EXPLAINED, NOT ONE SCREEN. A beat may dwell on three
 * things within a screen, or carry across a navigation. Building around screens
 * is what produced fixed-length steps and the drift that followed.
 *
 * Rules, each from a user correction in the source run:
 *   - Never name something the viewer cannot see. If the sentence names a
 *     thing, the matching step must point at that thing.
 *   - Don't invent jargon. Not "groups" — "the left sidebar's top-level menus,
 *     which expand to show…".
 *   - Explain, don't sell. No "exciting", no "powerful", no enthusiasm.
 *   - Give the dependency context: why this screen exists, and what downstream
 *     reads from it.
 *   - COUNT WHAT IS ON SCREEN before writing about it. "Eight-step wizard"
 *     shipped in a video where the UI said "Step 1 of 9".
 *
 * The order here is the order in the spec. Index N of LINES is L[N] there.
 */
export const LINES = [
  "Before anyone can book a flight, the aircraft has to exist here, at the location it lives at.",
  "The four cards across the top are the fleet's condition right now: how many are available, how many are grounded, how many open squawks there are, and how much maintenance is coming due.",
  "Below that is the fleet itself. Seven aircraft at this location, each with its hourly rate.",
  "That rate is what turns a flight into money later, so it belongs to the aircraft, not to the booking.",
  "Opening an aircraft gives you its full record, and the record has seven tabs — each one a different kind of history for the same airframe.",
  "So: register the aircraft, set its rate, keep its maintenance and its logbook current. Everything downstream reads from this record.",
];
