import { z } from "zod";
export const referralStatuses = [
  "saved",
  "contacted",
  "replied",
  "referred",
  "declined",
  "do_not_contact",
] as const;
export const draftSchema = z.object({
  connection: z.string().max(2000),
  referral: z.string().max(8000),
  subject: z.string().max(500),
  email: z.string().max(8000),
  followUp: z.string().max(4000),
});
export type Drafts = z.infer<typeof draftSchema>;
export function publicUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function linkedinUrl(value: string) {
  const safe = publicUrl(value);
  if (!safe) return "";
  const u = new URL(safe);
  if (
    !/(^|\.)linkedin\.com$/.test(u.hostname) ||
    !/^\/in\/[^/]+\/?$/.test(u.pathname)
  )
    return "";
  return `https://www.linkedin.com${u.pathname.replace(/\/$/, "")}`;
}
export function companyDomain(value: string) {
  const u = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    !publicUrl(u.href) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(u.hostname) ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)
  )
    throw new Error(
      "Enter the employer's public website domain, for example acme.com.",
    );
  return u.hostname.toLowerCase();
}
export function workEmail(value: string, domain: string) {
  domain = domain.replace(/^www\./, "");
  const email = value.trim().toLowerCase();
  return z.email().safeParse(email).success &&
    !!domain &&
    email.split("@")[1] === domain &&
    !/^(gmail|yahoo|outlook|hotmail|icloud|protonmail|proton|aol)\./.test(
      domain,
    )
    ? email
    : "";
}
export const genericInbox = (email: string) =>
  /^(careers?|jobs?|hiring|recruit(ment|ing)?|talent|hr|info|hello|contact|support|office|team|press|sales|privacy|legal|admin|noreply|no-reply|marketing)([._+-]|@)/i.test(
    email,
  );
export function contactPriority(title: string) {
  if (
    /engineering manager|head of engineering|tech lead|\bcto\b|vp.*engineering/i.test(
      title,
    )
  )
    return 95;
  if (/engineer|developer|technical lead/i.test(title)) return 90;
  if (/recruit|talent|hiring|people/i.test(title)) return 75;
  return 30;
}
export type FoundContact = {
  name: string;
  title: string;
  email: string;
  linkedin: string;
  sourceUrl: string;
  sourceKind: string;
  sourceNote: string;
  emailStatus: string;
};
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().max(300).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  linkedin: z
    .string()
    .max(1000)
    .default("")
    .refine(
      (v) => !v || !!linkedinUrl(v),
      "Use a public LinkedIn /in/ profile URL.",
    ),
  sourceUrl: z
    .string()
    .max(2000)
    .refine((v) => !!publicUrl(v), "Provide an HTTPS professional source URL."),
  sourceNote: z.string().max(3000).default(""),
});
