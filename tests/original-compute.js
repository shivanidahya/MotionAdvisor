/* The scoring code of the AI Drafting Advisor as deployed on Nov 6, 2026 (commit 99659f7),
   kept unchanged so the tests can prove the restored version scores identically. */
const SECTIONS=[
 {id:"task",title:"Task",weight:1,qs:[
  {id:"motionType",type:"select",text:"What kind of motion are you drafting?",why:"Dispositive and emergency motions carry higher stakes and denser legal argument, so an error costs more and is harder to catch.",options:[
    {v:"routine",label:"Routine or procedural (extension, continuance, pro hac vice)",score:0,note:"Routine procedural motions are short and formulaic, which keeps AI risk low."},
    {v:"discovery",label:"Discovery (compel, protective order)",score:1,note:"Discovery motions rely on specific record facts and conferral history that AI cannot know."},
    {v:"pleading",label:"Pleading-stage (dismiss, amend, strike)",score:2,note:"Pleading-stage motions turn on legal standards where fabricated or outdated authority is a real risk."},
    {v:"dispositive",label:"Dispositive (summary judgment, judgment on the pleadings)",score:3,note:"Dispositive motions can end a client’s case; every authority and record cite must be exact."},
    {v:"emergency",label:"Emergency or injunctive (TRO, preliminary injunction)",score:3,note:"Emergency motions combine high stakes with time pressure, the condition under which verification gets skipped."},
    {v:"post",label:"Post-trial (new trial, relief from judgment)",score:3,note:"Post-trial motions have strict deadlines and preservation rules that AI frequently misstates."}]},
  {id:"aiTask",type:"choice",text:"Which part of the motion would AI help with?",why:"AI is far more reliable at structure and language than at finding law. The closer the task is to legal research, the more verification it needs.",options:[
    {v:"format",label:"Formatting, templates, proofreading",hint:"No legal substance generated",score:0,note:"Formatting and proofreading keep AI away from legal substance."},
    {v:"outline",label:"Outlining or organizing my own arguments",score:1,note:"Outlining your own arguments is low risk if you supply the authorities."},
    {v:"summarize",label:"Summarizing record or discovery materials I provide",score:2,note:"Summaries of client materials raise confidentiality issues and can misstate facts."},
    {v:"draft",label:"Drafting argument sections",score:3,note:"Drafted argument sections mix language with legal claims that must each be verified."},
    {v:"research",label:"Finding case law and legal research",hint:"Highest hallucination risk",score:4,note:"Using general AI to find authority is how fabricated citations reach courts."}]},
  {id:"tool",type:"choice",text:"What kind of AI tool would you use?",why:"Consumer chatbots may retain or train on what you enter. Legal-specific and enterprise tools usually offer contractual confidentiality and citation grounding.",options:[
    {v:"legal",label:"Legal-specific or enterprise tool under a firm contract",hint:"No training on inputs; terms reviewed",score:0,note:"An enterprise or legal-specific tool with reviewed terms is the safest choice."},
    {v:"paid",label:"Paid general tool with data-training turned off",score:1,note:"A paid general tool with training off reduces, but does not remove, disclosure risk."},
    {v:"consumer",label:"Free consumer chatbot",score:3,note:"Free consumer tools may retain prompts and are not grounded in verified legal sources."},
    {v:"unsure",label:"Not sure",score:3,note:"Not knowing the tool’s data terms is itself a risk under Rule 1.6."}]}
 ]},
 {id:"conf",title:"Confidentiality",weight:1.5,qs:[
  {id:"clientInfo",type:"choice",text:"Would client-identifying or privileged information be entered into the tool?",why:"Rule 1.6 requires reasonable efforts to prevent unauthorized disclosure. ABA Formal Op. 512 says informed client consent is needed before confidential information goes into a self-learning tool.",options:[
    {v:"no",label:"No. Everything will be anonymized or generic",score:0,note:"Anonymized prompts keep confidential information out of the tool."},
    {v:"limited",label:"Yes, limited facts that are necessary to the task",score:2,note:"Even limited client facts in prompts trigger Rule 1.6 duties."},
    {v:"substantial",label:"Yes, substantial privileged facts or strategy",score:4,note:"Privileged facts or strategy in a prompt risk waiver and disclosure."},
    {v:"unsure",label:"Not sure",score:3,note:"Uncertainty about what will be entered needs to be resolved before drafting."}]},
  {id:"safeguards",type:"choice",text:"What protocols prevent a data breach or disclosure?",why:"Reasonable efforts usually mean a written policy, reviewed vendor terms, access controls and staff training (Rules 1.6(c) and 5.3).",options:[
    {v:"policy",label:"Written firm AI policy and reviewed vendor terms",score:0,note:"A written policy plus reviewed vendor terms meets the reasonable-efforts standard."},
    {v:"informal",label:"Informal practices only",score:2,note:"Informal practices are hard to prove and easy to skip under deadline."},
    {v:"none",label:"None yet",score:4,note:"No protocols means no reasonable efforts to show if something goes wrong."}]}
 ]},
 {id:"comp",title:"Competence",weight:1,qs:[
  {id:"familiarity",type:"choice",text:"How familiar are you with AI’s limits: hallucinated cases, outdated law, confident errors?",why:"Comment 8 to Rule 1.1 requires understanding the benefits and risks of the technology you use. ABA 512 applies that to generative AI.",options:[
    {v:"high",label:"Trained and experienced; I know how these tools fail",score:0,note:"You understand the tool’s failure modes."},
    {v:"some",label:"Some familiarity",score:2,note:"Partial familiarity often misses subtler errors like misquoted holdings."},
    {v:"low",label:"Little or none",score:4,note:"Low familiarity with AI limits is a Rule 1.1 competence gap."}]},
  {id:"guidance",type:"choice",text:"Have you read ABA Formal Op. 512 and your jurisdiction’s AI guidance?",why:"Guidance differs by bar and court and is changing quickly. Reading it is the baseline for competent use.",options:[
    {v:"yes",label:"Yes",score:0,note:"You have read the governing guidance."},
    {v:"partly",label:"Partly",score:1,note:"Finish reading the guidance before relying on AI for this motion."},
    {v:"no",label:"No",score:2,note:"Read ABA 512 and your bar’s guidance before you start."}]}
 ]},
 {id:"verify",title:"Verification",weight:1.5,qs:[
  {id:"citeCheck",type:"choice",text:"What is your process for checking citations in the motion?",why:"Every sanction decision on AI citations comes down to this step. Rule 11 and Rule 3.3 make the signer responsible for every authority.",options:[
    {v:"full",label:"Every citation pulled, read, and KeyCited or Shepardized",score:0,note:"Full citation verification is in place."},
    {v:"spot",label:"Spot-check some citations",score:4,note:"Spot-checking is how fabricated cases slipped through in Mata and Smith v. Farwell."},
    {v:"none",label:"No formal process",score:6,note:"Without a citation check, AI drafting should not proceed."}]},
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
    {v:"state",label:"Another state court",score:0,note:"Another state court."}]},
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
];
const QUESTIONS=SECTIONS.flatMap(s=>s.qs.map(q=>({...q,sec:s.id})));
const qById=Object.fromEntries(QUESTIONS.map(q=>[q.id,q]));
const optOf=(qid,v)=>qById[qid].options.find(o=>o.v===v);

