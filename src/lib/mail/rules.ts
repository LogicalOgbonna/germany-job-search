import { isHiringSystem } from "./senders";
import type { Classification, MailCategory, RawMail } from "./types";

export type Rule = {
  id: string; // e.g. "rejection.other-candidates"
  category: MailCategory;
  highPrecision: boolean;
  // Every pattern a rule gives must match. A rule without a body pattern is
  // decided by subject and sender alone.
  subject?: RegExp;
  body?: RegExp;
  from?: RegExp;
};

// JavaScript's \b and \w are ASCII-only and break on "für" or "übermittelt",
// so patterns are written with \b and \w and compiled to Unicode-aware forms.
// Line breaks inside a pattern are layout, not part of it; a space that falls
// on a line break is written [ ].
const word = "[\\p{L}\\p{N}_]";
const edge = `(?:(?<=${word})(?!${word})|(?<!${word})(?=${word}))`;
const compile =
  (flags: string) =>
  (source: TemplateStringsArray, ...parts: string[]) =>
    new RegExp(
      String.raw(source, ...parts)
        .replace(/\s*\n\s*/g, "")
        .replaceAll("\\b", edge)
        .replaceAll("\\w", word),
      flags,
    );
const re = compile("iu");
// For the few patterns where case carries meaning: "Sie" is you, "sie" is they.
const exact = compile("u");

type Draft = Omit<Rule, "category" | "highPrecision">;
const group = (
  category: MailCategory,
  highPrecision: boolean,
  drafts: Draft[],
): Rule[] =>
  drafts.map((draft) => ({
    ...draft,
    id: `${category}.${draft.id}`,
    category,
    highPrecision,
  }));
// The same phrase decides whether it stands in the subject or in the body.
const anywhere = (id: string, pattern: RegExp): Draft[] => [
  { id: `${id}.subject`, subject: pattern },
  { id, body: pattern },
];

// A subject that announces news about the application is not a receipt,
// whatever polite opening it also carries ("Application Update - Thank you for applying").
const noNews = String.raw`^(?!.*\b(?:update|feedback|status|decision|results?|rückmeldung|ergebnis|entscheidung)\b)`;
// A subject about the application itself is not settled by a notice word in it
// ("Your application - share your candidate experience"): the body decides.
const notTheApplication = String.raw`^(?!.*\b(?:your (?:job )?application|(?:ihre|deine|ihrer|deiner) bewerbung|update (?:on|to|regarding|about)|application (?:update|status))\b)`;
// An interview that was called off, is being thanked for, or is with a product
// team's researchers is not an invitation to a job interview.
const noAftermath = String.raw`^(?!.*\b(?:cancel\w*|abgesagt|absage|storniert|feedback|experience|follow(?:ing)?[- ]up|rückmeldung|thank\w*|danke?|user|customer|research|usability|podcast|kunden\w*)\b)`;
// "Outcome of your technical test" reports on a test; it does not set one.
const noOutcome = String.raw`^(?!.*\b(?:outcome|results?|feedback|ergebnis\w*|auswertung|completed|thank\w*|danke)\b)`;
// "Online assessment" is also what pension and security vendors sell, so the
// subject has to place it in a hiring process.
const inHiring = String.raw`(?=.*\b(?:application|interview|position|role|candidate|candidacy|next steps?|hiring|recruit\w+|bewerbung\w*|stelle|auswahl\w*)\b)`;
const noSales = String.raw`(?![^.!?]{0,40}\b(?:demo|sales|onboarding|product|webinar|discovery|kick-?off)\b)`;
const meeting = String.raw`(?:\w*termin(?:e|s|en)?|\w*gespräch\w*|interview\w*|call|meeting|treffen|veranstaltung|morgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|woche)`;
// "We will ask you to" describes the process; "we ask you to" is the request.
const invitedBy = String.raw`(?:please|kindly|(?<!will |'ll |would |may |might |then )ask(?:ing)? you to|invit(?:e|ing) you to|like you to|need you to|you(?:'ve| have) been invited to|you are invited to)`;
const task = String.raw`(?:assessment|assignment|(?:take[- ]?home|home|coding|technical|programming|online) (?:challenge|test|task|exercise)|take[- ]?home|test task)`;
const aufgabe = String.raw`(?:\w*aufgabe|coding[- ]challenge|assessment|(?:online-?|einstellungs|eignungs|coding-?)?test|arbeitsprobe)`;
const glad = String.raw`(?:pleased|delighted|happy|excited|thrilled|glad|would like|'d like|want)`;
const keen = String.raw`(?:would like|'d like|would love|'d love|(?:are|am|'m|'re) (?:happy|pleased|delighted|excited|glad)|want(?:ed)?|wish)`;
// The words between "offer you a" and "position" are a job title. An
// interview, a chance or a slot on offer is not a job.
// An article in between starts a new noun phrase ("a deep-dive regarding the role").
const title = String.raw`(?:(?!(?:interview|call|chat|chance|opportunity|slot|first|second|conversation|meeting|discount|trial|place|\w*gespräch|termin|for|to|of|about|in|on|at|with|the|an?|our|your)\b)[\p{L}\p{N}_\-/().,&+]+ ){0,4}`;
// Product teams invite users to "user interviews"; those are not job interviews.
const interview = String.raw`(?<!\b(?:user|customer|research|usability|podcast|press|media) )interview(?! about (?:how you use|your experience with (?:our|the|this))\b)`;
// "Beratungsgespräch" and "Kundengespräch" are sales calls, so only hiring compounds count.
const gespraech = String.raw`(?:vorstellungs|kennenlern|erst|zweit|bewerbungs|video|telefon|fach|team)?gespräch`;
const speech = String.raw`(?:${gespraech}|(?:video|telefon)?interview)`;
const yours = String.raw`(?:Ihre|deine|Ihrer|deiner) (?:\w+ )?(?:bewerbung|kandidatur|unterlagen|bewerbungsunterlagen)`;
const considered = String.raw`nicht (?:weiter |mehr |länger )?(?:berücksichtig\w+|weiterverfolg\w+|weiter verfolg\w+)`;
const filled = String.raw`(?:position (?:has been |was |is )?(?:already )?filled|(?:stelle|position) (?:ist |wurde )?(?:bereits |inzwischen )?(?:besetzt|vergeben))`;

