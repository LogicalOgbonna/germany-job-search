# Wunderflats — Follow-up Technical Interview Prep

**Date:** April 27, 2026 — 12:45pm UTC (afternoon Berlin time, ~2:45pm CEST)
**Meet link:** https://meet.google.com/jom-hzkk-mtk
**Format note:** All three interviewers share the same time slot and Meet link. Likely a back-to-back panel (e.g., 30 min each = 90 min total) on a single call. Confirm with the recruiter before joining if unclear. Be prepared for context switches between deeply technical, frontend-specific, and managerial framings.

---

## 1. Interviewer Profiles & Strategy

### A. Behnam Ghafary — Senior Full Stack Engineer
**LinkedIn:** https://www.linkedin.com/in/behnam-ghafary-812a6856/
**GitHub:** https://github.com/Behnamgh

**Background**
- ~10 years professional experience (since 2016).
- At Wunderflats since 2022, promoted to Senior in 2024.
- Prior: Honest Food (Delivery Hero), Rismun, Petiak System (lead full-stack), Fanoosprint.
- MSc/BSc Biomedical Engineering — switched into software, so he is sympathetic to non-traditional paths.
- Iranian background; Berlin-based.

**Technical signals**
- Self-described "Full Stack JavaScript Developer." Stack pattern: React, Angular (older), Node.js, Express, GraphQL.
- Public side projects: small developer-utility npm packages (`ts-import`, `graphql-converter`), portfolio repos, Tetris clone, Angular admin templates.
- Pragmatic builder, not a thought-leader. No conference talks, no Medium posts.
- Likely cares about: **shipping pragmatic full-stack code**, integration over reinvention, GraphQL patterns, hands-on craft.

**Strategic framing for him**
- Treat as a **peer-level technical interview**: deep dives on Node.js, TypeScript, GraphQL, and integration patterns are likely.
- He's been on the team for 4 years — he knows the codebase intimately. Expect specific questions about:
  - How you'd structure a third-party integration (e.g., a payments provider, a contract law API).
  - Error handling, retries, idempotency for financial workflows.
  - GraphQL schema design (Apollo/Nexus is in the stack).
  - TypeScript: discriminated unions, type narrowing, generics.
- He'll value **pragmatism and a clean mental model**. Don't over-engineer your answers.

**Anchor stories for him**
- OurNigeria: integrating OpenAI, Voyage AI, Cohere, Langfuse — vendor evaluation, retry/fallback logic, observability.
- ActivEdge: high-volume settlement, idempotency, transactional integrity.
- Genentech: full-stack Next.js chat widget with RAG (LangChain + Vercel AI SDK + Chroma).

---

### B. Marton Maleczki — Head of Engineering
**LinkedIn:** https://www.linkedin.com/in/martonmaleczki/

**Background**
- Hungarian. Budapest University of Technology — MSc Technical Informatics.
- ~25 years industry experience starting from web dev at Max Planck Institute for Physics (2000).
- Long architect track: Malév Hungarian Airlines (2004–2011), RTN Rendszerház (lead dev 2013–2016), then **7 years at Avon** (Software Architect → Solution Architect → Application & Platform Strategy Architect, 2016–2022).
- Joined Wunderflats ~2023 as Solutions Architect, promoted to Head of Engineering in 2025.
- Note: another Director-level engineering leader (Jurgen Wiehan) also exists at Wunderflats. His exact remit may be a slice of engineering rather than the whole org. Don't assume; ask.

**Personality signals**
- **Architect-by-DNA leader.** 15+ years in architect roles before becoming Head. He thinks in systems, integration boundaries, total cost of ownership.
- Almost zero public footprint — no Twitter, no blog, no talks. He's a substance-over-showmanship operator.
- Hungary-based, leading a Berlin team — values async, distributed work.
- "Buy/Integrate over Build" maps directly onto his Avon "Platform Strategy Architect" pedigree, but it is **not a quote attributable to him personally** — don't pretend you read his blog.

