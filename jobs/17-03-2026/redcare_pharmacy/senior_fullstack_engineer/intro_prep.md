# Intro Interview Prep: Redcare Pharmacy — Senior Fullstack Engineer (BE Focused)

---

## 1. Company Deep Dive

### What They Do
- **Europe's largest online pharmacy** (formerly Shop Apotheke), publicly listed on the Frankfurt Stock Exchange (ticker: RDC.DE)
- One-stop pharmacy platform serving millions of customers across 7+ European markets (Germany, Netherlands, Belgium, France, Italy, Poland, etc.)
- Offices in Berlin, Cologne, Munich, Eindhoven, Sevenum, Lille, Milan, Tongeren, Warsaw
- Mission: *"Until every human has their health"* — making quality pharmaceutical care digitally accessible

### What They Offer Employees
- **Tech org of ~200 professionals**: software engineers, product owners, agile coaches, QA engineers, UX designers, SREs
- Comprehensive onboarding, internal + external professional development
- Flexible work with up to 20 days/year remote anywhere in the EU
- Deutschland Ticket (public transport), corporate pension, employee discounts, sports/fitness, mental health resources
- Visa assistance for international hires
- Team events and company celebrations

### Recent News (2025-2026)
- **Strong 2025 growth**: Group revenue up 24.1% to EUR 2.9 billion; Rx revenue surpassed EUR 1 billion for the first time; adjusted EBITDA up 72% YoY
- **2025-2026 are "peak investment years"**: EUR 118.6M capex focused on automation and logistics
- Proactively restructured debt — repurchased EUR 157.9M of convertible bonds, issued EUR 300M new bonds maturing 2032
- **2026 outlook**: 13-15% revenue growth, EBITDA margin of at least 2.5%
- New CFO Hendrik Krampe appointed November 2025
- Published Climate Transition Plan aligned with Paris Agreement (1.5°C target)

### Why This Company Is Interesting (Genuine Reasons)
1. **Healthcare e-commerce at massive scale**: Processing millions of pharmaceutical orders across Europe — a rare combination of complex logistics, regulatory compliance, and modern web engineering. This is distributed systems and event-driven architecture applied to a mission that actually matters.
2. **Peak investment in tech**: With 2025-2026 as peak capex years and a 200-person tech org, they're actively building — not maintaining. Joining during a build phase means meaningful engineering impact.
3. **Modern JS stack on real infrastructure**: NestJS, Next.js, React, TypeScript, Kubernetes, RabbitMQ, Google Cloud — this is the exact stack you work with, applied to a product serving millions. Not a startup experiment, but production-grade at scale.

---

## 2. Role Analysis

### Core Responsibilities (Day-to-Day)
- Design and build complex features across the web-shop (backend-focused but full-stack)
- Build and extend backend services with clean interfaces and API contracts
- Contribute to React frontend with focus on performance
- Implement async communication using RabbitMQ (event-driven architecture)
- Full ownership: design → implementation → testing → deployment → monitoring
- Mentor junior engineers and participate in architecture discussions

### Key Challenges
- Balancing backend service reliability with a fast-moving e-commerce frontend
- Designing scalable async messaging patterns (RabbitMQ) for order processing, inventory, notifications
- Maintaining clean API contracts across microservices in a growing org
- Performance optimization for a high-traffic web-shop serving millions of European customers
- Working within healthcare regulatory constraints (pharmaceutical e-commerce compliance)

### Must-Have vs Nice-to-Have
| Must-Have | Nice-to-Have |
|-----------|-------------|
| Node.js + TypeScript for scalable services | Java experience |
| RESTful API design + distributed systems | Google Cloud experience |
| Event-driven architecture patterns | RabbitMQ specifically (vs other message brokers) |
| Docker, Kubernetes, CI/CD, production monitoring | MongoDB experience |
| Technical ownership + seniority through impact | NestJS specifically |
| Independent work on complex tasks | E-commerce domain knowledge |

---

## 3. Background Alignment

### Strongest Matches

1. **NestJS backend architecture at scale (OurNigeria)**
   - Architected a full platform as an Nx monorepo with NestJS API backend, NestJS ingestion pipeline, and 4 other apps — designed clean API interfaces, SSE streaming, and authentication flows
   - *Frame it as*: "I've architected and built production NestJS services from scratch, including API design, database schema design with Prisma, and deployment with Docker — exactly the backend ownership this role requires."

2. **Event-driven / real-time architecture (OurNigeria + ActivEdge)**
   - OurNigeria: SSE streaming with keepalive heartbeats to prevent reverse proxy timeouts
   - ActivEdge: Adopted native EventSource API for real-time data streaming, replacing socket.io for a high-volume bank settlement solution
   - *Frame it as*: "I've implemented event-driven patterns in production — SSE streaming for real-time data delivery, and I've worked with message-driven architectures. RabbitMQ is a natural extension of this experience."

