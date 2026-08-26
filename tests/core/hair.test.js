'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Hair = require('../../app/shared/hair');

const profile = {
  baselineLengthCm: 1,
  baselineDate: '2026-01-01',
  growthRateCmPerMonth: 1,
  targetLengthCm: 12,
  displayUnit: 'cm'
};

test('centimetres and inches use the exact 2.54 conversion', () => {
  assert.equal(Hair.CM_PER_INCH, 2.54);
  assert.equal(Hair.inchesToCm(1), 2.54);
  assert.equal(Hair.cmToInches(2.54), 1);
  assert.equal(Hair.inchesToCm(Hair.cmToInches(19.05)), 19.05);
});

test('calendar validation rejects impossible ISO dates', () => {
  assert.equal(Hair.formatIsoDate(Hair.parseIsoDate('2024-02-29')), '2024-02-29');
  assert.throws(() => Hair.parseIsoDate('2025-02-29'), /calendar date/);
  assert.throws(() => Hair.parseIsoDate('02/29/2024'), /YYYY-MM-DD/);
});

test('one average month at 1 cm per month adds 1 cm', () => {
  const start = Hair.parseIsoDate(profile.baselineDate);
  start.setUTCDate(start.getUTCDate() + Math.round(Hair.DAYS_PER_MONTH));
  const estimated = Hair.estimatedLengthCm(profile, Hair.formatIsoDate(start));
  assert.ok(Math.abs(estimated - 2) < 0.02, `expected about 2 cm, received ${estimated}`);
});

test('target date and projections remain bounded', () => {
  assert.match(Hair.targetDate(profile), /^\d{4}-\d{2}-\d{2}$/);
  const projections = Hair.futureProjections(profile, '2026-01-01', 12);
  assert.equal(projections.length, 13);
  assert.ok(projections.every((item, index) => !index || item.lengthCm >= projections[index - 1].lengthCm));
  assert.throws(() => Hair.validateProfile({ ...profile, growthRateCmPerMonth: 5.01 }), /between/);
  assert.throws(() => Hair.validateProfile({ ...profile, growthRateCmPerMonth: 0.049 }), /between/);
  assert.equal(Hair.validateProfile({ ...profile, growthRateCmPerMonth: 0.05 }).growthRateCmPerMonth, 0.05);
  assert.equal(Hair.validateProfile({ ...profile, growthRateCmPerMonth: 5 }).growthRateCmPerMonth, 5);
});

test('haircut records preserve before and after lengths and refuse growth during a cut', () => {
  const haircut = Hair.normalizeHaircut({
    id: 'haircut-12345678',
    date: '2026-08-24',
    preCutLengthCm: 12.5,
    postCutLengthCm: 1.2,
    note: '  Reset for summer  '
  });
  assert.equal(haircut.note, 'Reset for summer');
  assert.equal(haircut.preCutLengthCm, 12.5);
  assert.equal(haircut.postCutLengthCm, 1.2);
  assert.throws(() => Hair.normalizeHaircut({ ...haircut, postCutLengthCm: 13 }), /cannot exceed/);
});

test('eight deterministic image stages map the requested centimetre references', () => {
  assert.deepEqual(Hair.HAIR_STAGES.map((stage) => stage.targetCm), [0.3, 1.5, 3, 5, 9, 14, 20, 28]);
  assert.equal(Hair.stageForLength(0.3).id, 'buzz');
  assert.equal(Hair.stageForLength(1.5).id, 'short');
  assert.equal(Hair.stageForLength(28).id, 'shoulder');
  assert.ok(Hair.HAIR_STAGES.every((stage) => stage.file.endsWith('.png')));
});

test('CSV and Markdown exports retain both measurements', () => {
  const haircut = { id: 'haircut-12345678', date: '2026-08-24', preCutLengthCm: 10, postCutLengthCm: 2, note: 'Short, tidy' };
  const csv = Hair.haircutToCsv([haircut]);
  const markdown = Hair.haircutToMarkdown([haircut]);
  assert.match(csv, /preCutLengthCm/);
  assert.match(csv, /postCutLengthCm/);
  assert.match(markdown, /10/);
  assert.match(markdown, /2/);
});

