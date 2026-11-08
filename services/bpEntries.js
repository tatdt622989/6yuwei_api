const { isText } = require('./text');

/**
 * What each kind of blood pressure entry may contain. Every sanitizer returns a new object with
 * known fields only, or null when the entry is not valid.
 */

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const ARMS = ['left', 'right'];
const POSTURES = ['sitting', 'standing', 'lying'];
const SOURCES = ['manual', 'ocr-cloud', 'ocr-device', 'import'];
const MED_SLOTS = ['morning', 'noon', 'evening', 'bedtime'];
const STANDARDS = ['tw2022', 'acc2025', 'esc2024'];
const OCR_MODES = ['auto', 'device'];

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 24;
// 2000-01-01, older than any home monitor reading worth keeping
const EARLIEST_READING = 946684800000;
const FUTURE_ALLOWANCE_MS = 24 * 60 * 60 * 1000;

const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

const optionalOneOf = (value, allowed) => (allowed.includes(value) ? value : null);

const clippedText = (value, maxLength) => (typeof value === 'string' ? value.trim().slice(0, maxLength) : '');

const isDate = (value) => typeof value === 'string' && DATE_PATTERN.test(value);

const isTime = (value) => typeof value === 'string' && TIME_PATTERN.test(value);

const cleanTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  const clean = tags.filter(isText).map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH));
  return [...new Set(clean)].slice(0, MAX_TAGS);
};

const sanitizeReading = (input, now) => {
  const {
    takenAt, systolic, diastolic, pulse,
  } = input;
  const validTime = Number.isFinite(takenAt)
    && takenAt >= EARLIEST_READING
    && takenAt <= now + FUTURE_ALLOWANCE_MS;
  if (!validTime || !inRange(systolic, 40, 300) || !inRange(diastolic, 20, 200)) return null;
  if (pulse !== null && pulse !== undefined && !inRange(pulse, 20, 250)) return null;
  return {
    takenAt: Math.round(takenAt),
    systolic,
    diastolic,
    pulse: pulse ?? null,
    arm: optionalOneOf(input.arm, ARMS),
    posture: optionalOneOf(input.posture, POSTURES),
    tags: cleanTags(input.tags),
    irregular: input.irregular === true,
    note: clippedText(input.note, 500),
    source: optionalOneOf(input.source, SOURCES) ?? 'manual',
  };
};

const sanitizeMedication = (input) => {
  if (!isText(input.name) || !isDate(input.startDate)) return null;
  if (input.endDate !== null && input.endDate !== undefined && !isDate(input.endDate)) return null;
  const slots = Array.isArray(input.slots)
    ? input.slots.filter((slot) => MED_SLOTS.includes(slot))
    : [];
  return {
    name: clippedText(input.name, 60),
    dose: clippedText(input.dose, 40),
    slots: [...new Set(slots)],
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    note: clippedText(input.note, 200),
  };
};

const sanitizeIntake = (input) => {
  const validReference = typeof input.medicationId === 'string'
    && CLIENT_ID_PATTERN.test(input.medicationId);
  if (!validReference || !isDate(input.date) || !MED_SLOTS.includes(input.slot)) return null;
  return {
    medicationId: input.medicationId,
    date: input.date,
    slot: input.slot,
    takenAt: Number.isFinite(input.takenAt) ? Math.round(input.takenAt) : null,
  };
};

const sanitizeSettings = (input) => {
  const validTarget = inRange(input.targetSystolic, 90, 180)
    && inRange(input.targetDiastolic, 50, 110);
  if (!validTarget) return null;
  const hours = [input.morningStart, input.morningEnd, input.eveningStart, input.eveningEnd];
  if (!hours.every((hour) => inRange(hour, 0, 24))) return null;
  return {
    standard: optionalOneOf(input.standard, STANDARDS) ?? 'tw2022',
    targetSystolic: input.targetSystolic,
    targetDiastolic: input.targetDiastolic,
    morningStart: input.morningStart,
    morningEnd: input.morningEnd,
    eveningStart: input.eveningStart,
    eveningEnd: input.eveningEnd,
    defaultArm: optionalOneOf(input.defaultArm, ARMS),
    defaultPosture: optionalOneOf(input.defaultPosture, POSTURES),
    ocrMode: optionalOneOf(input.ocrMode, OCR_MODES) ?? 'auto',
    reminderMorning: isTime(input.reminderMorning) ? input.reminderMorning : '07:00',
    reminderEvening: isTime(input.reminderEvening) ? input.reminderEvening : '21:00',
    customTags: cleanTags(input.customTags),
    patientName: clippedText(input.patientName, 60),
  };
};

const sanitizers = {
  reading: sanitizeReading,
  medication: sanitizeMedication,
  intake: sanitizeIntake,
  settings: sanitizeSettings,
};

/**
 * Turns one change from a client into a storable entry, or null when it is not valid.
 * A clock ahead of the server is pulled back, so a wrong device time cannot outrank later edits.
 */
const parseChange = (change, now) => {
  if (!change || typeof change !== 'object') return null;
  const { kind, id, updatedAt } = change;
  const sanitize = typeof kind === 'string' && Object.hasOwn(sanitizers, kind)
    ? sanitizers[kind]
    : null;
  const validId = typeof id === 'string' && CLIENT_ID_PATTERN.test(id);
  if (!sanitize || !validId || !Number.isFinite(updatedAt)) return null;
  const clientUpdatedAt = Math.min(Math.round(updatedAt), now);
  if (change.deleted === true) {
    return {
      kind, clientId: id, data: null, deleted: true, clientUpdatedAt,
    };
  }
  if (!change.data || typeof change.data !== 'object' || Array.isArray(change.data)) return null;
  const data = sanitize(change.data, now);
  if (!data) return null;
  return {
    kind, clientId: id, data, deleted: false, clientUpdatedAt,
  };
};

module.exports = { parseChange };
