/**
 * Rules for one dict_words document. These functions touch no database.
 * Editors send only the fields in buildWord; every derived field is computed here, so the two never disagree.
 */
const { toHiragana, kanaToRomaji, romajiKey } = require('./dictWordKeys');

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const POS = ['noun', 'pronoun', 'numeral', 'verb', 'suru', 'transitive', 'intransitive', 'i-adj', 'na-adj', 'adverb', 'conjunction', 'adnominal', 'interjection', 'particle', 'suffix', 'phrase'];
const VERB_CLASSES = ['godan', 'ichidan', 'suru', 'kuru'];
const FORM_TYPES = ['masu', 'nai', 'masen', 'ta', 'mashita', 'nakatta', 'masendeshita', 'te', 'potential', 'passive', 'causative', 'volitional', 'imperative', 'ba'];
/** Editors can only clear these. The other flags follow from the data. */
const REVIEW_FLAGS = ['verb-class-conflict', 'verb-without-forms', 'form-suspect', 'kana-corrected'];
const KANA = /^[ぁ-ゖー]+$/;
const ROMAJI = /^[a-z -]+$/;
const MAX_TEXT = 500;

class DictWordError extends Error {
  constructor(details) {
    super('invalid word');
    this.details = details;
  }
}

const unique = (a) => [...new Set(a)];
const isText = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;

/** Reads a list of text from untrusted input and records an error for a value of any other shape. */
function textList(value, name, errors, { min = 0 } = {}) {
  if (!Array.isArray(value) || !value.every(isText)) {
    errors.push(`${name} must be a list of text`);
    return [];
  }
  const list = unique(value.map((v) => v.trim()));
  if (list.length < min) errors.push(`${name} needs at least ${min}`);
  return list;
}

function enumList(value, allowed, name, errors, opts) {
  const list = textList(value, name, errors, opts);
  list.filter((v) => !allowed.includes(v)).forEach((v) => errors.push(`${name} has an unknown value: ${v}`));
  return list;
}

function exampleList(value, name, errors) {
  if (!Array.isArray(value) || !value.every((e) => e && isText(e.ja) && isText(e.zh))) {
    errors.push(`${name} must be a list of { ja, zh }`);
    return [];
  }
  return value.map((e) => ({ ja: e.ja.trim(), zh: e.zh.trim() }));
}

/** Keeps the editor's romaji unless the reading changed and the romaji did not follow it. */
function chooseRomaji(kana, romaji, previous) {
  const given = typeof romaji === 'string' ? romaji.trim().toLowerCase() : '';
  if (given && !(previous && previous.kana !== kana && previous.romaji === given)) return given;
  return kanaToRomaji(kana);
}

function buildForm(raw, index, knownLegacyIds, previousForms, errors) {
  const name = `forms[${index}]`;
  if (!raw || typeof raw !== 'object') {
    errors.push(`${name} must be an object`);
    return null;
  }
  if (!isText(raw.written)) errors.push(`${name}.written is required`);
  if (!isText(raw.zh)) errors.push(`${name}.zh is required`);
  if (!LEVELS.includes(raw.level)) errors.push(`${name}.level has an unknown value`);
  const kana = typeof raw.kana === 'string' ? toHiragana(raw.kana.trim()) : '';
  if (!KANA.test(kana)) errors.push(`${name}.kana must be kana`);
  const legacyIds = textList(raw.legacyIds ?? [], `${name}.legacyIds`, errors);
  legacyIds.filter((id) => !knownLegacyIds.has(id)).forEach((id) => errors.push(`${name}.legacyIds has an ID this word does not own: ${id}`));
  const previous = previousForms.find((f) => f.written === raw.written) || null;
  const romaji = chooseRomaji(kana, raw.romaji, previous);
  if (!ROMAJI.test(romaji)) errors.push(`${name}.romaji must use a to z`);
  return {
    written: isText(raw.written) ? raw.written.trim() : '',
    kana,
    romaji,
    types: enumList(raw.types, FORM_TYPES, `${name}.types`, errors, { min: 1 }),
    zh: isText(raw.zh) ? raw.zh.trim() : '',
    level: raw.level,
    legacyIds,
    examples: exampleList(raw.examples ?? [], `${name}.examples`, errors),
  };
}