**Strategic framing for him**
- This is the **hiring manager round**. He is asking: *can this person own a problem end-to-end, make sound architectural trade-offs, and ship business value in our cost-conscious, integration-heavy environment?*
- Expect questions about:
  - **System design at the architectural level** (not algorithmic): how would you design the Contract Engine? What boundaries, what providers, what data model?
  - **Trade-off reasoning**: when do you build vs. buy? When is custom code justified?
  - **Ownership and outcomes**: tell me about a system you owned end-to-end. What was the business impact?
  - **Handling ambiguity**: what do you do when requirements shift mid-sprint?
  - **Working with distributed teams** — async, written communication.
- Don't bring algorithmic optimization or framework cult-following into this conversation. Bring **business impact, integration patterns, and architectural restraint**.

**Anchor stories for him**
- OurNigeria as a **systems-thinking exemplar**: hybrid RAG (pgvector + BM25 + Cohere rerank) is precisely the kind of integration-heavy decision he respects. Frame it as: "I evaluated three vector DBs, picked pgvector because we already had Postgres, integrated Cohere for rerank instead of training one. Saved ~3 months."
- ActivEdge: race conditions and idempotency in financial settlement — speaks to mission-critical financial systems (the Wunderflats payments/pricing platform).
- Genentech migration (Vue → React Chrome extension): ownership of a long-running, business-critical migration.

**Questions to ask him**
- "How is the engineering org structured today? You and Jurgen Wiehan both lead engineering — how is the remit split?"
- "What does the first 90 days look like for this role? Is the Contract Engine the first focus?"
- "When you joined, what's something you changed about how the team operates?"
- "What's the bar for 'good enough' on Buy vs. Build at Wunderflats? Is there a recent example where the team decided to build instead of buy, and why?"

---

### C. Agnieszka Gębuś — Frontend Engineer
**LinkedIn (probable):** https://www.linkedin.com/in/agnieszka-g%C4%99bu%C5%9B-67b666130

**Background**
- Polish (the surname is likely "Gębuś"; recruiter spelled it "Gebus").
- **Very thin public footprint.** No conference talks, no blog, no verified GitHub for Wunderflats work.
- A possibly-related GitHub `agne6ka` exists (Warsaw-based, JS/TS/React/Redux/SCSS) — could be her pre-Berlin profile. Treat as unconfirmed.

**Strategic framing for her**
- This is the **frontend technical round**. She'll go deep on React, Next.js, TypeScript, component patterns, and probably real-world frontend engineering: state management, performance, accessibility, testing.
- Since I have no public signal on her specialty (a11y, perf, design systems, testing), **lead with curiosity** — ask what she owns and what she values in a peer. This doubles as genuine interest and helps you tailor the rest.
- Likely topics:
  - React: hooks, rendering optimization, Suspense, server components, hydration.
  - Next.js: App Router vs Pages Router, RSC, caching/revalidation, data fetching patterns.
  - TypeScript: strict mode, advanced types, end-to-end type safety with GraphQL codegen.
  - State management: Redux Toolkit vs React Query vs Zustand vs context — when to use each.
  - Testing: Jest + RTL, Playwright (you have CI experience here), Cypress (their stack).
  - Performance: Core Web Vitals, bundle analysis, lazy loading, code splitting (you have direct Genentech + Descasio stories here).
  - Accessibility: ARIA, keyboard navigation, Radix UI patterns (Genentech design system story).

**Anchor stories for her**
- Genentech: design system in React + Radix UI; Vue → React Chrome extension migration; performance work with Lighthouse and DevTools; full-stack Next.js chat widget.
- Descasio: 35% faster load time via bundle analysis (rollup-plugin-visualizer, webpack-bundle-analyzer); React Profiler bottleneck hunting; Storybook for component documentation.
- OurNigeria: React 19, Tailwind v4, 22 chart types auto-generated from AI responses, Recharts, dark mode, nuqs URL state, mobile-responsive layouts. **This is your strongest "modern frontend" story.**