const PERSONAS=[
 {name:"Solo practitioner, routine extension",desc:"Paid tool, anonymized, full cite check",a:{motionType:"routine",aiTask:"format",tool:"paid",clientInfo:"no",safeguards:"informal",familiarity:"high",guidance:"yes",citeCheck:"full",finalReview:"signer",jurisdiction:"ma",standing:"none",informed:"will",billing:"actual"}},
 {name:"Two-lawyer firm, motion to compel",desc:"Legal-specific tool, limited client facts",a:{motionType:"discovery",aiTask:"summarize",tool:"legal",clientInfo:"limited",safeguards:"policy",familiarity:"some",guidance:"partly",citeCheck:"full",finalReview:"signer",jurisdiction:"dmass",standing:"unknown",informed:"consent",billing:"actual"}},
 {name:"New associate, summary judgment",desc:"Free chatbot, client strategy, spot-checks",a:{motionType:"dispositive",aiTask:"research",tool:"consumer",clientInfo:"substantial",safeguards:"none",familiarity:"low",guidance:"no",citeCheck:"spot",finalReview:"other",jurisdiction:"ma",standing:"unknown",informed:"no",billing:"saved"}}
];

const adv={step:-1,answers:{},ack:false,showErr:false,fromReview:false};
const STEP_REVIEW=SECTIONS.length, STEP_RESULT=SECTIONS.length+1;

function sectionComplete(i){return SECTIONS[i].qs.every(q=>adv.answers[q.id]!=null)}
function allComplete(){return SECTIONS.every((s,i)=>sectionComplete(i))}

function compute(){
  const A=adv.answers; let tot=0,max=0; const factors=[];
  SECTIONS.forEach(s=>{
    let sp=0,sm=0; const notes=[];
    s.qs.forEach(q=>{const o=optOf(q.id,A[q.id]);sp+=o.score;sm+=Math.max(...q.options.map(x=>x.score));notes.push(o.note)});
    tot+=sp*s.weight; max+=sm*s.weight;
    const r=sm?sp/sm:0; const level=r<0.34?"Low":r<0.6?"Moderate":"High";
    factors.push({title:s.title,ratio:r,level,notes:notes.filter((n,i)=>!(s.id==="juris"&&i===0))});
  });
  const index=Math.round(tot/max*100);
  const ov=[];
  if(A.citeCheck==="none")ov.push("No citation-checking process. Every AI-assisted filing needs one (Fed. R. Civ. P. 11; Rule 3.3).");
  if(A.finalReview==="none")ov.push("No final review before filing. The signing attorney must review the whole motion.");
  if(["limited","substantial","unsure"].includes(A.clientInfo)&&["consumer","unsure"].includes(A.tool))ov.push("Client information would go into a consumer or unknown tool (Rule 1.6).");
  if(["limited","substantial"].includes(A.clientInfo)&&A.safeguards==="none")ov.push("Client information would be entered with no data-protection protocols in place.");
  if(A.clientInfo==="substantial"&&A.informed==="no")ov.push("Privileged information would be entered without telling the client (ABA Op. 512; Rule 1.4).");
  if(A.standing==="restricts")ov.push("The court restricts or prohibits AI-drafted filings.");
  let verdict,cls,summary;
  if(ov.length){verdict="Not recommended";cls="bad";summary="One or more answers trigger an automatic stop. Fix the items below before using AI on this motion, whatever the overall score."}
  else if(index<=30){verdict="Recommended with safeguards";cls="ok";summary="Your setup supports using AI for this task. Keep the workflow and checklist below; a low result never removes the need for full attorney review."}
  else if(index<=55){verdict="Use with limits";cls="warn";summary="AI can help, but only on the narrower parts of this motion. Close the moderate- and high-risk gaps first."}
  else{verdict="Not recommended";cls="bad";summary="The combined risk is too high for this motion right now. Draft without AI, or fix the high-risk areas and reassess."}
  return {index,verdict,cls,summary,overrides:ov,factors,date:adv.at?new Date(adv.at):new Date()};
}
;module.exports={compute,adv,SECTIONS,PERSONAS};