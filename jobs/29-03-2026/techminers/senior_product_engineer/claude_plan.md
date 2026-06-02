# Interview Plan — TechMiners, Senior Product Engineer

**Date:** 2026-04-24 (tomorrow)
**Interviewers:**
- Robert Bordo — robert.bordo@techminers.com
- Armin Ayatollahi — armin.ayatollahi@techminers.com

Read `intro_prep.md` alongside this. That file has scripts + background alignment. This file has the **people**, the **signals**, and the **strategy**.

---

## 1. Who You're Talking To

### Robert Bordo — Senior Tech Analyst / CTO (the assessor)
- LinkedIn: https://de.linkedin.com/in/robert-bordo-a9259b13a
- 27+ years in tech. Former CTO, head of engineering. Berlin/Nuremberg.
- In-house CTO at TechMiners running client due diligence engagements. **Not a product engineer — an assessor.** He evaluates CTOs and engineering teams for a living.
- Certified Scrum Master, PRINCE2. German native.
- **No public writing.** LinkedIn only.

**What he'll probe for (high confidence):**
- Judgment and tradeoffs — not syntax.
- Scaling stories, architectural decisions, how you reason about tech debt.
- Team dynamics, seniority signals, ownership.
- How you'd assess a codebase — because that's his job.
- Red flags in engineering culture (he sees them daily in DD).

**What he will NOT do:**
- LeetCode. Whiteboard algorithms. Deep React hook trivia.

**How to win him:** Talk like a senior engineer who has survived production. Give concrete numbers. Admit tradeoffs. Show you understand WHY a pattern exists, not just that you've used it.

---

### Armin Ayatollahi — Staff Software Engineer (the peer / likely hiring manager)
- LinkedIn: https://de.linkedin.com/in/arminayat
- Blog (CRITICAL READ): https://www.arminayat.com
- GitHub: https://github.com/arminayat
- Twitter/X: @arminayat
- Joined TechMiners Aug 2022. Senior FE → Staff Engineer. Building TechMiners ONE.
- Born 1998. BSc CS Yazd Univ. Partial MSc AI, Univ. of Tehran. Moved to Berlin 2021.
- Previously: Tridion/Bendesk (led JS→TS migration, component library). Rahnema bootcamp mentor.
- Side ventures: co-founder **Nestor Code Crafters UG** (nestornotes.com — AI newsletter knowledge hub). Vinoh iOS app.
- React Day Berlin 2023 speaker: **"A Frontend Engineer's Guide to Tech Due Diligence"** (32 min talk).

**What he values (from his own writing — verbatim signals):**
- **Investigate the layer beneath the abstraction.** Understand failure modes.
- **Verify agent output.** Don't trust. Critique.
- **Scope tasks strategically** for agents.
- **Stay in the loop.** Human-in-the-loop, not autopilot.
- Quote to internalize: *"That's the difference between someone who uses AI and someone who actually controls it."*
- Long-term thinking on tool/vendor selection — bets on teams, not tools.
- Model-switching in AI products is non-trivial (voice/tone lock-in is real).

**What he'll probe for:**
- How you actually use Claude Code / Cursor. Specific workflow.
- How you verify agent output and catch its mistakes.
- Design system / frontend architecture sense.
- React/TS fundamentals (not trivia — how things work).
- Whether you "control" AI or "use" it.

**How to win him:** Show the receipts. Don't pitch AI tools as magic. Describe concrete Claude Code workflows, times agents got it wrong, how you caught it. Reference "layer beneath" thinking without name-dropping the post.

---

## 2. Required Reading (tonight, 30 min)

**Must read — Armin's blog (read in this order):**
1. https://www.arminayat.com/blog/know-the-layer-beneath
2. https://www.arminayat.com/blog/im-betting-on-teams-not-tools (vendor selection = long-term relationship)
3. https://www.arminayat.com/blog/the-real-lock-in-is-the-models-voice (AI provider switching is not a swap)

