# Langdock - Introductory Interview Prep

## 1. Company Deep Dive
* **What they do:** Langdock is a Berlin-based AI startup (founded 2023) providing a secure, model-agnostic enterprise AI platform. They build a unified abstraction layer that orchestrates multiple model providers (Azure, AWS, GCP) without vendor lock-in, offering Chat, Workflows, Agents, and Integrations while ensuring GDPR compliance.
* **What they offer:** 100% on-site work in Berlin, a "calm but intense" engineering culture, shared meals (lunch and dinner), health-focused perks (gym/running), and equity. 
* **Recent news & Traction:** Explosive growth—scaled from $1M ARR in Oct 2024 to $15M+ ARR by Dec 2025. They have over 5,000 customers including Merck, Mobile.de, and Babbel, and raised $3M from General Catalyst.
* **Why they are interesting:** They aren't just building a thin wrapper; they are solving hard infrastructure problems (prompt caching, automatic failover, resumable streaming) to make AI safe and scalable for massive enterprises.

## 2. Role Analysis
* **Core Responsibilities:** Ship features for the AI engine (prompt caching, failover, middleware), build resumable streaming infrastructure with exact stopping points, develop agents for workflow automation (Redis-coordinated), and work with MCP and RAG pipelines.
* **Key Challenges:** Managing perceived latency and rendering performance for AI streaming, handling provider-specific quirks, and building resilient, resumable state machines for agents.
* **Must-Haves:** Deep TypeScript, React, and Node.js expertise; databases and queues; Redis & vector stores; daily AI tool usage; and a non-negotiable commitment to working 100% on-site in Berlin.

## 3. Background Alignment
* **Strongest Matches:**
  * **AI Infrastructure & RAG:** At *OurNigeria*, you architected a multi-agent AI system using the Mastra framework, orchestrating 5 specialized agents with intent classification and a hybrid RAG pipeline (pgvector, Cohere reranking, Voyage AI embeddings across 708K+ chunks).
  * **Streaming Systems:** At *OurNigeria*, you implemented SSE streaming for real-time chat responses with keepalive heartbeats and token-budgeted context management. At *ActivEdge*, you used the EventSource API for high-volume real-time data streaming.
  * **Full-Stack TypeScript:** You built the entire *OurNigeria* platform as an Nx monorepo (Next.js, NestJS, Prisma) and led complex React/TypeScript migrations at *Genentech*.
* **Transferable Experience:**
  * **Cloud Infrastructure:** You deployed Docker Compose with multi-stage builds, health checks, and Traefik reverse proxy at *OurNigeria*, and built CI/CD pipelines on AWS/Heroku at *Founders Lair*.
* **Gaps to Address:**
  * **Redis-coordinated execution:** While you have general Redis knowledge, you haven't used it specifically for agent coordination. 
  * *Framing:* "I haven't used Redis specifically for agent state coordination, but I've built complex multi-agent orchestration using the Mastra framework and implemented sophisticated caching and state management. I understand the distributed systems principles required to pick up Redis coordination quickly."

## 4. "Why This Company?" Script
"I've been building multi-agent AI systems and RAG pipelines over the last year, and I've experienced firsthand the friction of provider lock-in and model orchestration. Langdock's approach to building a secure, model-agnostic abstraction layer is exactly what enterprises need right now. Seeing your growth from $1M to $15M ARR in just a year shows incredible product-market fit, and I want to be part of the engineering team scaling that core infrastructure."

## 5. "What Are You Looking For?" Script
"I'm looking for a high-growth environment where I can take end-to-end ownership of complex AI infrastructure. What stood out about Langdock is your focus on solving hard engineering problems like resumable streaming and multi-provider failover, rather than just building thin LLM wrappers. I want to work in a 'calm but intense' in-person culture where I can ship rapidly alongside a strong, collaborative team."

## 6. "Tell Me About Yourself" Script
"I'm a full-stack engineer currently building an AI-powered platform for Nigerian budget analysis, where I architected a multi-agent system that processes over 700,000 vector embeddings. Before that, I was a Frontend Engineer at Genentech, where I spearheaded the migration of their clinical trial data platform to React and co-developed a RAG-powered chat widget. Throughout my career, from building high-volume banking settlement systems at ActivEdge to my current AI work, I've focused on performance, real-time streaming, and scalable architecture. I'm now looking to bring my experience in TypeScript, React, Node, and AI infrastructure to a fast-scaling product company, which is why Langdock's mission to build the enterprise AI abstraction layer is the perfect next step for me."

## 7. Likely Questions & Talking Points

* **How would you design an automatic failover mechanism for LLM API calls across different providers?**
  * *Reference:* OurNigeria (Fallback mechanisms) & System Design.
  * *Points:* Mention your "three-stage intent classification" in OurNigeria which included an "inferred fallback" when the primary LLM classification failed. Explain that for Langdock, you would use circuit breakers and exponential backoff. If an Azure/AWS model deployment returns a 429 (Rate Limit) or 500 error, the abstraction layer should catch it and instantly route the prompt to a secondary provider deployment without the user noticing.
* **How would you build a resumable streaming architecture where a user can disconnect and resume mid-response?**
  * *Reference:* OurNigeria (SSE Streaming) & ActivEdge (EventSource).
  * *Points:* Discuss your current SSE implementation in OurNigeria (with 15s keepalive heartbeats to prevent proxy timeouts). To make it *resumable*, explain that you would decouple the LLM generation from the active client connection. The backend would stream the LLM response into a fast temporary store (like Redis Streams) while sending it to the client. Each chunk gets a sequence ID. If the client drops and reconnects with their last sequence ID, the server fetches the missed chunks from Redis and seamlessly reattaches them to the live stream.
  * *Reference:* OurNigeria multi-agent platform.
  * *Points:* Discuss the Mastra framework implementation, the 5 specialized agents, intent classification, and the hybrid RAG pipeline combining pgvector and BM25 with Cohere reranking.
* **How have you handled real-time streaming and perceived latency?**
  * *Reference:* OurNigeria and ActivEdge.
  * *Points:* Explain your implementation of SSE streaming with keepalive heartbeats to prevent timeouts, token-budgeted context management, and using the EventSource API for real-time data updates.
* **Describe your experience with full-stack TypeScript and monorepos.**
  * *Reference:* OurNigeria.
  * *Points:* Detail the Nx monorepo architecture managing 6 applications (Next.js frontend/admin, NestJS API/ingestion) orchestrated with pnpm workspaces.
* **How do you use AI tools in your daily workflow?**
  * *Reference:* Daily habits.
  * *Points:* Be prepared to discuss specific tools you use daily (e.g., Cursor, Copilot, Claude), your active experimentation, and your strong opinions on what works and what doesn't (as explicitly requested in the JD).
* **Tell us about a time you optimized application performance.**
  * *Reference:* Genentech and Descasio.
  * *Points:* Mention implementing lazy loading and code splitting at Genentech, and using React Profiler and Lighthouse at Descasio to reduce bundle size by 40% and improve load times by 35%.
* **Are you comfortable relocating to and working 100% on-site in Berlin?**
  * *Reference:* Personal commitment.
  * *Points:* Confirm your enthusiasm for an in-person, collaborative environment and confirm your work permit status for Germany.