**Questions to ask her**
- "What does the frontend stack look like day-to-day? Are you on App Router or Pages Router for Next.js?"
- "How is the design system organized? Is it a shared package across apps?"
- "How do you handle GraphQL on the frontend — codegen, Apollo Client, urql?"
- "What's a frontend problem you've been chewing on lately?"

---

## 2. Wunderflats Context (verified)

**Tech stack (from JD):** Node.js + TypeScript backend, React + Next.js frontend, MongoDB Atlas, GCP, Kubernetes, Terraform, GitHub Actions, GraphQL (Apollo/Nexus), some REST. QA uses Cypress.

**The Contract Engine** — the new hire's first mission:
- Goal: automate **95% of all contracts across Europe** (DE, AT, FR, BE, LU, CH, IT, PT, ES) next quarter.
- Constraint: "labyrinth of local regulations."
- Strategy: map third-party providers, build flawless integrations. Buy over Build.

**Recent expansion (March 18, 2026):** simultaneous launch in IT, ES, PT, CH. Now 8 countries, 63K+ apartments, 95% occupancy, 5-month avg stay. Each market needs legally-vetted contracts.

**Team:** ~150 total, small engineering team (TheOrg lists 7 named engineers — likely undercounted). Existing Senior Frontend Engineer "Payment & Invoicing" overlaps with this role's mission. Department: "Product & Engineering" — no separate platform/frontend/backend orgs publicly visible.

**Funding:** ~$34M total. Series C ($21M) led by Verdane in 2022. No new round announced around 2026 expansion.

**Culture warning:** Glassdoor reports a 6-step process and 10+ hours of homework for some candidates. Tomorrow's interview is the **technical loop** — sharp, deep, but the killer round before this was likely the take-home or coding challenge. Expect conceptual depth over code-on-the-spot, but be ready for either.

---

## 3. Likely Technical Topics — Drill These

### A. System Design: "Design the Contract Engine"
**Highly likely** — it's named in the JD as the new hire's first mission.

**Approach to discuss:**
1. **Clarify constraints first** — which countries first? Which contract types (residential lease)? What's the volume? What providers exist?
2. **Map the integration landscape** — DocuSign / Adobe Sign / Yousign for e-signature; jurisdiction-specific KYC providers (Onfido, Veriff); local notary integrations where required (Germany, Spain). Don't reinvent.
3. **Domain model** — Tenant, Landlord, Property, Contract (with jurisdiction discriminator), Clause (versioned, jurisdiction-tagged), Signature, AuditTrail.
4. **Data flow** — contract template selected by jurisdiction → variables filled from booking → legal review queue → e-signature provider → webhook back → store signed PDF + audit trail.
5. **Edge cases** — provider downtime (idempotent retries, circuit breaker), regulatory change mid-contract, partial signature (one party signed, other dropped), GDPR data deletion vs legal retention conflict.
6. **Observability** — every state transition logged, audit trail immutable (consider event sourcing here).
7. **Scaling** — 9 countries at launch, contract templates as data not code (versioned in DB), feature flags per country for staged rollout.

**Buzzwords that score well:** idempotency, event sourcing for audit, jurisdiction as discriminator, third-party SLA dependency, webhook resilience, GDPR-vs-legal-retention trade-off.

### B. Race Conditions / Data Consistency in Financial Systems
**Likely** — JD explicitly calls out "race conditions, data consistency, edge cases."

**Stories to lead with:**
- ActivEdge bank settlement, millions of daily transactions, 80% improvement in settlement rate.
- Discuss: idempotency keys, optimistic vs pessimistic locking, exactly-once vs at-least-once delivery, database transaction isolation levels, event ordering guarantees.

**Concrete patterns to mention:**
- Idempotency keys on all mutating endpoints to handle client retries.
- Outbox pattern for reliable event publishing alongside DB writes.
- Saga pattern for multi-step distributed transactions (e.g., booking + payment + contract).
- Optimistic locking with version columns for low-contention writes.

