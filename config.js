/* ============================================================================
   Motion Advisor: decision configuration
   ----------------------------------------------------------------------------
   Every option, factor, default weight, suggested rating, adjustment, gate,
   uncertainty setting, bias trigger and checklist item used by the AI Drafting
   Advisor lives in this one file. engine.js only applies these values; no AI
   model generates ratings or recommendations at runtime, so the same inputs
   always produce the same output.

   HOW TO EDIT
   - Ratings use a 1-5 scale where 5 is ALWAYS the most favourable for the user
     on that factor (for "Accuracy / hallucination risk", 5 = lowest risk).
   - Weights run 0-10. 0 means "this factor doesn't matter to me".
   - Conditions ("when") are plain data, read by engine.js:
       { field: "deadline", equals: "lt24" }
       { field: "deadline", in: ["lt24", "h24_48"] }
       { field: "trains", notEquals: "no" }
       { field: "info", includesAny: ["confidential", "privileged"] }
       { field: "info", excludesAll: ["confidential", "privileged"] }
       { all: [cond, cond] }   { any: [cond, cond] }
   - Authorities are written "rule:<id>" (an entry on the Rules & Sources page)
     or "cite:<citation>" (plain citation; civil-rule citations become
     courtrules.net links automatically).
   - Anything marked  REVIEW  is a judgment call that should be confirmed by a
     qualified person (practising attorney, ethics counsel or SME).
   ========================================================================== */
