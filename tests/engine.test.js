/* Automated tests for Motion Advisor's scoring.  Run: npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const CONFIG = require("../config.js");
const E = require("../engine.js")(CONFIG);
const ORIGINAL = require("./original-compute.js");
const P = Object.fromEntries(CONFIG.assessment.personas.map((p) => [p.name, p.a]));
const SOLO = P["Solo practitioner, routine extension"], TWO = P["Two-lawyer firm, motion to compel"], NEW = P["New associate, summary judgment"];
const fs = require("node:fs"), path = require("node:path");
const nlp = require("../vendor/compromise.min.js");
const ids = (list) => list.map((o) => o.id);

test("1. One selected task scores exactly as the original single-choice version did (personas + 3,000 random answer sets; old saved strings too)", () => {
  const sets = CONFIG.assessment.personas.map((p) => p.a);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 3000; i++) { const a = {}; CONFIG.assessment.sections.forEach((s) => s.qs.forEach((q) => { a[q.id] = q.options[Math.floor(rnd() * q.options.length)].v; })); sets.push(a); }
  sets.forEach((a0) => {
    // the original took one task; the new version takes a list. One selection must score the same.
    const single = Object.assign({}, a0, { aiTask: Array.isArray(a0.aiTask) ? a0.aiTask[0] : a0.aiTask });
    const listed = Object.assign({}, single, { aiTask: [single.aiTask] });
    ORIGINAL.adv.answers = single; const o = ORIGINAL.compute(); delete o.date;
    [listed, single].forEach((a) => { const e = E.assess(a); delete e.stopIds; e.factors.forEach((f) => delete f.id); assert.deepEqual(e, o); });
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

test("9. Select all that apply: the riskiest task sets the score; extra low-risk tasks never lower it", () => {
  const q = CONFIG.assessment.sections[0].qs.find((x) => x.id === "aiTask");
  assert.equal(q.multi, "max");
  const both = E.assess(Object.assign({}, TWO, { aiTask: ["format", "research"] }));
  const alone = E.assess(Object.assign({}, TWO, { aiTask: ["research"] }));
  assert.equal(both.index, alone.index);
  assert.equal(both.verdict, alone.verdict);
  assert.match(both.factors[0].notes.join(" "), /Finding case law and legal research \(high risk, sets the score\)/);
  assert.match(both.factors[0].notes.join(" "), /Formatting, templates, proofreading \(low risk\)/);
  // every combination: score is never below the riskiest single task
  const opts = q.options.map((o) => o.v);
  for (let m = 1; m < 1 << opts.length; m++) {
    const pick = opts.filter((_, i) => m & (1 << i));
    const worst = Math.max(...pick.map((v) => E.assess(Object.assign({}, TWO, { aiTask: [v] })).index));
    assert.equal(E.assess(Object.assign({}, TWO, { aiTask: pick })).index, worst);
  }
  // an empty selection is not complete
  assert.equal(E.complete(Object.assign({}, TWO, { aiTask: [] })), false);
  // old saved results with a single string convert to a one-item list
  assert.deepEqual(E.normalize({ aiTask: "draft" }).aiTask, ["draft"]);
});

test("10. Options Report uses every selected task the option allows", () => {
  const R = E.optionsReport(Object.assign({}, TWO, { aiTask: ["format", "research"] }));
  const draft = R.options.find((o) => o.id === "draft").cells[0].lines.find((l) => l.q === "aiTask");
  assert.deepEqual(draft.asAnswer, ["draft", "format"], "research is outside every option");
  const org = E.optionsReport(Object.assign({}, TWO, { aiTask: ["outline", "summarize"] })).options.find((o) => o.id === "organize").cells[0].lines.find((l) => l.q === "aiTask");
  assert.deepEqual(org.asAnswer.slice().sort(), ["outline", "summarize"]);
});

test("11. Draft scanner: identifiers, minors, privilege and medical terms; summary lists every category; suggests without choosing", () => {
  const t = "PRIVILEGED & CONFIDENTIAL. Client SSN 123-45-6789, DOB 03/14/1985, card 4111 1111 1111 1111, email a@b.com. Her child, age 9, was treated for depression. Our strategy is to settle.";
  const r = E.scanDraft(t);
  assert.equal(r.counts.identifier, 4); assert.equal(r.counts.minor, 2); assert.equal(r.counts.privilege, 3); assert.equal(r.counts.medical, 2);
  assert.deepEqual(r.suggestions.map((s) => s.kind), ["privilege", "identifying"]);
  // every category appears in the summary with its count, zeros included
  Object.values(CONFIG.scanner.categories).forEach((c) => assert.match(r.summary, new RegExp(c.label + ": \\d+")));
  assert.match(r.summary, /Personal identifiers: 4/); assert.match(r.summary, /Possible names: 0/);
  r.flags.forEach((f) => assert.equal(t.slice(f.start, f.end), f.text));
  // ordinary legal citations and dates aren't flagged
  const clean = E.scanDraft("Motion to dismiss under Rule 12(b)(6). See 550 U.S. 544 (2007); 28 U.S.C. § 1332. Filed Nov. 3, 2026. Docket No. 1:24-cv-10123. Page 12 of 20.", { nlp });
  assert.equal(clean.flags.length, 0);
  assert.equal(clean.suggestions[0].kind, "none");
  // a 16-digit number that fails the card checksum isn't a card; ages 18+ aren't minors
  assert.equal(E.scanDraft("Ref 1234 5678 9012 3456").flags.length, 0);
  assert.equal(E.scanDraft("She is age 34.").flags.length, 0);
});

test("11b. Keywords match in any case, across line breaks, double spaces, hyphen and dash variants, and in plural or variant forms", () => {
  ["privileged", "Privileged", "PRIVILEGED", "attorney-client", "attorney\u2013client", "attorney\u2011client", "attorney client", "work\nproduct", "work  product", "work\u00a0product", "do not\r\ndisclose"].forEach((w) =>
    assert.ok(E.scanDraft("The memo: " + w + ".").counts.privilege >= 1, JSON.stringify(w)));
  [["diagnosis", "medical"], ["diagnosed", "medical"], ["hospitalized", "medical"], ["disabilities", "medical"], ["immigrant", "immigration"], ["visas", "immigration"], ["green card", "immigration"],
   ["conviction", "criminal"], ["convicted", "criminal"], ["criminal records", "criminal"], ["CORI", "criminal"], ["impounded", "sealed"], ["under seal", "sealed"], ["juvenile", "minor"], ["routing number", "financial"], ["tax returns", "financial"]].forEach(([w, cat]) =>
    assert.ok(E.scanDraft("Note that " + w + " appears here.").counts[cat] >= 1, w + " -> " + cat));
  // whole words only
  assert.equal(E.scanDraft("The visage and the minority report were unprivileged news.").total, 0);
});

test("11c. Names: typed-in names match in any case; a name found once is flagged everywhere", () => {
  const r = E.scanDraft("We spoke with the client about the lease. jane q. doe agreed.", { names: ["Jane Q. Doe"] });
  assert.equal(r.counts.name, 1);
  assert.deepEqual(r.suggestions.map((s) => s.kind), ["names"]);
  assert.equal(E.scanDraft("Nothing to see.", { names: ["Jane Q. Doe"] }).counts.name, 0);
});

/* STEP 5 fixtures: the same expectations with and without the in-browser name library */
const FIX = (f) => fs.readFileSync(path.join(__dirname, "scanner-fixtures", f), "utf8");
[["no library", {}], ["with compromise", { nlp }]].forEach(([how, opts]) => {
  test("12. Fixtures (" + how + ")", () => {
    const n = E.scanDraft(FIX("1-names.txt"), opts);
    ["Jane Smith", "Acme Corp.", "Mr. Robert Jones", "Maria Lopez", "Daniel Park"].forEach((nm) => assert.ok(n.flags.some((f) => f.cat === "name" && f.text === nm), nm));
    assert.ok(!n.flags.some((f) => /Court|Massachusetts|Superior|Plaintiff|March/.test(f.text)), "no court, place, label or month words");
    assert.ok(n.suggestions.some((s) => s.kind === "names"));
    assert.doesNotMatch(n.suggestions.map((s) => s.text).join(" "), /Nothing flagged|No common identifiers/);
    const p = E.scanDraft(FIX("2-privilege.txt"), opts);
    assert.deepEqual(p.flags.map((f) => f.text), ["PRIVILEGED", "attorney work product"]);
    const m = E.scanDraft(FIX("3-medical-immigration.txt"), opts);
    assert.equal(m.counts.medical, 2); assert.equal(m.counts.immigration, 1);
    const i = E.scanDraft(FIX("4-identifiers.txt"), opts);
    assert.equal(i.counts.identifier, 3);
    const c = E.scanDraft(FIX("5-clean.txt"), opts);
    assert.equal(c.counts.name, 0, c.flags.map((f) => f.text).join(", "));
    assert.equal(c.total, 0);
  });
});

test("13. The scanner never changes the score", () => {
  const before = E.assess(Object.assign({}, TWO, { clientInfo: "unsure" }));
  E.scanDraft("SSN 123-45-6789 privileged");
  assert.deepEqual(E.assess(Object.assign({}, TWO, { clientInfo: "unsure" })), before);
});