// Priority order: notice, unrelated, rejection, offer, assessment, interview,
// recruiter_question, confirmation. Within a category, high precision first.
export const rules: Rule[] = [
  // Notices are decided by subject and sender only: receipts and rejections
  // routinely carry privacy and survey footers in the body.
  ...group("notice", true, [
    {
      id: "privacy",
      subject: re`\b(?:GDPR|DSGVO|data protection|datenschutz\w*|privacy and compliance|
        privacy (?:notice|notification|policy|information)|
        (?:application|applicant|candidate|personal) data|collected data|
        data (?:consent|retention|deletion|processing|privacy)|consent request|
        (?:bewerber|bewerbungs|personen)daten|personenbezogene\w* daten|
        daten(?:löschung|speicherung|verarbeitung)|einwilligung\w*|
        (?:information|data|profile|daten|profil) (?:has|have|wurden?) (?:been )?(?:deleted|removed|gelöscht))\b`,
    },
    {
      id: "verification",
      subject: re`\b(?:(?:security|verification|confirmation|login|one-time|access) code|
        verify your|confirm your (?:e-?mail|account)|activate your|password|
        (?:sicherheits|bestätigungs|verifizierungs|zugangs)code|
        bestätig\w* (?:sie |du )?(?:bitte )?(?:deine|ihre) e-?mail|e-?mail-?adresse bestätigen|
        passwort|kennwort|konto (?:aktivieren|bestätigen))\b`,
    },
    {
      id: "job-alert",
      subject: re`\bjob[- ]?alert|\bjobalarm|\bjob[- ]?agent\b|\bnew jobs\b|
        \bnew job (?:alert|match|posting|opening)|\bjobs? (?:for you|you (?:may|might)|matching|recommendations?)\b|
        \brecommended jobs?\b|\bjobempfehlung\w*|\b(?:\d+ )?neue (?:jobs|stellen\w*)\b|
        \bpassende (?:jobs|stellen\w*)\b|\bjob-?newsletter\b`,
    },
    // LinkedIn's "viewed" mail says nothing about the stage and arrives days
    // after the application, so it must not stand in as a receipt.
    {
      id: "application-viewed",
      subject: re`\byour application was viewed\b|\bbewerbung wurde (?:angesehen|aufgerufen)\b`,
    },
    {
      id: "incomplete-application",
      subject: re`\bforget to (?:complete|finish|submit)\b|\b(?:incomplete|unfinished) application\b|
        \bbewerbung (?:noch )?(?:nicht abgeschlossen|unvollständig|abschließen|vervollständigen)\b|
        \bunvollständige bewerbung\b`,
    },
    {
      id: "auto-reply",
      subject: re`^(?:re: ?)?(?:automatic (?:reply|response)|auto[- ]?(?:reply|response)|autoreply|
        out of (?:the )?office|abwesenheits\w*|automatische (?:antwort|rückmeldung))\b`,
    },
  ]),
  // These often follow, or are part of, a rejection.
  ...group("notice", false, [
    {
      id: "talent-pool",
      subject: re`${notTheApplication}(?:.*\btalent[- ]?(?:pool|community)\b|.*\b(?:bewerber|kandidaten)pool\b|
        .*\bkeep your (?:information|data|details|profile)\b|
        .*\b(?:deine|ihre) (?:daten|unterlagen) (?:\w+ )?(?:weiterhin |länger )?(?:speichern|aufbewahren|behalten)\b)`,
    },
    {
      id: "survey",
      subject: re`${notTheApplication}.*\b(?:survey|umfrage|we want to know what you think|how did we do|rate your|
        (?:interview|candidate|application|recruiting|hiring) experience|
        your opinion|(?:deine|ihre) meinung|bewerbungserfahrung|
        feedback zu (?:deinem|ihrem|unserem) (?:bewerbungs|recruiting)\w*)\b`,
    },
    {
      id: "portal",
      subject: re`${notTheApplication}.*\b(?:your account\b(?! manager| executive)|log ?in to|sign in to|career portal|
        candidate (?:account|profile|home)|(?:ihr|dein) (?:konto|account|benutzerkonto)|karriereportal|bewerberportal)\b`,
    },
    {
      id: "talent-connect",
      subject: re`^(?:welcome to|willkommen bei)\b`,
      from: re`teamtailor-mail\.com$`,
    },
  ]),

  // Employers on the board are also vendors: their research, event and
  // onboarding invitations are not about a job. These rules only run on mail
  // that never mentions an application.
  ...group("unrelated", true, [
    ...anywhere(
      "product-research",
      re`\b(?:user|customer|ux|usability|market) (?:research|interview|study|testing)\b|
        \b(?:research|feedback) (?:study|session|interview)\b|
        \binterview about (?:how you use|your experience with (?:our|the|this) (?:product|platform|app|service|tool|software))\b`,
    ),
    {
      id: "event.subject",
      subject: re`\b(?:webinar|(?:product|live|platform) demo|demo (?:call|session)|
        product (?:walkthrough|tour|update|news|launch|release)|onboarding (?:team|call|session|webinar|series|tour)|workshop|meetup|office hours|community call|
        newsletter|release notes|changelog|(?:video|call|event|talk|training|webinar) series)\b`,
    },
  ]),

  ...group("rejection", true, [
    // "Absage" alone also cancels appointments, so the application has to be
    // named and no meeting may be.
    {
      id: "absage.subject",
      subject: re`^(?!.*\b${meeting}\b)(?=.*\b(?:bewerbung\w*|stelle|position|kandidatur)\b).*\babsage\b`,
    },
    {
      id: "position-filled.subject",
      subject: re`^(?=.*\b(?:application|candidacy|bewerbung\w*)\b).*\b${filled}\b`,
    },
    ...anywhere(
      "other-candidates",
      re`\b(?:mov(?:e|ed|ing)|proceed(?:ed|ing)?|progress(?:ed|ing)?|go(?:ne|ing)?|went|continu(?:e|ed|ing)|pursu(?:e|ed|ing))[ ]
        (?:forward |ahead |further |on )?(?:with )?(?:other|another|different) (?:\w+ ){0,2}(?:candidates?|applicants?|profiles?)\b|
        \b(?:other|another) (?:\w+ ){0,2}(?:candidates?|applicants?) whose (?:\w+ ){1,4}(?:more closely|better|closer)\b`,
    ),
    ...anywhere(
      "not-moving-forward",
      re`\b(?:not|won't|cannot|can't|unable to|no longer) (?:\w+ ){0,3}?
        (?:mov(?:e|ing)|proceed(?:ing)?|progress(?:ing)?|continu(?:e|ing)|go(?:ing)?|advanc(?:e|ing)|pursu(?:e|ing))[ ]
        (?:forward |ahead |further |on )?
        (?:with (?:your|this) (?:\w+ ){0,2}(?:application|candidacy|candidature|profile)|
        your (?:application|candidacy|candidature)|you to the next (?:stage|step|round|phase))\b|
        \b(?:not|won't|cannot|can't|unable to) (?:\w+ ){0,3}?(?:mov(?:e|ing)|proceed(?:ing)?) forward with you\b|
        \b(?:not|won't|cannot|can't|unable to) (?:\w+ ){0,3}?tak(?:e|ing) your (?:application|candidacy|candidature) (?:any )?(?:further|forward)\b|
        \b(?:will not|won't|are not|aren't|not) be (?:moving|proceeding|going|progressing|continuing) (?:forward|ahead|further)
        (?: with you(?:r)?\b| in (?:the|this|our) (?:\w+ )?(?:process|hiring)\b| at this (?:time|stage|point)\b)`,
    ),
    // "Your application has been" or "was" is this application; "applications
    // are declined", "is rejected after the deadline" and "will be rejected if"
    // are house rules.
    ...anywhere(
      "unsuccessful",
      re`\byour (?:application|candidacy|candidature)\b[^.!?,;:]{0,40}?\b
        (?:(?:has|was)(?: unfortunately)?(?: not|n't)(?: been)? (?:\w+ )?(?:successful|selected|shortlisted)|
        (?:has(?: unfortunately)? been|was)(?: unfortunately)? (?:unsuccessful|rejected|declined))\b|
        \byou (?:have|were|are|'ve)(?: unfortunately)? not (?:been )?(?:selected|shortlisted|chosen)[ ]
        (?:for (?:the|this|an?|our) (?:\w+ ){0,4}(?:position|role|job|interview|stage|round|vacancy)|
        to (?:move|proceed|progress|advance|continue) (?:forward|ahead|further|to the next))\b|
        \b(?:have|had|decided) to (?:reject|decline) your (?:application|candidacy)\b|
        \bhave (?:rejected|declined) your (?:application|candidacy)\b`,
    ),
    {
      id: "different-direction",
      body: re`\b(?:decided|chosen|opted) to (?:go|move|head) in (?:a different|another) direction\b|
        \b(?:are|will be) (?:going|moving) in (?:a different|another) direction\b`,
    },
    {
      id: "cannot-offer",
      body: re`\b(?:unable to|not able to|not be able to|n't be able to|not in a position to|cannot|can't|will not be|won't be)[ ]
        offer(?:ing)? you (?:a|an|the|this)[ ]
        ${title}(?:position|role|job|place)\b|
        \b(?:unable to|not able to|cannot|can't|will not be|won't be|will not|won't|not) (?:invit(?:e|ing)|consider(?:ing)?)[ ]
        you (?:to|for) (?:an? |the |this )?(?:\w+ ){0,2}(?:interview|position|role)\b`,
    },
    ...anywhere(
      "andere-kandidaten",
      re`\bfür (?:eine[nr]? )?(?:andere[nrm]?|weitere[nrm]?) (?:\w+ ){0,2}(?:kandidat\w*|bewerber\w*|mitbewerber\w*|person(?:en)?)\b
        [^.!?]{0,40}\bentsch(?:ie|ei)de[nt]\b|
        \bentsch(?:ie|ei)de[nt]\b[^.!?]{0,60}\bfür (?:eine[nr]? )?andere[nrm]? (?:\w+ ){0,2}(?:kandidat|bewerber|mitbewerber)\w*|
        \bfür (?:jemand|jemanden) anderen entschieden\b|\buns (?:leider )?anders entschieden\b|
        \bgegen (?:(?:deine|ihre) (?:\w+ )?(?:bewerbung|kandidatur)|dich|Sie) entschieden\b`,
    ),
    // Only "Ihre Bewerbung" or "Sie" being passed over is this application:
    // "Bewerbungen von Personalvermittlern werden nicht berücksichtigt" is policy.
    ...anywhere(
      "nicht-beruecksichtigen",
      re`\b${yours}\b[^.!?,;:]{0,60}\b${considered}\b|
        \b(?:${yours}|du|Sie)\b[^.!?,;:]{0,60}\bnicht in die (?:engere (?:aus)?wahl|nächste runde)\b|
        \bmit (?:Ihnen|dir)\b[^.!?,;:]{0,60}\bnicht (?:weiter ?)?(?:fortsetzen|fortführen|verfolgen)\b`,
    ),
    {
      id: "sie-nicht-beruecksichtigen",
      body: exact`\b(?:Sie|[Dd]ich|[Ee]uch) (?:\w+ ){0,5}nicht (?:weiter |mehr |länger )?berücksichtig\w+\b`,
    },
    {
      id: "absage",
      body: re`\b(?:Ihnen|dir|euch) (?:(?!${meeting}\b|für heute\b)\w+ ){0,4}(?:absagen|eine absage (?:erteilen|geben|schicken|senden|mitteilen))\b|
        \b(?:Ihnen|dir|euch)\b[^.!?,;:]{0,60}\b(?:keine positive (?:rückmeldung|nachricht|antwort)|keinen positiven bescheid)\b|
        \b(?:Ihnen|dir) (?:\w+ ){0,3}(?:keine?|keinen) (?:\w+ ){0,2}(?:stelle|position|angebot|zusage)\b[^.!?,;:]{0,30}
        \b(?:anbieten|machen|unterbreiten|geben)\b|
        \b(?:Ihnen|dir) (?:\w+ ){0,3}(?:die |diese )?(?:stelle|position)\b[^.!?,;:]{0,40}\bnicht anbieten\b`,
    },
  ]),
  ...group("rejection", false, [
    // Without the application in the subject this may be a job board's news.
    { id: "position-filled.bare-subject", subject: re`\b${filled}\b` },
    {
      id: "position-filled",
      body: re`\bposition (?:has been |was |is )(?:already |now )?filled\b|\bfilled (?:the|this) (?:position|role)\b|
        \b(?:stelle|position) (?:ist |wurde )(?:\w+ ){0,2}(?:besetzt|vergeben)\b|
        \b(?:stelle|position) (?:\w+ ){0,2}(?:besetzt|vergeben) (?:haben|wurde|ist)\b`,
    },
    {
      id: "another-way",
      body: re`\bfür einen anderen weg entschieden\b|\b(?:go|going|gone|went) in (?:a different|another) direction\b`,
    },
    // LinkedIn words its "not selected" notice this way; the body rules above
    // confirm it when the usual sentence is there.
    {
      id: "linkedin-update",
      subject: re`^your application to .+ at .+`,
      from: re`@linkedin\.com$`,
    },
    {
      id: "regret",
      body: re`\b(?:regret|sorry) to (?:inform|tell|let) you\b|\bleider (?:\w+ ){0,4}mitteilen,? dass\b|
        \b(?:Ihnen|dir) (?:heute )?leider (?:\w+ ){0,3}mitteilen\b|\bbedauern\b[^.!?]{0,40}\bmitteilen\b`,
    },
  ]),

  // "Offer" alone is sales language, so an offer needs the job named with it.
  ...group("offer", true, [
    {
      id: "pleased-to-offer",
      body: re`\b${glad} to (?:formally )?offer you (?:the|a|an|this) ${title}(?:position|role|job)\b|
        \b${glad} to (?:formally )?(?:extend|make) (?:to )?(?:you )?(?:an?|the|our) (?:\w+ )?offer[ ]
        (?:of employment|to join|for the (?:position|role))\b|\boffer you employment\b`,
    },
    {
      id: "vertragsangebot",
      body: re`\b(?:Ihnen|dir) (?:(?!nicht\b|kein)\w+ ){0,4}(?:ein|einen|unser) (?:\w+ )?(?:vertrags|job|arbeits)angebot[ ]
        (?:(?!nicht\b)\w+ ){0,3}(?:unterbreiten|machen|zusenden|zukommen|schicken)\b|
        \b(?:Ihnen|dir) die (?:stelle|position) (?:(?!nicht\b|leider\b)\w+ ){0,8}anbieten\b|
        \b(?:Ihnen|dir) (?:\w+ ){0,3}eine zusage für die (?:stelle|position)\b`,
    },
  ]),
  ...group("offer", false, [
    {
      id: "contract.subject",
      subject: re`\b(?:offer letter|offer of employment|employment offer|contract offer|your (?:employment )?contract|
        job offer from|vertragsangebot|arbeitsvertrag|(?:job|stellen)?zusage)\b`,
    },
    {
      id: "contract",
      body: re`\b(?:offer letter|offer of employment|employment (?:contract|agreement)|arbeitsvertrag|vertragsangebot)\b
        [^.!?]{0,60}\b(?:attached|enclosed|sign|anbei|im anhang|unterschr\w+)\b|
        \b(?:attached|enclosed|anbei|im anhang)\b[^.!?]{0,60}
        \b(?:offer letter|employment (?:contract|agreement)|arbeitsvertrag|vertragsangebot)\b|
        \b(?:Ihnen|dir) (?:\w+ ){0,3}(?:ein angebot (?:unterbreiten|machen)|eine zusage (?:geben|erteilen))\b`,
    },
  ]),

  ...group("assessment", true, [
    {
      id: "test.subject",
      subject: re`${noOutcome}${inHiring}(?:
        .*\b(?:online|coding|technical|skills?|take[- ]?home|home|programming)[- ](?:assessment|test|assignment|task|exercise)\b|
        .*\b(?:assessment (?:invitation|invite|link)|test task|trial task|take[- ]?home (?:challenge|project))\b|
        .*\binvit\w* to (?:take |complete )?(?:the |an? |our |your )?(?:\w+ ){0,2}assessment\b|
        .*\b(?:test|probe|programmier|coding-?|haus)aufgabe\b|
        .*\b(?:arbeitsprobe|online-?test|einstellungstest|eignungstest|online-?assessment)\b)`,
    },
    {
      id: "please-complete",
      body: re`\b${invitedBy}\s+(?:(?!(?:not|never)\b)\w+ ){0,3}?
        (?:complete|take(?! a look| a moment| part| note| care| advantage)|finish|submit|work on|solve|start|return)\b(?! not\b)
        [^.!?]{0,60}\b${task}\b`,
    },
    {
      id: "bitte-bearbeiten",
      body: re`\b(?:bitte|bitten (?:wir )?(?:dich|Sie)|möchten (?:wir )?(?:dich|Sie) bitten)\b[^.!?]{0,60}\b${aufgabe}\b[^.!?]{0,60}
        \b(?:bearbeite\w*|absolvier\w*|löse\w*|lösen|durchführ\w*|durchzuführen|abschließ\w*|abzuschließen|
        einreich\w*|einzureichen|zurücksend\w*|zurückzusenden|zu bearbeiten|zu lösen|zu absolvieren)\b|
        \b(?:bearbeite|bearbeiten Sie|absolviere|absolvieren Sie|löse|lösen Sie)\b[^.!?]{0,60}\b${aufgabe}\b`,
    },
  ]),
  ...group("assessment", false, [
    // Words only hiring uses, in a subject that names no hiring process.
    {
      id: "test.bare-subject",
      subject: re`${noOutcome}(?:.*\b(?:take[- ]?home (?:assignment|challenge|project|task|test)|test task|trial task|
        coding (?:test|assignment)|(?:test|probe|programmier|coding-?|haus)aufgabe|arbeitsprobe|einstellungstest|eignungstest)\b)`,
    },
    // An interview the candidate "completes" is a recorded or automated one.
    // Companies also run public coding challenges, so that word alone is not an invitation.
    {
      id: "challenge.subject",
      subject: re`${noOutcome}(?:.*\b(?:coding|technical|programming|code)[- ]?challenge\b|
        .*\binvit\w* to (?:take |complete )?(?:the |an? |our |your )?(?:\w+ ){0,2}(?:challenge|test)\b)`,
    },
    {
      id: "ai-interview.subject",
      subject: re`\bAI interview\b|\b(?:complete|finish)\b.{0,40}\binterview\b|\b(?:start|take) your (?:\w+ ){0,3}interview\b|
        \b(?:async\w*|one-way|recorded|on-demand) (?:video )?interview\b`,
    },
    {
      id: "questionnaire",
      body: re`\b(?:please|kindly|bitte)\b[^.!?]{0,40}\b(?:complete|fill (?:in|out)|answer|ausfüllen|fülle|füllen Sie|beantworte\w*)\b
        [^.!?]{0,50}\b(?:questionnaire|fragebogen|screening questions|following questions|folgende[n]? fragen)\b`,
    },
    {
      id: "platform",
      from: re`@(?:[a-z0-9.\-]+\.)?(?:testgorilla|codility|hackerrank|codesignal|coderbyte|devskiller|coderpad|hackerearth|testdome|codingame|hirevue)\.`,
    },
  ]),

  ...group("interview", true, [
    {
      id: "invitation.subject",
      subject: re`${noAftermath}(?:
        .*\b(?:invitation|invite|invited|inviting|einladung)\b.{0,60}\b(?:interview|${gespraech})\b|
        .*\binterview (?:invitation|invite|confirmation|confirmed|scheduled|booked|einladung|termin)\b|
        .*\bconfirm(?:ing|ation of|ed)? your (?:\w+ ){0,3}interview\b|
        .*\bschedul(?:e|ed|ing) (?:your |an? |the )?(?:\w+ ){0,4}interview\b|
        .*\b(?:reminder|erinnerung)\b.{0,50}\b(?:interview|${gespraech})\b|
        .*\b(?:appointment|termin) (?:booked|confirmed|scheduled|bestätigt|gebucht)\b.{0,60}\b(?:interview|${gespraech})\b|
        .*\b(?:gesprächs|interview)(?:termin|einladung)\b)`,
    },
    {
      id: "invite-you",
      body: re`\b${keen} to invite you (?:to|for)\b[^.!?]{0,80}\b${interview}\b|
        \b${keen} to (?:schedule|set up|arrange|book) (?:an?|the|your) (?:\w+ ){0,3}${interview}\b|
        \b${glad} to offer you (?:an?|the) (?:\w+ ){0,2}${interview}\b|
        \byou (?:have been|are|'re|'ve been) invited to (?:an?|the|your) (?:\w+[ -]){0,3}${interview}\b|
        \byour (?:\w+ ){0,3}${interview}\b[^.!?]{0,60}\b(?:is|has been) (?:scheduled|confirmed|booked)\b|
        \b(?:have|'ve) scheduled (?:an?|your|the) (?:\w+ ){0,3}${interview}\b`,
    },
    {
      id: "einladen",
      body: re`\b(?:möchten|würden|wollen|dürfen) (?:wir )?(?:Sie|dich|euch) (?:\w+ ){0,4}zu (?:einem|einer|unserem|unserer) (?:\w+ ){0,3}
        ${speech}\b[^.!?]{0,40}\beinladen\b|
        \bladen (?:wir )?(?:Sie|dich) (?:\w+ ){0,3}zu (?:einem|einer|unserem|unserer) (?:\w+ ){0,3}${speech}\b[^.!?]{0,40}\bein\b`,
    },
  ]),
  ...group("interview", false, [
    // A subject that only names an interview may be thanking for it or
    // refusing after it; an invitation to a "call" may be a sales call.
    {
      id: "round.subject",
      subject: re`${noAftermath}(?:(?:video|phone|telephone|technical|virtual|onsite|on-site|final)[- ]interview\b|
        .*\b(?:1st|2nd|3rd|first|second|third|final|next)[- ]round interview\b|
        .*\b(?:your|ihr|dein) (?:(?:next|first|second|third|final|virtual|video|phone|technical|upcoming|onsite|on-site|initial|\w+-round) ){0,3}
        interview (?:with|at|mit|bei)\b|
        .*\b(?:vorstellungs|kennenlern|erst|zweit|bewerbungs|video)gespräch\b|
        .*\b(?:invitation|invite|invited|einladung)\b.{0,60}\b(?:\w*call|telefonat|kennenlernen)\b|
        .*\bterminbestätigung\b|.*\bterminvorschl\w+\b)`,
    },
    {
      id: "invite-call",
      body: re`\b${keen} to invite you (?:to|for)\b${noSales}[^.!?]{0,80}\b(?:\w*call|conversation|chat|meeting)\b|
        \b${keen} to (?:schedule|set up|arrange|book|have) (?:an?|the|your)${noSales} (?:\w+ ){0,3}(?:\w*call|conversation|chat|meeting)\b|
        \b${glad} to offer you (?:a|the) (?:chance|opportunity) to (?:discuss|talk|speak|meet|chat)\b|
        \b(?:möchten|würden|wollen|dürfen) (?:wir )?(?:Sie|dich|euch) (?:\w+ ){0,4}zu (?:einem|einer|unserem|unserer) (?:\w+ ){0,3}
        (?:\w*call|telefonat|termin|austausch|kennenlernen)\b[^.!?]{0,40}\beinladen\b|
        \b(?:Sie|dich) (?:\w+ ){0,2}(?:persönlich |näher )?kennen(?:zu)?lernen\b`,
    },
    {
      id: "scheduling-link",
      body: re`\b(?:calendly\.com|cal\.com/|calendar\.app\.google|savvycal\.com|youcanbook\.me|meetings\.hubspot\.com|zcal\.co|tidycal\.com)`,
    },
    {
      id: "availability",
      body: re`\b(?:share|send|provide|let (?:me|us) know)\b[^.!?]{0,30}\byour availabilit(?:y|ies)\b|
        \bwhen (?:are you|would you be) available for (?:an? )?(?:\w+ )?(?:call|interview|chat|conversation)\b|
        \b(?:terminvorschläge|verfügbarkeit(?:en)?)\b[^.!?]{0,60}\b(?:mitteilen|nennen|schicken|senden)\b|
        \bwann (?:hast du|haben Sie|hättest du|hätten Sie) zeit\b`,
    },
  ]),

  // A question ends in a question mark: "you told us what your salary
  // expectations are" asks nothing, and neither does a copy of the form's
  // answers ("What are your salary expectations? 85000").
  ...group("recruiter_question", true, [
    {
      id: "salary-start",
      body: re`\bwhat (?:are|is|would be|were) your (?:\w+ )?(?:salary|compensation|pay) (?:expectations?|requirements?|range)\b[^.!?]{0,40}\?(?!\s*\d)|
        \b(?:could|can|would) you (?:please )?(?:share|tell (?:me|us)|let (?:me|us) know|confirm|send(?: (?:me|us))?)[ ]
        (?:\w+ ){0,4}?(?:salary|compensation) (?:expectations?|requirements?|range)\b|
        \bwhat is your (?:\w+ )?(?:notice period|earliest (?:possible )?start(?:ing)? date)\b[^.!?]{0,40}\?|
        \bwhen (?:could|can|would) you (?:be able to |be available to )?(?:start|join)(?: with us| working| us| the team)?\s*\?(?!\s*\d)|
        \b(?:wie|was) (?:sind|ist|wären|wäre|lauten|lautet) (?:Ihre|deine) (?:\w+ )?gehaltsvorstellung(?:en)?\b[^.!?]{0,40}\?|
        \b(?:Ihre|deine) (?:\w+ )?gehaltsvorstellung(?:en)?\b[^.!?]{0,60}\b(?:mitteilen|nennen|schicken|verraten|zukommen)\b|
        \bwann (?:könnten|können|könntest|kannst|würden|würdest) (?:Sie|du) (?:\w+ ){0,3}(?:starten|anfangen|beginnen|einsteigen)\s*\?|
        \bwie (?:lang|lange) ist (?:Ihre|deine) kündigungsfrist\b[^.!?]{0,20}\?`,
    },
  ]),
  ...group("recruiter_question", false, [
    {
      id: "question.subject",
      subject: re`\b(?:quick|short|few|some|a couple of) (?:more )?questions?\b|\bquestions? (?:for you|about your|regarding your)\b|
        \b(?:rück|nach)frage\w*\b|\bfragen zu (?:deiner|ihrer) bewerbung\b`,
    },
    {
      id: "request",
      body: re`\b(?:could|can|would) you (?:please |kindly )?(?:let (?:me|us) know|share|send|provide|confirm|tell (?:me|us)|clarify|elaborate)\b|
        \b(?:unless|until) we (?:receive|have|get) your\b|
        \bplease (?:send|provide|share|forward) (?:us |me )?(?:your|an?|the) (?:\w+ ){0,2}
        (?:cv|resume|portfolio|references?|work permit|visa|certificates?|documents?)\b|
        \b(?:könnten|können|könntest|kannst|würden|würdest) (?:Sie|du) (?:uns|mir) (?:\w+ ){0,8}
        (?:mitteilen|zusenden|schicken|senden|nennen|sagen|bestätigen|zukommen lassen)\b|
        \bbitte (?:sende\w*|schicke\w*|teile\w*) (?:Sie )?(?:uns|mir)\b[^.!?]{0,60}
        \b(?:lebenslauf|zeugnisse?|unterlagen|portfolio|arbeitserlaubnis|referenzen)\b`,
    },
  ]),

  // "Thank you for your application" also opens most rejections, so it only
  // counts in the subject; in the body a receipt has to say it was received.
  ...group("confirmation", true, [
    {
      id: "thanks.subject",
      subject: re`${noNews}.*\bthank(?:s| you)(?: so much| very much)?,? for[ ]
        (?:applying|your? (?:job )?application|submitting your application)\b`,
    },
    {
      id: "received.subject",
      subject: re`${noNews}(?:.*\b(?:received|got|gotten) your (?:\w+ ){0,3}(?:application|resume|cv)\b|
        .*\bapplication (?:has been |was |is )?(?:successfully )?(?:received|submitted|sent|confirmed)\b|
        .*\bapplication (?:to|for) .{1,120}? (?:successfully submitted|(?:position )?confirmed)\b|
        .*\byour application (?:is in|has landed)\b|
        .*\b(?:confirmation of (?:receipt of )?your application|application confirmation|receipt of your application)\b|
        .*\bsubmitting your application\b)`,
    },
    {
      id: "danke.subject",
      subject: re`${noNews}.*\b(?:(?:vielen|herzlichen|besten) dank|danke) für (?:deine|ihre|die|eure) (?:\w+ )?bewerbung\b`,
    },
    {
      id: "eingang.subject",
      subject: re`${noNews}(?:.*\beingang (?:deiner|ihrer|der) bewerbung\b|.*\beingangsbestätigung\b|.*\bbewerbungseingang\b|
        .*\bbewerbung\b.{0,80}\b(?:erhalten|eingegangen|angekommen|übermittelt|eingereicht|abgeschickt)\b)`,
    },
    {
      id: "received",
      body: re`\b(?:we(?:'ve| have)?|have|has) (?:successfully |just |now )?(?:received|got|gotten) your (?:\w+ ){0,3}
        (?:application|resume|cv)\b|
        \byour application (?:(?:for|to|as|at|with) [^.!?]{1,120}? )?(?:has been|was) (?:successfully )?(?:received|submitted|sent)\b`,
    },
    {
      id: "erhalten",
      body: re`\b(?:wir haben|haben wir) (?:deine|ihre|eure) (?:\w+ )?(?:bewerbung|bewerbungsunterlagen)\b[^.!?]{0,80}\berhalten\b|
        \b(?:deine|ihre) (?:bewerbung|bewerbungsunterlagen) (?:ist|sind) (?:\w+ ){0,3}(?:eingegangen|angekommen)\b|
        \b(?:eingang|erhalt) (?:deiner|ihrer) (?:bewerbung|bewerbungsunterlagen)\b`,
    },
    // Banks and landlords also "receive your documents", so the subject has to
    // be about an application.
    {
      id: "documents",
      subject: re`${noNews}.*\b(?:bewerbung|application|applying|applied)\b`,
      body: re`\b(?:we(?:'ve| have)?|have|has) (?:successfully |just |now )?(?:received|got) your documents\b|
        \b(?:wir haben|haben wir) (?:deine|ihre|eure) unterlagen\b[^.!?]{0,80}\berhalten\b|
        \b(?:deine|ihre) unterlagen sind (?:\w+ ){0,3}(?:eingegangen|angekommen)\b`,
    },
  ]),
];

