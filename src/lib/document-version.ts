import { hash } from "./domain";
export const DOCUMENT_TEMPLATE_VERSION = "detailed-evidence-v2.1";
export function documentFingerprint(profileHash: string, jobHash: string) {
  return hash(`${profileHash}:${jobHash}:${DOCUMENT_TEMPLATE_VERSION}`);
}
