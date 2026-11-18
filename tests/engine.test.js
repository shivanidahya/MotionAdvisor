/* Automated test scenarios for the Motion Advisor decision engine.
   Run with:  npm test   (or: node --test tests/)
   Each scenario uses only config.js + engine.js, so results are deterministic. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const CONFIG = require("../config.js");
const E = require("../engine.js")(CONFIG);

const ids = (s) => s.ranked.map((r) => r.id);

// A situation where AI-assisted drafting is attractive: routine discovery motion,
// anonymized facts, legal-database tool, client consent, a tight deadline.
const FAVOURABLE = { motion: "compel", dispositive: "no", info: ["anonymized"], clientConsent: "yes", deadline: "h24_48" };

test("1. Gate blocks options: confidential data in a consumer chatbot", () => {
  const st = E.newState({ tool: "consumer", trains: "notsure", retains: "yes", grounded: "no", info: ["confidential"] });
  const g = E.gates(st);
  assert.deepEqual(g.triggered.map((x) => x.id), ["confidential-data"]);
  assert.deepEqual(Object.keys(g.blocked).sort(), ["C", "D", "E"]);
  const s = E.score(st);
  assert.deepEqual(ids(s), ["A", "B"], "blocked options are left out of the ranking");
  assert.ok(s.rows.find((r) => r.id === "D").blocked);
});

test("2. Weights and ratings cannot override a gate", () => {
  const st = E.newState({ citeCheck: "none" });
  E.setWeight(st, "time", 10); E.setWeight(st, "cost", 10);
  ["accuracy", "confidentiality", "compliance", "time", "cost", "client", "quality", "development"].forEach((f) => E.setOverride(st, "E", f, 5));
  const s = E.score(st);
  assert.ok(s.rows.find((r) => r.id === "E").blocked);
  assert.ok(!ids(s).includes("E"));
  assert.throws(() => E.decisionRecord(st, "E", "Fastest."), /blocked/);
});

test("3. Changing weights changes the top choice", () => {
  const st = E.newState(FAVOURABLE);
  assert.equal(E.score(st).top.id, "B");
  E.setWeight(st, "time", 10); E.setWeight(st, "cost", 10); E.setWeight(st, "development", 0);
  assert.equal(E.score(st).top.id, "D");
  const st2 = E.newState();
  E.setWeight(st2, "development", 10);
  assert.equal(E.score(st2).top.id, "A");
});

test("4. Close call: margin under 5 points is flagged", () => {
  const s = E.score(E.newState());
  assert.equal(s.top.id, "B");
  assert.equal(s.runnerUp.id, "A");
  assert.ok(s.margin < 5 && s.margin > 0);
  assert.equal(s.closeCall, true);
  const wide = E.score(E.newState({ tool: "consumer", trains: "notsure", retains: "yes", grounded: "no", info: ["confidential"] }));
  assert.ok(wide.margin >= 5);
  assert.equal(wide.closeCall, false);
});

test("5. Uncertainty estimate flips the ranking", () => {
  const st = E.newState(FAVOURABLE);
  E.setWeight(st, "time", 10); E.setWeight(st, "cost", 10); E.setWeight(st, "development", 0);
  assert.equal(E.score(st).top.id, "D");
  st.uncertainty = { enabled: true, errorChance: 15, disclosureChance: 10, touched: true };
  const s = E.score(st);
  assert.notEqual(s.top.id, "D");
  assert.ok(s.ranked.findIndex((r) => r.id === "D") >= 1);
  const range = E.uncertaintyRange(Object.assign(E.clone(st), { uncertainty: { enabled: true, errorChance: 0, disclosureChance: 10, touched: true } }));
  assert.equal(range.leader, "D");
  assert.ok(range.drop && range.drop.above >= 0 && range.drop.above < 15);
  assert.match(range.text, /drops to second if error risk is above \d+%/);
});

test("6. User picks a non-top option: allowed, recorded and checklist tailored", () => {
  const st = E.newState();
  const rec = E.decisionRecord(st, "C", "Firm policy allows AI only for formatting.", "2026-11-16T00:00:00Z");
  assert.equal(rec.top.id, "B");
  assert.equal(rec.chosen.id, "C");
  assert.equal(rec.choseTop, false);
  assert.equal(rec.chosen.rank, 3);
  assert.equal(rec.rationale, "Firm policy allows AI only for formatting.");
  assert.ok(rec.checklist.some((t) => /only the parts being formatted/.test(t)));
  assert.ok(!rec.checklist.some((t) => /every factual statement against the record/.test(t)), "fact check is for D/E");
});

test("7. Sensitivity reports the nearest weight change that changes the leader", () => {
  const sens = E.sensitivity(E.newState());
  assert.ok(sens.length > 0);
  assert.match(sens[0].text, /^If you (raised|lowered) the weight on .+ \(now \d+\), Option [A-E] would overtake Option B\.$/);
  // verify the claim: applying the change really changes the leader
  const st = E.newState(); E.setWeight(st, sens[0].factor, sens[0].at);
  assert.equal(E.score(st).top.id, sens[0].newLeader);
});

test("8. Bias checks: deadline, automation and overconfidence prompts", () => {
  const st = E.newState({ deadline: "lt24" });
  assert.deepEqual(E.biasChecks(st).map((b) => b.id), ["deadline"]);
  E.setOverride(st, "D", "accuracy", 5);
  assert.ok(E.biasChecks(st).some((b) => b.id === "automation"));
  E.setOverride(st, "E", "time", 5); // already 5: no change, not counted
  E.setOverride(st, "E", "compliance", 4);
  E.setOverride(st, "A", "quality", 2);
  const ids8 = E.biasChecks(st).map((b) => b.id);
  assert.ok(ids8.includes("overconfidence"));
});

test("9. Anchoring mode: ranking waits until every unblocked cell is rated", () => {
  const st = E.newState({ citeCheck: "spot" }); // B, D, E blocked
  st.blind = true;
  let p = E.blindProgress(st);
  assert.equal(p.need, 2 * 8);
  assert.equal(p.complete, false);
  ["A", "C"].forEach((o) => st.factors.forEach((f) => E.setOverride(st, o, f.id, 3)));
  p = E.blindProgress(st);
  assert.equal(p.complete, true);
});

test("10. Overrides are marked and reset to the suggestion", () => {
  const st = E.newState();
  const before = E.cell(st, st.options[3], "time");
  E.setOverride(st, "D", "time", 2);
  const c = E.cell(st, st.options[3], "time");
  assert.equal(c.overridden, true);
  assert.equal(c.value, 2);
  E.resetCell(st, "D", "time");
  assert.deepEqual(E.cell(st, st.options[3], "time"), before);
});

test("11. Custom options inherit the gates of the preset they are based on", () => {
  const st = E.newState({ swornAI: "yes" });
  E.addOption(st, "AI outline, I write", "D");
  E.addOption(st, "Westlaw research", "B");
  const g = E.gates(st);
  assert.deepEqual(g.blocked.X1, ["sworn-facts"]);
  assert.equal(g.blocked.X2, undefined);
  E.addFactor(st, "Supervising partner's comfort", 6);
  const s = E.score(st);
  assert.ok(s.ranked.some((r) => r.id === "X2"));
  assert.equal(E.cell(st, st.options[6], "f1").suggested, 3);
});

test("12. Deterministic: identical inputs give identical outputs", () => {
  const a = E.decisionRecord(E.newState(FAVOURABLE), "B", "x", "t");
  const b = E.decisionRecord(E.newState(FAVOURABLE), "B", "x", "t");
  assert.deepEqual(a, b);
});

test("13. Every gate, option and factor in config is well formed", () => {
  const optIds = CONFIG.options.map((o) => o.id);
  CONFIG.gates.forEach((g) => g.blocks.forEach((b) => assert.ok(optIds.includes(b), g.id)));
  CONFIG.factors.forEach((f) => optIds.forEach((o) => {
    const r = CONFIG.ratings[f.id][o];
    assert.ok(r && r[0] >= 1 && r[0] <= 5 && r[1].length > 10, f.id + "/" + o);
  }));
  CONFIG.adjustments.forEach((a) => assert.ok(CONFIG.ratings[a.factor], a.id));
  CONFIG.factors.forEach((f) => assert.ok(f.weight >= 0 && f.weight <= 10));
});

/* ===================== Main path: questionnaire + risk report ===================== */
const BASE = { court: "ma_state", maDept: "superior", motion: "compel", dispositive: "no", issue: "settled", tool: "enterprise", trains: "no", retains: "no", grounded: "no",
  info: ["public"], parts: ["service", "order", "editing"], citeCheck: "yes", factCheck: "yes", deadline: "gt7", policy: "yes", consent: "na", familiarity: "very" };