test('server sync creates missing haircuts and updates matching records', () => {
  const local = [
    { id: 'cut-existing', date: '2026-08-10', preCutLengthCm: 8, postCutLengthCm: 2, note: 'Existing' },
    { id: 'cut-new-one', date: '2026-08-20', preCutLengthCm: 3, postCutLengthCm: 1, note: 'New' }
  ];
  const plan = Hair.planHaircutSync(local, [{ id: 'cut-existing' }]);
  assert.deepEqual(plan.map(({ method, haircut }) => [method, haircut.id]), [
    ['PUT', 'cut-existing'],
    ['POST', 'cut-new-one']
  ]);
});

test('newest haircut reconciliation is pure and retains the manual fallback', () => {
  const manualBaseline = { baselineDate: '2026-01-01', baselineLengthCm: 1.5 };
  const haircuts = [
    { id: 'cut-older-one', date: '2026-04-10', preCutLengthCm: 6, postCutLengthCm: 2, note: 'Older' },
    { id: 'cut-newer-one', date: '2026-07-20', preCutLengthCm: 7, postCutLengthCm: 0.8, note: 'Newer' }
  ];
  const originalProfile = structuredClone(profile);
  const originalHaircuts = structuredClone(haircuts);

  const newest = Hair.reconcileBaseline(profile, haircuts, manualBaseline);
  assert.equal(newest.baselineDate, '2026-07-20');
  assert.equal(newest.baselineLengthCm, 0.8);
  assert.deepEqual(profile, originalProfile);
  assert.deepEqual(haircuts, originalHaircuts);

  const afterNewestDelete = Hair.reconcileBaseline(newest, [haircuts[0]], manualBaseline);
  assert.equal(afterNewestDelete.baselineDate, '2026-04-10');
  assert.equal(afterNewestDelete.baselineLengthCm, 2);

  const afterAllDelete = Hair.reconcileBaseline(afterNewestDelete, [], manualBaseline);
  assert.equal(afterAllDelete.baselineDate, manualBaseline.baselineDate);
  assert.equal(afterAllDelete.baselineLengthCm, manualBaseline.baselineLengthCm);
});

test('pulled snapshots validate completely before returning a reconciled candidate', () => {
  const current = {
    profile: structuredClone(profile),
    haircuts: [{ id: 'cut-current-one', date: '2026-02-10', preCutLengthCm: 3, postCutLengthCm: 1, note: 'Current' }],
    manualBaseline: { baselineDate: '2026-01-01', baselineLengthCm: 1 }
  };
  const before = structuredClone(current);

  assert.throws(() => Hair.preparePulledSnapshot({
    profile: { ...profile, growthRateCmPerMonth: 5.01 },
    haircuts: []
  }), /between/);
  assert.throws(() => Hair.preparePulledSnapshot({
    profile,
    haircuts: [{ id: 'cut-invalid-one', date: '2026-06-01', postCutLengthCm: 2, note: '' }]
  }), /finite number/);
  assert.deepEqual(current, before);

  const candidate = Hair.preparePulledSnapshot({
    profile: { ...profile, baselineDate: '2026-03-01', baselineLengthCm: 2 },
    haircuts: [
      { id: 'cut-pulled-old', date: '2026-05-01', preCutLengthCm: 5, postCutLengthCm: 2, note: '' },
      { id: 'cut-pulled-new', date: '2026-08-01', preCutLengthCm: 6, postCutLengthCm: 1, note: '' }
    ]
  });
  assert.equal(candidate.profile.baselineDate, '2026-08-01');
  assert.equal(candidate.profile.baselineLengthCm, 1);
  assert.deepEqual(candidate.manualBaseline, { baselineDate: '2026-03-01', baselineLengthCm: 2 });
  assert.deepEqual(candidate.haircuts.map((item) => item.id), ['cut-pulled-new', 'cut-pulled-old']);
});
