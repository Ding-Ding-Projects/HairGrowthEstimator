(function exposeHairMath(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HairMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHairMath() {
  'use strict';

  const CM_PER_INCH = 2.54;
  const DAYS_PER_MONTH = 365.2425 / 12;
  const MAX_LENGTH_CM = 300;
  const MIN_GROWTH_RATE_CM_PER_MONTH = 0.05;
  const MAX_GROWTH_RATE_CM_PER_MONTH = 5;

  const HAIR_STAGES = Object.freeze([
    { id: 'buzz', targetCm: 0.3, minCm: 0, maxCm: 0.9, label: 'Buzz cut', file: 'male-hair-growth-stage-01-buzz-cut-v1.png' },
    { id: 'short', targetCm: 1.5, minCm: 0.9, maxCm: 2.25, label: 'Short crop', file: 'male-hair-growth-stage-02-short-crop-v1.png' },
    { id: 'medium-short', targetCm: 3, minCm: 2.25, maxCm: 4, label: 'Medium short', file: 'male-hair-growth-stage-03-medium-short-v1.png' },
    { id: 'medium-top', targetCm: 5, minCm: 4, maxCm: 7, label: 'Medium top', file: 'male-hair-growth-stage-04-medium-top-v1.png' },
    { id: 'ear', targetCm: 9, minCm: 7, maxCm: 11.5, label: 'Ear length', file: 'male-hair-growth-stage-05-ear-length-v1.png' },
    { id: 'jaw', targetCm: 14, minCm: 11.5, maxCm: 17, label: 'Jaw length', file: 'male-hair-growth-stage-06-jaw-length-v1.png' },
    { id: 'neck', targetCm: 20, minCm: 17, maxCm: 24, label: 'Neck length', file: 'male-hair-growth-stage-07-neck-length-v1.png' },
    { id: 'shoulder', targetCm: 28, minCm: 24, maxCm: Number.POSITIVE_INFINITY, label: 'Shoulder length', file: 'male-hair-growth-stage-08-shoulder-length-v1.png' }
  ]);

  function finiteNumber(value, label) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be a finite number.`);
    return parsed;
  }

  function boundedNumber(value, min, max, label) {
    const parsed = finiteNumber(value, label);
    if (parsed < min || parsed > max) throw new RangeError(`${label} must be between ${min} and ${max}.`);
    return parsed;
  }

  function round(value, digits = 4) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function cmToInches(cm) {
    return round(finiteNumber(cm, 'Centimetres') / CM_PER_INCH, 6);
  }

  function inchesToCm(inches) {
    return round(finiteNumber(inches, 'Inches') * CM_PER_INCH, 6);
  }

  function toCm(value, unit) {
    return unit === 'in' ? inchesToCm(value) : finiteNumber(value, 'Length');
  }

  function fromCm(value, unit) {
    return unit === 'in' ? cmToInches(value) : round(finiteNumber(value, 'Length'), 4);
  }

  function parseIsoDate(value, label = 'Date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new TypeError(`${label} must use YYYY-MM-DD.`);
    }
    const parts = value.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 || date.getUTCDate() !== parts[2]) {
      throw new RangeError(`${label} is not a calendar date.`);
    }
    return date;
  }

  function formatIsoDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('A valid Date is required.');
    return date.toISOString().slice(0, 10);
  }

  function dayDifference(startIso, endIso) {
    return (parseIsoDate(endIso, 'End date') - parseIsoDate(startIso, 'Start date')) / 86400000;
  }

  function validateProfile(profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new TypeError('Profile must be an object.');
    const baselineLengthCm = boundedNumber(profile.baselineLengthCm, 0, MAX_LENGTH_CM, 'Baseline length');
    const targetLengthCm = boundedNumber(profile.targetLengthCm, 0, MAX_LENGTH_CM, 'Target length');
    const growthRateCmPerMonth = boundedNumber(
      profile.growthRateCmPerMonth,
      MIN_GROWTH_RATE_CM_PER_MONTH,
      MAX_GROWTH_RATE_CM_PER_MONTH,
      'Growth rate'
    );
    return {
      baselineLengthCm: round(baselineLengthCm),
      baselineDate: formatIsoDate(parseIsoDate(profile.baselineDate, 'Baseline date')),
      growthRateCmPerMonth: round(growthRateCmPerMonth),
      targetLengthCm: round(targetLengthCm),
      displayUnit: profile.displayUnit === 'in' ? 'in' : 'cm'
    };
  }

  function estimatedLengthCm(profile, onDate) {
    const valid = validateProfile(profile);
    const elapsedDays = Math.max(0, dayDifference(valid.baselineDate, onDate));
    return round(Math.min(MAX_LENGTH_CM, valid.baselineLengthCm + (elapsedDays / DAYS_PER_MONTH) * valid.growthRateCmPerMonth));
  }

  function targetDate(profile) {
    const valid = validateProfile(profile);
    if (valid.targetLengthCm <= valid.baselineLengthCm) return valid.baselineDate;
    const months = (valid.targetLengthCm - valid.baselineLengthCm) / valid.growthRateCmPerMonth;
    const date = parseIsoDate(valid.baselineDate);
    date.setUTCDate(date.getUTCDate() + Math.ceil(months * DAYS_PER_MONTH));
    return formatIsoDate(date);
  }

  function futureProjections(profile, startDate, months = 12) {
    const count = Math.max(1, Math.min(60, Math.trunc(finiteNumber(months, 'Projection count'))));
    const start = parseIsoDate(startDate);
    return Array.from({ length: count + 1 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + Math.round(index * DAYS_PER_MONTH));
      const iso = formatIsoDate(date);
      return { month: index, date: iso, lengthCm: estimatedLengthCm(profile, iso) };
    });
  }

  function stageForLength(lengthCm) {
    const length = boundedNumber(lengthCm, 0, MAX_LENGTH_CM, 'Hair length');
    return HAIR_STAGES.find((stage) => length >= stage.minCm && length < stage.maxCm) || HAIR_STAGES[HAIR_STAGES.length - 1];
  }

  function normalizeHaircut(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Haircut must be an object.');
    const id = typeof input.id === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(input.id)
      ? input.id
      : `cut-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length > 500) throw new RangeError('Haircut note must be 500 characters or fewer.');
    const preCutLengthCm = boundedNumber(input.preCutLengthCm, 0, MAX_LENGTH_CM, 'Pre-cut length');
    const postCutLengthCm = boundedNumber(input.postCutLengthCm, 0, MAX_LENGTH_CM, 'Post-cut length');
    if (postCutLengthCm > preCutLengthCm) throw new RangeError('Post-cut length cannot exceed pre-cut length.');
    return {
      id,
      date: formatIsoDate(parseIsoDate(input.date, 'Haircut date')),
      preCutLengthCm: round(preCutLengthCm),
      postCutLengthCm: round(postCutLengthCm),
      note
    };
  }

  function haircutToCsv(haircuts) {
    const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['id', 'date', 'preCutLengthCm', 'postCutLengthCm', 'note']];
    for (const haircut of haircuts) {
      const valid = normalizeHaircut(haircut);
      rows.push([valid.id, valid.date, valid.preCutLengthCm, valid.postCutLengthCm, valid.note]);
    }
    return `${rows.map((row) => row.map(quote).join(',')).join('\r\n')}\r\n`;
  }

  function haircutToMarkdown(haircuts) {
    const safe = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const lines = [
      '| Date | Pre-cut (cm) | Post-cut (cm) | Notes |',
      '| --- | ---: | ---: | --- |'
    ];
    for (const haircut of haircuts) {
      const valid = normalizeHaircut(haircut);
      lines.push(`| ${valid.date} | ${valid.preCutLengthCm} | ${valid.postCutLengthCm} | ${safe(valid.note)} |`);
    }
    return `${lines.join('\n')}\n`;
  }

  function planHaircutSync(localHaircuts, remoteHaircuts) {
    if (!Array.isArray(localHaircuts) || !Array.isArray(remoteHaircuts)) throw new TypeError('Local and remote haircut lists are required.');
    const remoteIds = new Set(remoteHaircuts.map((haircut) => haircut?.id).filter((id) => typeof id === 'string'));
    return localHaircuts.map((haircut) => {
      const normalized = normalizeHaircut(haircut);
      return { method: remoteIds.has(normalized.id) ? 'PUT' : 'POST', haircut: normalized };
    });
  }

  return Object.freeze({
    CM_PER_INCH,
    DAYS_PER_MONTH,
    MAX_LENGTH_CM,
    MIN_GROWTH_RATE_CM_PER_MONTH,
    MAX_GROWTH_RATE_CM_PER_MONTH,
    HAIR_STAGES,
    cmToInches,
    inchesToCm,
    toCm,
    fromCm,
    parseIsoDate,
    formatIsoDate,
    dayDifference,
    validateProfile,
    estimatedLengthCm,
    targetDate,
    futureProjections,
    stageForLength,
    normalizeHaircut,
    planHaircutSync,
    haircutToCsv,
    haircutToMarkdown,
    round
  });
});
