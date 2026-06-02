# Introductory Interview Prep: Senior Product Engineer at TechMiners GmbH

---

## 1. Company Deep Dive

### What They Do
TechMiners GmbH is a Berlin-based company (founded 2019) that provides **data-driven Technology Due Diligence for M&A transactions**. They assess software architecture, code quality, product strategy, team dynamics, and engineering processes for investors evaluating deals. Assessments are led exclusively by experienced CTOs (not junior analysts), supported by a proprietary, patent-applied-for data analysis platform called **TechMiners ONE**.

- **Target market:** Private equity firms, VCs (Seed through Series C), family offices, search funds, and corporate buyers
- **Scale:** 600+ companies assessed, 20B+ EUR in transaction value supported, 135+ years combined CTO experience in their assessor network
- **Notable clients:** High-Tech Grunderfonds, Index Ventures, Bright Pixel Capital, Pollen Street, SaaS.group, FUNKE Digital, Klett Group, All for One Group
- **SOC 2 Type 2 audited** (security matters given they access companies' codebases behind firewalls)
- **Leadership:** Daniel Jung (CEO), Mario Baumgart (Managing Director), Christoph Beckmann (Founder)

### What They Offer Employees
- **Remote-first** work model (Berlin-based)
- Small, high-impact engineering team (likely 2-3 engineers currently, 11-50 company-wide)
- AI-native development culture: Claude Code and Cursor are core tools, not afterthoughts
- Product with real traction (600+ assessments, blue-chip investor clients)
- Direct collaboration with CTOs and company leadership
- Early-stage product company pivoting from services, meaning significant ownership and architectural influence

### Recent News & Context
- Bootstrapped/self-funded, no external funding rounds recorded, revenue generated from due diligence engagements
- Actively hiring to transform TechMiners ONE from manual, static reporting into a **high-speed, agentic data platform**
- Published a "Due Diligence landscape overview in 2025" and knowledge guides on AI in Tech DD
- Most recent known deal advisory: Altares in 2025

### Why This Company Is Interesting (Genuine Reasons)
1. **AI as the product, not a feature:** They're building an agentic AI platform for M&A due diligence, a domain where automated analysis of codebases, architectures, and engineering practices is genuinely novel. This is the kind of AI application where the technology creates real, measurable value (faster, deeper assessments) rather than being bolted on.
2. **Small team, outsized impact:** With only 2-3 engineers building a product used by major PE/VC firms, every feature ships to real users making real investment decisions. This is the kind of leverage that's hard to find at larger companies.
3. **AI-native development workflow:** They use Claude Code and Cursor as core development tools and expect engineers to orchestrate agentic AI tooling. This aligns with how I already work and build.

---

## 2. Role Analysis

### Core Responsibilities (Day-to-Day)
- Own features end-to-end: from PostgreSQL/Django backend to React UI
- Build TechMiners ONE, the automated machinery for M&A due diligence
- Chain and orchestrate agentic AI tools (Claude Code, Cursor) to accelerate development
- Collaborate directly with CTOs to translate business requirements into technical solutions
- Maintain a scalable, secure architecture prepared for AI integration

### Key Challenges
- Transforming a services company's tooling into a standalone product platform
- Building agentic AI workflows that automate complex, domain-specific analysis (code quality, architecture assessment, team evaluation)
- Working in a very small engineering team where you own large surface areas
- Balancing speed (early-stage startup) with security and reliability (SOC 2, dealing with sensitive M&A data behind firewalls)

### Must-Have vs Nice-to-Have
**Must-have:**
- 5+ years production engineering experience
- Django expertise (this is the backend)
- Advanced AI-native development and agentic tool orchestration
- Product-focused mindset
- Valid German work permit, Berlin residence
- Remote-first work capability

**Nice-to-have (inferred):**
- Experience with M&A, fintech, or enterprise SaaS
- Experience building developer tools or code analysis platforms
- Background with monorepo architectures and complex data pipelines

---

## 3. Background Alignment

### Strongest Matches

1. **Multi-agent AI system with agentic workflows (OurNigeria)**
   - Built a production multi-agent AI system using Mastra with 5 specialized agents, three-stage intent classification, and hybrid RAG pipeline (pgvector + BM25 + RRF + Cohere reranking) processing 708K+ vector embeddings
   - **Frame for TechMiners:** "I've built production agentic AI systems from scratch. At OurNigeria, I designed a multi-agent pipeline with 5 specialized agents that route queries through intent classification and RAG-powered analysis. This is directly relevant to building agentic data analysis for TechMiners ONE."

2. **Full-stack database-to-UI ownership (OurNigeria)**
   - Architected the entire platform as an Nx monorepo with 6 applications: NestJS API, Next.js frontends, document ingestion pipeline, PostgreSQL 16 with Prisma v7
   - **Frame for TechMiners:** "I've owned products end-to-end, from database schema design to frontend UI. At OurNigeria, I built the entire platform solo, designing the PostgreSQL schema, building the API, and shipping the React frontends. I'm comfortable owning the full stack."

3. **AI-native development with Claude Code**
   - Active Claude Code user for development (listed in CV summary, used daily)
   - **Frame for TechMiners:** "I'm already deeply embedded in AI-native development. I use Claude Code as a core development tool, not just for autocomplete but for orchestrating complex multi-file changes, debugging, and accelerating entire development cycles."

4. **RAG chat widget with LLM integration (Genentech)**
   - Co-developed a full-stack Next.js chat widget powered by RAG using OpenAI GPT, LangChain, Vercel AI SDK, and Chroma vector database
   - **Frame for TechMiners:** "At Genentech, I co-built a RAG-powered chat system that lets users connect their data sources and query them conversationally. This experience with production LLM integrations, embeddings, and vector search maps directly to building AI-powered due diligence tools."

5. **Business requirement translation and CTO collaboration (multiple roles)**
   - At Founders Lair: translated business requirements into database models and APIs, collaborating with business team
   - At Descasio: collaborated with software architects to create scalable frontend architecture
   - At Genentech: collaborated with backend engineers on auth strategies
   - **Frame for TechMiners:** "I've consistently worked at the intersection of business and engineering. At Founders Lair, I translated business requirements directly into database schemas and APIs. I'm comfortable working with CTOs to turn business needs into shipped features."

### Transferable Experience

- **Document processing pipelines (OurNigeria):** Built a document ingestion pipeline supporting PDF (OCR), XLSX, DOCX, JSON, and Markdown, processing 700+ documents across 37 states with zero errors. Relevant to analyzing codebases and documentation in due diligence.
- **Financial/transaction domain (ActivEdge):** Built a bank settlement solution handling millions of daily transactions with real-time reconciliation. Shows comfort with high-stakes, data-intensive financial systems.
- **Performance optimization and architecture (Descasio, Genentech):** Reduced bundle sizes by 30-40%, optimized caching for 40% performance improvement, built design systems. Shows ability to maintain scalable, performant architecture.
- **Docker, CI/CD, and production deployment (OurNigeria):** Docker Compose production deployment with health checks, memory limits, GitHub Actions CI/CD, Playwright E2E tests.

### Gaps to Address

1. **Django/Python production experience:**
   - Honest framing: "My Python experience is in personal projects, not production. However, I've built production APIs in NestJS and NodeJS, and the patterns, REST design, ORM usage, auth, testing, translate directly. I'm confident I can ramp up on Django quickly, especially with AI-native tooling like Claude Code accelerating the learning curve."

2. **No direct M&A or due diligence domain experience:**
   - Honest framing: "I haven't worked in M&A specifically, but I've built data-intensive platforms across healthcare (Genentech), fintech (ActivEdge), and civic tech (OurNigeria). The pattern of ingesting large document sets, extracting structured insights, and presenting them through a user-friendly interface is consistent across all these domains."

---

## 4. "Why This Company?" Script

"What drew me to TechMiners is that you're building an AI-powered product in a domain where the technology genuinely changes outcomes, automating the analysis that CTOs do manually during due diligence. I've built production multi-agent systems and RAG pipelines, so I understand both the potential and the engineering challenges of making AI reliable for high-stakes decisions. The fact that you're a small team using Claude Code and Cursor as core tools, not just experimenting with them, tells me this is a place where I'd have real ownership and where my experience building agentic AI systems end-to-end would have immediate impact."

---

## 5. "What Are You Looking For?" Script

"I'm looking for a role where I can own features end-to-end and build AI-powered products that solve real problems, not just add a chatbot to an existing product. What stood out about TechMiners is that your entire product thesis is built around AI automating complex analysis, and the engineering team is small enough that I'd have direct influence on architecture decisions. I also appreciate that you've built a culture around AI-native development with Claude Code and Cursor. That's how I already work, and I want to be somewhere that embraces that rather than treats it as experimental."

---

## 6. "Tell Me About Yourself" Script

"I'm a software engineer at Genentech where I work on clinical trial data tools, and I recently built OurNigeria, a civic tech platform where I designed and shipped a multi-agent AI system with 5 specialized agents and a hybrid RAG pipeline processing over 708,000 vector embeddings across 700+ government budget documents.

Over the past 8 years, I've consistently gravitated toward full-stack, product-focused roles. At ActivEdge, I built a bank settlement system handling millions of daily transactions. At Descasio, I led frontend architecture that delivered 25% engagement improvements and 35% faster load times. At Genentech, I co-built a RAG-powered chat widget and led a migration from Vue.js to React.

What brings me to TechMiners is the convergence of what I'm best at: building full-stack products end-to-end, designing AI systems that work reliably in production, and working in small teams where I can own large surface areas. Your mission of automating M&A due diligence with agentic AI is exactly the kind of high-impact, technically challenging product I want to build next."

---

## 7. Likely Questions & Talking Points

### Q1: "Tell me about your experience with AI-native development and agentic tools."
- Built a **multi-agent AI system at OurNigeria** with 5 specialized agents using Mastra framework
- Three-stage intent classification: keyword scoring, LLM classification with caching, inferred fallback
- Hybrid RAG pipeline: pgvector + BM25 + Reciprocal Rank Fusion + Cohere reranking
- Use **Claude Code daily** as a core development tool for orchestrating complex changes
- Co-built a **RAG chat widget at Genentech** using OpenAI, LangChain, Vercel AI SDK, and Chroma
- **Key project:** OurNigeria multi-agent system (architecture, agent design, production deployment)

### Q2: "You don't have production Django experience. How would you handle that?"
- Built production APIs in **NestJS** (OurNigeria) and **NodeJS** (Founders Lair, SureTrade)
- Same patterns: REST design, ORM/schema management (Prisma), auth, middleware, testing
- Python experience in personal projects, comfortable with the language
- **AI-native tooling accelerates ramp-up**: Claude Code and Cursor make learning a new framework significantly faster
- **Key point:** The architectural patterns transfer; the framework syntax is the easy part

### Q3: "Describe a time you owned a feature end-to-end, from database to UI."
- **OurNigeria:** Designed PostgreSQL 16 schema with Prisma v7, built NestJS APIs, built Next.js frontends
- Owned the entire platform solo: 6 applications in an Nx monorepo
- Document ingestion pipeline processing 700+ documents with zero errors
- Built admin dashboard, citizen-facing chat, authentication, CI/CD
- **Key project:** OurNigeria (complete end-to-end ownership of the entire product)

### Q4: "How do you collaborate with non-technical stakeholders or translate business requirements?"
- **Founders Lair:** Translated business requirements directly into database models and APIs, collaborating with the business team
- **Genentech:** Collaborated with backend engineers on auth strategies, worked with product teams on Chrome extension migration
- **OurNigeria:** Made 700+ government budget documents queryable in plain English and Pidgin, user-focused design decisions throughout
- **Key example:** Founders Lair business requirement translation

### Q5: "Tell me about a challenging performance optimization you've done."
- **Descasio:** Profiled render bottlenecks with React Profiler and Lighthouse, reduced bundle size by 30-40% using rollup-plugin-visualizer and webpack-bundle-analyzer, achieving 35% faster load time
- **Descasio:** Optimized caching mechanisms for 40% performance improvement
- **Genentech:** Implemented lazy loading, code splitting, and CDN asset delivery
- **Key project:** Descasio performance optimization (measurable results: 30-40% bundle reduction, 35% faster load)

### Q6: "How do you approach building scalable, secure architecture?"
- **OurNigeria:** Docker Compose production deployment with health checks, memory limits (API 1GB, Ingest 4GB, Postgres 2GB), 30s graceful shutdown
- **OurNigeria:** Infisical for secrets management, Langfuse for LLM observability, Playwright E2E tests across 4 projects
- **Genentech:** JWT-based auth with HTTP-only cookies, role-based access control
- Mention awareness of SOC 2 requirements and handling sensitive data (relevant to TechMiners)
- **Key project:** OurNigeria production infrastructure

### Q7: "Why are you leaving your current role?"
- Frame around **growth and alignment**: looking for a role where AI is the product, not an add-on
- Want to work in a smaller team with more ownership and direct product impact
- The intersection of AI engineering and product development at TechMiners is a natural next step
- **Key point:** Not running away from anything, running toward the kind of work I do best

### Q8: "What's your experience working in early-stage or startup environments?"
- **OurNigeria:** Built the entire product solo, from architecture to deployment, true early-stage ownership
- **Founders Lair:** Small startup contract, wore multiple hats (frontend, backend, CI/CD, mentoring)
- **ActivEdge:** Team of 3 frontend engineers building a high-volume settlement system
- Comfortable with ambiguity, rapid iteration, and owning large surface areas
- **Key project:** OurNigeria (demonstrates startup-level ownership and velocity)

Technical interview (1hr) by staff engineer
Trial day (supper day)