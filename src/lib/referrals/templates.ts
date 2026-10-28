import { evidenceScore, type CandidateProfile } from "../profile";
import { genericInbox, type Drafts } from "./domain";
export function makeDrafts(
  job: {
    title: string;
    company: string;
    description: string;
    applyUrl: string;
  },
  contact: { name: string; email: string },
  profile: CandidateProfile,
  options: { connected?: boolean } = {},
): Drafts {
  const person =
    contact.name && !/unconfirmed|profile|inbox/i.test(contact.name)
      ? contact.name.split(/\s+/)[0]
      : "there";
  const greeting = `Hi ${person},`;
  const evidence = profile.roles
    .flatMap((role) =>
      role.bullets.map((b) => ({
        ...b,
        company: role.company,
        score: evidenceScore(b.text, `${job.title} ${job.description}`),
      })),
    )
    .sort((a, b) => b.score - a.score)[0];
  const proof = evidence
    ? `Relevant experience from ${evidence.company}: ${evidence.text.replace(/\*\*/g, "").replace(/—/g, ",")}`
    : "I can share my CV and relevant work examples.";
  const ask = genericInbox(contact.email)
    ? "Could you point me to the recruiter or engineering team handling this role?"
    : "Would you be open to reviewing my CV and considering a referral if you think my experience fits?";
  const intro = `${greeting}\n\nI'm ${profile.contact.name}, a software engineer based in Berlin. I'm interested in the ${job.title} role at ${job.company}.`;
  const body = `${intro}\n\n${proof}\n\n${ask}\n\nRole: ${job.applyUrl}\n\nThanks,\n${profile.contact.name}`;
  const note = `${greeting} I'm ${profile.contact.name}. I'm exploring ${job.title} at ${job.company} and would like to learn more about the team. Open to connecting?`;
  // An existing connection gets a direct message, not a request to connect. LinkedIn
  // messages allow far more than a connection note, but the evidence line is clipped so a
  // long verified bullet can never push the message past the limit.
  const direct = (evidenceLine: string) =>
    `${greeting}\n\nHope you're well. I'm applying for the ${job.title} role at ${job.company} and would value your view of the team and how engineering works there.\n\n${evidenceLine}\n\nIf you think I'd be a good fit, would you be open to referring me or pointing me to the hiring manager? Happy to send my CV.\n\nRole: ${job.applyUrl}\n\nThanks,\n${profile.contact.name}`;
  const overflow = direct(proof).length - 1900;
  const connected = direct(
    overflow > 0 ? `${proof.slice(0, proof.length - overflow - 1)}…` : proof,
  );
  return {
    connection: options.connected
      ? connected
      : note.length <= 200
        ? note
        : `Hi ${person.slice(0, 24)}, I'm ${profile.contact.name.slice(0, 50)}, a Berlin-based software engineer exploring a role on your team. Open to connecting?`,
    referral: body,
    subject: `${job.title} at ${job.company}`,
    email: `${body}\n${profile.contact.email}\n${profile.contact.linkedin}`,
    followUp: `${greeting}\n\nFollowing up on my note about ${job.title} at ${job.company}. Happy to share my CV or relevant work examples if useful. If the timing isn't right, no worries.\n\nThanks,\n${profile.contact.name}`,
  };
}
