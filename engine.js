/* ============================================================================
   Motion Advisor: scoring engine
   ----------------------------------------------------------------------------
   Pure, deterministic functions that apply config.js. No AI model, no network,
   no randomness: the same answers always give the same result.
   Browser:  var E = MAEngine(MA_CONFIG);
   Node:     var E = require("./engine.js")(require("./config.js"));
   ========================================================================== */
(function (root) {
  "use strict";

  function makeEngine(cfg) {
    var AS = cfg.assessment, OR = cfg.optionsReport;
    var QUESTIONS = [], QBY = {};
    AS.sections.forEach(function (s) { s.qs.forEach(function (q) { var x = Object.assign({ sec: s.id }, q); QUESTIONS.push(x); QBY[q.id] = x; }); });

    function asList(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
    function test(c, a) {
      if (!c) return true;
      if (c.all) return c.all.every(function (x) { return test(x, a); });
      if (c.any) return c.any.some(function (x) { return test(x, a); });
      var v = a[c.field];
      if ("equals" in c) return v === c.equals;
      if ("in" in c) return c.in.indexOf(v) >= 0;
      if ("notEquals" in c) return v !== c.notEquals;
      return false;
    }
    function optOf(qid, v) { var q = QBY[qid]; if (!q) return null; for (var i = 0; i < q.options.length; i++) if (q.options[i].v === v) return q.options[i]; return null; }
    /* "Select all that apply" questions: the riskiest selected answer sets the score
       (config: multi: "max"). A single value saved by an older version counts as a one-item list. */
    function pickMulti(q, v) {
      var list = q.options.filter(function (o) { return asList(v).indexOf(o.v) >= 0; });
      var top = list.reduce(function (t, o) { return !t || o.score > t.score ? o : t; }, null);
      return { list: list, top: top };
    }
    function multiNote(q, pick) {
      if (!pick.top) return "";
      if (pick.list.length === 1) return pick.top.note;
      var lvl = function (o) { return levelOf(o.score / maxScore(q)).toLowerCase() + " risk"; };
      return pick.top.note + " Tasks selected: " + pick.list.map(function (o) { return o.label + " (" + lvl(o) + (o === pick.top ? ", sets the score" : "") + ")"; }).join("; ") + ".";
    }
    function maxScore(q) { return Math.max.apply(null, q.options.map(function (o) { return o.score; })); }
    function levelOf(ratio) { return ratio < AS.levelCuts.moderate ? "Low" : ratio < AS.levelCuts.high ? "Moderate" : "High"; }
    function answered(q, a) { return q.multi ? asList(a[q.id]).length > 0 : a[q.id] != null; }
    function complete(a) { return QUESTIONS.every(function (q) { return answered(q, a); }); }
    /* Older saved results stored one task as a string; turn it into a one-item list. */
    function normalize(a) { var b = Object.assign({}, a); QUESTIONS.forEach(function (q) { if (q.multi && b[q.id] != null && !Array.isArray(b[q.id])) b[q.id] = [b[q.id]]; }); return b; }
    function defaultWeights() { var w = {}; AS.sections.forEach(function (s) { w[s.id] = s.weight; }); return w; }

    /* Section points for a set of answers; mod lets the Options Report re-score. */
    function sectionScores(a, mod) {
      mod = mod || {};
      return AS.sections.map(function (s) {
        var sp = 0, sm = 0, lines = [];
        s.qs.forEach(function (q) {
          var v = mod.answers && q.id in mod.answers ? mod.answers[q.id] : a[q.id];
          var mult = (mod.mult && q.id in mod.mult) ? mod.mult[q.id] : 1;
          if (q.multi) {
            var pick = pickMulti(q, v), sc = (pick.top ? pick.top.score : 0) * mult;
            sp += sc; sm += maxScore(q);
            lines.push({ q: q.id, question: q.text, multi: true, answer: pick.list.map(function (o) { return o.label; }).join("; "),
              note: multiNote(q, pick), tasks: pick.list.map(function (o) { return { v: o.v, label: o.label, level: levelOf(o.score / maxScore(q)), sets: o === pick.top }; }),
              score: sc, mult: mult, replaced: !!(mod.answers && q.id in mod.answers), asAnswer: v });
            return;
          }
          var o = optOf(q.id, v);
          var sc1 = (o ? o.score : 0) * mult;
          sp += sc1; sm += maxScore(q);
          lines.push({ q: q.id, question: q.text, answer: o ? o.label : "", note: o ? o.note : "", score: sc1, mult: mult, replaced: !!(mod.answers && q.id in mod.answers && mod.answers[q.id] !== a[q.id]), asAnswer: v });
        });
        var r = sm ? sp / sm : 0;
        return { id: s.id, title: s.title, weight: s.weight, points: sp, max: sm, ratio: r, level: levelOf(r), lines: lines };
      });
    }
    function indexOf(secs, weights) {
      var tot = 0, max = 0;
      secs.forEach(function (s) { var w = weights && s.id in weights ? weights[s.id] : s.weight; tot += s.points * w; max += s.max * w; });
      return max ? Math.round(tot / max * 100) : 0;
    }
    function stops(a) { return AS.stops.filter(function (s) { return test(s.when, a); }); }

    /* The main result, identical to the original assessment's compute(). */
    function assess(a) {
      var secs = sectionScores(a), index = indexOf(secs), st = stops(a), v;
      if (st.length) v = AS.stopVerdict;
      else for (var i = 0; i < AS.verdicts.length; i++) if (index <= AS.verdicts[i].max) { v = AS.verdicts[i]; break; }
      return {
        index: index, verdict: v.verdict, cls: v.cls, summary: v.summary,
        overrides: st.map(function (s) { return s.text; }), stopIds: st.map(function (s) { return s.id; }),
        factors: secs.map(function (s) {
          return { id: s.id, title: s.title, ratio: s.ratio, level: s.level,
            notes: s.lines.filter(function (l, i) { return !(s.id === "juris" && i === 0); }).map(function (l) { return l.note; }) };
        })
      };
    }

    /* ---------------- Options Report ---------------- */
    function bandOf(index) { for (var i = 0; i < OR.bands.length; i++) if (index <= OR.bands[i].max) return OR.bands[i].label; return "High"; }

    function optionsReport(a, weights) {
      weights = weights || defaultWeights();
      var st = stops(a), stopIds = st.map(function (s) { return s.id; });
      var options = OR.options.map(function (o) {
        var blockedBy = st.filter(function (s) { return (OR.blocks[s.id] || []).indexOf(o.id) >= 0; });
        var secs;
        if (o.noAI) {
          secs = AS.sections.map(function (s) { return { id: s.id, title: s.title, points: 0, max: s.qs.reduce(function (m, q) { return m + maxScore(q); }, 0), ratio: 0, level: "Low", lines: [], noAI: true }; });
        } else {
          var mult = {};
          (o.notCounted || []).forEach(function (q) { mult[q] = 0; });
          (o.halfCounted || []).forEach(function (q) { mult[q] = 0.5; });
          /* the option's own task plus every selected task the option still allows */
          var tasks = [o.taskAs].concat(asList(a.aiTask).filter(function (t) { return (o.allows || []).indexOf(t) >= 0 && t !== o.taskAs; }));
          secs = sectionScores(a, { answers: { aiTask: tasks }, mult: mult });
        }
        var idx = indexOf(secs, weights);
        return { id: o.id, name: o.name, desc: o.desc, usefulness: o.usefulness, noAI: !!o.noAI,
          blocked: blockedBy.length > 0, blockedBy: blockedBy.map(function (s) { return s.text; }), blockedIds: blockedBy.map(function (s) { return s.id; }),
          cells: secs, index: idx, band: bandOf(idx) };
      });
      /* Bottom line: the open AI option with the lowest overall risk (ties go to
         the more helpful option), unless even that one is High; then Draft without AI.
         Runner-up: the next-lowest-risk open option. */
      var open = options.filter(function (o) { return !o.blocked; });
      var ranked = open.slice().sort(function (x, y) { return (x.noAI - y.noAI) || (x.index - y.index) || (y.usefulness - x.usefulness); });
      var bestAI = ranked.filter(function (o) { return !o.noAI; })[0];
      var none = options.filter(function (o) { return o.noAI; })[0];
      var bottom = bestAI && bestAI.band !== "High" ? bestAI : none;
      var runnerUp = ranked.filter(function (o) { return o !== bottom; })[0] || null;
      return { options: options, bottom: bottom, runnerUp: runnerUp, ranked: ranked, blocked: options.filter(function (o) { return o.blocked; }), weights: weights, stopIds: stopIds };
    }

    /* ---------------- Draft scanner (local, deterministic) ---------------- */
    var SC = cfg.scanner;
    function luhn(d) { var sum = 0, alt = false; for (var i = d.length - 1; i >= 0; i--) { var n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return sum % 10 === 0; }
    function passes(rule, m) {
      if (rule.check === "luhn") { var d = m[0].replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d); }
      if (rule.check === "under18") { var age = +(m[1] || m[2]); return age < 18; }
      return true;
    }
    function scanDraft(text) {
      text = String(text || "");
      var found = [];
      SC.rules.forEach(function (r, order) {
        var re = new RegExp(r.re, r.flags.indexOf("g") >= 0 ? r.flags : r.flags + "g"), m;
        while ((m = re.exec(text))) {
          if (!m[0]) { re.lastIndex++; continue; }
          if (passes(r, m)) found.push({ rule: r.id, cat: r.cat, name: r.name, start: m.index, end: m.index + m[0].length, text: m[0], explain: r.explain, authorities: r.authorities, order: order });
        }
      });
      /* keep the earliest, then longest, match where two overlap */
      found.sort(function (a, b) { return a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order; });
      var flags = [], lastEnd = -1;
      found.forEach(function (f) { if (f.start >= lastEnd) { flags.push(f); lastEnd = f.end; } });
      var counts = {}; Object.keys(SC.categories).forEach(function (c) { counts[c] = 0; });
      flags.forEach(function (f) { counts[f.cat]++; });
      var parts = Object.keys(SC.categories).filter(function (c) { return counts[c]; }).map(function (c) {
        var cc = SC.categories[c]; return counts[c] + " " + (counts[c] === 1 ? (cc.singular || cc.label.toLowerCase()) : cc.plural); });
      var summary = parts.length ? "Found " + (parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]) + "." : "Found no common identifiers or markers.";
      var lab = function (v) { var o = optOf(SC.question, v); return o ? o.label : v; };
      var fill = function (t) { return t.replace("{limited}", lab("limited")).replace("{substantial}", lab("substantial")); };
      var suggestions = [];
      if (counts.privilege) suggestions.push({ kind: "privilege", suggests: "substantial", text: fill(SC.suggestions.privilege) });
      if (counts.identifier || counts.minor || counts.sensitive) suggestions.push({ kind: "identifying", suggests: ["limited", "substantial"], text: fill(SC.suggestions.identifying) });
      if (!suggestions.length) suggestions.push({ kind: "none", suggests: null, text: SC.suggestions.none });
      return { flags: flags, counts: counts, summary: summary, suggestions: suggestions, limits: SC.limits };
    }

    return {
      scanDraft: scanDraft,
      config: cfg, questions: QUESTIONS, optOf: optOf, complete: complete, answered: answered, normalize: normalize, assess: assess,
      stops: stops, optionsReport: optionsReport, defaultWeights: defaultWeights, levelOf: levelOf, bandOf: bandOf
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = makeEngine;
  else root.MAEngine = makeEngine;
})(typeof window !== "undefined" ? window : this);