(function (root) {
  "use strict";

  var CONFIG = {
    version: "2026-11-16",

    scale: { min: 1, max: 5, labels: { 1: "Very poor", 2: "Poor", 3: "Neutral", 4: "Good", 5: "Very good" } },
    weightScale: { min: 0, max: 10 },

    // A result is a "close call" when the top two options are fewer than this many
    // points apart on the 0-100 score scale.  REVIEW: 5 points is a design choice.
    closeCallPoints: 5,

    /* ------------------------------------------------------------------------
       STAGE 1: FRAME THE DECISION
       Multiple choice only, so no client names, case names, numbers or facts
       are ever typed in. Answers live in the browser session only.
       ---------------------------------------------------------------------- */
    framing: {
      groups: [
        { id: "motion", title: "The motion", fields: ["court", "motion", "dispositive", "deadline"] },
        { id: "tool", title: "The AI tool", fields: ["tool", "trains", "retains", "grounded"] },
        { id: "inputs", title: "What would go into the tool", fields: ["info", "swornAI"] },
        { id: "safeguards", title: "Safeguards", fields: ["citeCheck", "finalReview", "standingOrder", "clientConsent"] }
      ],
      fields: {
        court: {
          label: "Which court?", type: "select", default: "ma_superior",
          why: "Court rules, local rules and judges' AI orders differ by court.",
          choices: [
            { v: "ma_superior", label: "Massachusetts Superior Court" },
            { v: "ma_other", label: "Another Massachusetts state court" },
            { v: "dmass", label: "U.S. District Court, District of Massachusetts" },
            { v: "fed_other", label: "Another federal court" },
            { v: "state_other", label: "Another state's court" }
          ]
        },
        motion: {
          label: "Which motion?", type: "select", default: "msj",
          why: "The stakes and the amount of legal authority differ a lot between motions.",
          // libraryName links each choice to its Motions 101 entry.
          // dispositive: suggested answer for the next question (user can change it).
          choices: [
            { v: "dismiss", label: "Motion to Dismiss", libraryName: "Motion to Dismiss", dispositive: "yes" },
            { v: "jop", label: "Motion for Judgment on the Pleadings", libraryName: "Motion for Judgment on the Pleadings", dispositive: "yes" },
            { v: "msj", label: "Motion for Summary Judgment", libraryName: "Motion for Summary Judgment", dispositive: "yes" },
            { v: "jmol", label: "Motion for Directed Verdict / JMOL", libraryName: "Motion for Directed Verdict / JMOL", dispositive: "yes" },
            { v: "rjmol", label: "Renewed Motion for JMOL", libraryName: "Renewed Motion for JMOL", dispositive: "yes" },
            { v: "mds", label: "Motion for More Definite Statement", libraryName: "Motion for More Definite Statement", dispositive: "no" },
            { v: "strike", label: "Motion to Strike", libraryName: "Motion to Strike", dispositive: "no" },
            { v: "amend", label: "Motion for Leave to Amend", libraryName: "Motion for Leave to Amend", dispositive: "no" },
            { v: "transfer", label: "Motion to Transfer Venue", libraryName: "Motion to Transfer Venue", dispositive: "no" },
            { v: "compel", label: "Motion to Compel", libraryName: "Motion to Compel", dispositive: "no" },
            { v: "protective", label: "Motion for Protective Order", libraryName: "Motion for Protective Order", dispositive: "no" },
            { v: "sanctions", label: "Motion for Discovery Sanctions", libraryName: "Motion for Discovery Sanctions", dispositive: "unsure" },
            { v: "tro", label: "Temporary Restraining Order", libraryName: "Temporary Restraining Order", dispositive: "no" },
            { v: "pi", label: "Motion for Preliminary Injunction", libraryName: "Motion for Preliminary Injunction", dispositive: "no" },
            { v: "limine", label: "Motion in Limine", libraryName: "Motion in Limine", dispositive: "no" },
            { v: "newtrial", label: "Motion for New Trial", libraryName: "Motion for New Trial", dispositive: "no" },
            { v: "relief", label: "Motion for Relief from Judgment", libraryName: "Motion for Relief from Judgment", dispositive: "no" },
            { v: "extend", label: "Motion to Extend Time", libraryName: "Motion to Extend Time", dispositive: "no" },
            { v: "phv", label: "Motion for Admission Pro Hac Vice", libraryName: "Motion for Admission Pro Hac Vice", dispositive: "no" },
            { v: "other", label: "Another civil motion", libraryName: null, dispositive: "unsure" }
          ]
        },
        dispositive: {
          label: "Could this motion end all or part of the case?", type: "radio", default: "yes",
          why: "Dispositive motions raise the cost of any error. Suggested from the motion; change it if your motion differs.",
          choices: [{ v: "yes", label: "Yes, dispositive" }, { v: "no", label: "No" }, { v: "unsure", label: "Not sure" }]
        },
        deadline: {
          label: "How long until it's due?", type: "radio", default: "d3_7",
          why: "Short deadlines squeeze the time available to verify AI output.",
          choices: [
            { v: "lt24", label: "Less than 24 hours" }, { v: "h24_48", label: "24 to 48 hours" },
            { v: "d3_7", label: "3 to 7 days" }, { v: "gt7", label: "More than a week" }
          ]
        },
        tool: {
          label: "Which kind of AI tool are you considering?", type: "select", default: "legal",
          why: "Data handling and citation reliability differ by tool. Pick the closest kind, then confirm its settings below.",
          // prefill: suggested answers for the three settings questions. Users must
          // confirm against the tool's actual contract or settings.  REVIEW
          choices: [
            { v: "legal", label: "Legal-specific AI tool built on a legal research database", prefill: { trains: "no", retains: "no", grounded: "yes" } },
            { v: "enterprise", label: "General AI tool on a business or enterprise plan", prefill: { trains: "no", retains: "notsure", grounded: "no" } },
            { v: "consumer", label: "Free or personal-account consumer chatbot", prefill: { trains: "notsure", retains: "yes", grounded: "no" } },
            { v: "undecided", label: "Not decided yet", prefill: { trains: "notsure", retains: "notsure", grounded: "notsure" } }
          ]
        },
        trains: {
          label: "Does the tool train on what you enter?", type: "radio", default: "no",
          why: "Inputs used for training can resurface outside your firm (Rule 1.6; ABA Op. 512).",
          choices: [{ v: "no", label: "No (confirmed in the terms or settings)" }, { v: "yes", label: "Yes" }, { v: "notsure", label: "Not sure" }]
        },
        retains: {
          label: "Does the tool keep your inputs after the session?", type: "radio", default: "no",
          why: "Stored inputs can be accessed, breached or subpoenaed.",
          choices: [{ v: "no", label: "No, or zero-retention by contract" }, { v: "yes", label: "Yes" }, { v: "notsure", label: "Not sure" }]
        },
        grounded: {
          label: "Are its answers grounded in a legal research database?", type: "radio", default: "yes",
          why: "Grounded tools cite real sources more reliably, though they still make mistakes.",
          choices: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "notsure", label: "Not sure" }]
        },
        info: {
          label: "What would go into the tool? (Select all that apply)", type: "checkbox", default: ["public"],
          why: "Confidentiality duties attach to everything relating to the representation, not just names.",
          choices: [
            { v: "public", label: "Only public legal information (rules, published cases, general questions)" },
            { v: "anonymized", label: "Facts with every identifying detail removed" },
            { v: "confidential", label: "Client confidential information" },
            { v: "privileged", label: "Privileged communications or attorney work product" }
          ]
        },
        swornAI: {
          label: "Would AI draft or edit any affidavit or declaration?", type: "radio", default: "no",
          why: "Sworn statements must come from the witness's own personal knowledge.",
          choices: [{ v: "no", label: "No, sworn statements stay AI-free" }, { v: "yes", label: "Yes" }, { v: "unsure", label: "Not sure" }]
        },
        citeCheck: {
          label: "How will citations be checked before filing?", type: "radio", default: "full",
          why: "Every published AI sanction case involved citations nobody pulled and read.",
          choices: [
            { v: "full", label: "Every citation pulled and read in Westlaw, Lexis or the official reporter" },
            { v: "spot", label: "Spot-check some citations" },
            { v: "none", label: "No formal check" }
          ]
        },
        finalReview: {
          label: "Who reviews the final motion?", type: "radio", default: "signer",
          why: "The signing attorney certifies the filing under Rule 11.",
          choices: [
            { v: "signer", label: "The signing attorney reads the whole motion" },
            { v: "other", label: "Someone else reviews it" },
            { v: "none", label: "No formal final review" }
          ]
        },
        standingOrder: {
          label: "Does the judge or court have an order on AI use?", type: "radio", default: "none_found",
          why: "A growing number of judges require disclosure or certification, and a few restrict AI.",
          choices: [
            { v: "none_found", label: "I checked: no AI order applies" },
            { v: "disclosure", label: "An order requires disclosure or certification" },
            { v: "prohibits", label: "An order restricts or prohibits AI-drafted filings" },
            { v: "unchecked", label: "I haven't checked yet" }
          ]
        },
        clientConsent: {
          label: "Has the client been told about AI use?", type: "radio", default: "na",
          why: "Rule 1.4 and ABA Op. 512 address telling clients about AI use and billing.",
          choices: [
            { v: "yes", label: "Yes, and the client agreed" },
            { v: "notyet", label: "Not yet" },
            { v: "na", label: "Not needed: no client information goes in" }
          ]
        }
      }
    },

    /* ------------------------------------------------------------------------
       STAGE 2: GATES (hard stops)
       A triggered gate blocks the listed options. Gates are applied BEFORE any
       weighing and no weight or rating can override them. They clear only when
       the framing answer that triggered them changes.
       ---------------------------------------------------------------------- */
    gates: [
      {
        id: "confidential-data",
        title: "Confidential information would go into a tool that may keep or learn from it",
        when: { all: [
          { field: "info", includesAny: ["confidential", "privileged"] },
          { any: [{ field: "trains", notEquals: "no" }, { field: "retains", notEquals: "no" }] }
        ] },
        // B (research only) stays open: research prompts can be written without client facts.
        blocks: ["C", "D", "E"],
        why: "Confidential or privileged information would be entered into a tool that trains on inputs, keeps them, or might. That risks disclosure without the client's informed consent.",
        authorities: ["rule:rpc-1-6", "rule:aba-512"],
        clears: "Keep confidential and privileged information out of the tool (use public or fully anonymized material only), or switch to a tool whose contract confirms it neither trains on nor retains inputs."
      },
      {
        id: "citation-verification",
        title: "Citations would not all be verified",
        when: { field: "citeCheck", in: ["spot", "none"] },
        // Options that put AI-sourced authority into the filing.  C (formatting) does not.
        blocks: ["B", "D", "E"],
        why: "Without pulling and reading every citation, an invented or misstated authority can reach the court. Spot-checks are how fabricated cases slipped through in Mata v. Avianca and Smith v. Farwell.",
        authorities: ["rule:rpc-3-3", "rule:frcp-11", "rule:mata", "rule:smith"],
        clears: "Commit to pulling and reading every citation in Westlaw, Lexis or the official reporter before filing."
      },
      {
        id: "sworn-facts",
        title: "AI would draft or edit sworn facts",
        when: { field: "swornAI", in: ["yes", "unsure"] },
        blocks: ["C", "D", "E"],
        why: "Affidavits and declarations must rest on the witness's personal knowledge. AI-drafted sworn facts risk false statements made under oath.",
        authorities: ["cite:Fed. R. Civ. P. 56(c)(4)", "cite:28 U.S.C. § 1746", "rule:rpc-3-3"],
        clears: "Keep affidavits and declarations entirely AI-free; draft them from the witness's own account."
      },
      {
        id: "no-final-review",
        title: "No final review by the signing attorney",
        when: { field: "finalReview", equals: "none" },
        blocks: ["B", "C", "D", "E"],
        why: "The signing attorney certifies every filing. Without a final read, no one stands behind the AI-assisted content.",
        authorities: ["rule:frcp-11", "rule:mrcp-11", "rule:rpc-5-1"],
        clears: "Have the signing attorney read the entire final motion before it is filed."
      },
      {
        id: "court-prohibits",
        title: "The court restricts AI-drafted filings",
        when: { field: "standingOrder", equals: "prohibits" },
        // REVIEW: assumes the order reaches drafting assistance but not private research.
        blocks: ["C", "D", "E"],
        why: "A judge's order restricting AI in filings controls. Breaching it can lead to sanctions on its own.",
        authorities: ["rule:standing-orders", "rule:frcp-11"],
        clears: "Read the order closely. If it allows some uses (for example research), stay within them; otherwise draft without AI."
      }
    ],

    /* ------------------------------------------------------------------------
       STAGE 3: OPTIONS (columns)
       exposure: how much AI-generated content can reach the filing (used by the
         uncertainty panel: each 10 points of error chance lowers the accuracy
         rating by this many points).  REVIEW
       disclosureBurden: compliance points lost if disclosure is certain.  REVIEW
       parts: related "Parts of a motion" cards in Motions 101.
       ---------------------------------------------------------------------- */
    options: [
      { id: "A", name: "No AI", short: "No AI", exposure: 0, disclosureBurden: 0, parts: [],
        desc: "Research and draft the motion without generative AI." },
      { id: "B", name: "AI for legal research only, with independent verification", short: "Research only", exposure: 0.5, disclosureBurden: 0.25, parts: ["memo"],
        desc: "AI helps find and explain authority. Every source is pulled and read before use, and AI writes nothing that goes into the filing." },
      { id: "C", name: "AI for low-risk parts only", short: "Low-risk parts", exposure: 0.1, disclosureBurden: 0.5, parts: ["service", "order"],
        desc: "Certificate of service, proposed order, formatting and proofreading." },
      { id: "D", name: "AI-assisted memorandum drafting with full citation and fact verification", short: "Assisted memo", exposure: 1, disclosureBurden: 1, parts: ["memo", "motion"],
        desc: "AI helps draft the memorandum. Every citation and every fact is verified against the source and the record." },
      { id: "E", name: "Substantial AI drafting with attorney review", short: "Substantial drafting", exposure: 1.5, disclosureBurden: 1, parts: ["motion", "memo"],
        desc: "AI drafts most of the motion and memorandum; the attorney reviews and edits." }
    ],

    /* ------------------------------------------------------------------------
       STAGE 3: FACTORS (rows) with default weights (0-10)
       Default weights follow the course method and the project plan: duties
       that protect the client and the court (accuracy, confidentiality,
       compliance) outweigh convenience (time, cost).  REVIEW all weights.
       ---------------------------------------------------------------------- */
    factors: [
      { id: "accuracy", name: "Accuracy / hallucination risk", weight: 9, scaleNote: "5 = lowest risk of an error reaching the court",
        why: "Invented or misstated authority is the error courts sanction most often.",
        authorities: ["rule:rpc-1-1", "rule:rpc-3-3", "rule:frcp-11", "rule:mata"] },
      { id: "confidentiality", name: "Confidentiality and privilege risk", weight: 9, scaleNote: "5 = least exposure of client information",
        why: "Client information entered into a tool may be stored, reviewed or used for training.",
        authorities: ["rule:rpc-1-6", "rule:aba-512"] },
      { id: "time", name: "Time saved", weight: 5, scaleNote: "5 = saves the most time",
        why: "Time freed up can go to verification, strategy or the client.",
        authorities: ["rule:rpc-1-5"] },
      { id: "cost", name: "Cost", weight: 4, scaleNote: "5 = lowest total cost to the client",
        why: "Billed hours and tool costs both reach the client, and fees must be reasonable.",
        authorities: ["rule:rpc-1-5", "rule:aba-512"] },
      { id: "compliance", name: "Compliance with court rules and the judge's standing orders", weight: 8, scaleNote: "5 = least compliance risk",
        why: "Some judges require disclosure or certification of AI use, and Rule 11 applies to every filing.",
        authorities: ["rule:standing-orders", "rule:frcp-11", "rule:dmass-7-1"] },
      { id: "client", name: "Client expectations and consent", weight: 6, scaleNote: "5 = best fit with what the client expects and has agreed to",
        why: "Clients may need to know how AI is used and billed before it is used.",
        authorities: ["rule:rpc-1-4", "rule:rpc-1-5", "rule:aba-512"] },
      { id: "quality", name: "Quality and persuasiveness of the final product", weight: 7, scaleNote: "5 = most persuasive, record-specific motion",
        why: "The motion has to persuade this judge on this record.",
        authorities: ["rule:rpc-1-1"] },
      { id: "development", name: "Professional development / maintaining competence", weight: 4, scaleNote: "5 = builds the most skill",
        why: "Drafting builds the judgment you need to supervise AI output later.",
        authorities: ["rule:rpc-1-1"] }
    ],

    /* Suggested weight changes driven by Stage 1 (applied to the defaults above). */
    weightAdjustments: [
      { id: "deadline-time", when: { field: "deadline", in: ["lt24", "h24_48"] }, factor: "time", delta: 2,
        reason: "With less than 48 hours, time saved matters more to most practitioners." },
      { id: "dispositive-accuracy", when: { field: "dispositive", equals: "yes" }, factor: "accuracy", delta: 1,
        reason: "A dispositive motion raises the stakes of any error." },
      { id: "confidential-weight", when: { field: "info", includesAny: ["confidential", "privileged"] }, factor: "confidentiality", delta: 1,
        reason: "Client information is in play, so confidentiality carries more weight." }
    ],

    /* ------------------------------------------------------------------------
       BASE RATINGS: option x factor, 1-5 (5 = most favourable), with the reason
       shown in the side panel. Adjusted below by Stage 1 answers.  REVIEW all.
       ---------------------------------------------------------------------- */
    ratings: {
      accuracy: {
        A: [5, "No AI-generated content, so no AI-invented authority can enter the filing."],
        B: [4, "AI only points to sources; independent pulling and reading catches most errors."],
        C: [5, "Formatting and boilerplate parts carry almost no legal authority to get wrong."],
        D: [3, "AI-drafted argument can misstate holdings; full verification lowers but doesn't remove the risk."],
        E: [2, "The more AI-written argument, the more places for an error to hide during review."]
      },
      confidentiality: {
        A: [5, "Nothing leaves your own systems."],
        B: [4, "Research prompts can usually be written without client facts."],
        C: [4, "Party names and captions are often public, but proofreading exposes the full text."],
        D: [3, "Drafting the memorandum usually needs case facts."],
        E: [2, "Substantial drafting needs the most client facts and strategy."]
      },
      time: {
        A: [1, "Everything is done by hand."],
        B: [3, "Faster research, but verification time remains."],
        C: [2, "Saves a little time on routine parts."],
        D: [4, "Faster first draft of the longest part; verification still takes time."],
        E: [5, "Fastest first draft overall."]
      },
      cost: {
        A: [2, "Most attorney hours, no tool cost."],
        B: [3, "Some hours saved, offset by tool cost and verification."],
        C: [3, "Small savings on routine parts."],
        D: [4, "Fewer drafting hours, though verification is billed too."],
        E: [4, "Fewest drafting hours, but heavier review and tool costs."]
      },
      compliance: {
        A: [5, "No AI disclosure or certification issues."],
        B: [4, "Research use is rarely covered by AI orders, but check yours."],
        C: [4, "Some orders cover any AI-assisted text in a filing."],
        D: [3, "AI-assisted argument is what most disclosure orders target."],
        E: [2, "Most likely to trigger disclosure duties and judicial scrutiny."]
      },
      client: {
        A: [4, "No AI conversation needed, though some clients expect efficiency."],
        B: [4, "Research use is easy to explain and bill transparently."],
        C: [4, "Minimal AI use, simple to explain."],
        D: [3, "Usually needs a conversation about AI use and billing."],
        E: [2, "Most likely to need informed consent and raise billing questions."]
      },
      quality: {
        A: [4, "Depends on available time; fully record-specific."],
        B: [4, "Better-researched argument, written by you."],
        C: [4, "Cleaner formatting; substance unchanged."],
        D: [4, "Strong if verified and rewritten in your voice."],
        E: [3, "Generic drafts tend to miss record-specific points."]
      },
      development: {
        A: [5, "You do all the analysis and writing."],
        B: [4, "You still analyse and write; AI speeds the search."],
        C: [4, "Little effect on your core skills."],
        D: [3, "Less drafting practice, but verification builds review skills."],
        E: [2, "Least practice in building arguments yourself."]
      }
    },

    /* Rating adjustments driven by Stage 1. Applied in order; results are kept
       within 1-5. Each shows up in the side panel with its reason.  REVIEW */
    adjustments: [
      { id: "grounded-yes", when: { field: "grounded", equals: "yes" }, factor: "accuracy", delta: { B: 1, D: 1, E: 1 },
        reason: "The tool is grounded in a legal database, so it cites real sources more reliably." },
      { id: "grounded-no", when: { field: "grounded", in: ["no", "notsure"] }, factor: "accuracy", delta: { B: -1, D: -1, E: -1 },
        reason: "The tool isn't (or may not be) grounded in a legal database, so invented or misstated authority is more likely." },
      { id: "dispositive", when: { field: "dispositive", equals: "yes" }, factor: "accuracy", delta: { D: -1, E: -1 },
        reason: "A dispositive motion can end the case, so the same error costs more." },
      { id: "dispositive-quality", when: { field: "dispositive", equals: "yes" }, factor: "quality", delta: { E: -1 },
        reason: "Dispositive motions need record-specific argument that generic drafts rarely supply." },
      { id: "short-deadline-quality", when: { field: "deadline", in: ["lt24", "h24_48"] }, factor: "quality", delta: { A: -1 },
        reason: "Drafting everything by hand under a short deadline leaves less time to sharpen the argument." },
      { id: "routine", when: { field: "motion", in: ["extend", "phv"] }, factor: "accuracy", delta: { D: 1, E: 1 },
        reason: "Short procedural motions cite few authorities, so there is less to get wrong." },
      { id: "short-deadline", when: { field: "deadline", in: ["lt24", "h24_48"] }, factor: "accuracy", delta: { D: -1, E: -1 },
        reason: "Less time to verify means more risk that an error survives review." },
      { id: "public-only", when: { field: "info", excludesAll: ["anonymized", "confidential", "privileged"] }, factor: "confidentiality", delta: { B: 1, C: 1, D: 1, E: 1 },
        reason: "Only public legal information goes in." },
      { id: "anonymized", when: { all: [{ field: "info", includesAny: ["anonymized"] }, { field: "info", excludesAll: ["confidential", "privileged"] }] }, factor: "confidentiality", delta: { D: 1, E: 1 },
        reason: "Facts are anonymized, which lowers the exposure of drafting with case facts." },
      { id: "confidential-in", when: { field: "info", includesAny: ["confidential", "privileged"] }, factor: "confidentiality", delta: { D: -1, E: -1 },
        reason: "Even with a no-training, no-retention tool, confidential information leaves your systems." },
      { id: "review-other", when: { field: "finalReview", equals: "other" }, factor: "accuracy", delta: { B: -1, D: -1, E: -1 },
        reason: "Review by someone other than the signer leaves the signer certifying work they didn't check." },
      { id: "order-none", when: { field: "standingOrder", equals: "none_found" }, factor: "compliance", delta: { D: 1, E: 1 },
        reason: "You checked and no AI order applies." },
      { id: "order-disclosure", when: { field: "standingOrder", equals: "disclosure" }, factor: "compliance", delta: { D: -1, E: -1 },
        reason: "Disclosure or certification adds a step and invites scrutiny of AI-assisted content." },
      { id: "order-unchecked", when: { field: "standingOrder", equals: "unchecked" }, factor: "compliance", delta: { B: -1, C: -1, D: -1, E: -1 },
        reason: "Until you check, you can't know whether AI use is allowed or must be disclosed." },
      { id: "consent-yes", when: { field: "clientConsent", equals: "yes" }, factor: "client", delta: { D: 1, E: 1 },
        reason: "The client has been told and agreed." },
      { id: "consent-notyet", when: { field: "clientConsent", equals: "notyet" }, factor: "client", delta: { C: -1, D: -1, E: -1 },
        reason: "The client hasn't been told yet." }
    ],

    /* ------------------------------------------------------------------------
       UNCERTAINTY PANEL (optional)
       Adjusted accuracy   = rating - option.exposure x (error chance / 10)
       Adjusted compliance = rating - option.disclosureBurden x (disclosure chance / 100)
       Both kept within 1-5.  REVIEW the multipliers.
       ---------------------------------------------------------------------- */
    uncertainty: {
      errorChance: {
        label: "Chance an AI-generated citation error reaches the filing despite your review", min: 0, max: 50, step: 1, unit: "%",
        // Starting estimate from Stage 1 (first matching rule wins).  REVIEW
        defaults: [
          { when: { all: [{ field: "citeCheck", equals: "full" }, { field: "grounded", equals: "yes" }] }, value: 3 },
          { when: { field: "citeCheck", equals: "full" }, value: 8 },
          { when: null, value: 20 }
        ]
      },
      disclosureChance: {
        label: "Chance the judge requires AI disclosure", min: 0, max: 100, step: 5, unit: "%",
        defaults: [
          { when: { field: "standingOrder", in: ["disclosure", "prohibits"] }, value: 100 },
          { when: { field: "standingOrder", equals: "unchecked" }, value: 40 },
          { when: null, value: 10 }
        ]
      },
      // Scenarios used for the "ranks first in N of M scenarios" summary.
      errorGrid: [0, 5, 10, 15, 20, 25, 30, 40, 50],
      disclosureGrid: [0, 50, 100]
    },

    /* ------------------------------------------------------------------------
       BIAS CHECKS: short, dismissible prompts shown at the moment each bias is
       most likely. Never blocking.
       ---------------------------------------------------------------------- */
    bias: {
      automation: { minRating: 4, minExposure: 0.5, factor: "accuracy",
        text: "AI output often sounds confident even when it's wrong. What will you check independently?" },
      deadline: { deadlines: ["lt24", "h24_48"],
        text: "Time pressure makes it tempting to skip verification. Is your review plan realistic?" },
      overconfidence: { minOverrides: 3,
        text: "You've adjusted several ratings in AI's favor. Want to review them?" },
      anchoring: {
        text: "Rate each cell yourself first. Suggested ratings appear next to yours once you've entered them, and the ranking appears when every cell is rated." }
    },

    /* ------------------------------------------------------------------------
       STAGE 4: ACTION CHECKLIST, tailored to the chosen option.
       options: shown only when the chosen option (or the preset a custom option
       is based on) is in the list. always: shown for every choice.
       ---------------------------------------------------------------------- */
    checklist: [
      { id: "standing", always: true, text: "Check the assigned judge's standing orders and session procedures, and the local rules, for AI disclosure or certification." },
      { id: "citations", options: ["B", "D", "E"], text: "Verify every citation in Westlaw, Lexis or the official reporter: pull it, read it, confirm the pincite and check negative history." },
      { id: "citations-other", options: ["A", "C"], text: "Check every citation from any outside source (templates, research memos, colleagues) with the Citation Toolkit and a citator." },
      { id: "facts", options: ["D", "E"], text: "Verify every factual statement against the record: exhibits, transcripts and affidavits." },
      { id: "anonymize", options: ["B", "C", "D", "E"], text: "Remove client names, case names, docket numbers and identifying facts from every prompt." },
      { id: "scope", options: ["C"], text: "Give the tool only the parts being formatted or proofread, never the full confidential record." },
      { id: "sworn", options: ["B", "C", "D", "E"], text: "Draft affidavits and declarations from the witness's own knowledge, without AI." },
      { id: "policy", options: ["B", "C", "D", "E"], text: "Confirm your firm's AI policy allows this tool and this use, and that its data terms match what you assumed." },
      { id: "client", options: ["B", "C", "D", "E"], text: "Tell the client how AI will be used and billed, and get consent before any confidential information goes in." },
      { id: "billing", options: ["B", "C", "D", "E"], text: "Bill actual time spent; don't bill for time the tool saved or for learning a general-purpose tool." },
      { id: "log", options: ["B", "C", "D", "E"], text: "Keep a record of the AI use: tool, date, what went in, what came out and how it was checked." },
      { id: "review", always: true, text: "The signing attorney reads the entire final motion before filing." },
      { id: "redact", always: true, text: "Redact personal identifiers before filing (Fed. R. Civ. P. 5.2; SJC Rule 1:24)." }
    ]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else root.MA_CONFIG = CONFIG;
})(typeof window !== "undefined" ? window : this);