const A = (o) => Object.assign({}, BASE, o);

test("R1. Low risk: routine parts, enterprise tool that doesn't train, public information", () => {
  const r = E.assess(BASE);
  assert.equal(r.overall, "Low");
  assert.ok(r.parts.every((p) => p.level === "Low"));
  assert.equal(r.risks.length, 0);
  assert.match(r.suggestions[0], /Every part you selected is lower-risk/);
  assert.match(r.checklist[0], /Superior Court Rule 9A/);
});

test("R2. Moderate risk: AI-assisted legal argument with every safeguard in place", () => {
  const r = E.assess(A({ tool: "legal_research", grounded: "yes", parts: ["research", "memo_argument"] }));
  assert.equal(r.overall, "Moderate");
  assert.equal(r.parts.find((p) => p.id === "memo_argument").level, "Moderate");
  assert.ok(r.risks.some((x) => x.kind === "part"));
  assert.equal(E.lowerRisk(A({ tool: "legal_research", grounded: "yes", parts: ["research", "memo_argument"] }))[0].id, "no-argument");
});

test("R3. High risk: dispositive, novel, consumer tool, spot-checks, under 48 hours", () => {
  const ans = A({ motion: "msj", dispositive: "yes", issue: "novel", tool: "consumer", trains: "yes", retains: "yes", parts: ["research", "memo_argument", "service"], citeCheck: "partial", deadline: "lt48", policy: "no" });
  const r = E.assess(ans);
  assert.equal(r.overall, "High");
  assert.equal(r.hardStop, false);
  assert.equal(r.parts.find((p) => p.id === "service").level, "Low");
  assert.match(r.suggestions.join(" "), /Use AI only for the certificate of service/);
  assert.ok(E.lowerRisk(ans).length > 0);
});

