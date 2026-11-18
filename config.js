/* ============================================================================
   Motion Advisor: decision configuration
   ----------------------------------------------------------------------------
   Every question, risk rule, threshold and suggestion used by the AI Drafting
   Advisor's questionnaire and report, and every option, factor, weight, rating,
   gate, uncertainty setting and bias trigger used by Compare Your Options,
   lives in this one file. engine.js only applies these values; no AI
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

    /* ========================================================================
       MAIN PATH: QUESTIONNAIRE (one screen per step)
       ====================================================================== */
    questionnaire: {
      notice: "Do not enter confidential client information.",
      steps: [
        { id: "court", title: "Which court is the motion in?", fields: ["court", "maDept"] },
        { id: "motion", title: "What motion are you drafting?", fields: ["motion", "dispositive", "issue"] },
        { id: "tool", title: "Which AI tool would you use?", fields: ["tool", "trains", "retains", "grounded"] },
        { id: "info", title: "What information would you enter into the tool?", fields: ["info"] },
        { id: "parts", title: "Which parts of the motion would AI help with?", fields: ["parts"] },
        { id: "verify", title: "How will the work be checked, and how much time is there?", fields: ["citeCheck", "factCheck", "deadline"] },
        { id: "safeguards", title: "What safeguards are in place?", fields: ["policy", "consent", "familiarity"] }
      ],
      fields: {
        court: { label: "Court", type: "radio",
          why: "Court rules, local rules and judges' AI orders differ by court.",
          choices: [
            { v: "ma_state", label: "Massachusetts state court" },
            { v: "dmass", label: "U.S. District Court for the District of Massachusetts" },
            { v: "fed_other", label: "Another federal court" },
            { v: "state_other", label: "Another state's court" }] },
        maDept: { label: "Which department?", type: "radio", showIf: { field: "court", equals: "ma_state" },
          why: "Each Trial Court department has its own rules and standing orders.",
          choices: [
            { v: "superior", label: "Superior Court (including the Business Litigation Session)" },
            { v: "district", label: "District Court" },
            { v: "bmc", label: "Boston Municipal Court" },
            { v: "housing", label: "Housing Court" },
            { v: "land", label: "Land Court" },
            { v: "probate", label: "Probate and Family Court" }] },
        motion: { label: "Motion", type: "radio",
          why: "The stakes and the amount of legal authority differ a lot between motions.",
          // libraryName links to Motions 101; dispositive = the suggested next answer.
          choices: [
            { v: "strike", label: "Motion to Strike", libraryName: "Motion to Strike", dispositive: "no" },
            { v: "dismiss", label: "Motion to Dismiss", libraryName: "Motion to Dismiss", dispositive: "yes" },
            { v: "msj", label: "Motion for Summary Judgment", libraryName: "Motion for Summary Judgment", dispositive: "yes" },
            { v: "mds", label: "Motion for a More Definite Statement", libraryName: "Motion for More Definite Statement", dispositive: "no" },
            { v: "compel", label: "Motion to Compel", libraryName: "Motion to Compel", dispositive: "no" },
            { v: "jop", label: "Motion for Judgment on the Pleadings", libraryName: "Motion for Judgment on the Pleadings", dispositive: "yes" },
            { v: "other", label: "Other", libraryName: null, dispositive: null }] },
        dispositive: { label: "Could this motion end all or part of the case?", type: "radio",
          why: "A dispositive motion raises the cost of any error. Filled in from the motion you picked; change it if yours differs.",
          choices: [{ v: "yes", label: "Yes, it's dispositive" }, { v: "no", label: "No" }, { v: "unsure", label: "Not sure" }] },
        issue: { label: "Is the legal issue settled or novel?", type: "radio",
          why: "AI tools are least reliable where the law is unsettled or the authority is thin.",
          choices: [{ v: "settled", label: "Settled law" }, { v: "novel", label: "Novel or unsettled" }, { v: "unsure", label: "Not sure" }] },
        tool: { label: "Type of AI tool", type: "radio",
          why: "Data handling and citation reliability differ by type of tool.",
          choices: [
            { v: "legal_research", label: "Legal research platform with built-in AI" },
            { v: "legal_drafting", label: "Legal-specific AI drafting tool" },
            { v: "enterprise", label: "General AI tool on an enterprise or business plan" },
            { v: "consumer", label: "General AI tool on a free or consumer plan" },
            { v: "other", label: "Other" }] },
        trains: { label: "Does it train on your inputs?", type: "radio", riskyUnsure: true,
          why: "Inputs used for training can resurface outside your firm (Rule 1.6; ABA Op. 512). \"Not sure\" is treated as yes.",
          choices: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "notsure", label: "Not sure" }] },
        retains: { label: "Does it retain your data after the session?", type: "radio", riskyUnsure: true,
          why: "Stored inputs can be accessed, breached or subpoenaed. \"Not sure\" is treated as yes.",
          choices: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "notsure", label: "Not sure" }] },
        grounded: { label: "Are its citations grounded in a legal database?", type: "radio", riskyUnsure: true,
          why: "Grounded tools cite real sources more reliably, though they still make mistakes. \"Not sure\" is treated as no.",
          choices: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "notsure", label: "Not sure" }] },
        info: { label: "Select everything that would go into the tool", ask: "Information going into the tool:", type: "checkbox", exclusive: "public",
          why: "Confidentiality duties cover everything relating to the representation, not just names.",
          choices: [
            { v: "public", label: "Public information only (rules, published cases, general questions)" },
            { v: "confidential", label: "Client confidential information" },
            { v: "privileged", label: "Privileged communications or attorney strategy" },
            { v: "sealed", label: "Sealed or impounded material" },
            { v: "thirdparty", label: "Third parties' personal data (names, account numbers, health or financial details)" }] },
        parts: { label: "Select every part AI would help with", ask: "Parts AI would help with:", type: "checkbox",
          why: "Risk differs a lot between parts: a certificate of service is routine, legal argument is not.",
          choices: [
            { v: "research", label: "Legal research" },
            { v: "motion", label: "The motion or notice of motion" },
            { v: "memo_facts", label: "Memorandum: statement of facts" },
            { v: "memo_argument", label: "Memorandum: legal argument" },
            { v: "affidavits", label: "Affidavits, declarations and exhibits" },
            { v: "conference", label: "Certificate of conference" },
            { v: "order", label: "Proposed order" },
            { v: "service", label: "Certificate of service" },
            { v: "editing", label: "Editing and proofreading only" }] },
        citeCheck: { label: "Will an attorney check every citation against Westlaw, Lexis or official reporters?", type: "radio",
          why: "Every published AI sanction case involved citations nobody pulled and read.",
          choices: [{ v: "yes", label: "Yes, every citation" }, { v: "partial", label: "Partially" }, { v: "no", label: "No" }] },
        factCheck: { label: "Will an attorney check every fact against the record?", type: "radio",
          why: "AI can misstate or invent facts, and Rule 11 covers factual contentions too.",
          choices: [{ v: "yes", label: "Yes, every fact" }, { v: "partial", label: "Partially" }, { v: "no", label: "No" }] },
        deadline: { label: "Time until the deadline", type: "radio",
          why: "Short deadlines squeeze the time available to verify AI output.",
          choices: [{ v: "gt7", label: "More than a week" }, { v: "d2_7", label: "2 to 7 days" }, { v: "lt48", label: "Under 48 hours" }] },
        policy: { label: "Does your firm have an AI policy?", type: "radio",
          why: "Supervising lawyers must have measures in place for how lawyers and staff use AI (Rules 5.1 and 5.3).",
          choices: [{ v: "yes", label: "Yes" }, { v: "no", label: "No policy" }, { v: "notsure", label: "Not sure" }] },
        consent: { label: "Has the client been informed or consented?", type: "radio",
          why: "Rule 1.4 and ABA Op. 512 address telling clients about AI use and billing.",
          choices: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "na", label: "Not applicable: no client information goes in" }, { v: "notsure", label: "Not sure" }] },
        familiarity: { label: "How familiar are you with this tool?", type: "radio",
          why: "Competence includes understanding the tool's limits, such as invented citations and outdated law (Rule 1.1).",
          choices: [{ v: "very", label: "Very familiar" }, { v: "somewhat", label: "Somewhat familiar" }, { v: "not", label: "Not at all" }] }
      }
    },

    /* ========================================================================
       RISK CALCULATION (main path). Users never set weights here.
       How it works:
         1. Hard stops: a selected part that hits one is "Not recommended".
         2. Each selected part scores base points + the points of every risk
            factor that applies to it. Level: 0-1 Low, 2-3 Moderate, 4+ High.
         3. Overall = High if any selected part hits a hard stop; otherwise the
            highest part level, raised one level when safeguard gaps add up to
            safeguardBump points or more.
       Everything marked REVIEW needs confirmation by a qualified person.
       ====================================================================== */
    risk: {
      partLevels: { moderate: 2, high: 4 },     // REVIEW: point thresholds
      safeguardBump: 3,                         // REVIEW
      clientData: ["confidential", "privileged", "sealed", "thirdparty"],
      summaries: {
        hard: "At least one way you plan to use AI hits a hard stop, so AI isn't recommended for it as planned.",
        High: "Several risk factors stack up. Limit AI to the lowest-risk parts or add safeguards first.",
        Moderate: "AI can help with this motion if you follow the suggestions and checks below.",
        Low: "The uses you selected are lower-risk, as long as you keep the checks below."
      },
      // base = points before risk factors; a part whose base alone reaches Moderate is listed as a risk.
      // base = points before risk factors. usesClientData = drafting it normally needs client facts.
      // phrase is used in sentences; learn = the Parts of a Motion card in Motions 101.
      parts: {
        research: { base: 1, usesClientData: false, phrase: "legal research", learn: "memo", low: "Research leads, verified by you, put no AI text into the filing." },
        motion: { base: 1, usesClientData: true, phrase: "the motion or notice of motion", learn: "motion", low: "A short document that mostly states the relief requested." },
        memo_facts: { authorities: ["rule:rpc-3-3", "rule:frcp-11"], base: 2, usesClientData: true, phrase: "the statement of facts", learn: "memo", low: "Facts must match the record; AI can misstate them." },
        memo_argument: { authorities: ["rule:rpc-3-3", "rule:frcp-11", "rule:mata"], base: 2, usesClientData: true, phrase: "the legal argument", learn: "memo", low: "The argument carries the authority, and AI can invent or misstate it." },
        affidavits: { base: 4, usesClientData: true, phrase: "affidavits, declarations and exhibits", learn: "affidavits", low: "Sworn statements must come from the witness's own knowledge." },
        conference: { base: 0, usesClientData: false, phrase: "the certificate of conference", learn: "conference", low: "Routine form text; lower-risk when you enter no confidential information." },
        order: { base: 0, usesClientData: false, phrase: "the proposed order", learn: "order", low: "Short form text; lower-risk when you enter no confidential information." },
        service: { base: 0, usesClientData: false, phrase: "the certificate of service", learn: "service", low: "Routine form text; lower-risk when you enter no confidential information." },
        editing: { base: 0, usesClientData: true, phrase: "editing and proofreading", learn: "motion", low: "Lower-risk with a tool that doesn't train on your inputs." }
      },
      // parts: "clientData" = every selected part with usesClientData.
      hardStops: [
        { id: "confidential-data", title: "Confidential information in a tool that may keep or learn from it",
          when: { all: [{ field: "info", includesAny: ["confidential", "privileged", "sealed", "thirdparty"] },
                        { any: [{ field: "trains", notEquals: "no" }, { field: "retains", notEquals: "no" }] }] },
          parts: "clientData", fields: ["info", "trains", "retains"],
          text: "You'd enter confidential, privileged, sealed or third-party information into a tool that trains on it, keeps it, or might. That risks disclosure without consent and can breach an impoundment order.",
          authorities: ["rule:rpc-1-6", "rule:aba-512", "cite:Uniform Rules on Impoundment Procedure (Trial Court Rule VIII)", "rule:frcp-5-2"] },
        { id: "no-citation-check", title: "Citations won't be verified",
          when: { field: "citeCheck", equals: "no" }, parts: ["research", "memo_argument"], fields: ["citeCheck"],
          text: "Without an attorney checking every citation, an invented or misstated authority can reach the court. That is how the fabricated cases in Mata and Smith were filed.",
          authorities: ["rule:rpc-3-3", "rule:frcp-11", "rule:mrcp-11", "rule:mata", "rule:smith"] },
        { id: "no-fact-check", title: "Facts won't be checked against the record",
          when: { field: "factCheck", equals: "no" }, parts: ["memo_facts"], fields: ["factCheck"],   // REVIEW: not in the brief; added for consistency
          text: "AI can misstate or invent facts. A statement of facts nobody checks against the record risks a false statement to the court.",
          authorities: ["rule:rpc-3-3", "rule:frcp-11"] },
        { id: "sworn-statements", title: "AI drafting sworn statements",
          when: { field: "parts", includesAny: ["affidavits"] }, parts: ["affidavits"], fields: ["parts"],
          text: "Affidavits and declarations must rest on the witness's own personal knowledge. AI shouldn't draft their substance; at most it can format or proofread text an attorney has written.",
          authorities: ["cite:Fed. R. Civ. P. 56(c)(4)", "cite:Mass. R. Civ. P. 56(e)", "rule:rpc-3-3"] }
      ],
      // Risk factors: points added to each listed part that the user selected.
      factors: [
        { id: "dispositive", when: { field: "dispositive", equals: "yes" }, points: 2, parts: ["research", "motion", "memo_facts", "memo_argument"], fields: ["dispositive"],
          title: "Dispositive motion", text: "The motion can end all or part of the case, so any error costs more.", authorities: ["rule:rpc-1-1", "rule:frcp-11"] },
        { id: "dispositive-unsure", when: { field: "dispositive", equals: "unsure" }, points: 1, parts: ["research", "motion", "memo_facts", "memo_argument"], fields: ["dispositive"],
          title: "Possibly dispositive", text: "You aren't sure whether the motion is dispositive; it's treated as raising the stakes.", authorities: ["rule:rpc-1-1"] },
        { id: "novel", when: { field: "issue", equals: "novel" }, points: 2, parts: ["research", "memo_argument"], fields: ["issue"],
          title: "Novel or unsettled issue", text: "AI tools are least reliable where authority is thin or conflicting, and are more likely to invent support.", authorities: ["rule:rpc-1-1", "rule:frcp-11"] },
        { id: "issue-unsure", when: { field: "issue", equals: "unsure" }, points: 1, parts: ["research", "memo_argument"], fields: ["issue"],
          title: "Issue may be unsettled", text: "You aren't sure whether the law is settled, so AI output needs closer checking.", authorities: ["rule:rpc-1-1"] },
        { id: "consumer-tool", when: { field: "tool", equals: "consumer" }, points: 2, parts: ["research", "motion", "memo_facts", "memo_argument", "editing"], fields: ["tool"],
          title: "Free or consumer AI tool", text: "Consumer plans usually offer the weakest data protections and no legal grounding.", authorities: ["rule:rpc-1-6", "rule:aba-512"] },
        { id: "other-tool", when: { field: "tool", equals: "other" }, points: 1, parts: ["research", "motion", "memo_facts", "memo_argument", "editing"], fields: ["tool"],
          title: "Unfamiliar type of tool", text: "The tool's data handling and reliability are unknown.", authorities: ["rule:aba-512"] },
        { id: "ungrounded", when: { field: "grounded", notEquals: "yes" }, points: 2, parts: ["research", "memo_argument"], fields: ["grounded"],
          title: "Citations not grounded in a legal database", text: "Tools that aren't grounded in a legal database invent or misstate authority more often.", authorities: ["rule:rpc-1-1", "rule:mata"] },
        { id: "cite-partial", when: { field: "citeCheck", equals: "partial" }, points: 2, parts: ["research", "motion", "memo_argument"], fields: ["citeCheck"],
          title: "Only some citations will be checked", text: "Spot-checks miss invented citations; one is enough for sanctions.", authorities: ["rule:rpc-3-3", "rule:frcp-11", "rule:ma-obc"] },
        { id: "fact-partial", when: { field: "factCheck", equals: "partial" }, points: 2, parts: ["motion", "memo_facts"], fields: ["factCheck"],
          title: "Only some facts will be checked", text: "A misstated fact that slips through is a factual contention you've certified.", authorities: ["rule:rpc-3-3", "rule:frcp-11"] },
        { id: "deadline", when: { field: "deadline", equals: "lt48" }, points: 2, parts: ["research", "motion", "memo_facts", "memo_argument"], fields: ["deadline"],
          title: "Deadline under 48 hours", text: "Time pressure makes it tempting to skip verification.", authorities: ["rule:rpc-1-1", "rule:ma-obc"] },
        { id: "editing-trains", when: { field: "trains", notEquals: "no" }, points: 1, parts: ["editing"], fields: ["trains"],
          title: "Editing in a tool that may train on your text", text: "Proofreading exposes the full text of the motion to the tool.", authorities: ["rule:rpc-1-6"] }
      ],
      // Safeguard gaps: count toward raising the overall level one step.
      safeguards: [
        { id: "no-policy", when: { field: "policy", equals: "no" }, points: 1, fields: ["policy"],
          title: "No firm AI policy", text: "Without a policy there's no agreed standard for which tools and uses are allowed.", authorities: ["rule:rpc-5-1", "rule:aba-512"] },
        { id: "policy-unsure", when: { field: "policy", equals: "notsure" }, points: 1, fields: ["policy"],
          title: "Unsure about the firm's AI policy", text: "You may be using a tool or a use your firm doesn't allow.", authorities: ["rule:rpc-5-1"] },
        { id: "no-consent", when: { all: [{ field: "consent", in: ["no", "notsure"] }, { field: "info", includesAny: ["confidential", "privileged", "sealed", "thirdparty"] }] }, points: 2, fields: ["consent", "info"],
          title: "Client not informed, with client information going in", text: "Clients should know before their information goes into an AI tool, and how its use will be billed.", authorities: ["rule:rpc-1-4", "rule:rpc-1-6", "rule:aba-512"] },
        { id: "consent-gap", when: { all: [{ field: "consent", in: ["no", "notsure"] }, { field: "info", excludesAll: ["confidential", "privileged", "sealed", "thirdparty"] }] }, points: 1, fields: ["consent"],
          title: "Client not informed", text: "Even without client information, clients may expect to hear how AI is used and billed.", authorities: ["rule:rpc-1-4", "rule:rpc-1-5"] },
        { id: "unfamiliar", when: { field: "familiarity", equals: "not" }, points: 2, fields: ["familiarity"],
          title: "Not familiar with the tool", text: "Competence includes knowing the tool's limits before relying on it.", authorities: ["rule:rpc-1-1", "rule:aba-512"] },
        { id: "somewhat-familiar", when: { field: "familiarity", equals: "somewhat" }, points: 1, fields: ["familiarity"],
          title: "Only somewhat familiar with the tool", text: "Learn how the tool fails before relying on it for client work.", authorities: ["rule:rpc-1-1"] }
      ],
      // Suggestions, shown in this order when their condition holds.
      // when.hard / when.factor / when.safeguard = that rule was triggered.
      suggestions: [
        { when: { hard: "confidential-data" }, text: "Switch to a tool that doesn't train on or retain your inputs (confirmed in its contract) before entering client information, or enter only public or fully anonymized material." },
        { when: { hard: "no-citation-check" }, text: "Don't use AI for legal research or argument until an attorney will check every citation against Westlaw, Lexis or official reporters." },
        { when: { hard: "no-fact-check" }, text: "Don't use AI for the statement of facts unless an attorney will check every fact against the record." },
        { when: { hard: "sworn-statements" }, text: "Draft affidavits and declarations from the witness's own knowledge. Use AI only to format or proofread text an attorney has written." },
        { when: { lowParts: true }, text: "" },  // generated: "Use AI only for ..."
        { when: { factor: "ungrounded" }, text: "For research and argument, use a tool grounded in a legal database, and pull and read every source yourself." },
        { when: { factor: "cite-partial" }, text: "Check every citation and quotation, not a sample: pull it, read it, confirm the pincite and check negative history." },
        { when: { factor: "fact-partial" }, text: "Check every factual statement against the record: exhibits, transcripts and affidavits." },
        { when: { any: [{ factor: "dispositive" }, { factor: "novel" }] }, text: "On a dispositive motion or a novel issue, keep the legal argument attorney-written and use AI for research leads only." },
        { when: { factor: "consumer-tool" }, text: "Use an enterprise or legal-specific tool whose terms confirm it doesn't train on your inputs." },
        { when: { factor: "deadline" }, text: "Block out time for verification before the deadline. If there isn't time, limit AI to the low-risk parts." },
        { when: { any: [{ safeguard: "no-policy" }, { safeguard: "policy-unsure" }] }, text: "Confirm your firm's AI policy, or ask for one, before using AI on client work." },
        { when: { any: [{ safeguard: "no-consent" }, { safeguard: "consent-gap" }] }, text: "Tell the client how AI will be used and billed, and get consent before entering their information." },
        { when: { any: [{ safeguard: "unfamiliar" }, { safeguard: "somewhat-familiar" }] }, text: "Try the tool on a non-client task first to learn how it fails: invented citations, outdated law, misread facts." }
      ],
      lowPartsText: { some: "Use AI only for {parts} until you've addressed the other risks.", all: "Every part you selected is lower-risk. AI can help with {parts}, with the checks below." },
      // Candidate answer changes for "What would lower your risk". Unchangeable facts
      // (court, motion, dispositive, issue, deadline) are deliberately left out.
      fixes: [
        { id: "safe-tool", label: "Use a tool that doesn't train on or retain your inputs", set: { trains: "no", retains: "no" } },
        { id: "public-only", label: "Enter only public or fully anonymized information", set: { info: ["public"] } },
        { id: "check-citations", label: "Have an attorney check every citation", set: { citeCheck: "yes" } },
        { id: "check-facts", label: "Have an attorney check every fact against the record", set: { factCheck: "yes" } },
        { id: "grounded-tool", label: "Use a tool whose citations are grounded in a legal database", set: { grounded: "yes" } },
        { id: "no-affidavits", label: "Keep AI out of affidavits and declarations", removeParts: ["affidavits"] },
        { id: "no-argument", label: "Write the legal argument yourself", removeParts: ["memo_argument"] },
        { id: "no-facts", label: "Write the statement of facts yourself", removeParts: ["memo_facts"] },
        { id: "enterprise-tool", label: "Switch from a consumer tool to an enterprise or legal-specific tool", set: { tool: "enterprise" }, onlyIf: { field: "tool", equals: "consumer" } },
        { id: "policy", label: "Confirm your firm's AI policy", set: { policy: "yes" } },
        { id: "consent", label: "Inform the client and get consent", set: { consent: "yes" } },
        { id: "learn-tool", label: "Get familiar with the tool on non-client work first", set: { familiarity: "very" } }
      ],
      checklist: [
        "Check the judge's standing orders and the local rules for AI disclosure or certification requirements.",
        "Verify every citation and quotation against Westlaw, Lexis or the official reporter.",
        "Verify every fact against the record.",
        "Remove or anonymize confidential information before it goes into any tool.",
        "Confirm your firm's AI policy and your communication with the client.",
        "Keep a record of AI use: tool, date, what went in, what came out and how it was checked."
      ],
      courtNotes: {
        superior: "Superior Court motions follow Superior Court Rule 9A.",
        dmass: "D. Mass. motions follow Local Rule 7.1, including the conferral certificate."
      }
    },

    /* ========================================================================
       COMPARE YOUR OPTIONS (optional choice matrix). The "framing" below is
       filled in from the questionnaire answers (engine.framingFromAnswers).
       ====================================================================== */
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
