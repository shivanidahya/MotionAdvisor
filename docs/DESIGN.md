# Motion Advisor: design rationale, tests and review flags

## 1. Design rationale

**Why a choice matrix fits this decision.** "Should AI help draft this motion?" is not a yes-or-no question. The real choice is among several ways of using AI, ranging from none to substantial drafting. Each one trades accuracy, confidentiality and compliance against time, cost and quality, and different lawyers reasonably weigh those tradeoffs differently.

The earlier questionnaire hid the weighing inside a single risk score. A choice matrix (options × factors × weights) puts the tradeoff in view, so the user can see it, adjust it and own it. That is the choiceboxing method from the course applied to a professional-conduct decision.

**How gates and weighing interact.** Some risks are not tradeoffs: no amount of time saved offsets an unverified citation or a confidentiality breach. These are modeled as gates, a translation of the memo's "off-boarding screens." They run first, are lexically prior to the weighing, and block only the options that depend on the risky condition. For example, an unverified citation blocks the options that put AI-sourced authority into the filing, but it leaves "low-risk parts" open.

No weight or rating can reopen a blocked option. The only way to clear a gate is to change the answer that triggered it. This keeps the tool honest: weights express priorities, and they cannot express permission to breach a duty.

**How uncertainty and bias checks work.** The uncertainty panel is off by default. It is deliberately linear so a law student can follow it by hand: each percentage point of estimated error chance lowers accuracy in proportion to how much AI content the option puts into the filing. The tool then reruns the ranking across 27 scenarios and states where the leader loses first place (Aaron, Risk & Rigor ch. 11: make probability estimates explicit and test their effect).

Bias checks follow Munger's misjudgment list:

- **Automation bias:** triggered when the user rates an AI option's accuracy at least 4 and above its suggested rating.
- **Deadline pressure:** triggered when the deadline is under 48 hours.
- **Overconfidence:** triggered when three or more of the user's edits favor AI.
- **Anchoring:** handled by a "rate without suggestions" mode that hides defaults and the ranking until every cell is rated.

The prompts are short, neutral, dismissible and never blocking.

**What the tool deliberately does not automate:**

- **The choice itself.** The user can pick a non-top option, and the rationale is recorded beside the ranking.
- **Reading the client's facts, the draft or the tool's terms.** It relies on multiple-choice self-report.
- **Checking whether a court has an AI order.** It asks the user whether they checked.
- **Verifying citations.** The Citation Toolkit and a citator do that.

No AI model runs at runtime. The same inputs always produce the same output, so a result can be explained and audited.

**Known limitations:**

- **The numbers are judgment calls.** Ratings, weights and multipliers are the developer's judgments, not empirical rates.
- **Self-reported inputs.** A user can misreport the tool's data settings.
- **Default tilt.** The defaults weight duties (accuracy, confidentiality, compliance) above convenience. As a result, Options A and B usually lead, and Option D wins only when the user values time or cost highly. This is intentional and visible, but it is a tilt.
- **Fixed preset options.** The five presets are fixed reference points. A custom option inherits the ratings and gates of the preset it is closest to.
- **Coverage.** Massachusetts and federal civil practice only. Standing orders change faster than the config.
- **Additive weighting.** Additive scoring assumes the factors are independent. Interactions, such as deadline × verification, are handled only through explicit adjustments.

## 2. Where things live

- `config.js`: every option, factor, default weight, base rating with its reason, rating and weight adjustment, gate, uncertainty setting, bias trigger and checklist item. Each value is commented with its authority or reasoning.
- `engine.js`: the pure functions that apply the config.
- `tests/engine.test.js`: the automated scenarios.
- `index.html`: the user interface only.

## 3. Test scenarios and results (`npm test`: 13 of 13 pass)

