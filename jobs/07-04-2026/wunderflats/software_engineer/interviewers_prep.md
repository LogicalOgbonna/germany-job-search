# Wunderflats Onsite — Interviewer Briefing
**Date:** May 4, 2026 | **Location:** Rosenstrasse 16, 10187 Berlin (5th floor)

---

## Schedule at a Glance
| Time (CEST) | Interviewer(s) | Role | Likely Focus |
|---|---|---|---|
| 11:30–12:00 | **Emmi Meurling** | CPO | Product sense, "why Wunderflats", customer thinking |
| 12:15–12:45 | **Leonel Samayoa** | Technical Team Lead | Architecture, system design, leadership style |
| 13:00–13:45 | **Sergei Kovalenko, Samira Moghadam, Gbenga Anifowoshe, Kasim Ozkul** | Engineering panel | Tech deep dive, code/system design, team fit |
| 13:45–14:15 | **Jan Hase** | Founder/CEO | Vision fit, ownership mindset, culture |

---

## 1. Emmi Meurling — Chief Product Officer (11:30–12:00)

**Background:**
- First CPO in Wunderflats' history (joined Nov 2022).
- 10+ years in product. Spent most of her career at **Delivery Hero** (Berlin-based food delivery scale-up).
- Most recently **Senior Director of Product Management at Care.com**, owning product for all non-US markets.
- Master's in Political Science, Lund University (Sweden).
- Self-described: "Product leader with a passion for driving product success through compassion."
- Speaks publicly on female leadership in tech.

**Mandate at Wunderflats:** European and international product scaling.

**What she'll likely probe:**
- Why Wunderflats specifically (not just any Berlin scale-up)?
- How you think about users / business value (not just tech).
- Examples where you pushed back on a requirement that didn't make sense.
- How you handle ambiguity and shifting priorities.

**Talking points to lean into:**
- OurNigeria: framed every technical decision around the end-user query experience, not the model du jour.
- Genentech: redesigned clinical-trial data products around what scientists actually needed to see — not what was easiest to ship.
- Mention Wunderflats' 8-country expansion (DE/AT/FR/BE/LU/CH/IT/PT/ES) and the localization complexity that excites you.

**Smart question to ask her:**
- *"You're scaling product across 8 markets with very different regulatory and cultural contexts. How do you decide what to standardize globally vs. localize?"*
- *"What does the product roadmap look like for the payments and contract platform over the next 12 months?"*

---

## 2. Leonel Samayoa — Technical Team Lead (12:15–12:45)

**Background:**
- Berlin-based engineer, 10+ years experience. Self-described "go-to guy for all things APIs."
- Prior role: **Forto** (Berlin logistics scale-up) — likely overlap with high-throughput integration patterns.
- GitHub: lsamayoa (47 repos). Active in technical conferences.
- Passionate about mentoring engineers.

**Note:** Public footprint is light on Wunderflats specifics. Treat him as the technical gatekeeper — he probably runs your future team.

**What he'll likely probe:**
- System design / architecture trade-offs.
- API design, especially around third-party integrations (matches his Forto + Wunderflats background).
- How you think about race conditions, idempotency, retries (Contract Engine territory).
- How you mentor / collaborate with juniors.

**Talking points:**
- ActivEdge bank settlements: idempotency, transactional integrity, replay safety.
- OurNigeria multi-agent pipeline: SSE keepalives, queue routing, timeout handling.
- Mention you've owned API contracts from spec to deploy.

**Smart question to ask him:**
- *"What does the team structure look like, and how do feature decisions get made between PM, tech lead, and engineers?"*
- *"What's the most painful integration on the Contract Engine right now?"*

---

## 3. Engineering Panel (13:00–13:45)

### Sergei Kovalenko — Senior Backend Engineer
- **25 years in IT.** Most senior IC on the panel.
- Russian background (Orenburg State University, 1995–2000), Berlin-based.
- Prior: Aeria Games, Orion Express.
- Deep backend specialist. Will likely pressure-test technical depth.
- **Approach:** be precise, no hand-waving. He'll catch hedges.

### Gbenga Anifowoshe — Senior Frontend Engineer (Payment & Invoicing) ⭐
- **Nigerian** (GitHub handle gbenga504; David Gbenga Anifowoshe), based in Berlin. **Strong cultural connection point — use it.**
- At Wunderflats since **Sept 2021** (Software Engineer → Senior on Payment & Invoicing since July 2024).
- Stack: GCP, Node.js, GraphQL, TypeScript, React, MongoDB, Kubernetes, Terraform.
- Side projects: Walk Reminder Chrome extension, AI Travel Assistant, music-port (Spotify↔Apple Music migration tool), Javico (collaborative code review platform), js-docusaurus.
- Interests: investing, cash flow analysis, snooker.
- **He owns the exact codebase you'd join.** This is your most useful panelist.

### Samira (Saremi) Moghadam — Fullstack Engineer
- Limited public footprint. Fullstack on the engineering team.
- Will likely test breadth across stack and collaborative working style.

### Kasim Ozkul — Senior Backend Engineer
- Limited public footprint. Likely Turkish background.
- Senior backend IC. Expect Node.js / MongoDB / GCP focus.

**What the panel will likely do:**
- Live system design or coding exercise, OR
- Deep-dive on a past project (pick OurNigeria multi-agent pipeline — it has the most surface area).
- Cross-fire questions on edge cases, failure modes, trade-offs.