3. **Full ownership from design to production (OurNigeria)**
   - Designed the entire system: database schema, API architecture, CI/CD with GitHub Actions, Docker Compose deployment with health checks, memory limits, graceful shutdown, and Traefik reverse proxy
   - *Frame it as*: "On OurNigeria, I owned the entire lifecycle — from architecture decisions to production deployment and monitoring. That's exactly the ownership model described in this role."

4. **Docker + CI/CD + production infrastructure (OurNigeria + Genentech)**
   - OurNigeria: Docker Compose production deployment, multi-stage Dockerfiles, health checks, memory limits, GitHub Actions CI/CD, Playwright E2E tests
   - Genentech: Playwright E2E tests in CI/CD pipeline with Allure reporting and Slack notifications
   - *Frame it as*: "I've built containerized CI/CD pipelines with automated E2E testing and production deployment — Docker, GitHub Actions, and monitoring are part of my daily workflow."

5. **Mentoring junior engineers (Genentech, Founders Lair, Descasio)**
   - Genentech: Mentored 2 interns; Founders Lair: Guided 2 interns through full-stack projects; Descasio: Mentored junior engineers on frontend best practices
   - *Frame it as*: "I've consistently mentored junior engineers across roles — from code reviews and architecture guidance to hands-on pairing on complex features."

### Transferable Experience

- **High-volume financial transaction processing (ActivEdge)**: Settlement solution handling millions of daily transactions with MasterCard/VISA — demonstrates ability to build systems where reliability and scale matter, directly analogous to e-commerce order processing
- **Healthcare domain experience (Genentech/Roche)**: Working within a regulated industry with compliance requirements — relevant to pharmaceutical e-commerce
- **React + Next.js frontend performance (Genentech, Descasio)**: Extensive performance optimization (lazy loading, code splitting, bundle size reduction of 30-40%, Lighthouse auditing) — directly relevant to the frontend contribution expected

### Gaps to Address

1. **RabbitMQ specifically**: "I haven't used RabbitMQ directly, but I've implemented event-driven patterns with SSE and EventSource for real-time data streaming, and I've designed async communication in distributed systems. The messaging concepts are the same — RabbitMQ is a tool I can pick up quickly given my understanding of pub/sub and async patterns."

2. **Kubernetes**: "I've worked extensively with Docker and Docker Compose for production deployments including health checks and resource limits. Kubernetes is the natural next step, and I understand container orchestration concepts. I'm confident I can ramp up quickly in an environment where K8s is already established."

3. **Google Cloud**: "My cloud experience is primarily AWS (CloudFront, S3) and platform services like Vercel and Heroku. Cloud providers share core concepts — compute, storage, networking, IAM — and I can transfer that knowledge to GCP."

4. **Java**: "My backend work has been in Node.js/TypeScript and NestJS. I don't have production Java experience, but the role is primarily Node.js/TypeScript focused, which is my strength."

---

## 4. "Why This Company?" Script

"Redcare Pharmacy stands out to me for a few specific reasons. First, you're building at a scale that's genuinely rare in European e-commerce — EUR 2.9 billion in revenue, millions of customers, and you're in a peak investment phase right now in tech, which means I'd be joining during a build phase, not a maintenance phase. Second, the tech stack is exactly what I work with daily — NestJS, Next.js, TypeScript, Docker, Kubernetes — but applied to a mission I find compelling. Healthcare accessibility is a problem worth solving, and doing it through modern distributed systems and event-driven architecture is the kind of engineering challenge I'm drawn to."

---

## 5. "What Are You Looking For?" Script

"I'm looking for a role where I can take full technical ownership of features end-to-end — from API design through to deployment and monitoring — in a system that operates at real scale. What stood out about Redcare is that your engineering team of 200 is building a platform that serves millions of customers across Europe, using a modern stack I'm deeply experienced with. I also value working somewhere that invests in its engineers — the professional development support, the flexible work setup, and the fact that you're in a peak investment year in tech tells me this is a team that's serious about building well, not just shipping fast."

---

## 6. "Tell Me About Yourself" Script

"I'm a senior fullstack engineer, currently at Genentech — part of Roche — where I've been building clinical data products, including co-developing a full-stack Next.js application with a RAG-powered AI system and leading a migration from Vue.js to React. Before that, I spent two years as a Senior Frontend Developer at Descasio, where I drove 40% performance improvements and established engineering standards across the team.

