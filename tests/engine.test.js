/* Automated tests for Motion Advisor's scoring.  Run: npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const CONFIG = require("../config.js");
const E = require("../engine.js")(CONFIG);
const ORIGINAL = require("./original-compute.js");
const P = Object.fromEntries(CONFIG.assessment.personas.map((p) => [p.name, p.a]));
const SOLO = P["Solo practitioner, routine extension"], TWO = P["Two-lawyer firm, motion to compel"], NEW = P["New associate, summary judgment"];
const ids = (list) => list.map((o) => o.id);

test("1. Restored scoring matches the original deployed version exactly (personas + 3,000 random answer sets)", () => {
  const sets = CONFIG.assessment.personas.map((p) => p.a);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) { const a = {}; CONFIG.assessment.sections.forEach((s) => s.qs.forEach((q) => { a[q.id] = q.options[Math.floor(rnd() * q.options.length)].v; })); sets.push(a); }
  sets.forEach((a) => {
    ORIGINAL.adv.answers = a; const o = ORIGINAL.compute(); delete o.date;
    const e = E.assess(a); delete e.stopIds; e.factors.forEach((f) => delete f.id);
    assert.deepEqual(e, o);
  });
});

test("2. Persona results", () => {
  assert.deepEqual([E.assess(SOLO).verdict, E.assess(SOLO).index], ["Recommended with safeguards", 9]);
  assert.deepEqual([E.assess(TWO).verdict, E.assess(TWO).index], ["Recommended with safeguards", 21]);
  const n = E.assess(NEW);
  assert.equal(n.verdict, "Not recommended");
  assert.deepEqual(n.stopIds, ["client-info-unsafe-tool", "client-info-no-safeguards", "privileged-no-client"]);
});

test("3. Every automatic stop forces Not recommended and blocks the configured options", () => {
  const cases = { "no-cite-check": { citeCheck: "none" }, "no-final-review": { finalReview: "none" }, "client-info-unsafe-tool": { clientInfo: "limited", tool: "consumer" },
    "client-info-no-safeguards": { clientInfo: "limited", safeguards: "none", tool: "legal" }, "privileged-no-client": { clientInfo: "substantial", informed: "no", tool: "legal" }, "court-restricts": { standing: "restricts" } };
  Object.entries(cases).forEach(([id, ch]) => {
    const a = Object.assign({}, SOLO, ch);
    const r = E.assess(a); assert.equal(r.verdict, "Not recommended", id); assert.ok(r.stopIds.includes(id), id);
    const R = E.optionsReport(a);
    assert.deepEqual(ids(R.blocked).sort(), CONFIG.optionsReport.blocks[id].slice().sort(), id);
    assert.ok(!R.options.find((o) => o.id === "none").blocked, "Draft without AI is never blocked");
  });
});

test("4. Options Report: Draft without AI is Low everywhere; AI options are rated on the same six sections", () => {
  const R = E.optionsReport(TWO);
  const none = R.options.find((o) => o.id === "none");
  assert.ok(none.cells.every((c) => c.level === "Low"));
  R.options.forEach((o) => assert.deepEqual(o.cells.map((c) => c.id), ["task", "conf", "comp", "verify", "juris", "client"]));
  const f = R.options.find((o) => o.id === "format"), d = R.options.find((o) => o.id === "draft");
  assert.ok(f.index <= d.index, "formatting is never riskier than drafting");
});

test("5. Bottom line: lowest-risk open AI option; Draft without AI when every AI option is blocked or high", () => {
  const R = E.optionsReport(TWO);
  const ai = R.options.filter((o) => !o.noAI && !o.blocked);
  assert.equal(R.bottom.index, Math.min(...ai.map((o) => o.index)));
  assert.equal(R.bottom.id, "format");
  assert.equal(R.runnerUp.id, "organize");
  assert.equal(E.optionsReport(NEW).bottom.id, "none");
  // no blocks but every AI option high -> Draft without AI
  const risky = Object.assign({}, NEW, { tool: "legal", safeguards: "informal", informed: "will" });
  const r2 = E.optionsReport(risky);
  if (r2.options.filter((o) => !o.noAI && !o.blocked).every((o) => o.band === "High")) assert.equal(r2.bottom.id, "none");
});

test("6. Weights change the bars and the bottom line is recomputed; defaults equal the assessment weights", () => {
  assert.deepEqual(E.defaultWeights(), { task: 1, conf: 1.5, comp: 1, verify: 1.5, juris: 1, client: 1 });
  const a = Object.assign({}, TWO, { citeCheck: "spot" });
  const base = E.optionsReport(a);
  const heavy = E.optionsReport(a, Object.assign(E.defaultWeights(), { comp: 3 }));
  assert.notEqual(heavy.options.find((o) => o.id === "format").index, base.options.find((o) => o.id === "format").index);
  // the bottom line is recomputed from the weighted totals
  const w = Object.assign(E.defaultWeights(), { comp: 3, verify: 0 });
  const R = E.optionsReport(a, w), ai = R.options.filter((o) => !o.noAI && !o.blocked);
  assert.equal(R.bottom.index, Math.min(...ai.map((o) => o.index)));
});

test("7. Deterministic", () => {
  assert.deepEqual(E.optionsReport(NEW), E.optionsReport(JSON.parse(JSON.stringify(NEW))));
  assert.deepEqual(E.assess(TWO), E.assess(Object.assign({}, TWO)));
});

test("8. Config integrity", () => {
  const optIds = CONFIG.optionsReport.options.map((o) => o.id);
  CONFIG.assessment.stops.forEach((s) => (CONFIG.optionsReport.blocks[s.id] || []).forEach((b) => assert.ok(optIds.includes(b) && b !== "none")));
  assert.equal(CONFIG.assessment.sections.reduce((n, s) => n + s.qs.length, 0), 13);
  CONFIG.assessment.sections.forEach((s) => assert.ok(CONFIG.assessment.authorities[s.id]));
});
