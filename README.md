# Motion Advisor

Motion Advisor helps you decide whether it's worth using AI to draft your motion. Complete a short assessment, and Motion Advisor will calculate the risks and give you a report with those risks and suggestions for using AI safely. It was built for Decision Making and Choice Management (Suffolk Law School, Fall 2026). It supports professional judgment. It does not decide for the user and it is not legal advice.

Live site: <https://motionadvisor.vercel.app>

## Features

- **AI Drafting Advisor** (main path): seven multiple-choice questions, one per screen, with a progress bar, Back/Next and a "Why we ask this" note on each. Motion Advisor then calculates the risks and shows **Your Report**:
  - an overall risk level (Low, Moderate or High)
  - the risks identified, each with the answer that triggered it and the rule behind it
  - a part-by-part table
  - suggestions for using AI
  - what would lower your risk
  - a "Before you file" checklist

  The report can be downloaded as a PDF or printed. Answers are kept only for the browser session.
- **Compare Your Options** (optional, advanced): a choice matrix of five ways of using AI against eight factors, with weights you set, sensitivity, an uncertainty panel and bias checks. It is filled in from your answers, and options ruled out by a hard stop are locked.
- **How this works**: a plain-language explanation of the questionnaire and risk calculation; its tables are drawn straight from `config.js`.
- **Citation Toolkit**: finds citations in a pasted or uploaded draft, flags problems, and tracks verification.
- **Redaction Game**: practice removing identifying and confidential information.
- **Motions 101**: what a motion is, its parts, its life cycle, and a library of 20 motions. Each motion has a "Start an assessment" button that pre-fills Stage 1.
- **Rules & Sources**: every rule, opinion and case the site relies on.

## Project structure

```text
index.html             # The page: layout, styles and UI code
config.js              # ALL decision content: questions, risk rules, points, thresholds,
                       #   suggestions, checklist; plus the Compare Your Options matrix
engine.js              # Pure, deterministic functions that apply config.js
tests/engine.test.js   # Automated scenarios (node:test)
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