Most recently, I've been building OurNigeria — a platform I architected end-to-end using NestJS and Next.js as an Nx monorepo with six applications. I designed the API backend, built the PostgreSQL database schema with Prisma, implemented Docker-based production deployment with CI/CD, and created a multi-agent AI system. That project really brought together my backend architecture skills with my frontend experience.

What draws me to Redcare is the opportunity to apply this exact NestJS, TypeScript, and distributed systems experience to an e-commerce platform operating at European scale — with full feature ownership from design through production, which is how I do my best work."

---

## 7. Likely Questions & Talking Points

### Q1: "Tell me about your experience with Node.js and TypeScript for building scalable backend services."
- **Talk about**: OurNigeria NestJS backend — designed API architecture, database schema with Prisma/PostgreSQL, SSE streaming with keepalive heartbeats, authentication flows
- **Also mention**: Founders Lair — built NodeJS RESTful APIs, translated business requirements into MongoDB schemas
- **Metric to drop**: Platform processes 700+ budget documents with 708K+ vector embeddings, zero ingestion errors

### Q2: "How have you implemented event-driven architecture patterns?"
- **Talk about**: OurNigeria SSE streaming — real-time chat responses with 15s keepalive heartbeats to prevent reverse proxy timeouts
- **Also mention**: ActivEdge — adopted native EventSource API for real-time data streaming in bank settlement solution, replacing socket.io
- **Frame the gap**: "I haven't used RabbitMQ specifically, but the async messaging patterns — pub/sub, event-driven decoupling, handling eventual consistency — are concepts I apply regularly. RabbitMQ is a tool; the architecture thinking is what I bring."

### Q3: "Describe a feature you owned end-to-end, from design to production."
- **Talk about**: OurNigeria (entire platform) — architected the Nx monorepo, designed database schema, built NestJS APIs, configured Docker Compose production deployment with health checks and memory limits, set up CI/CD with GitHub Actions and Playwright E2E tests, integrated Traefik reverse proxy
- **Key point**: "I didn't just write the code — I made every architecture decision, designed the deployment topology, and set up monitoring. That's the kind of ownership I thrive on."

### Q4: "How do you approach API design and maintaining clean contracts?"
- **Talk about**: OurNigeria — clean NestJS API interfaces with typed DTOs and Prisma models ensuring type safety from database to API response
- **Also mention**: Genentech — collaborated with backend engineers to align on auth strategies and API contracts for JWT-based flows
- **Principle**: "I believe in contracts-first design — define the interface, agree on it, then implement. TypeScript and NestJS make this natural with decorators, DTOs, and validation pipes."

### Q5: "Tell me about your experience with Docker, Kubernetes, and CI/CD."
- **Talk about**: OurNigeria — multi-stage Dockerfiles, Docker Compose production deployment with health checks, memory limits (API 1GB, Ingest 4GB, Postgres 2GB), 30s graceful shutdown, GitHub Actions CI/CD with Playwright across 4 test projects
- **Also mention**: Genentech — Playwright E2E in CI/CD with Allure Reports on GitHub Pages, Slack notifications for build visibility
- **K8s gap framing**: "My container experience is Docker and Compose for production. Kubernetes is the orchestration layer I'm ready to step into — I understand the concepts from the container side."

### Q6: "How do you mentor junior engineers?"
- **Talk about**: Genentech — mentored 2 interns, fostered culture of technical excellence; Founders Lair — guided 2 interns through full-stack projects; Descasio — mentored junior engineers on frontend best practices
- **Approach**: "I focus on three things: pair programming on complex problems so they see the thought process, thorough code reviews with explanations not just corrections, and gradually increasing ownership — start with well-scoped tasks, then expand to feature-level ownership."

### Q7: "Why are you looking to leave your current role?"
- **Talk about**: Current role at Genentech is frontend-focused; looking for a role that leverages full-stack and especially backend skills — NestJS, API design, distributed systems, Docker
- **Frame positively**: "Genentech has been excellent for sharpening my React and frontend architecture skills. But my recent work on OurNigeria reminded me that I do my best work when I own the full stack, especially the backend. This role's backend-focused full-stack profile is exactly that."

### Q8: "What experience do you have with distributed systems and microservices?"
- **Talk about**: OurNigeria — 6-application Nx monorepo with separate NestJS services (API + ingestion pipeline), inter-service communication, Traefik reverse proxy routing
- **Also mention**: ActivEdge — settlement solution processing millions of daily transactions across MasterCard, VISA, and e-commerce modules with real-time data streaming
- **Principle**: "I think about service boundaries in terms of domain ownership, independent deployability, and failure isolation. Clean API contracts between services are non-negotiable."
