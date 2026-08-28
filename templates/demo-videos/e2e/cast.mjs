/**
 * The demo's CAST — every name and value the walkthrough says out loud or types.
 *
 * TWO STORIES, WOVEN
 * ------------------
 * Tyler owns the flight school; his is the story on screen, in his own voice.
 * Maya is why every value he types is THAT value. Neither works alone — Maya
 * by herself is a bio, Tyler by himself is a man explaining a form.
 *
 *   Maya works night shifts   ->  Tyler picks Part 61, not Part 141
 *   Maya has never flown      ->  Tyler sets 55 hours, not the FAA's 40
 *   Maya can only fly mornings->  Tyler assigns James, who flies mornings
 *
 * The reason comes BEFORE the value, in the same breath: "She's on nights, so —
 * Part 61." Value-then-justification is the teacher voice creeping back.
 *
 * THREE RULES:
 *   1. Real and specific. "Private Pilot Certificate — Part 61", not
 *      "Test Course 1". A generic placeholder makes the whole demo read as fake.
 *   2. ENTERED on camera, not described — including EVERY DROPDOWN. A select
 *      that is merely highlighted shows nothing: the viewer cannot see what the
 *      alternatives were or that a choice was made. Open it, pick the value.
 *   3. The names CARRY FORWARD. After the cast is introduced, every later
 *      sentence uses the name — "Maya's first lesson", never "the student's".
 *
 * The example is a flight school; replace it with your own domain. The SHAPE is
 * what matters: a person with a reason, an operator with a decision, and the
 * exact values that get typed and picked.
 */

/** The narrator. He speaks in the first person — his school, his decisions. */
export const TYLER = { name: 'Tyler', role: 'flight school owner' };

/** The reason every value below is the value it is. */
export const MAYA = {
  first: 'Maya',
  last: 'Ellison',
  short: 'Maya',
  email: 'maya.ellison@example.com',
  phone: '(480) 555-0142',
  /** The facts Tyler's choices answer to. Each one drives a field. */
  age: 24,
  ageSpoken: 'twenty-four',
  job: 'works nights at the hospital',
  experience: 'has never flown anything',
  goal: 'her private pilot license by spring',
  availability: 'Weekday mornings',
};

export const STUDENT_NAME = `${MAYA.first} ${MAYA.last}`;

/** The course Tyler builds for her. */
export const COURSE = {
  name: 'Private Pilot Certificate — Part 61',
  /** Dropdown selections — each is OPENED and PICKED on camera. */
  certificate: 'Private Pilot',
  regulation: 'Part 61',
  category: 'Airplane, Single-Engine Land',
  /** Typed. 55 not 40, because nobody finishes in the FAA minimum. */
  hours: '55',
  hoursSpoken: 'fifty-five',
};

/** The syllabus, in the order Maya flies it. Each stage is typed + typed-picked. */
export const STAGES = [
  { name: 'Ground School',            type: 'Ground',        hours: '15', spoken: 'fifteen' },
  { name: 'Pre-Solo Flight Training', type: 'Dual',          hours: '20', spoken: 'twenty' },
  { name: 'Solo Flight',              type: 'Solo',          hours: '10', spoken: 'ten', endorsement: true },
  { name: 'Cross-Country',            type: 'Dual and Solo', hours: '5',  spoken: 'five' },
  { name: 'Checkride Preparation',    type: 'Dual',          hours: '5',  spoken: 'five' },
];

/**
 * PRODUCTS — everything a charge can be applied to.
 *
 * The sum of a course's products is what an invoice is built from, so these are
 * created first and then attached to the course. This is the spine of the
 * story: build the chargeable things, attach them, and the invoice falls out.
 */
export const PRODUCTS = [
  { name: 'Cessna 172 — N172SA',   type: 'Aircraft Rental', price: '185', unit: 'per hour', wet: true },
  { name: 'Flight Instruction — CFI', type: 'Instructor Time', price: '75',  unit: 'per hour' },
  { name: 'Ground Instruction',    type: 'Instructor Time', price: '65',  unit: 'per hour' },
  { name: 'Private Pilot Kit',     type: 'Materials',       price: '289', unit: 'One-time' },
];

/** Everything else Tyler names aloud. */
export const INSTRUCTOR = { name: 'James Rivera', short: 'James', why: 'flies mornings, good with first-timers' };
export const AIRCRAFT = { tail: 'N172SA', tailSpoken: 'November one seven two Sierra Alpha', type: 'Cessna 172' };
export const FIRST_LESSON = { day: 'Tuesday', time: '9:00 AM', timeSpoken: 'nine in the morning' };

/**
 * SPOKEN forms. The narrator reads text literally, so "$185/hr" comes out as
 * "dollar one eight five slash h r" and "9:00 AM" as "nine colon zero zero A M".
 * The typed value goes in the form; these go in the sentence.
 */
export const SPOKEN = {
  aircraftRate:   'a hundred and eighty-five',
  cfiRate:        'seventy-five',
  groundRate:     'sixty-five',
  kitPrice:       'two hundred and eighty-nine',
  dualHourTotal:  'two-sixty',
  courseTotal:    'about thirteen thousand, four hundred',
};