**Key prep:**
- Have **OurNigeria architecture diagram** ready in your head: ingestion → pgvector + BM25 + Cohere reranker → multi-agent router → SSE stream.
- Be ready to defend MongoDB choices (Wunderflats runs MongoDB Atlas — your Founders Lair / SureTrade experience matters).
- Be ready to talk GraphQL (mention any Apollo work).
- ActivEdge for the financial-systems angle.

**Smart questions to ask the panel:**
- To **Gbenga**: *"What does a typical sprint look like on the Payment & Invoicing team? What's the most interesting problem you've solved this quarter?"* (Builds rapport, gets ground truth.)
- To **Sergei**: *"Where do you draw the line on 'buy vs. build' when an integration starts feeling fragile?"*
- To anyone: *"What's the deploy and on-call story for the Contract Engine?"*

**Cultural connection — Gbenga:**
You're both Nigerian engineers in Berlin orbit. Mention OurNigeria naturally — it'll resonate. He was at Wunderflats during the Bookings & Payment era → if you can frame OurNigeria's payment/data-ingestion challenges in his vocabulary, you win him.

---

## 4. Jan Hase — Founder & CEO (13:45–14:15)

**Background:**
- Co-founded Wunderflats in 2015 with Arkadi Jampolski.
- Vision: housing as a service — analogous to ride-sharing / food delivery.
- Frequent speaker (FutureTravel Summit, MIPIM).

**Leadership philosophy (well-documented):**
- **Blunt feedback culture.** Jan and his co-founder give each other direct feedback; he says "with many meetings and limited time, blunt is best." Don't sugarcoat.
- **Ownership over solutions.** Wunderflats culture: leaders give *guidance*, not answers. Team owns the problem. Frame your past work as ownership stories.
- **Bidirectional feedback.** He opens meetings by asking for feedback first to flatten hierarchy. If he asks "any feedback for me?" — have something thoughtful ready (e.g., on the interview process itself).
- **Energy management.** He talks about pacing — chill when you can, deliver when you must. Signals he respects sustainable performance, not heroics.
- **Platform thinking.** "Stay focused on your core interaction and make adjacent players more successful." Echoes the "leverage over lines of code" philosophy in the JD.

**What he'll likely probe:**
- Why Wunderflats vs. any other scale-up.
- Long-term ambition / what you want to own.
- How you handle ambiguity and disagreement.
- Cultural fit — directness, ownership, business sense.

**Talking points:**
- Echo the housing-as-a-service framing: you see Wunderflats as building infrastructure for a category that's structurally inevitable.
- OurNigeria as proof you take genuine ownership (architected and built solo end-to-end).
- Mention pragmatism: "buy/integrate over build" matches how you actually shipped OurNigeria (OpenAI, Cohere, Voyage AI, Langfuse — no custom ML infra).

**Smart questions to ask him:**
- *"You've talked about giving the team ownership rather than solutions. Where does that get hardest at the current scale — 150 people across 8 markets?"*
- *"What's the one thing about the next 2 years at Wunderflats you're most worried about getting right?"* (Invites candor; matches his blunt-feedback style.)
- If he asks for feedback: *"The interview structure today is unusually well-thought-through — most companies don't separate technical depth from product and founder conversations this cleanly."* (Honest if true; shows you noticed structure.)

**Avoid:**
- Hedging language ("kind of", "I guess", "maybe"). He'll read it as low conviction.
- Overselling — he's seen every pitch. Be specific, quantify, admit gaps.

---

## Cross-Cutting Themes (mention in every conversation)

1. **"Leverage over lines of code"** — your OurNigeria stack proves it (third-party AI providers vs. custom ML).
2. **Systems thinking on financial data** — ActivEdge settlements, transactional integrity, idempotency.
3. **End-to-end ownership** — OurNigeria solo build (NestJS + Next.js + RAG pipeline + agents).
4. **8 years JS/TS, recent deep Node + Next.js** — directly maps to Wunderflats stack.
5. **Honest gap on GCP/Kubernetes** — frame as Docker/AWS background, concepts transfer, eager to ramp.

## Pre-Interview Logistics
- Arrive 10–15 min early; building has 5 floors, give yourself buffer.
- Bring printed CV copies (6 — one per interviewer).
- Water bottle — you'll talk for 2h45m straight.
- Notepad for questions to each interviewer.

---

## Sources
- [Wunderflats wins Emmi Meurling as CPO](https://hub.wunderflats.com/wunderflats-wins-emmi-meurling-as-chief-product-officer/)
- [Emmi Meurling LinkedIn](https://www.linkedin.com/in/emmimeurling/)
- [Sergei Kovalenko LinkedIn](https://www.linkedin.com/in/sergei-kovalenko-404/)
- [Gbenga Anifowoshe LinkedIn](https://de.linkedin.com/in/gbenga-anifowoshe-78bb83106)
- [Gbenga Anifowoshe portfolio](https://gbengaanifowoshe.com/)
- [Gbenga Anifowoshe GitHub](https://github.com/gbenga504)
- [Leonel Samayoa LinkedIn](https://www.linkedin.com/in/lsamayoa/)
- [Leonel Samayoa GitHub](https://github.com/lsamayoa)
- [Samira Moghadam LinkedIn](https://www.linkedin.com/in/samira-moghadam-209b5257/)
- [Jan Hase LinkedIn](https://www.linkedin.com/in/janhase/)
- [Jan Hase Crunchbase](https://www.crunchbase.com/person/jan-hase)
- [Q&A: Jan Hase on housing-as-a-service](https://pdreporter.substack.com/p/q-and-a-wunderflats-ceo-jan-hase)
- [Wunderflats Org Chart](https://theorg.com/org/wunderflats)
- [Wunderflats Engineering Team](https://theorg.com/org/wunderflats/teams/engineering-team)
