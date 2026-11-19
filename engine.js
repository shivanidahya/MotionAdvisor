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
    function escRe(x) { return x.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"); }
    /* One-for-one character clean-up, so positions still match the original text:
       curly quotes -> straight, every hyphen/dash -> "-", unusual spaces -> " ". */
    function normalizeText(t) {
      return String(t || "")
        .replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"')
        .replace(/[‐-―−﹘﹣－­]/g, "-")
        .replace(/[   -​  　﻿]/g, " ");
    }
    /* A keyword list -> one case-insensitive, whole-word regular expression.
       Spaces/hyphens inside a phrase match any run of spaces, line breaks or hyphens;
       "*" matches any ending; plurals are added automatically. */
    function termSource(term) {
      var star = /\*$/.test(term), words = term.replace(/\*$/, "").split(/[\s-]+/).filter(Boolean);
      var src = words.map(escRe).join("[\\s-]+");
      return src + (star ? "[A-Za-z]*" : "(?:s|es)?");
    }
    var KW = {};
    Object.keys(SC.keywords).forEach(function (cat) {
      var terms = SC.keywords[cat].slice().sort(function (x, y) { return y.length - x.length; });
      KW[cat] = new RegExp("(?<![A-Za-z0-9])(?:" + terms.map(termSource).join("|") + ")(?![A-Za-z0-9])", "gi");
    });
    var NOT = {}; SC.names.notNames.forEach(function (w) { NOT[w.toLowerCase()] = 1; });
    function allNotNames(str) { return str.split(/[\s.,]+/).filter(Boolean).every(function (w) { return NOT[w.toLowerCase().replace(/[.'’]+$/, "")]; }); }
    function anyNotName(str) { return str.split(/[\s.,]+/).filter(Boolean).some(function (w) { return NOT[w.toLowerCase().replace(/[.'’]+$/, "")]; }); }
    var CAP = "[A-Z][A-Za-z'’-]+\\.?";
    var CAPSEQ = CAP + "(?:[ \\t]+(?:[A-Z]\\.[ \\t]+)?" + CAP + "){0,3}";      // a name stays on one line
    /* drop leading words like "See" or "Plaintiff" from a captured name */
    function trimLead(str) { var w = str.split(/([ \t]+)/), i = 0; while (i < w.length && (/^[ \t]*$/.test(w[i]) || NOT[w[i].toLowerCase().replace(/[.'’]+$/, "")])) i++; return { cut: w.slice(0, i).join("").length, rest: w.slice(i).join("") }; }

    function scanDraft(text, opts) {
      opts = opts || {};
      var src = String(text || ""), t = normalizeText(src), found = [];
      function add(cat, rule, name, start, end, explain, authorities, order) {
        if (end > start) found.push({ rule: rule, cat: cat, name: name, start: start, end: end, text: src.slice(start, end), explain: explain, authorities: authorities, order: order });
      }
      var m;
      /* 1. identifier patterns */
      SC.rules.forEach(function (r, order) {
        var re = new RegExp(r.re, r.flags.indexOf("g") >= 0 ? r.flags : r.flags + "g");
        while ((m = re.exec(t))) { if (!m[0]) { re.lastIndex++; continue; } if (passes(r, m)) add(r.cat, r.id, r.name, m.index, m.index + m[0].length, r.explain, r.authorities, order); }
      });
      /* 2. keyword lists */
      Object.keys(KW).forEach(function (cat) {
        var re = new RegExp(KW[cat].source, "gi"), c = SC.categories[cat], ex = SC.keywordExplain && SC.keywordExplain[cat];
        while ((m = re.exec(t))) add(cat, "kw-" + cat, ex ? ex.name : c.one.charAt(0).toUpperCase() + c.one.slice(1), m.index, m.index + m[0].length, ex ? ex.explain : c.explain, ex ? ex.authorities : c.authorities, 50);
      });
      /* 3. possible names */
      var N = SC.names, nc = SC.categories.name;
      /* case citations ("Bell Atlantic Corp. v. Twombly, 550 U.S. 544") name public parties, not your client: skip them */
      var cites = [], cre = new RegExp(CAPSEQ + "[ \\t]+v(?:s)?\\.?[ \\t]+" + CAPSEQ + ",?\\s+\\d+\\s+[A-Z][A-Za-z.\\s]{0,25}?\\d+", "g");
      while ((m = cre.exec(t))) cites.push([m.index, m.index + m[0].length]);
      var inCite = function (a1, b1) { return cites.some(function (c) { return a1 < c[1] && b1 > c[0]; }); };
      function addName(start, end, how) {
        var tr = trimLead(t.slice(start, end)); start += tr.cut; var s2 = tr.rest.replace(/[ \t]+$/, "");
        if (!s2 || allNotNames(s2) || inCite(start, start + s2.length)) return;
        add("name", "name-" + how, "Possible name", start, start + s2.length, N.explain, nc.authorities, 40); }
      // names the user typed in (exact matches, any case)
      (opts.names || []).map(function (n) { return String(n).trim(); }).filter(function (n) { return n.length > 1; }).forEach(function (n) {
        var re = new RegExp("(?<![A-Za-z0-9])" + n.split(/\s+/).map(escRe).join("\\s+") + "(?![A-Za-z0-9])", "gi");
        while ((m = re.exec(t))) add("name", "name-listed", "Name you listed", m.index, m.index + m[0].length, "A name you asked the scanner to look for.", nc.authorities, 30);
      });
      // honorifics: Mr. Robert Jones, Judge Smith
      var hon = new RegExp("\\b(?:" + N.honorifics.map(escRe).join("|") + ")\\.?\\s+" + CAPSEQ, "g");
      while ((m = hon.exec(t))) { var hs = m[0].replace(/^\S+\s+/, ""); if (!allNotNames(hs) && !inCite(m.index, m.index + m[0].length)) add("name", "name-honorific", "Possible name", m.index, m.index + m[0].length, N.explain, nc.authorities, 40); }
      // captions: Jane Smith v. Acme Corp.
      var cap = new RegExp("(" + CAPSEQ + ")[ \\t]+v(?:s)?\\.?[ \\t]+(" + CAPSEQ + ")", "g");
      while ((m = cap.exec(t))) { var p1 = m.index, p2 = m.index + m[0].lastIndexOf(m[2]); addName(p1, p1 + m[1].length, "caption"); addName(p2, p2 + m[2].length, "caption"); }
      // party labels: Plaintiff Jane Smith, Defendant Acme Corp.
      var party = new RegExp("\\b(?:" + N.partyLabels.map(escRe).join("|") + "),?\\s+(" + CAPSEQ + ")", "g");
      while ((m = party.exec(t))) { var ps = m.index + m[0].length - m[1].length; addName(ps, ps + m[1].length, "party"); }
      // signature blocks: /s/ Jane Smith, By: Jane Smith
      var sig = new RegExp("(?:/s/|\\bBy:)\\s*(" + CAPSEQ + ")", "g");
      while ((m = sig.exec(t))) { var ss = m.index + m[0].length - m[1].length; addName(ss, ss + m[1].length, "signature"); }
      // people recognized by the compromise library (runs in the browser)
      if (opts.nlp) {
        try {
          /* line by line, so a name never runs across a line break */
          var off = 0;
          t.split("\n").forEach(function (line) {
            if (/[A-Za-z]/.test(line)) {
              var seen = {};
              opts.nlp(line).people().out("array").forEach(function (pp) {
                pp = String(pp).replace(/[.,;:]+$/, "").trim(); if (!pp || seen[pp] || allNotNames(pp) || !/[a-z]/.test(pp)) return; seen[pp] = 1;
                var re = new RegExp("(?<![A-Za-z0-9])" + pp.split(/\s+/).map(escRe).join("[ \\t]+") + "(?![A-Za-z0-9])", "g"), mm;
                while ((mm = re.exec(line))) addName(off + mm.index, off + mm.index + mm[0].length, "nlp");
              });
            }
            off += line.length + 1;
          });
        } catch (e) { /* the library is optional: the patterns still run */ }
      }
      // two or three capitalized words in a row, not at the start of a sentence, none of them a legal term
      var seq = /\b[A-Z][a-z'’]+(?:[ \t]+(?:[A-Z]\.[ \t]+)?[A-Z][a-z'’]+){1,2}\b/g;
      while ((m = seq.exec(t))) {
        var before = t.slice(Math.max(0, m.index - 3), m.index);
        if (m.index === 0 || /(?:[.!?:]\s+|\n\s*|^\s*)$/.test(before) || /^\s*$/.test(t.slice(0, m.index))) continue;
        if (anyNotName(m[0]) || inCite(m.index, m.index + m[0].length)) continue;
        add("name", "name-caps", "Possible name", m.index, m.index + m[0].length, N.explain, nc.authorities, 45);
      }
      // a name found once is flagged everywhere it appears (e.g. at the start of a line, where the patterns above skip it)
      var known = {};
      found.forEach(function (f) { if (f.cat === "name" && f.rule !== "name-listed") { var nm = f.text.replace(/^(?:\S+\.?\s+)?/, function (h) { return N.honorifics.some(function (x) { return h.replace(/[.\s]+$/, "").toLowerCase() === x.toLowerCase(); }) ? "" : h; }).trim(); if (/\s/.test(nm)) known[nm] = 1; } });
      Object.keys(known).forEach(function (nm) {
        var re = new RegExp("(?<![A-Za-z0-9])" + nm.split(/\s+/).map(escRe).join("[ \\t]+") + "(?![A-Za-z0-9])", "g");
        while ((m = re.exec(t))) add("name", "name-repeat", "Possible name", m.index, m.index + m[0].length, N.explain, nc.authorities, 60);
      });
      /* keep the earliest, then longest, match where two overlap */
      found.sort(function (a, b) { return a.start - b.start || (b.end - b.start) - (a.end - a.start) || a.order - b.order; });
      var flags = [], lastEnd = -1;
      found.forEach(function (f) { if (f.start >= lastEnd) { flags.push(f); lastEnd = f.end; } });
      var cats = Object.keys(SC.categories), counts = {};
      cats.forEach(function (c) { counts[c] = 0; });
      flags.forEach(function (f) { counts[f.cat]++; });
      var total = flags.length;
      var summary = cats.map(function (c) { return SC.categories[c].label + ": " + counts[c]; }).join(" · ");
      var lab = function (v) { var o = optOf(SC.question, v); return o ? o.label : v; };
      var fill = function (x) { return x.replace("{limited}", lab("limited")).replace("{substantial}", lab("substantial")); };
      var sensitive = cats.filter(function (c) { return ["person", "minor", "sensitive"].indexOf(SC.categories[c].group) >= 0 && c !== "name"; });
      var suggestions = [];
      if (counts.privilege) suggestions.push({ kind: "privilege", text: fill(SC.suggestions.privilege) });
      if (sensitive.some(function (c) { return counts[c]; })) suggestions.push({ kind: "identifying", text: fill(SC.suggestions.identifying) });
      if (counts.name) suggestions.push({ kind: "names", text: fill(SC.suggestions.names) });
      if (!total) suggestions.push({ kind: "none", text: SC.suggestions.none });
      return { flags: flags, counts: counts, total: total, summary: summary, suggestions: suggestions, limits: SC.limits, nameNotice: SC.names.notice, length: src.length };
    }

    return {
      scanDraft: scanDraft, normalizeText: normalizeText,
      config: cfg, questions: QUESTIONS, optOf: optOf, complete: complete, answered: answered, normalize: normalize, assess: assess,
      stops: stops, optionsReport: optionsReport, defaultWeights: defaultWeights, levelOf: levelOf, bandOf: bandOf
    };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = makeEngine;
  else root.MAEngine = makeEngine;
})(typeof window !== "undefined" ? window : this);