### C. Buy vs Build — Concrete Examples
- **OurNigeria, chose buy:** OpenAI/Cohere/Voyage AI instead of training models; Langfuse instead of building observability; Mastra framework instead of agent orchestration from scratch; Telegram OAuth instead of building a third auth provider.
- **OurNigeria, chose build:** custom migration tooling for Prisma + Mastra-managed tables (no off-the-shelf solution fit); SSE keepalive heartbeat layer (specific to our reverse proxy); domain-specific BM25 + pgvector hybrid (off-the-shelf solutions didn't combine these the way we needed).
- **Trade-off framework:** does an existing tool cover ≥80% of the need? Does it leave us in control of our data? What's the migration cost if we need to swap? What's the maintenance burden vs the build cost?

### D. Frontend Performance (for Agnieszka)
- Genentech: lazy loading, code splitting, image optimization, memoization, CDN delivery, Lighthouse audits, Chrome DevTools profiling.
- Descasio: 30-40% bundle reduction via rollup-plugin-visualizer + webpack-bundle-analyzer; React Profiler for render bottlenecks; 35% faster load time.
- OurNigeria: React 19 server components for SEO pages (shareable conversations with Open Graph + JSON-LD).

### E. Testing Strategy
- Genentech: Playwright in CI, results published to GitHub Pages with Allure, Slack notifications. Stakeholder confidence story.
- Descasio: Jest + Enzyme; 20% bug reduction.
- OurNigeria: Playwright with 4 projects (web auth, dashboard auth, desktop Chrome, mobile Pixel 5).

### F. CI/CD & Infrastructure
- GitHub Actions experience across OurNigeria, Genentech, Descasio.
- Docker Compose production deployment (OurNigeria) with multi-stage Dockerfiles, health checks, memory limits, graceful shutdown.
- **Honest gap:** GCP/Kubernetes/Terraform — direct production experience is limited. Frame as: "I've worked extensively with Docker, multi-stage builds, health checks, and infrastructure-as-code patterns. The concepts map directly to GCP/K8s/Terraform — I'd be productive within weeks."

---

## 4. STAR Stories — Sharpened

### Story 1: OurNigeria Multi-Agent Pipeline (use for "most complex system")
- **S:** Build a system that ingests 700+ Nigerian budget docs (959 files, 37 states) and lets citizens query in plain English or Pidgin.
- **T:** Real-time, accurate, no timeouts, multi-language, scalable to thousands of users.
- **A:**
  - Hybrid RAG: pgvector + BM25, Reciprocal Rank Fusion (K=60), Cohere rerank-2.
  - 5-agent system (Mastra): Router, Budget Analyst, Corruption Analyst, GovSpend Analyst, Impact Analyst.
  - Three-stage intent classification (keyword scoring → LLM classification with 5-min cache → inferred fallback).
  - SSE streaming with 15s keepalive heartbeats to defeat reverse proxy timeouts.
  - 708K+ vector embeddings across 4 indexes; voyage-3-large (1024-dim).
- **R:** Zero ingestion errors. Sub-second query routing. 22 chart types auto-rendered. Shipped solo as a single engineer.
- **Reusable for:** complexity, third-party integration, observability, ownership.

### Story 2: Genentech Migration (use for "long-running ownership")
- **S:** Mission-critical clinical-trial data product, Vue.js web app, needed to become a Chrome extension in React.
- **T:** Migrate without breaking existing users; ship features in parallel during the migration.
- **A:** Maintained both codebases; introduced Redux + React Query; refactored class components to functional; built a Radix UI design system; added Playwright E2E in CI with Allure reports + Slack notifications.
- **R:** Stakeholder confidence rose; design system reused across products; junior devs mentored.
- **Reusable for:** ownership, migration patterns, testing, design systems.

### Story 3: ActivEdge Settlement (use for "race conditions / financial systems")
- **S:** High-volume bank settlement: thousands to millions of transactions daily.
- **T:** Boost settlement rate; build modules for MasterCard, VISA, Express-cash, E-commerce.
- **A:** React + Redux + RxJS for streaming; native EventSource API replacing socket.io for real-time updates; reconciliation pipeline with transaction-integrity strategies.
- **R:** **80% boost in settlement rate; 60% improvement in daily reconciliation.**
- **Reusable for:** financial systems, race conditions, real-time, data consistency.

### Story 4: Genentech RAG Chat Widget (use for "shipped a buy/integrate solution")
- **S:** Customers wanted to query their data conversationally inside the product.
- **T:** Build a chat widget embeddable on third-party sites.
- **A:** Next.js full-stack; OpenAI GPT models via LangChain; Vercel AI SDK; Chroma vector DB. **Bought every component** — built only the integration layer and UX.
- **R:** Shipped in weeks not quarters; users embed and query their own data.
- **Reusable for:** Buy/Integrate over Build, modern AI stack, full-stack delivery.

---

## 5. Questions to Ask (Pick 1-2 per Interviewer)

**For Behnam (peer engineer):**
- "What does a typical week look like for you on the team? How much time on Contract Engine vs other systems?"
- "What's the GraphQL story — Apollo or Nexus? How well-typed is the schema end-to-end?"
- "What's the most painful part of the codebase right now?"

**For Marton (Head of Engineering):**
- "How is the engineering org split between you and Jurgen Wiehan?"
- "What does success in the first 90 days look like for this role?"
- "Recent example where the team chose to build instead of buy — what tipped the scale?"
- "How does the team handle the spread between Berlin office and Hungary?"

**For Agnieszka (Frontend):**
- "What's the frontend stack day-to-day? App Router or Pages Router?"
- "Is there a shared design system across apps, or does each surface own its UI?"
- "How is GraphQL handled on the client — codegen, Apollo, urql?"
- "What's a frontend problem the team is chewing on right now?"

**Don't ask** about salary, benefits, vacation in this round — those go to the recruiter.

---

## 6. Things to Avoid

- **Don't claim GCP/K8s/Terraform production experience.** Frame as "transferable from Docker/AWS work; concepts map directly."
- **Don't pitch building custom systems** — this team explicitly disdains that. Lead with integration, reuse, leverage.
- **Don't use em dashes in any whiteboard or written artifact** — house style.
- **Don't quote Marton's blog** — he doesn't have one. Don't fabricate familiarity.
- **Don't say you're 8+ years.** You are 8 years exactly (Mar 2018 to today).
- **Don't mislabel OurNigeria** as "side project" or "open source." It's listed as Senior Engineer, ournigeria.ng (no GitHub link).
- **Don't claim Python/Django production experience.** Personal projects only.

---

## 7. Logistics

- **Time:** 12:45pm UTC = 14:45 Berlin (CEST) = 13:45 Lagos (WAT). Confirm your local time.
- **Meet link:** https://meet.google.com/jom-hzkk-mtk
- **Test the link 15 min early.** Camera, mic, screen share permissions. Have a backup tab open with the JD.
- **Have ready on a second screen:** the JD, this prep doc, your CV, the Wunderflats site (8 countries, 63K apartments stat).
- **Whiteboard alternative:** if asked to system-design, prefer Excalidraw (excalidraw.com) or just talk through it on screen share with a notepad — don't fumble with unfamiliar tools.
- **Battery, charger, water, quiet space.** Wear something neutral; Berlin tech is informal but a collared shirt won't hurt for a Head-of-Engineering round.

---

## 8. Pre-Interview Checklist (do tomorrow morning)

- [ ] Open all three LinkedIn profiles, scan recent activity (last 5 posts each).
- [ ] Re-read the JD once.
- [ ] Re-skim this prep doc.
- [ ] Re-skim cv/experience.md so the metrics are top-of-mind: 80% settlement boost, 35% load time, 700+ docs, 708K embeddings, 5 agents, 4 vector indexes.
- [ ] Write down 3 questions for each interviewer on a sticky note.
- [ ] Open Excalidraw in a tab.
- [ ] Test mic, camera, Meet link.
- [ ] Glass of water on the desk.
- [ ] Notice period and salary expectation: have specific numbers ready (Berlin senior backend/full-stack range typically 80-110K€ gross; calibrate to your context).
