# Motion Advisor

Motion Advisor helps you decide whether it's worth using AI to draft your motion. Complete a short assessment, and Motion Advisor will calculate the risks and give you a report with those risks and suggestions for using AI safely. It was built for Decision Making and Choice Management (Suffolk Law School, Fall 2026). It supports professional judgment. It does not decide for the user and it is not legal advice.

Live site: <https://motionadvisor.vercel.app>

## Features

- **AI Drafting Advisor**: 13 multiple-choice questions in six weighted sections, one section per screen, with a review screen. The result has four parts:
  - a risk index (0–100) and a verdict
  - automatic stop conditions
  - a Low/Moderate/High rating for each section
  - a workflow, a checklist and the rules to check

  The result can be downloaded as a PDF. The latest result is saved in this browser only.
- **Draft scanner** (question 4, when the answer is "Not sure"): checks a pasted or uploaded draft (.docx incl. headers and footers, .pdf, .txt) for personal identifiers, likely names, minors, privilege markers and sensitive categories. It runs entirely in the browser: the draft is never sent anywhere or saved, and the result never changes the score. Keyword lists live in `config.js`; name detection combines legal-document patterns with the [compromise](https://github.com/spencermountain/compromise) library (MIT), served from `vendor/`. Test drafts are in `tests/scanner-fixtures/`.
- **Options Report** (optional, from "Compare your options →" on the result): rates four ways of using AI on the same six sections from the same answers. It contains:
  - the safest useful option first
  - Low/Moderate/High risk chips, with a detail panel for each cell
  - options blocked by automatic stops, locked
  - optional weight sliders
  - a one-option-at-a-time card view on phones
  - a PDF download
- **How this works**: a plain-language explanation of the scoring; its tables are drawn straight from `config.js`.
- **Citation Toolkit**: finds citations in a pasted or uploaded draft, flags problems, and tracks verification.
- **Redaction Game**: practice removing identifying and confidential information.
- **Motions 101**: what a motion is, its parts, its life cycle, and a library of 20 motions. Each motion has a "Start an assessment" button that pre-fills Stage 1.
- **Rules & Sources**: every rule, opinion and case the site relies on.

## Project structure

```text
index.html             # The page: layout, styles and UI code
config.js              # ALL scoring content: questions, answer scores, weights, thresholds,
                       #   automatic stops, personas, Options Report rules
engine.js              # Pure, deterministic functions that apply config.js
tests/engine.test.js   # Automated tests (node:test), incl. parity with the original scoring
tests/original-compute.js # The original scoring code, kept for the parity test
tests/scanner-fixtures/   # Test drafts for the draft scanner (.txt, .docx, .pdf)
vendor/                # compromise 14.19.0 (name detection, MIT licence)
docs/DESIGN.md         # Design rationale, test results, values flagged for review
package.json           # `npm test`
```

## How to edit the decision logic

Edit `config.js`; nothing else needs to change. Each value carries a comment citing the authority or reasoning behind it, and values marked `REVIEW` are judgment calls awaiting expert review.

- **Ratings** use a 1–5 scale where 5 is always the most favourable value on that factor.
- **Conditions** (the `when` fields) are plain data, for example `{ field: "citeCheck", in: ["spot", "none"] }`.

After any edit, run the tests:

```bash
npm test     # or: node --test tests/*.test.js   (Node 18+)
```

No AI model runs at runtime. The same inputs always produce the same output.

## Run locally

Serve the folder with any static server, for example `python3 -m http.server 8000`, then open <http://localhost:8000/>. Vercel deploys automatically on every push to `main`.

## Important limitation

Motion Advisor is an educational decision-support tool. It is not a lawyer, a legal research service, or a substitute for professional judgment.

- Its suggested weights and ratings are the developer's judgments, not measured data.
- Verify every authority, deadline, citation and court-specific requirement against current primary sources before filing.
- Do not paste confidential or identifying client information into any external AI service.
