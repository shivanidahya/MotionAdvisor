# Motion to Use AI (Motion Advisor)

A decision-support tool that helps attorneys and legal staff evaluate whether, and how, to use generative AI when drafting motions. It is framed as a courtroom comedy: the user "files a motion to use AI" and the tool rules on it. A **Serious mode** toggle removes the jokes.

Built for a Decision Making and Choice Management course project.

> **Disclaimer:** Decision support only. This is not legal advice and creates no attorney-client relationship. Rules change and vary by jurisdiction, so verify every rule and citation against your own sources.

## Features

- **Document intake:** upload (.docx, .pdf, .txt) or paste text. A browser-side scan flags possible identifying details, confidentiality markers, reporter citations and motion type, then pre-fills the hearing. Nothing is uploaded or stored.
- **Hearing:** 10 weighted questions with "why we ask" notes, hard-stop rules, and a ruling (Granted, Granted in part, Denied without prejudice) with a risk meter.
- **Verdict by task** and a **motion for reconsideration** (what-if mode) that recalculates the ruling live.
- **Drills:** a redaction exercise and a spot-the-fake-citation exercise (all cases are invented).
- **Training:** five courses sorted by the user's results: disclosure rules, tool competence, billing protocols, AI policy, security parameters.
- **Toolkit:** auto-redact with a restore key, citation worklist, policy and engagement-letter generator (export to PDF or Word), and an AI use log.

## Run locally

It is a single static file with no build step.

```bash
# Option 1: open index.html in a browser

# Option 2: serve it locally
npx serve .
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, choose **Add New > Project** and import the repo.
3. Framework preset: **Other**. Leave the build command and output directory empty.
4. Deploy. Vercel serves `index.html` at the root.

To update an existing Vercel project (for example `motion-advisor`), replace its `index.html` with this one and push.

## Project structure

```
index.html   The whole app: HTML, CSS and JavaScript
README.md    This file
```

## Where to edit things

All in `index.html`, inside the `<script>` block:

| What | Where |
|---|---|
| Hearing questions, answer options, risk scores, hard stops | the `Q` array |
| Ruling thresholds (28% and 55%) and verdict text | `verdict()` and the `V` object |
| Per-task verdicts | `TASKS` and `taskTable()` |
| Training courses | the `TM` array |
| Document scan patterns | the `RX`, `MK`, `CIT`, `AI` and `MT` constants |
| Policy and engagement-letter text | `gen()` (the `P`, `C` and `LT` strings) |
| Colors and layout | CSS variables at the top of the `<style>` block |

## Scoring logic

Each answer has a risk score (`r`) and each question has a weight (`w`). Risk is the weighted sum as a percentage of the maximum. Hard stops force a denial regardless of score: skipping citation verification, ignoring a court's AI rule, or entering confidential data into a tool with unknown data protections.

| Risk | Result |
|---|---|
| under 28% | Granted (proceed with safeguards) |
| 28% to 54% | Granted in part (limited use only) |
| 55% or more, or any hard stop | Denied without prejudice |

## Privacy

- All processing happens in the browser. Documents and answers are not sent anywhere.
- The AI use log is saved in the browser's `localStorage` only. Use matter numbers, never client names.
- The restore key from the auto-redact tool exists only in page memory.

## External scripts (loaded on demand)

| Library | Used for | Source |
|---|---|---|
| mammoth 1.6.0 | reading .docx uploads | jsDelivr |
| pdf.js 3.11.174 | reading .pdf uploads | cdnjs |
| jsPDF 2.5.1 | exporting PDFs | cdnjs |
| docx 8.5.0 | exporting Word files | jsDelivr |

## Known limitations

- The document scan is pattern matching, not AI analysis. It misses unusual formats and plain names, and a clean scan is not clearance to share a document with an AI tool.
- Scanned-image PDFs have no readable text.
- PDF exports use Helvetica (the standard PDF font that matches Arial). Word exports use Arial.
- Legal and ethics content (ABA Formal Opinion 512, the Model Rules) is summarized from general knowledge and should be verified against current sources and your state's rules.
- Practice-drill cases are fictional.

## License

Add a license of your choice (for example MIT) before publishing.
