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
  return {
    connection:
      note.length <= 200
        ? note
        : `Hi ${person.slice(0, 24)}, I'm ${profile.contact.name.slice(0, 50)}, a Berlin-based software engineer exploring a role on your team. Open to connecting?`,
    referral: body,
    subject: `${job.title} at ${job.company}`,
    email: `${body}\n${profile.contact.email}\n${profile.contact.linkedin}`,
    followUp: `${greeting}\n\nFollowing up on my note about ${job.title} at ${job.company}. Happy to share my CV or relevant work examples if useful. If the timing isn't right, no worries.\n\nThanks,\n${profile.contact.name}`,
  };
}
