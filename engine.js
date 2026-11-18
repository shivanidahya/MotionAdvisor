/* ============================================================================
   Motion Advisor: decision engine
   ----------------------------------------------------------------------------
   Pure, deterministic functions that apply config.js to a user's session state.
   No AI model, no network, no randomness: the same state always gives the same
   result. The page (index.html) and the tests (tests/engine.test.js) both use
   this file.

   Usage:  var E = MAEngine(MA_CONFIG);   // browser
           var E = require("./engine.js")(require("./config.js"));  // Node
   ========================================================================== */
(function (root) {
  "use strict";

  function makeEngine(cfg) {
    var MIN = cfg.scale.min, MAX = cfg.scale.max;

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function asList(v) { return Array.isArray(v) ? v : (v == null || v === "" ? [] : [v]); }

    /* ---------- conditions ---------- */
    function test(cond, framing) {
      if (!cond) return true;
      if (cond.all) return cond.all.every(function (c) { return test(c, framing); });
      if (cond.any) return cond.any.some(function (c) { return test(c, framing); });
      var v = framing[cond.field];
      if ("equals" in cond) return v === cond.equals;
      if ("notEquals" in cond) return v !== cond.notEquals;
      if ("in" in cond) return cond.in.indexOf(v) >= 0;
      if ("includesAny" in cond) return asList(v).some(function (x) { return cond.includesAny.indexOf(x) >= 0; });
      if ("excludesAll" in cond) return !asList(v).some(function (x) { return cond.excludesAll.indexOf(x) >= 0; });
      return false;
    }

    /* ---------- framing ---------- */
    function defaultFraming() {
      var f = {};
      Object.keys(cfg.framing.fields).forEach(function (k) { f[k] = clone(cfg.framing.fields[k].default); });
      return f;
    }
    function choice(field, v) {
      var def = cfg.framing.fields[field];
      if (!def) return null;
      for (var i = 0; i < def.choices.length; i++) if (def.choices[i].v === v) return def.choices[i];
      return null;
    }
    function framingLabel(field, v) {
      if (Array.isArray(v)) return v.map(function (x) { var c = choice(field, x); return c ? c.label : x; }).join("; ");
      var c = choice(field, v); return c ? c.label : String(v);
    }
    /* Suggested follow-on answers when the user changes the motion or tool. */
    function prefillFor(field, v) {
      var c = choice(field, v);
      if (!c) return {};
      if (field === "motion" && c.dispositive) return { dispositive: c.dispositive };
      if (field === "tool" && c.prefill) return clone(c.prefill);
      return {};
    }

    /* ---------- state ---------- */
    function newState(framing) {
      var fr = Object.assign(defaultFraming(), framing || {});
      var st = {
        framing: fr,
        options: cfg.options.map(function (o) { return { id: o.id, name: o.name, short: o.short, desc: o.desc, basedOn: o.id, custom: false }; }),
        factors: cfg.factors.map(function (f) { return { id: f.id, name: f.name, why: f.why, custom: false }; }),
        weights: {},
        weightsTouched: {},
        overrides: {},
        uncertainty: { enabled: false, errorChance: null, disclosureChance: null, touched: false },
        blind: false
      };
      refreshSuggested(st);
      return st;
    }
    /* Re-derive weights and uncertainty starting points after framing changes,
       keeping anything the user has set by hand. */
    function refreshSuggested(st) {
      var sw = suggestedWeights(st.framing).weights;
      st.factors.forEach(function (f) {
        if (!st.weightsTouched[f.id]) st.weights[f.id] = f.custom ? (st.weights[f.id] == null ? 5 : st.weights[f.id]) : sw[f.id];
      });
      if (!st.uncertainty.touched) {
        var u = defaultUncertainty(st.framing);
        st.uncertainty.errorChance = u.errorChance;
        st.uncertainty.disclosureChance = u.disclosureChance;
      }
      return st;
    }

    function cfgOption(id) { for (var i = 0; i < cfg.options.length; i++) if (cfg.options[i].id === id) return cfg.options[i]; return null; }
    function cfgFactor(id) { for (var i = 0; i < cfg.factors.length; i++) if (cfg.factors[i].id === id) return cfg.factors[i]; return null; }
    function baseOf(opt) { return cfgOption(opt.basedOn || opt.id) || cfgOption("E"); }

    /* ---------- gates ---------- */
    function gates(st) {
      var triggered = cfg.gates.filter(function (g) { return test(g.when, st.framing); });
      var blocked = {};
      st.options.forEach(function (o) {
        var base = baseOf(o).id;
        var by = triggered.filter(function (g) { return g.blocks.indexOf(base) >= 0; }).map(function (g) { return g.id; });
        if (by.length) blocked[o.id] = by;
      });
      return { triggered: triggered, blocked: blocked };
    }

    /* ---------- weights ---------- */
    function suggestedWeights(framing) {
      var w = {}, notes = {};
      cfg.factors.forEach(function (f) { w[f.id] = f.weight; notes[f.id] = []; });
      cfg.weightAdjustments.forEach(function (a) {
        if (test(a.when, framing) && a.factor in w) {
          w[a.factor] = clamp(w[a.factor] + a.delta, cfg.weightScale.min, cfg.weightScale.max);
          notes[a.factor].push({ id: a.id, delta: a.delta, reason: a.reason });
        }
      });
      return { weights: w, notes: notes };
    }

    /* ---------- ratings ---------- */
    function suggestedCell(st, opt, factorId) {
      var base = baseOf(opt), f = cfgFactor(factorId);
      if (!f) return { value: 3, base: 3, reason: "You added this factor, so there is no suggested rating. Rate each option yourself.", adjustments: [], custom: true };
      var r = cfg.ratings[factorId][base.id];
      var cell = { value: r[0], base: r[0], reason: r[1], adjustments: [], custom: false };
      cfg.adjustments.forEach(function (a) {
        if (a.factor !== factorId || !(base.id in a.delta) || !test(a.when, st.framing)) return;
        var before = cell.value;
        cell.value = clamp(cell.value + a.delta[base.id], MIN, MAX);
        if (cell.value !== before) cell.adjustments.push({ id: a.id, delta: cell.value - before, reason: a.reason });
      });
      if (opt.custom) cell.reason = "Suggested from “" + base.name + "”, the preset this option is based on. " + cell.reason;
      return cell;
    }
    function key(optId, factorId) { return optId + "|" + factorId; }

    /* Uncertainty panel: plain linear penalties (see config.uncertainty). */
    function uncertaintyShift(opt, factorId, u) {
      if (!u || !u.enabled) return 0;
      var b = baseOf(opt);
      if (factorId === "accuracy") return -b.exposure * (u.errorChance / 10);
      if (factorId === "compliance") return -b.disclosureBurden * (u.disclosureChance / 100);
      return 0;
    }
    function cell(st, opt, factorId, u) {
      var s = suggestedCell(st, opt, factorId);
      var k = key(opt.id, factorId);
      var overridden = k in st.overrides;
      var chosen = overridden ? st.overrides[k] : s.value;
      var shift = uncertaintyShift(opt, factorId, u === undefined ? st.uncertainty : u);
      return {
        suggested: s.value, suggestion: s, overridden: overridden, entered: chosen,
        shift: shift, value: clamp(chosen + shift, MIN, MAX)
      };
    }

    /* ---------- scoring ---------- */
    function score(st, opts) {
      opts = opts || {};
      var weights = opts.weights || st.weights;
      var u = opts.uncertainty === undefined ? st.uncertainty : opts.uncertainty;
      var g = opts.gates || gates(st);
      var wsum = st.factors.reduce(function (s, f) { return s + (weights[f.id] || 0); }, 0);
      var rows = st.options.map(function (o, idx) {
        var raw = 0;
        st.factors.forEach(function (f) { raw += (weights[f.id] || 0) * cell(st, o, f.id, u).value; });
        var pct = wsum > 0 ? (raw / (wsum * MAX)) * 100 : 0;
        return { id: o.id, name: o.name, short: o.short, index: idx, raw: round(raw, 6), score: round(pct, 6), blocked: !!g.blocked[o.id], blockedBy: g.blocked[o.id] || [] };
      });
      var ranked = rows.filter(function (r) { return !r.blocked; }).sort(function (a, b) { return (b.score - a.score) || (a.index - b.index); });
      ranked.forEach(function (r, i) { r.rank = i + 1; });
      var top = ranked[0] || null, second = ranked[1] || null;
      var margin = top && second ? round(top.score - second.score, 6) : null;
      return {
        rows: rows, ranked: ranked, top: top, runnerUp: second, margin: margin,
        closeCall: margin !== null && margin < cfg.closeCallPoints,
        weightSum: wsum, gates: g
      };
    }
    function leaderOf(st, opts) { var s = score(st, opts); return s.top ? s.top.id : null; }
    function rankOf(st, optId, opts) { var s = score(st, opts); for (var i = 0; i < s.ranked.length; i++) if (s.ranked[i].id === optId) return i + 1; return null; }
    function optName(st, id) { for (var i = 0; i < st.options.length; i++) if (st.options[i].id === id) return st.options[i].name; return id; }
    function optLabel(st, id) { var o = st.options.filter(function (x) { return x.id === id; })[0]; return o ? (o.custom ? "“" + o.name + "”" : "Option " + o.id) : id; }

    /* ---------- sensitivity: how far would one weight have to move? ---------- */
    function sensitivity(st) {
      var g = gates(st), cur = leaderOf(st, { gates: g });
      if (!cur) return [];
      var out = [];
      st.factors.forEach(function (f) {
        var w0 = st.weights[f.id] || 0, best = null;
        for (var w = cfg.weightScale.min; w <= cfg.weightScale.max; w++) {
          if (w === w0) continue;
          var ws = Object.assign({}, st.weights); ws[f.id] = w;
          var lead = leaderOf(st, { weights: ws, gates: g });
          if (lead !== cur) {
            var dist = Math.abs(w - w0);
            if (!best || dist < best.dist) best = { dist: dist, w: w, lead: lead };
          }
        }
        if (best) {
          var up = best.w > w0;
          // threshold phrasing: "above X" means any weight > X (up) / "below X" (down)
          out.push({
            factor: f.id, factorName: f.name, current: w0, at: best.w, direction: up ? "up" : "down",
            newLeader: best.lead, distance: best.dist,
            text: "If you " + (up ? "raised" : "lowered") + " the weight on " + f.name + " to " + best.w + (up ? (best.w < cfg.weightScale.max ? " or more" : "") : (best.w > cfg.weightScale.min ? " or less" : "")) + " (now " + w0 + "), " +
                  optLabel(st, best.lead) + " would overtake " + optLabel(st, cur) + "."
          });
        }
      });
      out.sort(function (a, b) { return a.distance - b.distance || a.factorName.localeCompare(b.factorName); });
      return out;
    }

    /* ---------- uncertainty ---------- */
    function defaultUncertainty(framing) {
      function pick(list) { for (var i = 0; i < list.length; i++) if (test(list[i].when, framing)) return list[i].value; return 0; }
      return { errorChance: pick(cfg.uncertainty.errorChance.defaults), disclosureChance: pick(cfg.uncertainty.disclosureChance.defaults) };
    }
    /* Scenario sweep: who ranks first across a grid of error and disclosure chances,
       and the error chance at which the current leader loses first place. */
    function uncertaintyRange(st) {
      var g = gates(st), U = cfg.uncertainty;
      var cur = leaderOf(st, { gates: g });
      if (!cur) return null;
      var wins = {}, total = 0;
      U.errorGrid.forEach(function (e) {
        U.disclosureGrid.forEach(function (d) {
          var l = leaderOf(st, { gates: g, uncertainty: { enabled: true, errorChance: e, disclosureChance: d } });
          wins[l] = (wins[l] || 0) + 1; total++;
        });
      });
      var d0 = st.uncertainty.disclosureChance == null ? 0 : st.uncertainty.disclosureChance;
      var e0 = st.uncertainty.errorChance == null ? 0 : st.uncertainty.errorChance;
      var drop = null;
      for (var e = 0; e <= U.errorChance.max; e++) {
        var u = { enabled: true, errorChance: e, disclosureChance: d0 };
        var r = rankOf(st, cur, { gates: g, uncertainty: u });
        if (r !== 1 && e > e0) { drop = { above: e - 1, rank: r, leader: leaderOf(st, { gates: g, uncertainty: u }) }; break; }
      }
      var mostId = Object.keys(wins).sort(function (a, b) { return wins[b] - wins[a]; })[0];
      var ord = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
      var text = optLabel(st, mostId) + " ranks first in " + (wins[mostId] === total ? "every" : wins[mostId] + " of " + total) + " scenarios tested";
      if (drop) {
        text += mostId === cur ? ", but" : ". " + optLabel(st, cur) + " (first at your current settings)";
        text += " drops to " + (ord[drop.rank] || drop.rank + "th") + " if error risk is above " + drop.above + "%.";
      } else {
        text += mostId === cur ? ", and stays first at every error chance up to " + U.errorChance.max + "%." : ". " + optLabel(st, cur) + " stays first at every higher error chance.";
      }
      return { wins: wins, total: total, leader: cur, mostFirst: mostId, drop: drop, text: text };
    }

    /* ---------- bias checks ---------- */
    function biasChecks(st) {
      var B = cfg.bias, out = [];
      if (B.deadline.deadlines.indexOf(st.framing.deadline) >= 0) out.push({ id: "deadline", text: B.deadline.text });
      var auto = st.options.some(function (o) {
        var b = baseOf(o); if (b.exposure < B.automation.minExposure) return false;
        var k = key(o.id, B.automation.factor);
        if (!(k in st.overrides)) return false;
        var sug = suggestedCell(st, o, B.automation.factor).value;
        return st.overrides[k] >= B.automation.minRating && (st.blind || st.overrides[k] > sug);
      });
      if (auto) out.push({ id: "automation", text: B.automation.text });
      var favor = 0, against = 0;
      Object.keys(st.overrides).forEach(function (k) {
        var p = k.split("|"), o = st.options.filter(function (x) { return x.id === p[0]; })[0];
        if (!o || st.factors.every(function (f) { return f.id !== p[1]; })) return;
        var diff = st.overrides[k] - suggestedCell(st, o, p[1]).value;
        if (!diff) return;
        var isAI = baseOf(o).exposure > 0;
        if ((isAI && diff > 0) || (!isAI && diff < 0)) favor++; else against++;
      });
      if (!st.blind && favor >= B.overconfidence.minOverrides && favor > against) out.push({ id: "overconfidence", text: B.overconfidence.text, count: favor });
      return out;
    }

    /* Anchoring mode: every unblocked cell needs a user rating. */
    function blindProgress(st) {
      var g = gates(st), need = 0, done = 0;
      st.options.forEach(function (o) {
        if (g.blocked[o.id]) return;
        st.factors.forEach(function (f) { need++; if (key(o.id, f.id) in st.overrides) done++; });
      });
      return { need: need, done: done, complete: done >= need };
    }

    /* ---------- editing helpers ---------- */
    function setOverride(st, optId, factorId, v) { st.overrides[key(optId, factorId)] = clamp(Math.round(v), MIN, MAX); return st; }
    function resetCell(st, optId, factorId) { delete st.overrides[key(optId, factorId)]; return st; }
    function setWeight(st, factorId, w) { st.weights[factorId] = clamp(Math.round(w), cfg.weightScale.min, cfg.weightScale.max); st.weightsTouched[factorId] = true; return st; }
    function resetWeights(st) { st.weightsTouched = {}; return refreshSuggested(st); }
    function addOption(st, name, basedOn) {
      var n = 1; while (st.options.some(function (o) { return o.id === "X" + n; })) n++;
      var base = cfgOption(basedOn) ? basedOn : "D";
      st.options.push({ id: "X" + n, name: name || "Custom option " + n, short: name || "Custom " + n, desc: "Your own option, rated starting from “" + cfgOption(base).name + "”.", basedOn: base, custom: true });
      return st;
    }
    function removeOption(st, id) {
      st.options = st.options.filter(function (o) { return o.id !== id; });
      Object.keys(st.overrides).forEach(function (k) { if (k.split("|")[0] === id) delete st.overrides[k]; });
      return st;
    }
    function addFactor(st, name, weight) {
      var n = 1; while (st.factors.some(function (f) { return f.id === "f" + n; })) n++;
      st.factors.push({ id: "f" + n, name: name || "Your factor " + n, why: "A factor you added.", custom: true });
      st.weights["f" + n] = weight == null ? 5 : weight; st.weightsTouched["f" + n] = true;
      return st;
    }
    function removeFactor(st, id) {
      st.factors = st.factors.filter(function (f) { return f.id !== id; });
      delete st.weights[id]; delete st.weightsTouched[id];
      Object.keys(st.overrides).forEach(function (k) { if (k.split("|")[1] === id) delete st.overrides[k]; });
      return st;
    }

    /* ---------- stage 4 ---------- */
    function checklist(st, optId) {
      var o = st.options.filter(function (x) { return x.id === optId; })[0];
      var b = o ? baseOf(o).id : optId;
      return cfg.checklist.filter(function (c) { return c.always || (c.options && c.options.indexOf(b) >= 0); });
    }
    function decisionRecord(st, chosenId, rationale, now) {
      var s = score(st), g = s.gates;
      if (!st.options.some(function (o) { return o.id === chosenId; })) throw new Error("Unknown option: " + chosenId);
      if (g.blocked[chosenId]) throw new Error("That option is blocked by a gate and can't be chosen.");
      var chosenRow = s.rows.filter(function (r) { return r.id === chosenId; })[0];
      var rat = {};
      st.options.forEach(function (o) {
        rat[o.id] = {};
        st.factors.forEach(function (f) { var c = cell(st, o, f.id); rat[o.id][f.id] = { value: round(c.value, 2), entered: c.entered, suggested: c.suggested, overridden: c.overridden }; });
      });
      var framing = Object.keys(cfg.framing.fields).map(function (k) {
        return { field: k, question: cfg.framing.fields[k].label, answer: framingLabel(k, st.framing[k]) };
      });
      return {
        createdAt: now || new Date().toISOString(),
        configVersion: cfg.version,
        framing: framing,
        gates: g.triggered.map(function (x) { return { id: x.id, title: x.title, why: x.why, clears: x.clears, authorities: x.authorities, blocks: x.blocks }; }),
        options: st.options.map(function (o) { return { id: o.id, name: o.name, custom: o.custom, basedOn: o.basedOn, blocked: !!g.blocked[o.id], blockedBy: g.blocked[o.id] || [] }; }),
        factors: st.factors.map(function (f) { return { id: f.id, name: f.name, weight: st.weights[f.id] || 0, custom: f.custom }; }),
        ratings: rat,
        uncertainty: st.uncertainty.enabled ? { errorChance: st.uncertainty.errorChance, disclosureChance: st.uncertainty.disclosureChance } : null,
        blind: !!st.blind,
        ranking: s.ranked.map(function (r) { return { rank: r.rank, id: r.id, name: r.name, score: round(r.score, 1) }; }),
        top: s.top ? { id: s.top.id, name: s.top.name, score: round(s.top.score, 1) } : null,
        runnerUp: s.runnerUp ? { id: s.runnerUp.id, name: s.runnerUp.name, score: round(s.runnerUp.score, 1) } : null,
        margin: s.margin == null ? null : round(s.margin, 1),
        closeCall: s.closeCall,
        chosen: { id: chosenId, name: optName(st, chosenId), score: round(chosenRow.score, 1), rank: chosenRow.rank },
        choseTop: !!(s.top && s.top.id === chosenId),
        rationale: String(rationale || "").trim(),
        biasPrompts: biasChecks(st).map(function (b) { return b.id; }),
        checklist: checklist(st, chosenId).map(function (c) { return c.text; })
      };
    }

    /* ======================================================================
       MAIN PATH: questionnaire + risk report (config.questionnaire, config.risk)
       ==================================================================== */
    var Q = cfg.questionnaire, RK = cfg.risk, LEVELS = ["Low", "Moderate", "High"];

    function qVisible(fieldId, ans) { var f = Q.fields[fieldId]; return !f.showIf || test(f.showIf, ans); }
    function qLabel(fieldId, v) {
      var f = Q.fields[fieldId]; if (!f) return String(v);
      var find = function (x) { for (var i = 0; i < f.choices.length; i++) if (f.choices[i].v === x) return f.choices[i].label; return x; };
      return Array.isArray(v) ? v.map(find).join("; ") : find(v);
    }
    function qAnswered(fieldId, ans) { var v = ans[fieldId]; return Array.isArray(v) ? v.length > 0 : v != null && v !== ""; }
    /* Fields still unanswered on a step (empty array = the step is complete). */
    function stepMissing(stepIndex, ans) {
      return Q.steps[stepIndex].fields.filter(function (f) { return qVisible(f, ans) && !qAnswered(f, ans); });
    }
    function complete(ans) { for (var i = 0; i < Q.steps.length; i++) if (stepMissing(i, ans).length) return false; return true; }
    function levelOf(points) { return points >= RK.partLevels.high ? "High" : points >= RK.partLevels.moderate ? "Moderate" : "Low"; }
    function partsOf(rule, sel) {
      var list = rule.parts === "clientData" ? Object.keys(RK.parts).filter(function (p) { return RK.parts[p].usesClientData; }) : rule.parts;
      return sel.filter(function (p) { return list.indexOf(p) >= 0; });
    }
    function trigger(rule, ans, affects) {
      return (rule.fields || []).filter(function (f) { return qVisible(f, ans); }).map(function (f) {
        var v = ans[f];
        if (f === "parts" && affects) v = affects;                       // only the parts this rule is about
        if (f === "info") v = asList(v).filter(function (x) { return RK.clientData.indexOf(x) >= 0; }).length ? asList(v).filter(function (x) { return RK.clientData.indexOf(x) >= 0; }) : v;
        return { field: f, question: Q.fields[f].ask || Q.fields[f].label, answer: qLabel(f, v) }; });
    }

    function assess(ans) {
      var sel = asList(ans.parts).filter(function (p) { return RK.parts[p]; });
      var hard = RK.hardStops.filter(function (h) { return test(h.when, ans); })
        .map(function (h) { return { rule: h, affects: partsOf(h, sel) }; }).filter(function (x) { return x.affects.length; });
      var factors = RK.factors.filter(function (f) { return test(f.when, ans); })
        .map(function (f) { return { rule: f, affects: partsOf(f, sel) }; }).filter(function (x) { return x.affects.length; });
      var guards = RK.safeguards.filter(function (s) { return test(s.when, ans); });
      var safeguardPoints = guards.reduce(function (s, g) { return s + g.points; }, 0);

      var parts = sel.map(function (p) {
        var def = RK.parts[p], blocked = hard.filter(function (h) { return h.affects.indexOf(p) >= 0; });
        var hits = factors.filter(function (f) { return f.affects.indexOf(p) >= 0; });
        var points = def.base + hits.reduce(function (s, f) { return s + f.rule.points; }, 0);
        var level = blocked.length ? "Not recommended" : levelOf(points);
        var reason = blocked.length ? blocked[0].rule.title + "." :
          hits.length ? hits.slice().sort(function (a, b) { return b.rule.points - a.rule.points; }).map(function (f) { return f.rule.title; }).slice(0, 2).join("; ") + "." : def.low;
        return { id: p, label: qLabel("parts", p), learn: def.learn, points: points, level: level, blockedBy: blocked.map(function (h) { return h.rule.id; }), reason: reason };
      });

      var maxIdx = parts.reduce(function (m, p) { return Math.max(m, LEVELS.indexOf(p.level)); }, 0);
      var bumped = !hard.length && safeguardPoints >= RK.safeguardBump && maxIdx < 2;
      var overall = hard.length ? "High" : LEVELS[Math.min(2, maxIdx + (bumped ? 1 : 0))];
      var summary = hard.length ? RK.summaries.hard : RK.summaries[overall];

      var risks = []
        .concat(hard.map(function (h) { return { kind: "hard", id: h.rule.id, title: h.rule.title, text: h.rule.text, authorities: h.rule.authorities, trigger: trigger(h.rule, ans, h.affects), affects: h.affects }; }))
        .concat(factors.slice().sort(function (a, b) { return b.rule.points - a.rule.points; }).map(function (f) { return { kind: "factor", id: f.rule.id, title: f.rule.title, text: f.rule.text, authorities: f.rule.authorities, trigger: trigger(f.rule, ans), affects: f.affects, points: f.rule.points }; }))
        .concat(parts.filter(function (p) { return !p.blockedBy.length && RK.parts[p.id].base >= RK.partLevels.moderate; }).map(function (p) {
          return { kind: "part", id: "part-" + p.id, title: "AI drafting " + RK.parts[p.id].phrase, text: RK.parts[p.id].low, authorities: RK.parts[p.id].authorities || [], trigger: [{ field: "parts", question: Q.fields.parts.ask, answer: p.label }] }; }))
        .concat(guards.map(function (g) { return { kind: "safeguard", id: g.id, title: g.title, text: g.text, authorities: g.authorities, trigger: trigger(g, ans), points: g.points }; }));

      var ids = { hard: hard.map(function (h) { return h.rule.id; }), factor: factors.map(function (f) { return f.rule.id; }), safeguard: guards.map(function (g) { return g.id; }) };
      var lowParts = parts.filter(function (p) { return p.level === "Low"; });
      function sTest(c) {
        if (c.any) return c.any.some(sTest);
        if (c.hard) return ids.hard.indexOf(c.hard) >= 0;
        if (c.factor) return ids.factor.indexOf(c.factor) >= 0;
        if (c.safeguard) return ids.safeguard.indexOf(c.safeguard) >= 0;
        if (c.lowParts) return lowParts.length > 0;
        return test(c, ans);
      }
      function joinParts(list) {
        var w = list.map(function (p) { return RK.parts[p.id].phrase; });
        return w.length < 2 ? w.join("") : w.slice(0, -1).join(", ") + " and " + w[w.length - 1];
      }
      var suggestions = RK.suggestions.filter(function (s) { return sTest(s.when); }).map(function (s) {
        if (s.when.lowParts) return (lowParts.length === parts.length ? RK.lowPartsText.all : RK.lowPartsText.some).replace("{parts}", joinParts(lowParts));
        return s.text;
      });

      var checklist = RK.checklist.slice();
      var note = RK.courtNotes[ans.court === "ma_state" ? ans.maDept : ans.court];
      if (note) checklist[0] = checklist[0] + " " + note;

      return {
        overall: overall, summary: summary, hardStop: hard.length > 0, bumped: bumped, safeguardPoints: safeguardPoints,
        parts: parts, risks: risks, suggestions: suggestions, checklist: checklist,
        score: LEVELS.indexOf(overall) * 1000 + hard.length * 100 + parts.reduce(function (s, p) { return s + p.points; }, 0) + safeguardPoints
      };
    }

    /* The one or two answer changes that would reduce risk the most. */
    function lowerRisk(ans, max) {
      var base = assess(ans), out = [];
      RK.fixes.forEach(function (fx, order) {
        if (fx.onlyIf && !test(fx.onlyIf, ans)) return;
        var next = clone(ans), changed = false;
        Object.keys(fx.set || {}).forEach(function (k) { if (JSON.stringify(next[k]) !== JSON.stringify(fx.set[k])) { next[k] = clone(fx.set[k]); changed = true; } });
        if (fx.removeParts) {
          var before = asList(next.parts).length;
          next.parts = asList(next.parts).filter(function (p) { return fx.removeParts.indexOf(p) < 0; });
          if (next.parts.length !== before && next.parts.length) changed = true; else if (!next.parts.length) changed = false;
        }
        if (!changed) return;
        var r = assess(next), drop = base.score - r.score;
        var hardBefore = base.risks.filter(function (x) { return x.kind === "hard"; }).length, hardAfter = r.risks.filter(function (x) { return x.kind === "hard"; }).length;
        if (drop > 0) out.push({ id: fx.id, label: fx.label, drop: drop, order: order, overall: r.overall, sameLevel: r.overall === base.overall, clearsHard: hardAfter < hardBefore });
      });
      out.sort(function (a, b) { return b.drop - a.drop || a.order - b.order; });
      return out.slice(0, max || 2);
    }

    /* Questionnaire answers -> the framing used by the Compare Your Options matrix. */
    function framingFromAnswers(ans) {
      var cd = RK.clientData, info = asList(ans.info);
      var fInfo = [];
      if (info.indexOf("confidential") >= 0 || info.indexOf("sealed") >= 0 || info.indexOf("thirdparty") >= 0) fInfo.push("confidential");
      if (info.indexOf("privileged") >= 0) fInfo.push("privileged");
      if (!fInfo.length) fInfo.push("public");
      var motion = { strike: "strike", dismiss: "dismiss", msj: "msj", mds: "mds", compel: "compel", jop: "jop" }[ans.motion] || "other";
      var tool = { legal_research: "legal", legal_drafting: "legal", enterprise: "enterprise", consumer: "consumer" }[ans.tool] || "undecided";
      return {
        court: ans.court === "ma_state" ? (ans.maDept === "superior" ? "ma_superior" : "ma_other") : ans.court === "dmass" ? "dmass" : ans.court === "fed_other" ? "fed_other" : "state_other",
        motion: motion, dispositive: ans.dispositive || "unsure",
        deadline: { lt48: "h24_48", d2_7: "d3_7", gt7: "gt7" }[ans.deadline] || "d3_7",
        tool: tool, trains: ans.trains || "notsure", retains: ans.retains || "notsure", grounded: ans.grounded || "notsure",
        info: fInfo,
        swornAI: asList(ans.parts).indexOf("affidavits") >= 0 ? "yes" : "no",
        citeCheck: { yes: "full", partial: "spot", no: "none" }[ans.citeCheck] || "spot",
        finalReview: "signer",          // not asked on the main path; assumed
        standingOrder: "unchecked",     // not asked on the main path
        clientConsent: { yes: "yes", no: "notyet", notsure: "notyet", na: "na" }[ans.consent] || "notyet"
      };
    }

    return {
      assess: assess, lowerRisk: lowerRisk, framingFromAnswers: framingFromAnswers, stepMissing: stepMissing,
      qComplete: complete, qVisible: qVisible, qLabel: qLabel,
      config: cfg, test: test, defaultFraming: defaultFraming, prefillFor: prefillFor, framingLabel: framingLabel,
      newState: newState, refreshSuggested: refreshSuggested, gates: gates, suggestedWeights: suggestedWeights,
      suggestedCell: suggestedCell, cell: cell, score: score, sensitivity: sensitivity,
      defaultUncertainty: defaultUncertainty, uncertaintyRange: uncertaintyRange, biasChecks: biasChecks,
      blindProgress: blindProgress, setOverride: setOverride, resetCell: resetCell, setWeight: setWeight,
      resetWeights: resetWeights, addOption: addOption, removeOption: removeOption, addFactor: addFactor,
      removeFactor: removeFactor, checklist: checklist, decisionRecord: decisionRecord, baseOf: baseOf,
      cfgOption: cfgOption, cfgFactor: cfgFactor, optLabel: optLabel, key: key, round: round, clone: clone
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = makeEngine;
  else root.MAEngine = makeEngine;
})(typeof window !== "undefined" ? window : this);