**Must read — TechMiners thought leadership:**
4. Daniel Jung's **"Real AI vs Vanity AI"** framework (on techminers.com/knowledge) — watch for the "Lethal Trifecta": sensitive data + external action + untrusted input.
5. TechMiners "2025 Toolbox" blog — shows their internal stack signals.

**Skim:**
6. Armin's React Day Berlin 2023 talk summary — https://gitnation.com/person/armin_ayatollahi

**Why:** Armin will drop concepts from his own posts into questions. If you echo his framing back (naturally, not performatively), you signal alignment without sycophancy.

---

## 3. Framework Drops — Language to Use

Weave these in once or twice. Not more. Naturally.

| Their phrase | When to use it |
|---|---|
| "the layer beneath" | When talking about debugging AI output or React internals |
| "verify, don't trust" | When talking about Claude Code / Cursor workflow |
| "human in the loop" | When talking about agentic systems you've built |
| "Real AI" (data moat, evals, MLOps) vs "Vanity AI" (clever prompts) | When talking about your OurNigeria multi-agent work |
| "scope the task for the agent" | When describing how you use Claude Code day-to-day |

---

## 4. Likely Questions, Mapped to Interviewer

### From Robert (assessor lens)
1. **"Walk me through an architectural decision you regret."** — Wants to see self-critique. Have one ready. Talk about tradeoff, not blame.
2. **"How do you assess whether a codebase is healthy?"** — This IS his job. Answer in his language: test coverage signal, dependency hygiene, architectural coherence, dead code, CI/CD maturity, observability, team velocity trends.
3. **"Tell me about scaling a product."** — ActivEdge (millions of daily transactions, settlement). Descasio (30-40% bundle reduction, 35% faster load). Use numbers.
4. **"How do you work with CTOs / non-technical stakeholders?"** — Founders Lair translation of business requirements to schemas. Genentech product team on Chrome extension.
5. **"What would you look for in a production Django codebase?"** — Honest: "I'd read it the way I'd read a NestJS codebase — model boundaries, migration history, signal usage (the Django equivalent of hooks), auth middleware, test pyramid, ORM N+1 patterns, query profiling." The point isn't Django expertise — it's showing you know *what to look for*.