| # | Scenario | Expected / observed |
|---|---|---|
| 1 | Confidential info + consumer chatbot | Confidential-data gate triggers; C, D, E blocked; ranking holds A then B only |
| 2 | Weights and ratings can't override a gate (no citation check, E rated 5 everywhere, time and cost weights 10) | E stays blocked; choosing E throws an error |
| 3 | Weights change the top choice | Favourable framing: B leads. Time 10, cost 10, development 0: D leads. Default framing with development 10: A leads |
| 4 | Close call | Defaults: B 83.8 vs A 83.0, margin 0.8 < 5 → flagged. Gated scenario: margin ≥ 5 → not flagged |
| 5 | Uncertainty flips the ranking | D leads at 0% error chance; at 15%, D is no longer first; the range message reports the drop point |
| 6 | User picks a non-top option (C, ranked #3) | Allowed; the record shows the top option, the choice, the rank, the rationale and a C-specific checklist (no fact-check item) |
| 7 | Sensitivity | The first statement names the smallest single-weight change; applying it really changes the leader |
| 8 | Bias checks | Deadline under 24 hours → deadline prompt; D accuracy raised to 5 → automation prompt; three AI-favourable edits → overconfidence prompt |
| 9 | Anchoring mode | Ranking waits until all 16 open cells are rated |
| 10 | Override marking and reset | An edited cell is marked; reset restores the suggestion exactly |
| 11 | Custom option inherits gates from its preset | Based-on-D option blocked by the sworn-facts gate; based-on-B option open; added factor starts at 3 |
| 12 | Determinism | Identical inputs give identical records |
| 13 | Config integrity | Every gate targets a real option; every cell has a rating of 1–5 and a reason; every weight is 0–10 |

Browser checks (Playwright, desktop at 1360 px and iPhone 13) covered:

- every stage, the cell panel, keyboard rating (keys 1–5), the bias prompts, the uncertainty message, custom options, anchoring mode, the decision record and the PDF download
- "Start an assessment" pre-fill from Motions 101 and the How this works page
- no horizontal page overflow on mobile

## 4. Values flagged for review by a qualified person

**Gates**

1. *Confidential-data*: triggers on "not sure" about training or retention, not only on "yes." This is strict by design; confirm it. It leaves B (research) open on the assumption that research prompts can be written without client facts.
2. *Citation-verification*: treats spot-checking as equal to no check, and leaves C open. Confirm that formatting and proofreading carry no citation risk.
3. *Sworn-facts*: "not sure" triggers the gate. B is left open.
4. *No-final-review*: blocks every AI option. A review by someone other than the signer is only penalized (accuracy −1), not gated. Is that enough?
5. *Court-prohibits*: assumes a restricting order reaches drafting help but not private research (B open). Orders vary, so this needs review.
6. *Not modeled as gates:* the memo's "court requires disclosure and the user won't disclose" and "billing not transparent." These are handled through the Compliance and Client ratings and the checklist instead. Should either be a gate?

**Default weights.** Accuracy 9, Confidentiality 9, Compliance 8, Quality 7, Client 6, Time 5, Cost 4, Development 4. There are also automatic adjustments:

- +2 to Time when the deadline is under 48 hours
- +1 to Accuracy for dispositive motions
- +1 to Confidentiality when client information is involved

**Base ratings most open to dispute**

- Option A rated 5 on accuracy. Human research errs too, but the factor is framed as AI-specific risk.
- Option C rated 5 on accuracy and 4 on confidentiality. Proofreading exposes the full text.
- Option B rated 4 on compliance. Some orders may cover AI-assisted research.
- Option E rated 2 on quality. This is the quality of a generic draft; it should perhaps be lower for dispositive motions, where the adjustment already applies −1.
- The Cost ratings (A=2 through E=4). Verification time is billed too, so the savings may be overstated.
- The Development ratings. Is supervising AI a competence in its own right?

**Rating adjustments**

- Grounded tool: ±1 on accuracy.
- Dispositive motion: −1 on accuracy for D and E.
- Under 48 hours: −1 on accuracy for D and E, and −1 on quality for A.
- Anonymized facts: +1 on confidentiality for D and E.
- Unchecked standing orders: −1 on compliance for B through E.

**Uncertainty settings.** The exposure multipliers (A 0, B 0.5, C 0.1, D 1, E 1.5) and disclosure burdens (B 0.25, C 0.5, D and E 1) are illustrative. The starting error chances (3%, 8% or 20%) and disclosure chances (10%, 40% or 100%) are not measured rates.

**Thresholds**

- Close call when the top two are under 5 points apart.
- Automation prompt at an accuracy rating of 4 or higher.
- Overconfidence prompt after 3 edits that favour AI.

**Tool-type presets.** The suggested data settings, such as "enterprise plan: retention not sure," must be confirmed against each vendor's actual terms.

**Legal content.** Check the current text of the amended Mass. R. Civ. P. 11 (effective January 1, 2027) and the AI standing orders of individual D. Mass. and Superior Court judges.
