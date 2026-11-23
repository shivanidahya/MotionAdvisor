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
  // the citation question now branches; old saved answers ("full", "spot", "none") convert to the branch answers
  const LEGACY = { citeCheck: ["full", "spot", "none"], informed: ["consent", "will", "no"] };
  for (let i = 0; i < 3000; i++) { const a = {}; CONFIG.assessment.sections.forEach((s) => s.qs.forEach((q) => { const vs = LEGACY[q.id] || q.options.map((o) => o.v); a[q.id] = vs[Math.floor(rnd() * vs.length)]; })); sets.push(a); }
  sets.forEach((a0) => {
    // the original took one task; the new version takes a list. One selection must score the same.
    const single = Object.assign({}, a0, { aiTask: Array.isArray(a0.aiTask) ? a0.aiTask[0] : a0.aiTask });
    delete single.maCourt;
    if (single.clientTold) { single.informed = E.prepare(single).informed; ["clientTold", "informedConsent", "clientConfShared", "disclosureRequired"].forEach((k) => delete single[k]); } // the court follow-up adds explanation lines only; checked in test 15
    if (single.citeProcess) { single.citeCheck = E.prepare(single).citeCheck; delete single.citeProcess; delete single.citeMethods; delete single.citeScope; delete single.citeIdeas; }
    const listed = Object.assign({}, single, { aiTask: [single.aiTask] });
    ORIGINAL.adv.answers = single; const o = ORIGINAL.compute(); delete o.date;
    [listed, single].forEach((a) => { const e = E.assess(a); delete e.stopIds; e.factors.forEach((f) => { delete f.id; delete f.links; f.notes = f.notes.map((n) => n.replace(/ Methods you use: .*$/, "")); }); assert.deepEqual(e, o); });
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
  const cases = { "no-cite-check": { citeProcess: "no", citeIdeas: "no" }, "no-final-review": { finalReview: "none" }, "client-info-unsafe-tool": { clientInfo: "limited", tool: "consumer" },
    "client-info-no-safeguards": { clientInfo: "limited", safeguards: "none", tool: "legal" }, "privileged-no-client": { clientInfo: "substantial", clientTold: "no", clientConfShared: "yes", disclosureRequired: "no", tool: "legal" }, "court-restricts": { standing: "restricts" } };
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
  const a = Object.assign({}, TWO, { citeScope: "some" });
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

test("14. Citation checking branches: Yes/No paths, the citator adjustment, the stop, completeness, summaries", () => {
  const q = CONFIG.assessment.sections.find((s) => s.id === "verify").qs.find((x) => x.id === "citeCheck");
  assert.equal(q.type, "branch"); assert.equal(CONFIG.assessment.sections.find((s) => s.id === "verify").weight, 1.5);
  const base = Object.assign({}, TWO); ["citeProcess", "citeMethods", "citeScope", "citeIdeas"].forEach((k) => delete base[k]);
  const run = (ch) => { const a = Object.assign({}, base, ch); return { a, r: E.assess(a), lvl: E.prepare(a).citeCheck }; };
  const old = (v) => { ORIGINAL.adv.answers = Object.assign({}, base, { aiTask: base.aiTask[0], informed: E.prepare(base).informed, citeCheck: v }); return ORIGINAL.compute(); };
  const every = run({ citeProcess: "yes", citeMethods: ["keycite", "spreadsheet", "second"], citeScope: "every" });
  const some = run({ citeProcess: "yes", citeMethods: ["keycite"], citeScope: "some" });
  const noCitator = run({ citeProcess: "yes", citeMethods: ["pincites", "spreadsheet"], citeScope: "every" });
  const noIdeas = run({ citeProcess: "no", citeIdeas: "yes" }), noCont = run({ citeProcess: "no", citeIdeas: "no" });
  // levels and scores match the old answers
  assert.equal(every.lvl, "full"); assert.equal(every.r.index, old("full").index);
  assert.equal(some.lvl, "spot"); assert.equal(some.r.index, old("spot").index);
  assert.equal(noCitator.lvl, "nocitator"); assert.equal(noCitator.r.index, old("spot").index, "every citation but no citator = moderate");
  assert.equal(noCitator.r.factors[3].level, some.r.factors[3].level);
  [noIdeas, noCont].forEach((x) => { assert.equal(x.lvl, "none"); assert.equal(x.r.index, old("none").index); assert.equal(x.r.verdict, "Not recommended"); assert.ok(x.r.stopIds.includes("no-cite-check")); });
  assert.deepEqual(noIdeas.r, noCont.r, "wanting ideas changes nothing");
  // any one citator counts
  ["keycite", "shepards"].forEach((m) => assert.equal(run({ citeProcess: "yes", citeMethods: ["pincites", m], citeScope: "every" }).lvl, "full"));
  // options no longer offered stay hidden but still load: an earlier "BCite + every" result keeps its score
  const shown = q.follow.yes[0].options.filter((o) => !o.hidden).map((o) => o.v);
  assert.deepEqual(shown, ["keycite", "shepards", "pincites", "spreadsheet", "checklist", "second"]);
  assert.equal(run({ citeProcess: "yes", citeMethods: ["bcite"], citeScope: "every" }).lvl, "full");
  // completeness: Yes needs a method and a scope; No needs the ideas answer
  [{ citeProcess: "yes" }, { citeProcess: "yes", citeMethods: ["keycite"] }, { citeProcess: "yes", citeScope: "every" }, { citeProcess: "yes", citeMethods: [], citeScope: "every" }, { citeProcess: "no" }, {}]
    .forEach((ch) => assert.equal(E.answered(q, Object.assign({}, base, ch)), false, JSON.stringify(ch)));
  [every.a, noIdeas.a].forEach((a) => assert.equal(E.answered(q, a), true));
  // summaries and the Verification note name the methods
  assert.equal(E.branchSummary(q, every.a), "Yes. KeyCite, spreadsheet, second reviewer. Every citation.");
  assert.equal(E.branchSummary(q, noIdeas.a), "No.");
  assert.match(every.r.factors[3].notes[0], /Methods you use: KeyCite \(Westlaw\); Tracking citations in a spreadsheet/);
  assert.match(noCitator.r.factors[3].notes[0], /don’t use a citator/);
  // personas keep their scores; old saved results convert
  assert.deepEqual([E.assess(SOLO).index, E.assess(TWO).index, E.assess(NEW).index], [9, 21, 79]);
  assert.deepEqual(E.normalize({ citeCheck: "none" }), { citeProcess: "no", citeIdeas: "no" });
  assert.equal(E.prepare({ citeCheck: "full" }).citeCheck, "full");
  // ideas are in the config
  assert.equal(q.ideas.items.length, 6);
});

test("15. Massachusetts court follow-up: required for MA state court, cleared otherwise, never changes the score", () => {
  const q = CONFIG.assessment.sections.find((s) => s.id === "juris").qs.find((x) => x.id === "jurisdiction");
  assert.equal(q.followUp.options.length, 10);
  const base = Object.assign({}, SOLO);
  assert.equal(E.answered(q, Object.assign({}, base, { maCourt: undefined })), false, "court required");
  ["fed", "state"].forEach((j) => assert.equal(E.answered(q, { jurisdiction: j }), true));
  assert.deepEqual(q.options.map((o) => o.v), ["ma", "fed", "state"]);
  assert.equal(E.normalize({ jurisdiction: "dmass" }).jurisdiction, "fed", "old D. Mass. answers become Federal court");
  assert.deepEqual(E.normalize({ jurisdiction: "fed", maCourt: "sjc" }), { jurisdiction: "fed" }, "switching away clears the court");
  const idx = q.followUp.options.map((o) => E.assess(Object.assign({}, base, { maCourt: o.v })).index);
  assert.ok(idx.every((i) => i === E.assess(base).index), "no court changes the score");
  const juris = (ct) => E.assess(Object.assign({}, base, { maCourt: ct })).factors.find((f) => f.id === "juris");
  assert.match(juris("superior").notes[0], /Filed in the Superior Court/);
  assert.ok(!juris("superior").links.some((l) => /interim-guidelines/.test(l.url)), "SJC guidelines are no longer in the question or explanation");
  assert.deepEqual(juris("superior").links.map((l) => l.pdf), ["docs/wild-west-of-artificial-intelligence.pdf", "docs/two-years-of-fake-cases.pdf"]);
  q.followUp.note.articles.forEach((x) => assert.ok(require("node:fs").existsSync(require("node:path").join(__dirname, "..", x.pdf)), x.pdf));
  assert.ok(juris("bls").links.some((l) => /business-litigation-session-bench-notes/.test(l.url)));
  ["sjc", "appeals"].forEach((ct) => assert.ok(juris(ct).notes.some((n) => /Rules of Appellate Procedure/.test(n))));
  assert.ok(!juris("superior").notes.some((n) => /Appellate/.test(n)));
  assert.equal(E.assess(TWO).factors.find((f) => f.id === "juris").links, undefined, "federal court gets no Massachusetts state-court extras");
});

test("16. Every link and PDF the assessment shows is also on the Rules & Sources page", () => {
  const html = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  const rules = html.slice(html.indexOf("const RULES=["), html.indexOf("function renderRules"));
  const urls = new Set();
  const walk = (o) => { if (!o || typeof o !== "object") return; Object.values(o).forEach((v) => { if (typeof v === "string" && (/^https?:\/\//.test(v) || /^docs\//.test(v)) && !/#citations$/.test(v)) urls.add(v); else walk(v); }); };
  walk(CONFIG.assessment);
  assert.ok(urls.size >= 10);
  urls.forEach((u) => assert.ok(rules.includes('"' + u + '"'), "missing from Rules & Sources: " + u));
});

test("17. Client communication branches: told / not yet / no, follow-ups, the stop, old answers", () => {
  const q = CONFIG.assessment.sections.find((s) => s.id === "client").qs.find((x) => x.id === "informed");
  assert.equal(q.type, "branch");
  const base = Object.assign({}, TWO); ["clientTold", "informedConsent", "clientConfShared", "disclosureRequired"].forEach((k) => delete base[k]);
  const run = (ch) => { const a = Object.assign({}, base, ch); return { a, r: E.assess(a), lvl: E.prepare(a).informed }; };
  const old = (v) => { ORIGINAL.adv.answers = Object.assign({}, base, { aiTask: base.aiTask[0], citeCheck: E.prepare(base).citeCheck, informed: v }); return ORIGINAL.compute().index; };
  assert.equal(run({ clientTold: "yes", informedConsent: "yes" }).lvl, "consent"); assert.equal(run({ clientTold: "yes", informedConsent: "yes" }).r.index, old("consent"));
  assert.equal(run({ clientTold: "yes", informedConsent: "no" }).lvl, "toldnoconsent"); assert.equal(run({ clientTold: "yes", informedConsent: "no" }).r.index, old("will"));
  assert.equal(run({ clientTold: "notyet" }).lvl, "will"); assert.equal(run({ clientTold: "notyet" }).r.index, old("will"));
  const no = run({ clientTold: "no", clientConfShared: "yes", disclosureRequired: "yes" });
  assert.equal(no.lvl, "no"); assert.equal(no.r.index, old("no"));
  // follow-up answers add explanation lines, never score
  assert.equal(run({ clientTold: "no", clientConfShared: "no", disclosureRequired: "no" }).r.index, no.r.index);
  assert.match(no.r.factors[5].notes[0], /ABA Formal Op\. 512 calls for informed consent/);
  assert.match(no.r.factors[5].notes[0], /requires disclosing AI use in the filing/);
  // completeness
  [{ clientTold: "yes" }, { clientTold: "no" }, { clientTold: "no", clientConfShared: "yes" }, {}].forEach((ch) => assert.equal(E.answered(q, Object.assign({}, base, ch)), false, JSON.stringify(ch)));
  // stop still fires for substantial client information and "No"
  assert.ok(run({ clientInfo: "substantial", tool: "legal", clientTold: "no", clientConfShared: "yes", disclosureRequired: "no" }).r.stopIds.includes("privileged-no-client"));
  // links by answer, and old saved answers convert
  assert.ok(run({ clientTold: "notyet" }).r.factors[5].links.some((l) => /caseread\.ai/.test(l.url)));
  assert.ok(no.r.factors[5].links.some((l) => /when-should-lawyers-disclose-ai-use/.test(l.url)));
  assert.deepEqual(E.normalize({ informed: "consent" }), { clientTold: "yes", informedConsent: "yes" });
  assert.equal(E.prepare({ informed: "no" }).informed, "no");
  assert.equal(E.branchSummary(q, no.a), "No. Confidential information will be shared. Disclosure required in filings.");
  assert.ok(q.follow.yes[0].term.def.startsWith("Informed consent denotes"));
});