### From Armin (peer lens)
1. **"How do you actually use Claude Code day-to-day?"** — Give a concrete workflow. Example: "I scope tasks to single-file or single-feature changes, give it context by pointing to the schema and the related handler, let it propose a diff, read it line-by-line before accepting, and always run tests before I trust it. For multi-file refactors I use plan mode first."
2. **"Tell me about a time Claude Code or Cursor got it wrong."** — HAVE THIS STORY READY. Specific. Concrete. "It hallucinated a library method / it missed an edge case in migration / it introduced a subtle N+1." Show how you caught it. This is the "layer beneath" test.
3. **"Walk me through OurNigeria's multi-agent system."** — Your strongest card. Three-stage intent classification. Hybrid RAG (pgvector + BM25 + RRF + Cohere rerank). 708K embeddings. Show you picked multi-agent deliberately (Vanity AI would've been a single GPT call with clever prompting).
4. **"How do you know when NOT to use an agent?"** — Answer: short, mechanical, high-stakes, or poorly-scoped tasks. When the cost of verification exceeds the cost of writing it yourself. When the context window can't hold what the task actually needs.
5. **"How do you keep a design system coherent as the product scales?"** — Descasio design system, 40% bundle savings. Storybook. Component library governance.
6. **"How would you think about building TechMiners ONE's frontend?"** — Answer in their problem domain: DD reports are dense, comparative, and need to be skimmable for PE/VC readers. Think heatmaps, benchmarks, drill-downs. Progressive disclosure. Export-to-PDF fidelity.

---

## 5. Red Flags to Avoid

- **Do not** say "I use Claude Code for everything." Armin will read that as lack of judgment. Say: "I scope tasks. I verify. I reach for it when the task has clear boundaries and a verifiable outcome."
- **Do not** oversell Django. You said in application materials Python is personal projects. Stay consistent: *"I've built production APIs in NestJS and Node. The patterns transfer. I'll ramp fast with the tooling, and I'd spend my first two weeks reading the codebase, running migrations, and shadowing on a real feature before I ship anything non-trivial."*
- **Do not** pitch AI agents autonomously writing DD reports. Their public writing is explicit: **human-in-the-loop, guardrails, evals**. Autonomous = Vanity AI in their framework.
- **Do not** name-drop their blog posts awkwardly. Echo the ideas, not the titles.
- **Do not** bring up compensation unless asked. First round is mutual fit.
- **Do not** ramble. Robert will be timing you mentally. Keep answers to 60–90 seconds unless invited to go deeper.

---

## 6. Your Strongest Cards — Have Ready

| Card | Use when |
|---|---|
| **OurNigeria multi-agent RAG** | Any AI / agentic / architecture question |
| **Genentech RAG chat widget** | Production LLM question, vector DB, LangChain |
| **ActivEdge settlement** | Scale, reliability, high-stakes data |
| **Descasio perf + design system** | Frontend architecture, measurable results |
| **Founders Lair** | Business-to-schema translation, CTO collab |
| **Claude Code daily workflow** | AI-native dev question (have a 60s story) |
| **"Time Claude Code got it wrong"** | The layer-beneath test |

---

## 7. Questions You Ask Them (pick 3–4)

**For Armin:**
1. "You talked about 'knowing the layer beneath' in your post. In practice at TechMiners, where does that show up the most — is it in the agent orchestration layer, the code-analysis layer, or the frontend?"
2. "How is the team currently splitting work between agents and engineers? Where's the line you've drawn?"
3. "What does a good week on TechMiners ONE look like for you right now?"

**For Robert:**
4. "What does success for this hire look like at 90 days and at one year?"
5. "You've assessed 600+ companies. What's the #1 thing that separates the engineering teams that ship from the ones that don't — and how does that shape how you're building TechMiners internally?"
6. "Where is TechMiners ONE today vs where you want it in 12 months, and what's the biggest unsolved problem?"

**Don't ask:**
- "What's the tech stack?" (you know it)
- "Is it remote?" (you know it)
- Anything Google-able.

---

## 8. 24-Hour Checklist

**Tonight:**
- [ ] Read Armin's three blog posts (links in §2)
- [ ] Read Daniel Jung's Real vs Vanity AI post
- [ ] Prep the "Claude Code got it wrong" story — specific, 60 seconds
- [ ] Prep the OurNigeria walkthrough — 90 seconds, ending in "and here's what I'd do differently"
- [ ] Re-read your own `intro_prep.md` scripts (Tell me about yourself, Why TechMiners, What are you looking for)
- [ ] Check LinkedIn one more time — note if either has posted anything new this week

**Morning of:**
- [ ] Test mic/camera/internet 30 min before
- [ ] Water within reach
- [ ] CV pulled up in a tab
- [ ] Job description pulled up
- [ ] This file pulled up
- [ ] Quiet room, door closed

**During:**
- Speak slowly. Pause before answering. Silence is confidence.
- Robert will ask "why" — always have the tradeoff ready.
- Armin will listen for how you talk about agents. Control, not use.
- Ask at least 3 questions. They're interviewing you, you're interviewing them.

**Immediately after:**
- [ ] Jot down what they asked that surprised you
- [ ] Note who said what — helps with follow-up
- [ ] Send thank-you within 24h: two sentences, reference one specific thing each person said

---

## 9. The One-Line Frame

You are a **full-stack senior engineer who builds production multi-agent AI systems, controls AI tooling rather than being controlled by it, and ships end-to-end from schema to UI.** TechMiners is the rare place where all three converge.

Everything you say should reinforce one of those three.