// One character for one, so positions stay valid in the original.
const tidy = (text: string) =>
  text
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u00A0\u2007\u202F]/g, " ")
    .replace(/[\u2013\u2014]/g, "-");
const replyHeader =
  /(?:^|\s)On (?=.{0,200}?\d).{5,200}? wrote:|(?:^|\s)Am (?=.{0,200}?\d).{5,200}? schrieb .{0,200}?:|-{2,} ?(?:Original Message|Ursprüngliche Nachricht|Forwarded message) ?-{2,}|\sFrom: .{3,120}? Sent: |\sVon: .{3,120}? Gesendet: /s;
const quoteMark = /^[ \t]*>[ \t>]*/;
// "1. Wir prüfen" is a list item; "31. Oktober" is a date that a hard wrap put
// at the start of a line.
const listItem =
  /^(?:[-*•][ \t]|\d{1,2}[.)][ \t]+(?!(?:jan|feb|mär|mar|apr|mai|may|jun|jul|aug|sep|okt|oct|nov|dez|dec)))/i;
// The mail as the rules read it: the part the sender wrote, in running text.
// - Plain-text mail is hard-wrapped at about 72 columns, so a line break is a
//   space. A blank line ends a sentence, and so does a list item that follows
//   a finished line.
// - History quoted with ">" is dropped; a mail that is nothing but a quotation
//   (a bare forward) is read as the quotation.
// - Everything from a reply header ("On ... wrote:") on is dropped.
// `at` maps each position back to the mail as written, so that quotes can be
// cut from it.
function read(original: string) {
  const source = tidy(original);
  const lines: [number, string][] = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    lines.push([offset, line]);
    offset += line.length + 1;
  }
  const bare = lines.every(([, line]) => !line.trim() || quoteMark.test(line));
  let at: number[] = [];
  let text = "";
  let apart = true; // a blank or dropped line lies before this one
  let closed = true; // the line before ended a sentence or was a list item
  for (const [start, line] of lines) {
    const mark = quoteMark.exec(line)?.[0].length ?? 0;
    const content = (mark && !bare ? "" : line.slice(mark)).trim();
    if (!content) {
      apart = true;
      continue;
    }
    const from = start + line.indexOf(content, mark);
    const item: boolean = closed && listItem.test(content);
    if (text) {
      text += apart || item ? "\n" : " ";
      at.push(from);
    }
    for (let index = 0; index < content.length; index++) {
      const blank = content[index] === " " || content[index] === "\t";
      if (blank && text.endsWith(" ")) continue;
      text += blank ? " " : content[index];
      at.push(from + index);
    }
    apart = false;
    closed = item || /[.!?:;]$/.test(content);
  }
  at.push(source.length);
  const header = replyHeader.exec(text);
  if (header && text.slice(0, header.index).trim())
    text = text.slice(0, header.index);
  else if (header) {
    // Nothing above the header: the mail is the forwarded text.
    const skip = header.index + header[0].length;
    text = text.slice(skip);
    at = at.slice(skip);
  }
  return { text, at };
}
// The body with quoted reply history removed, in running text.
export function freshBody(text: string): string {
  return read(text).text.trim();
}
const fresh = freshBody;

