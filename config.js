/* ============================================================================
   Motion Advisor: assessment and Options Report configuration
   ----------------------------------------------------------------------------
   Every question, answer score, section weight, threshold, automatic stop and
   Options Report rule lives in this one file. engine.js applies them; no AI
   model runs at runtime, so the same answers always give the same result.

   HOW SCORING WORKS
   - Each answer has a score (0 = no added risk). A section's points are the sum
     of its answers' scores; its maximum is the sum of each question's highest
     score. Section level: ratio < 0.34 Low, < 0.6 Moderate, otherwise High.
   - Risk index (0-100) = sum(points x weight) / sum(max x weight) x 100.
     Confidentiality and Verification weigh 1.5x (they outweigh convenience,
     per the project plan); the rest 1x.
   - Verdict: index <= 30 "Recommended with safeguards"; 31-55 "Use with
     limits"; > 55 "Not recommended". Any automatic stop forces "Not
     recommended" whatever the score.
   Values marked REVIEW are judgment calls for a qualified person to confirm.
   ========================================================================== */
(function (root) {
  "use strict";

  var CONFIG = {
    version: "2026-11-18",

    assessment: {
      levelCuts: { moderate: 0.34, high: 0.6 },          // section ratio thresholds  REVIEW
      verdicts: [                                          // checked in order
        { max: 30, verdict: "Recommended with safeguards", cls: "ok",
          summary: "Your setup supports using AI for this task. Keep the workflow and checklist below; a low result never removes the need for full attorney review." },
        { max: 55, verdict: "Use with limits", cls: "warn",
          summary: "AI can help, but only on the narrower parts of this motion. Close the moderate- and high-risk gaps first." },
        { max: 100, verdict: "Not recommended", cls: "bad",
          summary: "The combined risk is too high for this motion right now. Draft without AI, or fix the high-risk areas and reassess." }
      ],
      stopVerdict: { verdict: "Not recommended", cls: "bad",
        summary: "One or more answers trigger an automatic stop. Fix the items below before using AI on this motion, whatever the overall score." },

      /* Automatic stops: force "Not recommended" regardless of score. */
      stops: [
        { id: "no-cite-check", when: { field: "citeCheck", equals: "none" },
          text: "No citation-checking process. Every AI-assisted filing needs one (Fed. R. Civ. P. 11; Rule 3.3)." },
        { id: "no-final-review", when: { field: "finalReview", equals: "none" },
          text: "No final review before filing. The signing attorney must review the whole motion." },
        { id: "client-info-unsafe-tool", when: { all: [{ field: "clientInfo", in: ["limited", "substantial", "unsure"] }, { field: "tool", in: ["consumer", "unsure"] }] },
          text: "Client information would go into a consumer or unknown tool (Rule 1.6)." },
        { id: "client-info-no-safeguards", when: { all: [{ field: "clientInfo", in: ["limited", "substantial"] }, { field: "safeguards", equals: "none" }] },
          text: "Client information would be entered with no data-protection protocols in place." },
        { id: "privileged-no-client", when: { all: [{ field: "clientInfo", equals: "substantial" }, { field: "informed", equals: "no" }] },
          text: "Privileged information would be entered without telling the client (ABA Op. 512; Rule 1.4)." },
        { id: "court-restricts", when: { field: "standing", equals: "restricts" },
          text: "The court restricts or prohibits AI-drafted filings." }
      ],

      /* Rules behind each section (linked from the Options Report). */
      authorities: {
        task: ["rule:rpc-1-1", "rule:mata"],
        conf: ["rule:rpc-1-6", "rule:aba-512"],
        comp: ["rule:rpc-1-1", "rule:aba-512"],
        verify: ["rule:rpc-3-3", "rule:frcp-11", "rule:rpc-5-1"],
        juris: ["rule:standing-orders", "rule:frcp-11"],
        client: ["rule:rpc-1-4", "rule:rpc-1-5", "rule:aba-512"]
      },

      /* Sections, questions, answer scores and the note shown for each answer.
         Sources: Model Rules 1.1 (cmt. 8), 1.4, 1.5, 1.6, 3.3, 5.1, 5.3; ABA Formal
         Opinion 512; Fed. R. Civ. P. 11; Mass. R. Civ. P. 11; sanction cases (Mata,
         Park, Smith v. Farwell). Scores are the developer's judgments.  REVIEW */
      sections: [
 {id:"task",title:"Task",weight:1,qs:[
  {id:"motionType",type:"select",text:"What kind of motion are you drafting?",why:"Dispositive and emergency motions carry higher stakes and denser legal argument, so an error costs more and is harder to catch.",options:[
    {v:"routine",label:"Routine or procedural (extension, continuance, pro hac vice)",score:0,note:"Routine procedural motions are short and formulaic, which keeps AI risk low."},
    {v:"discovery",label:"Discovery (compel, protective order)",score:1,note:"Discovery motions rely on specific record facts and conferral history that AI cannot know."},
    {v:"pleading",label:"Pleading-stage (dismiss, amend, strike)",score:2,note:"Pleading-stage motions turn on legal standards where fabricated or outdated authority is a real risk."},
    {v:"dispositive",label:"Dispositive (summary judgment, judgment on the pleadings)",score:3,note:"Dispositive motions can end a client’s case; every authority and record cite must be exact."},
    {v:"emergency",label:"Emergency or injunctive (TRO, preliminary injunction)",score:3,note:"Emergency motions combine high stakes with time pressure, the condition under which verification gets skipped."},
    {v:"post",label:"Post-trial (new trial, relief from judgment)",score:3,note:"Post-trial motions have strict deadlines and preservation rules that AI frequently misstates."}]},
  /* Select all that apply. SCORING RULE (multi: "max"): the question scores as the
     single riskiest task selected. Conservative on purpose: adding low-risk tasks
     next to a high-risk one never lowers the score, and one high-risk task is
     enough to call for full verification (Rule 1.1 cmt. 8; Fed. R. Civ. P. 11).  REVIEW */
  {id:"aiTask",type:"multi",multi:"max",hint:"Select all that apply",text:"Which part of the motion would AI help with?",why:"AI is far more reliable at structure and language than at finding law. The closer the task is to legal research, the more verification it needs. Each task you select is assessed, and the riskiest one sets the score for this question.",options:[
    {v:"format",label:"Formatting, templates, proofreading",hint:"No legal substance generated",score:0,note:"Formatting and proofreading keep AI away from legal substance."},
    {v:"outline",label:"Outlining or organizing my own arguments",score:1,note:"Outlining your own arguments is low risk if you supply the authorities."},
    {v:"summarize",label:"Summarizing record or discovery materials I provide",score:2,note:"Summaries of client materials raise confidentiality issues and can misstate facts."},
    {v:"draft",label:"Drafting argument sections",score:3,note:"Drafted argument sections mix language with legal claims that must each be verified."},
    {v:"research",label:"Finding case law and legal research",hint:"Highest hallucination risk",score:4,note:"Using general AI to find authority is how fabricated citations reach courts."}]},
  /* Example products shown under each option. Edit the "examples" lists as products
     change; "{examples}" in the hint is replaced by the list ("join": "or" puts "or"
     before the last item, "list" uses commas only). Examples don't affect scoring. */
  {id:"tool",type:"choice",text:"What kind of AI tool would you use?",why:"Consumer chatbots may retain or train on what you enter. Legal-specific and enterprise tools usually offer contractual confidentiality and citation grounding. The same product can fall into different categories depending on your plan. Choose based on the version you’d actually use, and check its data and training settings.",options:[
    {v:"legal",label:"Legal-specific or enterprise tool under a firm contract",hint:"No training on inputs; terms reviewed. {examples}",examples:["CoCounsel","Lexis+ AI","Harvey","ChatGPT Enterprise","Claude for Enterprise"],join:"list",score:0,note:"An enterprise or legal-specific tool with reviewed terms is the safest choice."},
    {v:"paid",label:"Paid general tool with data-training turned off",hint:"Paid plans of {examples}, with training on your data switched off in settings",examples:["ChatGPT","Claude","Gemini","Copilot"],join:"or",score:1,note:"A paid general tool with training off reduces, but does not remove, disclosure risk."},
    {v:"consumer",label:"Free consumer chatbot",hint:"Free versions of {examples}",examples:["ChatGPT","Claude","Gemini","Microsoft Copilot"],join:"or",score:3,note:"Free consumer tools may retain prompts and are not grounded in verified legal sources."},
    {v:"unsure",label:"Not sure",score:3,note:"Not knowing the tool’s data terms is itself a risk under Rule 1.6."}]}
 ]},
 {id:"conf",title:"Confidentiality",weight:1.5,qs:[
  {id:"clientInfo",type:"choice",text:"Would client-identifying or privileged information be entered into the tool?",why:"Rule 1.6 requires reasonable efforts to prevent unauthorized disclosure. ABA Formal Opinion 512 says informed client consent is needed before confidential information goes into a self-learning tool.",options:[
    {v:"no",label:"No. Everything will be anonymized or generic",score:0,note:"Anonymized prompts keep confidential information out of the tool."},
    {v:"limited",label:"Yes, limited facts that are necessary to the task",score:2,note:"Even limited client facts in prompts trigger Rule 1.6 duties."},
    {v:"substantial",label:"Yes, substantial privileged facts or strategy",score:4,note:"Privileged facts or strategy in a prompt risk waiver and disclosure."},
    {v:"unsure",label:"Not sure",score:3,note:"Uncertainty about what will be entered needs to be resolved before drafting."}]},
  {id:"safeguards",type:"choice",text:"Do you have security protocols in place to prevent a data breach or disclosure of confidential information?",why:"Reasonable efforts usually mean a written policy, reviewed vendor terms, access controls and staff training (Rules 1.6(c) and 5.3).",options:[
    {v:"policy",label:"Written firm AI policy and reviewed vendor terms",score:0,note:"A written policy plus reviewed vendor terms meets the reasonable-efforts standard."},
    {v:"informal",label:"Informal practices only",score:2,note:"Informal practices are hard to prove and easy to skip under deadline."},
    {v:"none",label:"None yet",score:4,note:"No protocols means no reasonable efforts to show if something goes wrong."}]}
 ]},
 {id:"comp",title:"Competence",weight:1,qs:[
  {id:"familiarity",type:"choice",text:"How familiar are you with AI’s limits: hallucinated cases, outdated law, confident errors?",why:"Comment 8 to Rule 1.1 requires understanding the benefits and risks of the technology you use. ABA 512 applies that to generative AI.",options:[
    {v:"high",label:"Trained and experienced; I know how these tools fail",score:0,note:"You understand the tool’s failure modes."},
    {v:"some",label:"Some familiarity",score:2,note:"Partial familiarity often misses subtler errors like misquoted holdings."},
    {v:"low",label:"Little or none",score:4,note:"Low familiarity with AI limits is a Rule 1.1 competence gap."}],
   // a learning link shown below the options for these answers; it never changes the answer or the score
   learn:{showFor:["some","low"],lead:"New to AI’s limits?",linkText:"Learn how AI tools can go wrong",url:"https://www.ncsc.org/resources-courts/legal-practitioners-guide-ai-hallucinations",ariaLabel:"Learn how AI tools can go wrong (opens in new tab)"}},
  {id:"guidance",type:"choice",text:"Have you read the ABA Formal Opinion 512 or your jurisdiction’s AI guidance?",why:"Guidance differs by bar and court and is changing quickly. Reading it is the baseline for competent use.",options:[
    {v:"yes",label:"Yes",score:0,note:"You have read the governing guidance."},
    {v:"partly",label:"Partly",score:1,note:"Finish reading the guidance before relying on AI for this motion."},
    {v:"no",label:"No",score:2,note:"Read ABA 512 and your bar’s guidance before you start."}],
   // links never change the answer or the score
   textLinks:[
     {match:"ABA Formal Opinion 512",href:"docs/view.html?file=aba-formal-opinion-512.pdf",ariaLabel:"ABA Formal Opinion 512 (opens in new tab)",resume:true},
     {match:"jurisdiction’s AI guidance",href:"https://www.mass.gov/info-details/massachusetts-law-about-artificial-intelligence#government-issued-guidance",icon:"↗",ariaLabel:"Massachusetts government-issued AI guidance (opens in new tab)"}],
   learn:{showFor:["partly","no"],lead:"Haven’t read it yet?",linkText:"See the ABA’s summary of its first AI ethics guidance",url:"https://www.americanbar.org/news/abanews/aba-news-archives/2024/07/aba-issues-first-ethics-guidance-ai-tools/",ariaLabel:"ABA summary of its first AI ethics guidance (opens in new tab)"}}
 ]},
 {id:"verify",title:"Verification",weight:1.5,qs:[
  /* Citation checking: a branching question.
     The user answers "Do you have a process?" (citeProcess) and the follow-ups for that branch.
     The score comes from the internal risk levels in `options`, chosen by `levelRules`
     (first rule that matches wins). The "no-cite-check" automatic stop fires on level "none". */
  {id:"citeCheck",type:"branch",text:"Do you have a process for checking citations?",why:"Every sanction decision on AI citations comes down to this step. Rule 11 and Rule 3.3 make the signer responsible for every authority. A citator (KeyCite or Shepard’s) shows whether a case is still good law.",
   options:[ // internal risk levels (not shown as choices)
    {v:"full",label:"Checks every citation, using a citator",score:0,note:"Full citation verification is in place."},             // = old "Every citation pulled, read, and KeyCited or Shepardized"
    {v:"nocitator",label:"Checks every citation, without a citator",score:4,note:"You check every citation but don’t use a citator (KeyCite or Shepard’s). A case can exist and still be bad law, so this is scored the same as a spot-check."}, // adjustment: same score as a spot-check
    {v:"spot",label:"Spot-checks some citations",score:4,note:"Spot-checking is how fabricated cases slipped through in Mata and Smith v. Farwell."}, // = old "Spot-check some citations"
    {v:"none",label:"No citation-checking process",score:6,note:"Without a citation check, AI drafting should not proceed."}], // = old "No formal process"; triggers the automatic stop
   main:{id:"citeProcess",options:[{v:"yes",label:"Yes"},{v:"no",label:"No"}]},
   follow:{
    yes:[
     {id:"citeMethods",type:"multi",text:"Which methods do you use?",hint:"Select all that apply",options:[
      {v:"keycite",label:"KeyCite (Westlaw)",short:"KeyCite",citator:true},
      {v:"shepards",label:"Shepard’s (Lexis)",short:"Shepard’s",citator:true},
      {v:"pincites",label:"Checking pincites and quotations against the source",short:"pincite and quotation check"},
      {v:"spreadsheet",label:"Tracking citations in a spreadsheet (Excel, Google Sheets)",short:"spreadsheet"},
      {v:"checklist",label:"Notes or a checklist",short:"checklist"},
      {v:"second",label:"A second person reviews the citations",short:"second reviewer"},
      // no longer offered; kept hidden so results saved earlier still load and score the same
      {v:"bcite",label:"BCite (Bloomberg Law)",short:"BCite",citator:true,hidden:true},
      {v:"read",label:"Reading the full opinion for each case",short:"reading each opinion",hidden:true},
      {v:"toolkit",label:"Motion Advisor’s Citation Toolkit",short:"Citation Toolkit",hidden:true},
      {v:"other",label:"Other method",short:"other method",hidden:true},
      // used only when converting results saved before this question branched ("Every citation pulled, read, and KeyCited or Shepardized")
      {v:"legacy",label:"Pulled, read and KeyCited or Shepardized",short:"KeyCite or Shepard’s",citator:true,hidden:true}],
      // a link to the Citation Toolkit's checklist when either of these is selected; it never changes the answer or the score
      learn:{showFor:["pincites","spreadsheet"],lead:"Keep track as you check:",linkText:"Use Motion Advisor’s Citation Checklist",url:"index.html#citations",ariaLabel:"Motion Advisor’s Citation Checklist, in the Citation Toolkit (opens in new tab)"}},
     {id:"citeScope",type:"choice",text:"How many citations do you check?",options:[
      {v:"every",label:"Every citation",short:"Every citation"},
      {v:"some",label:"Some citations (spot-check)",short:"Some citations (spot-check)"}]}],
    no:[
     {id:"citeIdeas",type:"choice",text:"Would you like some ideas for checking citations?",options:[
      {v:"yes",label:"Yes, show me ideas"},
      {v:"no",label:"No, continue"}]}]},
   // Wanting ideas never changes the score or removes the stop.
   levelRules:[
    {when:{field:"citeProcess",equals:"no"},level:"none"},
    {when:{all:[{field:"citeProcess",equals:"yes"},{field:"citeScope",equals:"some"}]},level:"spot"},
    {when:{all:[{field:"citeProcess",equals:"yes"},{field:"citeScope",equals:"every"},{field:"citeMethods",hasNone:["keycite","shepards","bcite","legacy"]}]},level:"nocitator"},
    {when:{all:[{field:"citeProcess",equals:"yes"},{field:"citeScope",equals:"every"}]},level:"full"}],
   // results saved before the question branched
   legacy:{full:{citeProcess:"yes",citeMethods:["legacy"],citeScope:"every"},spot:{citeProcess:"yes",citeMethods:["legacy"],citeScope:"some"},none:{citeProcess:"no",citeIdeas:"no"}},
   ideas:{title:"Ideas for checking citations",items:[
    {text:"Pull and read every case you cite; don’t rely on summaries or AI descriptions."},
    {text:"Run each case through KeyCite, Shepard’s or BCite to check that it’s still good law."},
    {text:"Confirm every pincite and quotation matches the source word for word."},
    {text:"Track each citation and its status in a simple spreadsheet."},
    {text:"Have a second person check the citations before filing."},
    {text:"Run your draft through Motion Advisor’s Citation Toolkit to pull out every citation.",link:{match:"Citation Toolkit",href:"index.html#citations",ariaLabel:"Citation Toolkit (opens in new tab)"}}]}},
  {id:"finalReview",type:"choice",text:"Who does the final review before filing?",why:"The attorney who signs certifies the filing under Rule 11. Supervisors are responsible for work they delegate (Rules 5.1, 5.3).",options:[
    {v:"signer",label:"The signing attorney reviews the entire motion",score:0,note:"The signing attorney reviews the whole filing."},
    {v:"other",label:"Another attorney or supervised staff reviews it",score:2,note:"Review by someone other than the signer still leaves the signer responsible."},
    {v:"none",label:"No formal final review",score:6,note:"No final review means no one stands behind the AI output."}]}
 ]},
 {id:"juris",title:"Jurisdiction",weight:1,qs:[
  {id:"jurisdiction",type:"select",text:"Where will the motion be filed?",why:"Rules on signatures, redaction and AI disclosure vary by court. The result lists the rules for your forum.",options:[
    {v:"ma",label:"Massachusetts state court",score:0,note:"Massachusetts state court."},
    {v:"dmass",label:"U.S. District Court for the District of Massachusetts",score:0,note:"D. Mass. federal court."},
    {v:"fed",label:"Another federal court",score:0,note:"Another federal court."},
    {v:"state",label:"Another state court",score:0,note:"Another state court."}],
   /* Follow-up for Massachusetts state court. The court choice never changes the score. */
   followUp:{showFor:"ma",id:"maCourt",label:"Which Massachusetts court?",placeholder:"Choose a court…",
    options:[ // name: used in sentences ("Check the Superior Court’s rules…")
     {v:"sjc",label:"Supreme Judicial Court",name:"the Supreme Judicial Court",appellate:true},
     {v:"appeals",label:"Appeals Court",name:"the Appeals Court",appellate:true},
     {v:"superior",label:"Superior Court",name:"the Superior Court"},
     {v:"bls",label:"Superior Court – Business Litigation Session",name:"the Business Litigation Session",bls:true},
     {v:"district",label:"District Court",name:"the District Court"},
     {v:"bmc",label:"Boston Municipal Court",name:"the Boston Municipal Court"},
     {v:"housing",label:"Housing Court",name:"the Housing Court"},
     {v:"land",label:"Land Court",name:"the Land Court"},
     {v:"probate",label:"Probate and Family Court",name:"the Probate and Family Court"},
     {v:"juvenile",label:"Juvenile Court",name:"the Juvenile Court"}],
    // shown as soon as Massachusetts state court is chosen
    learn:{lead:"See how Massachusetts courts are approaching AI:",linkText:"SJC Interim Guidelines for Use of Generative AI",url:"https://www.mass.gov/guidance/interim-guidelines-for-use-of-generative-ai",ariaLabel:"SJC Interim Guidelines for Use of Generative AI (opens in new tab)",
      sub:"These guidelines apply to judges and court staff, not attorneys, but they show the courts’ expectations.",
      rule:"Massachusetts Trial Court and SJC interim guidelines on generative AI for judges and court staff; not binding on attorneys, but they show the courts’ expectations."},
    // extra lines in the Jurisdiction explanation
    appellateNote:"Appeals are governed by the Massachusetts Rules of Appellate Procedure, not the Rules of Civil Procedure. Check those rules for filing requirements.",
    bls:{text:"Business Litigation Session judges have shared their views on AI use in litigation in the BLS Bench Notes.",linkText:"BLS Bench Notes: use of artificial intelligence",url:"https://www.mass.gov/info-details/business-litigation-session-bench-notes-miscellaneous",ariaLabel:"BLS Bench Notes on the use of artificial intelligence (opens in new tab)"}}},
  {id:"standing",type:"choice",text:"Does the judge or court have a standing order on AI use?",why:"A growing number of judges require disclosure or certification of AI use, and a few restrict it. A violation can be sanctioned on its own.",options:[
    {v:"none",label:"I checked; there is none",score:0,note:"You have confirmed no standing order applies."},
    {v:"comply",label:"Yes, it requires disclosure or certification, and I will comply",score:1,note:"Add the required AI disclosure or certification to your filing."},
    {v:"unknown",label:"I haven’t checked",score:3,note:"Check the judge’s session page and standing orders before drafting."},
    {v:"restricts",label:"Yes, it restricts or prohibits AI-drafted filings",score:6,note:"The court restricts AI-drafted filings."}]}
 ]},
 {id:"client",title:"Client communication",weight:1,qs:[
  {id:"informed",type:"choice",text:"Has the client been told that AI will be used, and what information it will see?",why:"Rule 1.4 requires explaining matters the client needs to make informed decisions. ABA 512 calls for informed consent before confidential data is entered.",options:[
    {v:"consent",label:"Yes, and the client gave informed consent",score:0,note:"Informed consent is documented."},
    {v:"will",label:"Not yet; I will before drafting",score:1,note:"Get and document consent before any prompt includes client information."},
    {v:"no",label:"No",score:3,note:"The client has not been told about AI use."}]},
  {id:"billing",type:"choice",text:"How will AI-assisted work be billed?",why:"ABA 512 and Rule 1.5: bill actual time spent; do not bill hourly clients for time AI saved, or for learning a general-purpose tool.",options:[
    {v:"actual",label:"Actual time spent, hourly",score:0,note:"Billing actual time complies with Rule 1.5."},
    {v:"flat",label:"Flat or contingent fee, unchanged",score:0,note:"Flat or contingent fees avoid hourly AI billing issues; make sure the fee stays reasonable."},
    {v:"saved",label:"Bill the hours the work would have taken, or charge for learning the tool",score:3,note:"Billing for time AI saved or for learning a general tool is unreasonable under Rule 1.5."},
    {v:"unsure",label:"Not decided",score:1,note:"Decide and disclose AI billing practices before you begin."}]}
 ]}
],

      /* Test scenarios from the project plan's testing section. */
      personas: [
 {name:"Solo practitioner, routine extension",desc:"Paid tool, anonymized, full cite check",a:{motionType:"routine",aiTask:["format"],tool:"paid",clientInfo:"no",safeguards:"informal",familiarity:"high",guidance:"yes",citeProcess:"yes",citeMethods:["keycite","pincites"],citeScope:"every",finalReview:"signer",jurisdiction:"ma",maCourt:"district",standing:"none",informed:"will",billing:"actual"}},
 {name:"Two-lawyer firm, motion to compel",desc:"Legal-specific tool, limited client facts",a:{motionType:"discovery",aiTask:["summarize"],tool:"legal",clientInfo:"limited",safeguards:"policy",familiarity:"some",guidance:"partly",citeProcess:"yes",citeMethods:["shepards","spreadsheet","second"],citeScope:"every",finalReview:"signer",jurisdiction:"dmass",standing:"unknown",informed:"consent",billing:"actual"}},
 {name:"New associate, summary judgment",desc:"Free chatbot, client strategy, spot-checks",a:{motionType:"dispositive",aiTask:["research"],tool:"consumer",clientInfo:"substantial",safeguards:"none",familiarity:"low",guidance:"no",citeProcess:"yes",citeMethods:["pincites"],citeScope:"some",finalReview:"other",jurisdiction:"ma",maCourt:"superior",standing:"unknown",informed:"no",billing:"saved"}}
]
    },

    /* ========================================================================
       DRAFT SCANNER (question "Would client-identifying or privileged information
       be entered into the tool?", shown only for "Not sure").
       Runs entirely in the browser. Nothing is sent anywhere or saved, and the
       scan never changes the score: only the answer the user chooses counts.
       Categories follow Fed. R. Civ. P. 5.2(a) (redacted filings), SJC Rule 1:24
       (personal identifying information in Massachusetts filings) and Mass. R.
       Prof. C. 1.6 (confidentiality).  REVIEW

       HOW TO EDIT THE KEYWORD LISTS ("keywords" below)
       - Matching ignores case and works across line breaks, extra spaces, curly
         quotes and every kind of hyphen or dash.
       - Plurals are matched automatically ("record" also finds "records").
       - End a word with * to match any ending: "diagnos*" finds diagnosis,
         diagnosed and diagnoses.
       - A space or hyphen inside a phrase matches either one, so "work product"
         also finds "work-product" and "work\nproduct".
       ====================================================================== */
    scanner: {
      question: "clientInfo",
      showFor: "unsure",
      /* Shown in this order in the summary. tag = the text label on each highlight. */
      categories: {
        name: { label: "Possible names", one: "possible name", tag: "NAME", group: "person", authorities: ["rule:rpc-1-6", "rule:frcp-5-2"] },
        identifier: { label: "Personal identifiers", one: "personal identifier", tag: "ID", group: "person" },
        financial: { label: "Financial", one: "financial term", tag: "FIN", group: "person", authorities: ["rule:frcp-5-2", "rule:sjc-1-24", "rule:rpc-1-6"],
          explain: "Financial details can identify the client and are often protected." },
        minor: { label: "Minors", one: "minors' information signal", tag: "MINOR", group: "minor" },
        privilege: { label: "Privilege markers", one: "privilege marker", tag: "PRIV", group: "privilege", authorities: ["rule:rpc-1-6", "rule:aba-512"],
          explain: "Suggests privileged or confidential material. Entering it into a tool risks disclosure and waiver." },
        medical: { label: "Medical", one: "medical term", tag: "MED", group: "sensitive", authorities: ["rule:rpc-1-6"],
          explain: "Medical and mental health information is highly sensitive client information." },
        immigration: { label: "Immigration", one: "immigration term", tag: "IMM", group: "sensitive", authorities: ["rule:rpc-1-6"],
          explain: "Immigration status is highly sensitive client information." },
        criminal: { label: "Criminal", one: "criminal-history term", tag: "CRIM", group: "sensitive", authorities: ["rule:rpc-1-6"],
          explain: "Criminal history is sensitive and its use may be restricted." },
        sealed: { label: "Sealed or protected", one: "sealed or protected marker", tag: "SEAL", group: "sensitive", authorities: ["rule:rpc-1-6"],
          explain: "Sealed, impounded or protected material must stay out of AI tools and public filings." }
      },
      keywords: {
        privilege: ["privileged", "confidential", "attorney-client", "attorney work product", "work product", "do not disclose", "do not distribute", "not for distribution",
          "settlement offer", "settlement negotiations", "for settlement purposes", "our strategy", "litigation strategy", "legal strategy", "legal advice", "mental impressions",
          "draft - privileged", "mediation statement"],
        medical: ["medical", "diagnos*", "treatment", "treated", "prescription", "prescribed", "medication", "therapist", "therapy", "psychiatric", "psychiatrist",
          "psychological", "mental health", "mental illness", "HIPAA", "hospital*", "disabilit*", "disabled", "PTSD", "depression", "anxiety disorder", "surgery"],
        immigration: ["immigration status", "immigra*", "undocumented", "visa", "green card", "asylum", "deportation", "deported", "removal proceedings", "DACA", "noncitizen"],
        criminal: ["arrest*", "conviction", "convicted", "criminal record", "criminal history", "probation", "parole", "indictment", "indicted", "CORI", "prior offense"],
        sealed: ["sealed", "impounded", "impoundment", "under seal", "protective order", "confidential pursuant to", "filed under seal"],
        minor: ["minor", "juvenile", "child", "children", "infant", "guardian ad litem", "next friend"],
        financial: ["bank account", "routing number", "credit card", "debit card", "tax return", "salary", "income", "wages", "net worth"]
      },
      /* Pattern rules for identifiers (JavaScript regular expressions). */
      rules: [
        { id: "ssn", cat: "identifier", name: "Social Security number", re: "\\b(?!000|666|9\\d\\d)\\d{3}[- ]\\d{2}[- ]\\d{4}\\b", flags: "g",
          explain: "Looks like a Social Security number. Filings may show only the last four digits.", authorities: ["rule:frcp-5-2", "rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "ssn-labeled", cat: "identifier", name: "Social Security number", re: "\\b(?:SSN|SS#|Social Security(?: No\\.?| Number| #)?)\\s*[:#]?\\s*\\d{9}\\b", flags: "gi",
          explain: "A labelled Social Security number. Filings may show only the last four digits.", authorities: ["rule:frcp-5-2", "rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "tin", cat: "identifier", name: "Taxpayer ID number", re: "\\b(?:EIN|TIN|ITIN|Tax(?:payer)? ID(?:entification)?(?: No\\.?| Number)?)\\s*[:#]?\\s*\\d{2}-?\\d{7}\\b", flags: "gi",
          explain: "Looks like a taxpayer identification number. Filings may show only the last four digits.", authorities: ["rule:frcp-5-2", "rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "dob", cat: "identifier", name: "Date of birth", re: "\\b(?:DOB|D\\.O\\.B\\.|date of birth|birth ?date|born(?: on)?)\\s*[:\\-]?\\s*(?:\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.? \\d{1,2},? \\d{4})", flags: "gi",
          explain: "A full date of birth. Federal filings may show only the year of birth.", authorities: ["rule:frcp-5-2", "rule:rpc-1-6"] },
        { id: "card", cat: "identifier", name: "Card number", re: "\\b(?:\\d[ -]?){12,18}\\d\\b", flags: "g", check: "luhn",
          explain: "Looks like a credit or debit card number. Filings may show only the last four digits.", authorities: ["rule:frcp-5-2", "rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "account", cat: "identifier", name: "Financial account number", re: "\\b(?:account|acct\\.?|a/c|routing)(?: (?:no\\.?|number|#))?\\s*[:#]?\\s*[0-9][0-9 -]{4,20}[0-9]\\b", flags: "gi",
          explain: "Looks like a financial account number. Filings may show only the last four digits.", authorities: ["rule:frcp-5-2", "rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "license", cat: "identifier", name: "Driver's license number", re: "\\b(?:driver'?s? licen[cs]e|DL|license)(?: (?:no\\.?|number|#))?\\s*[:#]?\\s*[A-Z]?\\d{6,9}\\b", flags: "gi",
          explain: "Looks like a driver's license number, a personal identifier in Massachusetts filings.", authorities: ["rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "passport", cat: "identifier", name: "Passport number", re: "\\bpassport(?: (?:no\\.?|number|#))?\\s*[:#]?\\s*[A-Z0-9]{6,9}\\b", flags: "gi",
          explain: "Looks like a passport number, a personal identifier in Massachusetts filings.", authorities: ["rule:sjc-1-24", "rule:rpc-1-6"] },
        { id: "email", cat: "identifier", name: "Email address", re: "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", flags: "gi",
          explain: "An email address can identify the client or a witness.", authorities: ["rule:rpc-1-6"] },
        { id: "phone", cat: "identifier", name: "Phone number", re: "(?:\\+1[ .-]?)?\\(?\\b\\d{3}\\)?[ .-]\\d{3}[ .-]\\d{4}\\b", flags: "g",
          explain: "A phone number can identify the client or a witness.", authorities: ["rule:rpc-1-6"] },
        { id: "address", cat: "identifier", name: "Street address", re: "\\b\\d{1,6}\\s+(?:[A-Z][A-Za-z.'-]*\\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Ter|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Square|Sq)\\b\\.?", flags: "g",
          explain: "A street address can identify the client or a witness.", authorities: ["rule:rpc-1-6"] },
        { id: "minor-age", cat: "minor", name: "Age of a minor", re: "\\b(?:age[d]?\\s+(\\d{1,2})|(\\d{1,2})[- ]years?[- ]old)\\b", flags: "gi", check: "under18",
          explain: "Gives an age under 18. Federal filings may name a minor only by initials.", authorities: ["rule:frcp-5-2", "rule:rpc-1-6"] }
      ],
      keywordExplain: { minor: { name: "Reference to a minor", explain: "Mentions a minor. Federal filings may name a minor only by initials.", authorities: ["rule:frcp-5-2", "rule:rpc-1-6"] } },

      /* ---- Possible names (approximate) ----
         Found by the compromise library running in the browser (people it
         recognizes) plus the patterns below. Words in notNames never count as
         names on their own. */
      names: {
        explain: "Looks like a person's or party's name. Names identify the client, parties and witnesses.",
        honorifics: ["Mr", "Ms", "Mrs", "Miss", "Mx", "Dr", "Judge", "Justice", "Attorney", "Atty", "Hon", "Officer", "Detective", "Det", "Sgt", "Prof", "Professor", "Rev"],
        partyLabels: ["Plaintiff", "Plaintiffs", "Defendant", "Defendants", "Petitioner", "Respondent", "Appellant", "Appellee", "Claimant", "Witness", "Affiant", "Deponent", "Debtor", "Creditor", "Client"],
        notNames: ["Court", "Courts", "Rule", "Rules", "Motion", "Memorandum", "Massachusetts", "Superior", "District", "Federal", "Supreme", "Judicial", "Appeals", "Appellate", "Housing", "Land", "Probate", "Family",
          "Municipal", "Boston", "Commonwealth", "United", "States", "America", "State", "County", "Plaintiff", "Plaintiffs", "Defendant", "Defendants", "Petitioner", "Respondent", "Appellant", "Appellee",
          "Civil", "Criminal", "Procedure", "Evidence", "Professional", "Conduct", "Code", "Act", "Section", "Chapter", "Title", "Article", "Amendment", "Constitution", "Order", "Orders", "Standing", "Local",
          "Judge", "Justice", "Clerk", "Office", "Department", "Docket", "Case", "Cause", "Action", "Complaint", "Answer", "Exhibit", "Exhibits", "Affidavit", "Declaration", "Certificate", "Service", "Conference",
          "Summary", "Judgment", "Dismiss", "Compel", "Strike", "Discovery", "Opposition", "Reply", "Brief", "Notice", "Hearing", "Trial", "Jury", "Proposed", "Statement", "Facts", "Argument", "Conclusion",
          "Introduction", "Background", "Standard", "Review", "Relief", "Request", "Requests", "Interrogatories", "Production", "Documents", "Admissions", "Deposition", "Protective", "Sanctions",
          "Fed", "Mass", "Civ", "Gen", "Laws", "U.S.C", "Stat", "Corp", "Inc", "LLC", "LLP", "Co", "Company", "Bar", "Association", "ABA", "Formal", "Opinion", "Westlaw", "Lexis", "Business", "Litigation", "Session",
          "Honorable", "Esq", "Counsel", "SSN", "DOB", "EIN", "TIN", "BBO", "PTSD", "HIPAA", "CORI", "DACA", "Commonwealth", "Of", "Re", "Ex", "Rel", "Mr", "Ms", "Mrs", "Dr", "Attorney", "Attorneys", "Firm", "Law", "Legal", "Privileged", "Confidential", "Work", "Product",
          "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
          "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "The", "This", "That", "These", "Those", "See", "Id", "Cf", "But", "And", "Or", "In", "On", "Of", "For", "To", "By", "With", "At", "As", "If", "It", "We", "Our", "Your", "Their", "His", "Her"],
        notice: "Name detection is approximate. It may miss some names or flag words that aren't names."
      },

      suggestions: {
        none: "Nothing flagged: no common identifiers, likely names or sensitive keywords were found. This scan can’t catch everything, so review the draft yourself before choosing.",
        names: "Your draft appears to name people. Consider choosing “{limited}”, or anonymize the draft first.",
        identifying: "Your draft appears to contain client-identifying or sensitive information. Consider choosing “{limited}” or “{substantial}”, or anonymize it first.",
        privilege: "Your draft contains privilege or confidentiality markers. Consider choosing “{substantial}”, or remove that material before using AI."
      },
      limits: "This scan catches common patterns, likely names and sensitive keywords. It can miss things and flag false matches. Your own review is still required.",
      privacy: "Your draft is scanned on this device and never uploaded or saved."
    },

    /* ========================================================================
       OPTIONS REPORT (optional): four ways of using AI rated on the same six
       sections, from the same answers.
       For each AI option, "Which part of the motion would AI help with?" is
       re-scored as the option's own task (taskAs) plus every task you selected
       that the option still allows (allows), using the same riskiest-task rule.
       Tasks an option doesn't allow (for example legal research under any option)
       are dropped from that option. Questions in
       notCounted score 0 for that option; questions in halfCounted score half.
       "Draft without AI" is Low on every section: no AI tool is involved.
       ====================================================================== */
    optionsReport: {
      options: [
        { id: "none", name: "Draft without AI", noAI: true, usefulness: 0,
          desc: "You research and write the motion yourself. No AI tool sees any part of it." },
        { id: "format", name: "AI for formatting and proofreading only", taskAs: "format", allows: ["format"], usefulness: 1,
          notCounted: ["citeCheck"],     // proofreading adds no citations  REVIEW
          desc: "AI tidies the layout and catches typos in text you wrote. It adds no law or facts." },
        { id: "organize", name: "AI to organize and summarize your own material", taskAs: "summarize", allows: ["format", "outline", "summarize"], usefulness: 2,
          halfCounted: ["citeCheck"],    // you supply the authorities; AI summaries can still misstate them  REVIEW
          desc: "AI outlines your arguments or summarizes documents you give it. You supply every authority." },
        { id: "draft", name: "AI to draft argument sections (with full verification)", taskAs: "draft", allows: ["format", "outline", "summarize", "draft"], usefulness: 3,
          desc: "AI writes first drafts of argument sections, and you check every citation and fact." }
      ],
      /* Which options each automatic stop blocks. "Draft without AI" is never blocked. */
      blocks: {
        "no-cite-check": ["draft"],                              // REVIEW: format/organize generate no authority
        "no-final-review": ["format", "organize", "draft"],
        "client-info-unsafe-tool": ["format", "organize", "draft"],
        "client-info-no-safeguards": ["format", "organize", "draft"],
        "privileged-no-client": ["format", "organize", "draft"],
        "court-restricts": ["organize", "draft"]                 // REVIEW: assumes formatting is not "AI-drafted"
      },
      /* Overall band for each option's bar (same cut-offs as the verdict). */
      bands: [{ max: 30, label: "Low" }, { max: 55, label: "Moderate" }, { max: 100, label: "High" }],
      weightRange: { min: 0, max: 3, step: 0.5 },
      // Bottom line = the open AI option with the lowest overall risk (ties go to the more
      // helpful one); if even that is High, "Draft without AI".  REVIEW
      bottomLine: "Based on your answers, the safest useful option is:"
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else root.MA_CONFIG = CONFIG;
})(typeof window !== "undefined" ? window : this);
