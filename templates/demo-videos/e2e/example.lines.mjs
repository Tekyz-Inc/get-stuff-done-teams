/**
 * TEMPLATE — the narration for one walkthrough. Nothing but sentences.
 *
 * THIS IS A STORY, NOT A TOUR. Tyler owns the school and speaks in his own
 * voice; Maya is why every value he types is that value. Read it aloud: if a
 * sentence would survive with the names removed, it is explaining the software
 * instead of telling the story, and it is wrong.
 *
 * The failure this replaces: "Her contact details are what the school will use
 * to reach her, so they're required rather than optional" — a sentence about a
 * form. What it should say: "Maya's asleep by eight most nights, so mornings
 * are all she has" — a fact about Maya that lands in a field.
 *
 * THE TELL: a "because" clause pointing at the software. "so it's required",
 * "which is what the invoice uses later", "the schedule refuses it otherwise".
 * Every reason must point at Maya, never at the mechanism.
 *
 * Rules, each from a user correction in the source run:
 *   - EVERY DROPDOWN IS OPENED AND PICKED, and the sentence says the chosen
 *     value. A highlighted select shows nothing — the viewer cannot see what
 *     the alternatives were, or that a choice happened at all.
 *   - The reason comes BEFORE the value, in the same breath. "She's on nights,
 *     so — Part 61." Not the value followed by a justification.
 *   - Narrate the VALUE, not the field's purpose. "Fifty-five hours, because
 *     nobody finishes in forty" — not "you would enter the hours here".
 *   - Use the SPOKEN form of any value with a symbol or abbreviation. The
 *     narrator reads literally: "$185/hr" becomes "dollar one eight five slash
 *     h r". cast.mjs carries a said-aloud twin for those.
 *   - Don't invent jargon. Not "groups" — "the left sidebar's top-level menus".
 *   - Explain, don't sell. No "exciting", no "powerful", no enthusiasm.
 *   - COUNT WHAT IS ON SCREEN before writing about it. "Eight-step wizard"
 *     shipped in a video where the UI said "Step 1 of 9".
 *
 * The order here is the order in the spec. Index N of LINES is L[N] there.
 */
import {
  AIRCRAFT, COURSE, FIRST_LESSON, INSTRUCTOR, MAYA, PRODUCTS, SPOKEN, STAGES, STUDENT_NAME,
} from './cast.mjs';

const [PLANE, CFI, GROUND, KIT] = PRODUCTS;

export const LINES = [
  // ── Why this course exists ──────────────────────────────────────────────
  `${STUDENT_NAME} walked into my school on Monday. She's ${MAYA.ageSpoken}, ${MAYA.job}, ${MAYA.experience}. She wants ${MAYA.goal}.`,
  `I don't have a course she can join, so I'm building the one she'll fly.`,

  // ── The course ──────────────────────────────────────────────────────────
  `The ${COURSE.name}. That's the license itself — fly a small plane, day or night, carry passengers, just not for money.`,
  `Certificate type, ${COURSE.certificate}. That's what she walks out with.`,
  `${MAYA.short}'s on night shifts and can't hold to a fixed school timetable, so — ${COURSE.regulation}. It lets her fly when she's free. Part 141 would have locked her into my schedule.`,
  `I'm setting ${COURSE.hoursSpoken} hours. The FAA minimum is forty and nobody finishes in forty — fifty-five is what my students actually take, and I'd rather quote ${MAYA.short} a number she'll hit.`,
  `${COURSE.category}. She'll train in the one-seventy-twos.`,

  // ── The syllabus, in the order she flies it ─────────────────────────────
  `Now the syllabus. Five stages, in the order ${MAYA.short} flies them.`,
  `${STAGES[0].name} — weather, regulations, navigation, radio work. All on the ground, ${STAGES[0].spoken} hours of it, before she touches an airplane.`,
  `${STAGES[1].name}. Takeoffs, landings, stalls, emergencies — ${STAGES[1].spoken} hours of dual, meaning ${INSTRUCTOR.short} is beside her the whole time.`,
  `${STAGES[2].name}. ${STAGES[2].spoken} hours, and the first of them is the day ${MAYA.short} takes off by herself. It needs my endorsement — I sign that off, nobody else.`,
  `${STAGES[3].name}. ${STAGES[3].spoken} hours of long flights to airports she has never seen, navigating there and back.`,
  `${STAGES[4].name}. The last ${STAGES[4].spoken} hours, flying to the standard an examiner will hold her to.`,

  // ── The products — everything a charge attaches to ──────────────────────
  `Now what ${MAYA.short} actually pays for. Every chargeable thing is its own product, and a course is the sum of the products on it.`,
  `The airplane. ${PLANE.name}, ${SPOKEN.aircraftRate} an hour, wet — fuel included, so ${MAYA.short} isn't doing arithmetic after every lesson.`,
  `${CFI.name}, ${SPOKEN.cfiRate} an hour. That's ${INSTRUCTOR.short} in the right seat, and it bills whether they fly or sit out a weather delay.`,
  `${GROUND.name}, ${SPOKEN.groundRate}. Cheaper, because there's no airplane on the clock.`,
  `And the ${KIT.name} — ${SPOKEN.kitPrice}, one time. Her books, charts, plotter and headset, bought on day one.`,
  `All four go onto the course.`,
  `So an hour of dual bills ${MAYA.short} ${SPOKEN.dualHourTotal} — ${SPOKEN.aircraftRate} for the airplane, ${SPOKEN.cfiRate} for ${INSTRUCTOR.short}. Her ${COURSE.hoursSpoken} hours come to ${SPOKEN.courseTotal}, and that's the number I quote her.`,
  `The ${COURSE.name} is open for enrollment.`,

  // ── Maya ────────────────────────────────────────────────────────────────
  `Now ${MAYA.short} herself.`,
  `She's asleep by eight most nights, so — ${MAYA.availability}. That's all she has.`,
  `Into the ${COURSE.name}. She's the first one in it.`,
  `${INSTRUCTOR.name} takes her. He ${INSTRUCTOR.why}.`,
  `Her first lesson: ${FIRST_LESSON.day}, ${FIRST_LESSON.timeSpoken}, in ${AIRCRAFT.tailSpoken}. Ground School, hour one.`,
  `That's ${MAYA.short}'s ${COURSE.hoursSpoken} hours laid out in front of her. ${FIRST_LESSON.day} morning she starts the first one.`,
];
