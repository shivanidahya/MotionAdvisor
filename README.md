# Motion Advisor

Motion Advisor is a standalone browser tool for deciding how artificial intelligence should be used when preparing a legal motion. It combines practical drafting guidance with citation verification, privacy review, and a short redaction exercise.

## Features

- **AI Drafting Advisor**: Answer six sections about the motion, client information, workflow, supervision, and verification. The tool returns a weighted recommendation, stop conditions, and a review checklist.
- **Citation Toolkit**: Paste or upload a draft to find and review common case, statute, rule, and docket citations. Results include highlighted text, issue severity, and export options.
- **Redaction Game**: Practice removing identifying and confidential information before sharing legal text with an AI tool.
- **Motions 101**: Browse common federal and Massachusetts motions by stage, search by name or rule, and review filing timing, standards, and AI drafting cautions.
- **Responsive interface**: Works on desktop and mobile, with light and dark themes that follow the device preference.

## Run locally

No build step or package installation is required. Open [`index.html`](index.html) in a modern browser, or serve the folder with any static file server:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000/Motion%20Advisor.html>.

The app is implemented as a single HTML file with inline CSS and JavaScript. Google Fonts are loaded remotely when an internet connection is available. The citation toolkit may also load export libraries on demand for PDF, spreadsheet, and document exports.

## Important limitation

Motion Advisor is an educational decision-support tool, not a lawyer, legal research service, or substitute for professional judgment. It does not provide legal advice. Verify every authority, deadline, citation, factual assertion, and court-specific requirement against current primary sources before filing or sharing a document. Do not paste confidential or identifying client information into an external AI service.

## Project structure

```text
MotionAdvisor/
├── index.html            # Complete browser application
└── README.md             # Project documentation
```

## License

No license has been specified for this project.
