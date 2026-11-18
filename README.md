# Motion Advisor

Motion Advisor helps you decide whether it's worth using AI to draft your motion. Complete a short assessment, and Motion Advisor will calculate the risks and give you a report with those risks and suggestions for using AI safely. It was built for Decision Making and Choice Management (Suffolk Law School, Fall 2026). It supports professional judgment. It does not decide for the user and it is not legal advice.

Live site: <https://motionadvisor.vercel.app>

## Features

- **AI Drafting Advisor**, a four-stage choice matrix:
  1. **Frame the decision.** Multiple-choice questions cover the court, the motion, the deadline, the AI tool and its data settings, what would go into the tool, and your safeguards. There are no free-text fields for client details. Answers are kept only for the browser session.
  2. **Gates.** Hard stops are applied before any weighing. A gate blocks the options it names, and no weight or rating can reopen them.
  3. **Weigh the options.** Five options are scored against eight factors. Weights run from 0 to 10 and ratings from 1 to 5; both start with suggested values and can be edited. The view also includes:
     - a live ranking
     - close-call flags
     - sensitivity
     - an optional uncertainty panel
     - bias checks
     - a "rate without suggestions" mode
  4. **Your Report.** You pick any open option and write a short rationale. The tool produces Your Report, with the risks identified and suggestions for using AI, which you can download as a PDF or print.
- **How this works**: a plain-language explanation of the method, with a worked example computed live.
- **Citation Toolkit**: finds citations in a pasted or uploaded draft, flags problems, and tracks verification.
- **Redaction Game**: practice removing identifying and confidential information.
- **Motions 101**: what a motion is, its parts, its life cycle, and a library of 20 motions. Each motion has a "Start an assessment" button that pre-fills Stage 1.
- **Rules & Sources**: every rule, opinion and case the site relies on.

## Project structure

```text
index.html             # The page: layout, styles and UI code
config.js              # ALL decision content: options, factors, weights, ratings,
                       #   adjustments, gates, uncertainty, bias triggers, checklist
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