test("R4. Hard stops: confidential data + unsure tool, and AI-drafted affidavits", () => {
  const r = E.assess(A({ tool: "consumer", trains: "notsure", retains: "yes", info: ["confidential"], parts: ["memo_facts", "service", "affidavits"], consent: "no" }));
  assert.equal(r.overall, "High");
  assert.equal(r.parts.find((p) => p.id === "memo_facts").level, "Not recommended");
  assert.equal(r.parts.find((p) => p.id === "affidavits").level, "Not recommended");
  assert.equal(r.parts.find((p) => p.id === "service").level, "Low", "parts that need no client data stay open");
  assert.deepEqual(r.risks.filter((x) => x.kind === "hard").map((x) => x.id), ["confidential-data", "sworn-statements"]);
  assert.match(r.suggestions[0], /Switch to a tool that doesn't train/);
  // no citation check blocks research and argument only
  const n = E.assess(A({ citeCheck: "no", parts: ["research", "memo_argument", "order"] }));
  assert.deepEqual(n.parts.filter((p) => p.level === "Not recommended").map((p) => p.id), ["research", "memo_argument"]);
});

test("R5. Safeguard gaps raise the overall level one step", () => {
  const r = E.assess(A({ policy: "no", familiarity: "not" }));
  assert.equal(r.overall, "Moderate");
  assert.equal(r.bumped, true);
});

test("R6. Report answers pre-fill the Compare Your Options matrix, with the same hard stops", () => {
  const ans = A({ tool: "consumer", trains: "notsure", retains: "yes", info: ["sealed"], parts: ["memo_argument"], citeCheck: "partial", deadline: "lt48" });
  const st = E.newState(E.framingFromAnswers(ans));
  assert.equal(st.framing.citeCheck, "spot");
  assert.deepEqual(st.framing.info, ["confidential"]);
  const g = E.gates(st);
  assert.deepEqual(g.triggered.map((x) => x.id).sort(), ["citation-verification", "confidential-data"]);
  assert.ok(g.blocked.D && g.blocked.E);
});

test("R7. Questionnaire validation and determinism", () => {
  assert.deepEqual(E.stepMissing(0, { court: "ma_state" }), ["maDept"]);
  assert.deepEqual(E.stepMissing(0, { court: "dmass" }), []);
  assert.equal(E.qComplete(BASE), true);
  assert.deepEqual(E.assess(BASE), E.assess(JSON.parse(JSON.stringify(BASE))));
});