type Span = [number, number];
// A full stop after a one- or two-digit number is a German date ("21. Oktober"),
// not the end of a sentence.
const sentenceEnd =
  /(?<=[!?])\s+|(?<=(?<!\b\d{1,2}|\b(?:Dr|Mr|Mrs|Ms|Nr|No|bzw|ca|inkl|ggf|usw|etc|vs|z\.B|e\.g|i\.e|d\.h|u\.a))\.)\s+(?=["'(]?[A-ZÄÖÜ0-9])|\s*\n\s*/gu;
function sentences(text: string) {
  const spans: Span[] = [];
  let start = 0;
  for (const end of text.matchAll(sentenceEnd)) {
    spans.push([start, end.index]);
    start = end.index + end[0].length;
  }
  spans.push([start, text.length]);
  return spans;
}

// A rule may only fire on a sentence that states the thing itself. Policy,
// footers and forecasts say what would happen: "if you have not heard from
// us ...", "we may move forward with other candidates", "... after your
// application has been rejected", "... unless we receive your work permit".
const outcomes = new Set<MailCategory>(["rejection", "offer"]);
const requests = new Set<MailCategory>([
  "assessment",
  "interview",
  "recruiter_question",
]);
// "Auch wenn uns Ihr Profil gefallen hat, müssen wir ..." concedes and then
// states. Without the comma the phrase is still inside the "even if".
const concession = re`\b(?:auch wenn|selbst wenn|even if|even though)\b[^,]*,`;
const condition = re`\b(?:if|whether|unless|in case|in the event|should|assuming|falls|sofern|wenn|ob|sollte[nst]?|
  für den fall|im falle?)\b`;
// German also says "if" by putting the verb first: "Entscheiden wir uns für
// einen anderen Bewerber, werden Ihre Daten gelöscht."
const verbFirst = exact`^(?:\d{1,2}[.)] )?(?:[\p{L}\- ]{2,30}: )?(?:Entscheiden|Wird|Werden|Müssen|Muss|Sollten?|Kommt|Kommen|Passt|Passen|
  Erhalten|Hören|Können|Kann|Ist|Sind|Liegt|Fehlt|Fehlen) (?:wir|Sie|Ihre|Ihr|deine|dein|du|es|uns|die|das|der)\b`;
// Lower case only: "May" is a month.
const possibility = /\b(?:may|might)\b/;
// The phrase is the clause these words open: "after your application has been rejected".
const subordinate = re`\b(?:after|once|when|whenever|as soon as|while|nachdem|sobald|bevor|solange|
  the (?:date|day|time|moment))(?:\s+[^\s,;:]+){0,2}\s*$`;
const conditionAfter = re`\b(?:if|unless|until|otherwise|whether|in case|as long as|when|once(?! again| more)|without|falls|sofern|wenn|solange|
  sobald|bis|ohne|andernfalls|ansonsten|sonst|es sei denn)\b`;
// A request that waits for something is a description of the process.
const later = re`\b(?:as soon as|once(?! again| more)|sobald|nachdem|after (?:we|our|the team))\b`;
// House rules and habits, whoever they are addressed to.
const general = re`\b(?:please note|usually|typically|normally|generally|sometimes|often|as a rule|in (?:that|this) case|in such cases|
  reserve the right|possibly|perhaps|which means|what to expect|bitte beachten|grundsätzlich|in der regel|normalerweise|
  üblicherweise|manchmal|in (?:diesem|dem) fall|in solchen fällen|behalten uns vor|möglicherweise|eventuell)\b`;
// What follows these is a new thought, so a condition there governs something else.
const turn = re`\b(?:but|however|although|though|even though|even if|aber|jedoch|allerdings|obwohl|auch wenn)\b|
  [,;]\s*(?:and|und|doch)\b|\band (?:we|will|would|wish|hope|encourage|thank)\b|
  \bund (?:wir|wünschen|werden|bedanken|hoffen)\b|\s-\s`;
// A meeting that is cancelled or moved, and a refusal that comes with an
// invitation, are not rejections.
const moved = re`\b(?:\w*termin(?:e|s|en)?|verschieb\w*|verleg\w*|reschedul\w*|postpon\w*|krank|sick|unwell)\b`;
const counterOffer = re`\b(?:but|however|instead|aber|jedoch|allerdings|stattdessen)\b[^.!?]{0,80}
  \b(?:interview|invit\w+|einladen|\w*gespräch|kennenlernen)\b`;
function stated(
  category: MailCategory,
  sentence: string,
  from: number,
  to: number,
) {
  const request = requests.has(category);
  if (!request && !outcomes.has(category)) return true;
  const before = sentence.slice(0, from).replace(concession, "");
  if (condition.test(before) || possibility.test(before)) return false;
  if (general.test(sentence) || verbFirst.test(sentence)) return false;
  if (request) return !later.test(sentence.slice(to).split(turn)[0]);
  // A question states nothing: "Your application was unsuccessful? Ask us why."
  if (sentence.endsWith("?")) return false;
  if (subordinate.test(before) || /\b(?:without|ohne)\b/i.test(before))
    return false;
  // From the start of the phrase: "... Sie ohne Arbeitserlaubnis nicht berücksichtigen".
  if (conditionAfter.test(sentence.slice(from).split(turn)[0])) return false;
  return (
    category !== "rejection" ||
    !(moved.test(sentence) || counterOffer.test(sentence))
  );
}

// Words that mean a mail is more than a receipt even when it reads like one.
// "Unfortunately we cannot answer every applicant" is the one harmless use.
const badNews = re`\bunfortunately\b(?![^.!?]{0,160}\b(?:volume|number of applica\w+|individual\w*|personal\w*|every\w*|each|feedback|respond|reply|answer)\b)|
  \bleider\b(?![^.!?]{0,160}\b(?:vielzahl|anzahl|jede[rnms]?|einzeln\w*|individuell\w*|persönlich\w*|feedback|antworten)\b)|
  \b(?:regret\w*|bedauer\w*|future endeavou?rs|careful (?:consideration|review)|sorgfältiger (?:prüfung|überlegung)|
  different direction|anderen weg|anders entschieden|jemand(?:en)? anderen|on hold|afraid)\b|
  \b(?:best|luck|success)\b[^.!?]{0,40}\b(?:job )?search\b|
  \b(?:erfolg|gute)\b[^.!?]{0,40}\b(?:weiteren|beruflichen|jobsuche|stellensuche)\b`;
// Wording of a decision the rules above may not know. Stated plainly in the
// body, it means a receipt subject or a notice subject is not the whole story.
const decision = re`\b(?:not (?:be )?able to offer|unable to offer|(?:cannot|can't|won't) offer|
  (?:does|do)(?: not|n't) (?:quite |fully )?(?:match|fit|meet)|not (?:a|the) (?:right |good |strong )?(?:fit|match)|
  chosen (?:a|another|someone)|
  (?:role|position|vacancy) (?:has been|was|is) (?:closed|filled|cancelled|canceled|put on hold)|
  withdraw\w* (?:the|our|your) (?:invitation|offer)|(?:have|need) to cancel|
  nicht in die engere (?:aus)?wahl|anderen (?:kandidat|bewerber)\w*)\b`;
// A subject or a sender alone does not settle these when the body carries bad news.
const swayed = new Set<MailCategory>([
  "offer",
  "assessment",
  "interview",
  "recruiter_question",
]);
// Mail that mentions none of these is not about a job application.
const hiringWords = re`\b(?:application|applied|applying|candidate|candidacy|position|role|job|vacancy|hiring|recruit\w+|
  career|cv|resume|challenge|assessment|take[- ]?home|(?:interview|selection) process|our process|
  (?:next|last|final) (?:step|stage|round)|bewerbung\w*|beworben|stelle|kandidat\w*|lebenslauf|auswahlverfahren|
  (?:unserem|unseren|im) prozess|(?:letzte[rnm]?|nächste[rnm]?) (?:schritt|runde))\b`;

// Flats, study places, visas, credit, bank accounts and conference talks are
// "applied for" in the same words as jobs. They are recognised here and filed
// as unrelated so that they are never sent on to the fallback. A subject may
// name the kind; a body has to say whose application it is, because job mail
// mentions visas, flats and loan products in passing.
const otherSubject = re`\b(?:wohnungsbewerbung|wohnungsbesichtigung\w*|besichtigungstermin\w*|mietvertrag\w*|mietobjekt|wg-zimmer|
  mieterselbstauskunft|wohnungsanfrage|visa application|visumantrag|aufenthaltstitel|studienplatz\w*|immatrikulation\w*|
  zulassungsbescheid|admissions? (?:office|decision)|kontoeröffnung\w*|account opening|kreditantrag\w*|kreditkartenantrag\w*|
  darlehensantrag\w*|call for (?:papers|proposals|speakers)|talk proposal|speaker application|oauth verification)\b|
  \b(?:bewerbung|anfrage|absage|zusage)\b.{0,40}\bwohnung\b|\bwohnung\b.{0,40}\b(?:bewerbung|absage|zusage|besichtigung)\b`;
const otherApplication = re`\bwohnungsbewerbung\b|\bmieterselbstauskunft\b|
  \bbewerbung (?:für|um|auf) (?:die|eine|unsere|diese) (?:\w+ )?wohnung\b|
  \b(?:application|applying|applied|apply) for (?:the|an?|your|our) (?:apartment|flat|room)\b|
  \byour (?:apartment|flat|rental|tenancy|loan|mortgage|credit card|visa) application (?:has|was|is)\b|
  \b(?:Ihr|Ihren|dein|deinen) (?:kreditantrag|kreditkartenantrag|darlehensantrag|visumantrag)\b|
  \b(?:Ihre|deine) kontoeröffnung\b|
  \b(?:application|applying|applied|apply) for (?:the|an?|your|our) (?:[\p{L}\p{N}\-]+ ){0,3}(?:account|credit card|loan|mortgage|visa)
  (?=\s*(?:[.,!?;:]|$|with\b|at\b|from\b|has\b|is\b|was\b))|
  \b(?:application|applying|applied|apply) to speak\b|\b(?:your|received your) talk proposal\b|
  \bcall for (?:papers|proposals|speakers)\b|\bfor oauth verification\b`;

function everywhere(pattern: RegExp) {
  return new RegExp(pattern, `${pattern.flags}g`);
}
// The sentence a rule matched, or null when no match states the thing itself.
function sentenceOf(
  category: MailCategory,
  pattern: RegExp,
  text: string,
  spans: Span[],
): Span | null {
  for (const found of text.matchAll(everywhere(pattern))) {
    const span = spans.find(([, to]) => to > found.index) ?? [0, text.length];
    const from = found.index - span[0];
    const to = from + found[0].length;
    // A phrase does not run on into the next sentence.
    if (found.index + found[0].length > span[1]) continue;
    if (stated(category, text.slice(...span), from, to)) return span;
  }
  return null;
}

// First matching rule in priority order, or null when no rule decides.
export function classifyByRules(mail: RawMail): Classification | null {
  const none = { evidenceQuote: null, nextStep: null, deadline: null };
  if (mail.fromMe)
    return {
      category: "unrelated",
      confidence: "high",
      decidedBy: "from-me",
      ...none,
      ...extractDetails(mail, "unrelated"),
    };
  const subject = tidy(mail.subject);
  const { text: body, at } = read(mail.bodyText);
  if (
    otherSubject.test(subject) ||
    otherApplication.test(subject) ||
    otherApplication.test(body)
  )
    return {
      category: "unrelated",
      confidence: "high",
      decidedBy: "other-application",
      ...none,
      company: null,
      role: null,
    };
  const spans = sentences(body);
  const whole: Span[] = [[0, subject.length]];
  const says = (category: MailCategory, pattern: RegExp) =>
    sentenceOf(category, pattern, body, spans);
  const decided = says("rejection", decision) !== null;
  const calm = !decided && !badNews.test(body);
  const hiring =
    isHiringSystem(mail.fromAddress) || hiringWords.test(`${subject} ${body}`);
  // Bulk mail from outside a hiring system is marketing until a person says otherwise.
  const bulk = mail.bulk === true && !isHiringSystem(mail.fromAddress);
  let notice: Classification | null = null;
  for (const rule of rules) {
    const { category } = rule;
    // A notice is decided by its subject, so the body may still overrule it.
    if (notice && !(category === "rejection" && rule.body)) continue;
    if (category === "unrelated" && hiring) continue;
    if (
      !calm &&
      (category === "confirmation" || (!rule.body && swayed.has(category)))
    )
      continue;
    if (!rule.subject && !rule.body && !rule.from) continue;
    if (rule.from && !rule.from.test(mail.fromAddress)) continue;
    if (rule.subject && !sentenceOf(category, rule.subject, subject, whole))
      continue;
    const found = rule.body && says(category, rule.body);
    if (rule.body && !found) continue;
    // A refusal and an invitation in one mail: the rules cannot tell which holds.
    if (
      category === "rejection" &&
      found &&
      rules.some(
        (other) =>
          other.highPrecision &&
          other.body &&
          (requests.has(other.category) || other.category === "offer") &&
          says(other.category, other.body),
      )
    )
      return null;
    const quote = found
      ? mail.bodyText
          .slice(at[found[0]], at[found[1]])
          .replace(/\n[ \t]*>[ \t>]*/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300)
      : mail.subject.trim();
    const capped = bulk && (requests.has(category) || category === "offer");
    const result: Classification = {
      category,
      confidence: rule.highPrecision && !capped ? "high" : "medium",
      decidedBy: rule.id,
      evidenceQuote: quote,
      ...extractDetails(mail, category),
    };
    if (category !== "notice") return result;
    notice = result;
  }
  // A notice subject over a body that states a decision no rule knows.
  return decided ? null : notice;
}

const genders =
  /\s*\((?:(?:[mwfdxn]\s*[/|]\s*){1,2}[mwfdxn*]|all genders|all|gn|m\/w\/divers)\)/gi;
const roleWord = re`\b(?:engineer(?!ing)\w*|developer\w*|entwickler\w*|programmer\w*|architect\w*|designer\w*|manager\w*|lead|
  specialist|consultant|analyst|scientist|intern|werkstudent\w*|devops|expert|berater\w*|leiter\w*|praktikant\w*|trainee|
  head of|director|officer|administrator|tester|full[- ]?stack|front[- ]?end|back[- ]?end)\b`;
// Words that show a subject fragment is wording, not a company name.
const filler = re`\b(?:appl\w+|bewerbung\w*|thank\w*|danke?|interview\w*|\w*gespräch|update\w*|feedback|invitation|einladung|
  reminder|erinnerung|confirm\w*|bestätigung|received|erhalten|position|questions?|frage\w*|action|required|next|steps?|
  welcome|willkommen|offer|angebot|assessment|opportunity|your|you|we|deine?|ihre?|wir|re|fwd?|aw|wg|important|wichtig|
  hello|hi|hallo|regarding|rejection|absage|notification|privacy|gdpr|dsgvo|talent|account|konto|code|job|career|karriere|
  letter|team|round|runde|office|automatic|appointment|request|status|results?|submitted|eingang\w*|rückmeldung|news|
  filled|message|nachricht|process|let's|lets|talk|great|good|congratulations|glückwunsch)\b`;
const about = String.raw`(?:application|applying|applied|bewerbung|beworben|interview|candidacy)`;
const aboutWord = re`\b${about}\b`;
const article = String.raw`(?:an?\s+|the\s+|our\s+|die\s+|der\s+|eine[nr]?\s+)?`;
// Greedy on the role, so "Product Engineer at AI Music Video Generator at neural frames" ends on the employer.
const roleAtCompany = re`\b${about}\b.*?\b(?:as|als|for|für|to)\s+${article}(?<role>.+)(?:\s+(?<by>at|bei|with)\s+|\s+@\s*)(?<company>.+)$`;
const leadingRole = re`^(?<role>[^|:]+)\s+(?:at|bei|@)\s+(?<company>[^|:]+?)(?:\s+-\s+.*)?$`;
const roleAfter = [
  re`\b${about}\b.*?\b(?:as|als)\s+${article}(?<role>.+)$`,
  re`\b${about}\b.*?\b(?:for|für|to)\s+${article}(?<role>.+)$`,
  re`\b(?:role|position|stelle) (?:of|as|als)\s+(?<role>.+)$`,
];
const companyAfter = new RegExp(
  re`\b(?:(?:appl(?:ication|ying|ied)|bewerbung|interest(?:ed)?|process|interview|experience|data)
    (?:\s+(?:to|at|bei|with|in|for)\s+|\s*@\s*)|(?:update|thank you|notification|news)\s+from\s+|
    application was (?:sent to|viewed by)\s+)(?:join(?:ing)?\s+)?(?<company>.+)$`,
  "giu",
);
const companyBefore = [
  re`(?:^|,\s*)(?<company>[^,|:]+?) (?:has |have )?received your application\b`,
  re`^(?<company>[^|:]+?) application (?:update|status|results|received|next steps|confirmation)\b`,
  re`^(?<company>[^|:]+?) interview (?:confirmation|invitation)\b`,
];
// Case matters here: "Your Tesla application", but not "your job application".
const yourCompany =
  /\b[Yy]our ((?:[A-Z0-9][\p{L}\p{N}&.\-]*)(?: [A-Z0-9][\p{L}\p{N}&.\-]*){0,2}) [Aa]pplication\b/u;
const bilingual =
  /\s+\/{1,2}\s+(?=(?:your|deine|ihre|thank|thanks|vielen|danke|bewerbung)\b)/i;

// In running text a title is the run of capitalised words: "Senior Frontend
// Engineer" in "... Senior Frontend Engineer and your interest in Acme".
const titleWord = String.raw`(?:[\p{Lu}\p{N}(][\p{L}\p{N}_\-/().,&+]*|[-/&])`;
const titleRun = new RegExp(`^(?:${titleWord}(?: |$))+`, "u");
function cleanRole(text: string | undefined, strict = false) {
  const stripped = (text ?? "")
    .replace(genders, "")
    .replace(/^(?:the|an?|our|die|der|eine[nr]?)\s+/i, "")
    .replace(/^(?:role|position|stelle) (?:of|as|als)\s+/i, "");
  const title = (strict ? (titleRun.exec(stripped)?.[0] ?? "") : stripped)
    .split(
      /\s+(?:position|role|stelle)\b|\s+(?:at|bei|with|mit)\s+|\s*@|\s*\|/i,
    )[0]
    .replace(/\s+/g, " ")
    .replace(/[\s\-,;:!.]+$/, "")
    .trim();
  return title.length >= 3 && title.length <= 120 && roleWord.test(title)
    ? title
    : null;
}
// `strict` is for running text, where a name has no clear end.
function cleanCompany(text: string | undefined, strict = false) {
  const name = (text ?? "")
    .replace(genders, "")
    .replace(/^(?:the|join(?:ing)?)\s+/i, "")
    .split(
      /\s+(?:-|\/\/|for|as|als|für|on|regarding|about|is|was|has|successfully)\s+|\s+(?:erhalten|eingegangen|angekommen)\b|\s*[|(!?,;:~]|\s+@/i,
    )[0]
    .split(
      strict ? /\s+(?:and|und|but|aber|we|wir|which|that|dass)\s+/i : "|",
    )[0]
    .replace(/'s\s.*$/, "")
    .replace(/[\s.]+$/, "")
    .trim();
  if (name.length < 2 || name.length > 50 || roleWord.test(name)) return null;
  if (/^(?:applying|us|you|our|the|this|an?|your)\b/i.test(name)) return null;
  if (strict && (name.split(" ").length > 4 || !/^[\p{Lu}\p{N}]/u.test(name)))
    return null;
  return name;
}
const isName = (text: string) =>
  text.length >= 2 &&
  text.length <= 40 &&
  text.split(" ").length <= 4 &&
  !filler.test(text) &&
  !roleWord.test(text);

function phrases(text: string, strict: boolean) {
  let company: string | null = null;
  const both = roleAtCompany.exec(text)?.groups;
  let role = cleanRole(both?.role, strict);
  if (
    both &&
    (role || /^(?:position|role|job|stelle|opening)$/i.test(both.role)) &&
    (both.by?.toLowerCase() !== "with" || /interview/i.test(text))
  )
    company = cleanCompany(both.company, strict);
  if (!role && !strict) {
    const lead = leadingRole.exec(text)?.groups;
    if (lead && !filler.test(lead.role) && cleanRole(lead.role)) {
      role = cleanRole(lead.role);
      company = cleanCompany(lead.company);
    }
  }
  for (const pattern of roleAfter)
    role ??= cleanRole(pattern.exec(text)?.groups?.role, strict);
  // The capture runs to the end of the text, so a phrase that turns out not
  // to name a company must not hide a later one.
  companyAfter.lastIndex = 0;
  for (let found; !company && (found = companyAfter.exec(text));) {
    company = cleanCompany(found.groups!.company, strict);
    companyAfter.lastIndex = found.index + 1;
  }
  return { company, role };
}

// A role named only in the body: "the Product Designer opening", "der Stelle
// Backend-Entwickler", "join us as our new Office Manager". Case-sensitive,
// because in running text only the capitals mark where a title starts and ends.
const run = `(?<role>(?:${titleWord} ){0,5}${titleWord})`;
const rolesInText = [
  String.raw`\b(?:[Tt]he|[Oo]ur|[Dd]er|[Dd]ie|[Uu]nsere[rn]?) ${run} (?:position|role|opening|vacancy|job)\b`,
  String.raw`\b(?:[Rr]ole|[Pp]osition|[Jj]ob|Stelle) (?:of|as|als) (?:an? |the |eine[rn]? )?${run}`,
  String.raw`\b(?:Stelle|Position) ${run}`,
  String.raw`\b[Aa]ls (?:unsere[rn]? |neue[rn]? |eine[rn]? )*${run}`,
  String.raw`\b(?:join (?:us|our team|the team)|start(?:ing)?|work(?:ing)?|you) as (?:our |an? |the )?(?:new |next )?${run}`,
].map((source) => new RegExp(source.replaceAll("\\b", edge), "u"));

// "Hi Arinze," and "Ogbonna, thank you ..." name the candidate, not an employer.
const greeting =
  /^\W{0,3}(?:hi|hello|hey|dear|hallo|liebe[rs]?|guten (?:tag|morgen)|moin|servus|sehr geehrte[rs]?)\s+(?:(?:herr|frau|mr|ms|mrs)\.?\s+)?(\p{L}+)(?:\s+(\p{L}+))?/iu;
function named(mail: RawMail) {
  // Enpal separates the parts of its subjects with a lone "l".
  const subject = tidy(mail.subject)
    .replace(/\s+l\s+/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
  const halves = subject.split(bilingual);
  let { company, role } = phrases(halves[0], false);
  for (const half of halves.slice(1)) {
    const other = phrases(half, false);
    company ??= other.company;
    role ??= other.role;
  }
  for (const pattern of companyBefore) {
    const before = cleanCompany(pattern.exec(halves[0])?.groups?.company);
    if (!company && before && isName(before)) company = before;
  }
  const yours = cleanCompany(yourCompany.exec(subject)?.[1]);
  if (!company && yours && isName(yours)) company = yours;

  // "Langdock | Thank you ...", "We received your application | plancraft".
  const bars = subject.split(/\s*\|\s*/).map((part) => part.trim());
  const parts = subject.split(/\s*\|\s*|\s+(?:-|\/\/)\s+|\s*:\s+/).map((part) =>
    part
      .replace(genders, "")
      .replace(/[\s!.]+$/, "")
      .trim(),
  );
  if (parts.length > 1) {
    const last = parts.at(-1)!;
    const tail = leadingRole.exec(last)?.groups;
    if (!company && tail && !filler.test(tail.role) && cleanRole(tail.role)) {
      role ??= cleanRole(tail.role);
      company = cleanCompany(tail.company);
    }
    const sender = `${mail.fromAddress} ${mail.fromName}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const key = last.toLowerCase().replace(/[^a-z0-9]/g, "");
    // A name after a dash is usually part of the job title, so it counts only
    // when the sender confirms it: "... (Frontend) - Revolut" from revolut.com.
    company ??= isName(parts[0])
      ? parts[0]
      : isName(last) &&
          (bars.length > 1 || (key.length >= 4 && sender.includes(key)))
        ? last
        : null;
    role ??= cleanRole(
      [...bars.slice(1), ...parts].find(
        (part) => roleWord.test(part) && !filler.test(part),
      ),
    );
  }
  if (!company || !role) {
    const body = fresh(mail.bodyText).slice(0, 1500);
    const lines = sentences(body).map(([start, end]) =>
      body.slice(start, end).replace(/[\s.]+$/, ""),
    );
    for (const sentence of lines) {
      if (!aboutWord.test(sentence)) continue;
      const found = phrases(sentence, true);
      company ??= found.company;
      role ??= found.role;
    }
    // Only a phrase that holds a job-kind word counts, so "als Unternehmen"
    // and "the Berlin position" give no role.
    for (const sentence of lines)
      for (const pattern of rolesInText)
        role ??= cleanRole(pattern.exec(sentence)?.groups?.role, true);
  }
  const addressed = [
    ...(greeting.exec(mail.bodyText)?.slice(1) ?? []),
    /^(\p{L}+),\s/u.exec(subject)?.[1],
  ].map((name) => name?.toLowerCase());
  if (company && addressed.includes(company.toLowerCase())) company = null;
  // "Software Engineer (Frontend) - Revolut", "Jobgether (Senior Frontend Engineer)".
  if (company && role) {
    const [title, name] = [role.toLowerCase(), company.toLowerCase()];
    if (title.endsWith(name)) role = cleanRole(role.slice(0, -name.length));
    else if (title.startsWith(name))
      role = cleanRole(
        role
          .slice(name.length)
          .replace(/^[\s~:-]+/, "")
          .replace(/^\((.*)\)$/, "$1"),
      );
  }
  return { company, role };
}

// Only these categories ask something of the candidate, so only they carry a
// next step and a deadline.
const cues: Partial<Record<MailCategory, RegExp>> = {
  assessment: re`\b(?:assessment|assignment|challenge|\w*test|task|exercise|case study|questionnaire|\w*aufgabe|fallstudie|
    arbeitsprobe|fragebogen)\b`,
  interview: re`\b(?:interview|\w*gespräch|call|meeting|termin\w*|kennenlernen|availabilit\w+|schedule|book|slot|invit\w+|
    einladen|einladung)\b`,
  offer: re`\b(?:offer|contract|\w*angebot|\w*vertrag|zusage|sign|unterschr\w+)\b`,
  recruiter_question: re`\?|\b(?:let (?:me|us) know|could you|can you|please (?:send|share|provide|confirm)|mitteilen|
    zusenden|schicken|nennen)\b`,
};
// A date the employer sets for itself ("we will reply by Friday") is not the candidate's deadline.
const theirs = re`\b(?:we(?:'ll| will| would| aim| expect| try| can| should| shall)?|wir|our team|unser team)\b[^.!?]{0,40}
  \b(?:get back|respond|reply|review|be in touch|contact|come back|let you know|melden|rückmeldung|antworten|prüfen|sichten)\b|
  \bhear (?:back )?from\b|\bvon uns hören\b|\bhören (?:\w+ )?von uns\b`;

const monthNames =
  "jan(?:uary|uar)?|feb(?:ruary|ruar)?|mar(?:ch)?|märz?|maerz|apr(?:il)?|may|mai|jun[ei]?|jul[yi]?|aug(?:ust)?|sep(?:t(?:ember)?)?|o[ck]t(?:ober)?|nov(?:ember)?|de[cz](?:ember)?";
const monthStarts = "ja f mar|mär|mae ap may|mai jun jul au s o n d".split(" ");
const monthIndex = (name: string) =>
  monthStarts.findIndex((start) => new RegExp(`^(?:${start})`, "i").test(name));
const weekday =
  "(?:(?:mon|tue|wed|thu|fri|sat|sun|mo|di|mi|do|fr|sa|so)[a-zä]*\\.?,?\\s+)?";
const by = new RegExp(
  `\\b(?:by|until|till|(?<!not )before|no later than|due(?: on| by)?|deadline(?: is| of|:)?|bis(?: zum| spätestens(?: zum| am)?)?|spätestens(?: am| bis(?: zum)?)?|frist(?: ist| bis)?:?)\\s+(?:(?:end of day|eod|close of business|cob),?\\s+)?(?:(?:on|the|den|dem)\\s+)?${weekday}(?:the\\s+|den\\s+|dem\\s+)?`,
  "giu",
);
const calendarAt = new RegExp(`@\\s+${weekday}`, "giu");
// Position is the value: "a week" is 1, "zwei Wochen" is 2.
const numberWords = [
  "a|an|one|ein|eine|einer|einem",
  "two|zwei",
  "three|drei",
  "four|vier",
  "five|fünf",
  "six|sechs",
  "seven|sieben",
  "eight|acht",
  "nine|neun",
  "ten|zehn",
];
const amount = `(\\d{1,3}|${numberWords.join("|")})\\s+(business |working |werk|arbeits)?(hours?|stunden?|days?|tage?n?|weeks?|wochen?)(?![\\p{L}])`;
// "You have 7 days to finish" is a deadline; "you have 30 days of holiday" is not.
const within = [
  `(?:within|in the next|innerhalb(?: von| der nächsten)?|binnen|in den nächsten)\\s+(?:the next\\s+)?${amount}`,
  `(?:you(?:'ll| will)? have|du hast|Sie haben)\\s+${amount}(?=\\s+(?:to|zeit|um)(?![\\p{L}]))`,
].map((source) => new RegExp(`(?<![\\p{L}])${source}`, "iu"));
const dayMs = 86_400_000;
const utcDay = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

// Null for an impossible date and for a date without a year that already
// passed and is not plausibly next year's.
function calendarDate(
  day: number,
  month: number,
  year: string | undefined,
  base: Date,
) {
  const build = (fullYear: number) => {
    const date = new Date(Date.UTC(fullYear, month, day));
    return date.getUTCMonth() === month && date.getUTCDate() === day
      ? date
      : null;
  };
  if (month < 0 || month > 11) return null;
  if (year)
    return build(year.length === 2 ? 2000 + Number(year) : Number(year));
  const today = utcDay(base);
  const thisYear = build(today.getUTCFullYear());
  if (thisYear && thisYear >= today) return thisYear;
  const nextYear = build(today.getUTCFullYear() + 1);
  return nextYear && +nextYear - +today <= 183 * dayMs ? nextYear : null;
}
function dateAt(text: string, base: Date) {
  let found: RegExpExecArray | null;
  if ((found = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(text)))
    return calendarDate(+found[3], +found[2] - 1, found[1], base);
  if (
    (found =
      /^(\d{1,2})\.\s?(\d{1,2})\.(?:(\d{4}|\d{2})|\s(\d{4}))?(?!\d)/.exec(text))
  )
    return calendarDate(+found[1], +found[2] - 1, found[3] ?? found[4], base);
  // 03/04/2027 is March in one country and April in another.
  if ((found = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/.exec(text))) {
    const [first, second] = [+found[1], +found[2]];
    if (first > 12 && second <= 12)
      return calendarDate(first, second - 1, found[3], base);
    if (second > 12 && first <= 12)
      return calendarDate(second, first - 1, found[3], base);
    return null;
  }
  if (
    (found = new RegExp(
      `^(\\d{1,2})(?:st|nd|rd|th|\\.)?\\s+(?:of\\s+)?(${monthNames})(?![\\p{L}])\\.?(?:,?\\s+(\\d{4}))?`,
      "iu",
    ).exec(text))
  )
    return calendarDate(+found[1], monthIndex(found[2]), found[3], base);
  if (
    (found = new RegExp(
      `^(${monthNames})(?![\\p{L}])\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`,
      "iu",
    ).exec(text))
  )
    return calendarDate(+found[2], monthIndex(found[1]), found[3], base);
  return null;
}
function deadlineIn(text: string, base: Date, calendar: boolean) {
  for (const cue of [by, ...(calendar ? [calendarAt] : [])])
    for (const found of text.matchAll(cue)) {
      const date = dateAt(text.slice(found.index + found[0].length), base);
      if (date) return date;
    }
  const span = within[0].exec(text) ?? within[1].exec(text);
  if (!span) return null;
  const count =
    Number(span[1]) ||
    numberWords.findIndex((names) =>
      names.split("|").includes(span[1].toLowerCase()),
    ) + 1;
  const unit = span[3].toLowerCase();
  if (unit.startsWith("h") || unit.startsWith("s"))
    return utcDay(new Date(+base + count * 3_600_000));
  const due = utcDay(base);
  if (!span[2]) {
    const days = unit.startsWith("w") ? count * 7 : count;
    return new Date(+due + days * dayMs);
  }
  for (let left = count; left > 0;) {
    due.setUTCDate(due.getUTCDate() + 1);
    if (due.getUTCDay() !== 0 && due.getUTCDay() !== 6) left -= 1;
  }
  return due;
}

// Company, role, next step, deadline. Any of them may be null.
export function extractDetails(
  mail: RawMail,
  category: MailCategory,
  now: Date = new Date(),
): Pick<Classification, "company" | "role" | "nextStep" | "deadline"> {
  const { company, role } = named(mail);
  const cue = cues[category];
  if (!cue) return { company, role, nextStep: null, deadline: null };
  // Relative deadlines count from the day the mail arrived.
  const base = Number.isNaN(+mail.receivedAt) ? now : mail.receivedAt;
  const subject = tidy(mail.subject).trim();
  const body = fresh(mail.bodyText);
  const lines = sentences(body)
    .map(([start, end]) => body.slice(start, end).trim())
    .filter((line) => line && !theirs.test(line));
  const dated = (line: string) =>
    deadlineIn(line, base, category === "interview");
  const steps = lines.filter((line) => cue.test(line));
  const step =
    steps.find((line) => dated(line)) ??
    steps[0] ??
    (cue.test(subject) ? subject : null);
  let deadline = step ? dated(step) : null;
  for (const line of [...lines, subject]) deadline ??= dated(line);
  return {
    company,
    role,
    nextStep: step ? step.replace(/\s+/g, " ").slice(0, 240) : null,
    deadline,
  };
}