/** Computes every field that follows from the edited ones. */
function deriveWord(word) {
  const levels = LEVELS.filter((l) => word.levels.includes(l));
  const forms = word.forms.map((f) => ({ ...f, exampleHasForm: f.examples.some((e) => e.ja.includes(f.written)) }));
  const reviewFlags = (word.quality?.flags ?? []).filter((f) => REVIEW_FLAGS.includes(f));
  return {
    ...word,
    levels,
    level: levels[0],
    levelRank: LEVELS.indexOf(levels[0]) + 1,
    forms,
    formCount: forms.length,
    exampleCount: word.examples.length,
    allLegacyIds: unique([...word.legacyIds, ...forms.flatMap((f) => f.legacyIds)]),
    searchKeys: unique([
      word._id, word._id.toLowerCase(), ...word.readings, ...word.romaji.map(romajiKey),
      ...forms.flatMap((f) => [f.written, f.kana, romajiKey(f.romaji)]),
    ].filter(Boolean)),
    quality: {
      ...word.quality,
      flags: unique([
        ...reviewFlags,
        ...(word.readings.length > 1 ? ['multi-reading'] : []),
        ...(word.examples.length ? [] : ['no-examples']),
        ...(forms.some((f) => !f.exampleHasForm) ? ['form-example-mismatch'] : []),
      ]),
    },
  };
}

/**
 * Turns an editor's input into the next document. Throws DictWordError with every problem found.
 * @param {object} input untrusted request body
 * @param {string} id the spelling
 * @param {object|null} existing the stored document, or null when creating
 */
function buildWord(input, id, existing) {
  const errors = [];
  if (!isText(id)) errors.push('the spelling is required');
  const body = input && typeof input === 'object' ? input : {};
  const readings = textList(body.readings, 'readings', errors, { min: 1 }).map(toHiragana);
  readings.filter((k) => !KANA.test(k)).forEach((k) => errors.push(`readings must be kana: ${k}`));
  const previousRomaji = existing?.romaji ?? [];
  const givenRomaji = body.romaji === undefined ? [] : textList(body.romaji, 'romaji', errors).map((r) => r.toLowerCase());
  const followsReadings = !givenRomaji.length || (existing && readings.join() !== existing.readings.join() && givenRomaji.join() === previousRomaji.join());
  const romaji = followsReadings ? unique(readings.map(kanaToRomaji)) : givenRomaji;
  romaji.filter((r) => !ROMAJI.test(r)).forEach((r) => errors.push(`romaji must use a to z: ${r}`));
  const verbClass = body.verbClass ?? null;
  if (verbClass !== null && !VERB_CLASSES.includes(verbClass)) errors.push('verbClass has an unknown value');
  const known = new Set(existing?.allLegacyIds ?? []);
  const rawForms = body.forms ?? [];
  if (!Array.isArray(rawForms)) errors.push('forms must be a list');
  const forms = (Array.isArray(rawForms) ? rawForms : []).map((f, i) => buildForm(f, i, known, existing?.forms ?? [], errors));
  const next = {
    _id: id,
    readings,
    romaji,
    levels: enumList(body.levels, LEVELS, 'levels', errors, { min: 1 }),
    pos: enumList(body.pos, POS, 'pos', errors, { min: 1 }),
    posRaw: existing?.posRaw ?? [],
    verbClass,
    categories: textList(body.categories ?? [], 'categories', errors),
    meanings: textList(body.meanings, 'meanings', errors, { min: 1 }),
    related: textList(body.related ?? [], 'related', errors),
    suruVerb: isText(body.suruVerb) ? body.suruVerb.trim() : null,
    suruNoun: isText(body.suruNoun) ? body.suruNoun.trim() : null,
    legacyIds: existing?.legacyIds ?? [],
    examples: exampleList(body.examples ?? [], 'examples', errors),
    forms,
    quality: {
      flags: textList(body.quality?.flags ?? existing?.quality?.flags ?? [], 'quality.flags', errors)
        .filter((f) => (existing?.quality?.flags ?? []).includes(f)),
      corrections: existing?.quality?.corrections ?? [],
    },
    order: existing?.order ?? null,
    schemaVersion: existing?.schemaVersion ?? 1,
  };
  if (errors.length) throw new DictWordError(errors);
  return deriveWord(next);
}

module.exports = { buildWord, deriveWord, DictWordError, LEVELS };
