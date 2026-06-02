# Introductory Interview Prep: Wunderflats - Software Engineer

## 1. Company Deep Dive

- **What they do:** Wunderflats operates a European platform for mid-term furnished housing rentals (1+ months), connecting verified landlords with vetted tenants.
- **What they offer:** A highly pragmatic, product-obsessed engineering culture that explicitly values "Buy/Integrate over Build." They focus on business value rather than lines of code and operate in a fast-paced Lean-Agile environment.
- **Recent news:** In Q1 2026, they rapidly expanded their European footprint. After launching in Brussels in February, they simultaneously entered Italy, Spain, Portugal, and Switzerland in March. They now operate in 8 countries with a portfolio of over 63,000 apartments.
- **Why this company is interesting:** 
  - Their engineering philosophy of "leverage over lines of code" aligns perfectly with your proven ability to build high-impact systems using smart third-party integrations.
  - Their rapid European expansion presents complex scaling and localization challenges (like the "Contract Engine" project), offering exciting architectural problems to solve.

## 2. Role Analysis

- **Core responsibilities:** Owning mission-critical financial systems (payments and pricing) from the database to the UI, with a heavy focus on the backend. A key project is "The Contract Engine," automating 95% of European contracts across diverse local regulations.
- **Key challenges:** Handling race conditions, data consistency, and edge cases in financial/contractual systems. Integrating third-party providers flawlessly while writing minimal custom code.
- **Must-have skills:** Node.js, TypeScript, React, Next.js, systems thinking, and strong end-to-end product ownership.
- **Nice-to-have:** GCP, Kubernetes, Terraform, GitHub Actions, MongoDB Atlas, GraphQL.

## 3. Background Alignment

- **Strongest matches:**
  - **Full-Stack Node.js/Next.js Ownership:** At OurNigeria, you architected and built the entire platform (NestJS backend, Next.js frontend) managing complex data ingestion and user flows. *Framing:* "I have recent, deep experience owning complex systems end-to-end using the exact Node.js/Next.js stack you use."
  - **Third-Party Integrations & "Buy over Build":** At OurNigeria, you integrated multiple AI providers (OpenAI, Cohere, Voyage AI) and services (Telegram, Infisical) to deliver massive business value quickly. *Framing:* "I naturally lean towards integrating best-in-class third-party tools rather than reinventing the wheel, which allowed me to single-handedly build a complex multi-agent platform."
  - **Systems Thinking & Data Consistency:** At ActivEdge, you built high-volume bank settlement solutions handling millions of daily transactions. *Framing:* "I have a strong background in financial systems where data consistency, race conditions, and edge cases are critical, directly translating to the needs of your payments and pricing platform."
- **Transferable experience:**
  - **MongoDB:** Used extensively at Founders Lair and SureTrade for designing database schemas and powering Node.js APIs.
  - **Infrastructure:** Extensive use of GitHub Actions, Docker, and CI/CD pipelines across OurNigeria, Genentech, and Descasio.
- **Gaps to address:**
  - **GCP / Kubernetes / Terraform:** You have strong AWS and Docker/CI/CD experience, but less direct exposure to GCP/K8s. *Framing:* "While my recent infrastructure work has been Docker and AWS-focused, the core concepts of containerization, health checks, and automated deployments I use daily map directly to Kubernetes and GCP environments."

## 4. "Why This Company?" Script

"I've been following Wunderflats' recent massive expansion into Southern Europe and Switzerland this March. What really draws me to the company is your engineering philosophy—the explicit focus on 'leverage over lines of code' and integrating third-party solutions to solve business problems. That's exactly how I operate, and the challenge of building something like 'The Contract Engine' to handle localized regulations across 8 different countries is exactly the kind of complex systems problem I want to tackle next."

## 5. "What Are You Looking For?" Script

"I'm looking for a role where I can take true end-to-end ownership of mission-critical systems, from the database up to the UI. What stood out about Wunderflats is your product-obsessed culture and the focus on the payments and pricing platform. I want to work in an environment where engineering success is measured by business impact and shipped value, rather than just writing custom code, and your 'Buy/Integrate over Build' mindset aligns perfectly with that."

## 6. "Tell Me About Yourself" Script

"I'm a Senior Software Engineer with about 8 years of experience, specializing in Node.js, TypeScript, and React. Most recently, I've been the lead engineer at OurNigeria, where I architected and built a complex AI-powered data platform from scratch using a NestJS backend and Next.js frontend. Before that, I spent a few years at Genentech redesigning mission-critical clinical trial data products, and earlier in my career, I built high-volume financial settlement solutions at ActivEdge. Throughout my career, I've always gravitated towards owning systems end-to-end and focusing on the business 'why' behind the code. I'm looking to bring that systems-thinking approach to a scaling product company, which is why the opportunity to work on Wunderflats' core financial and contract engines is the perfect next step for me."

## 7. Likely Questions & Talking Points

- **"Tell me about the most complex system you've ever had to work on or fix. What made it so difficult, and what did you do about it?"** *(Crucial screening question)*
  - **Reference:** OurNigeria multi-agent ingestion and query pipeline.
  - **Outline:**
    - *Situation:* Needed to process 700+ complex government budget documents and make them queryable in real-time.
    - *Task:* Build a system that accurately routes queries, extracts data, and prevents timeouts during long operations.
    - *Action:* Architected a hybrid RAG pipeline (pgvector + BM25 + Cohere reranking) and a multi-agent system. Implemented SSE streaming with keepalive heartbeats to solve reverse proxy timeout issues.
    - *Result:* Achieved zero ingestion errors across 959 files and delivered a highly responsive, accurate platform.
- **"How do you approach the 'Buy/Integrate over Build' philosophy?"**
  - **Reference:** OurNigeria third-party integrations.
  - **Outline:**
    - Explain that your first instinct is to research existing solutions to save time and reduce maintenance burden.
    - Highlight how you integrated OpenAI, Voyage AI, Cohere, and Langfuse at OurNigeria instead of building custom ML infrastructure, allowing you to ship a massive platform efficiently.
- **"Can you give an example of how you handle data consistency and race conditions?"**
  - **Reference:** ActivEdge bank settlement solution.
  - **Outline:**
    - Discuss building the high-volume settlement solution handling millions of daily transactions.
    - Mention techniques used to ensure transactional integrity and how you boosted settlement rates by 80%.
- **"How much experience do you have with Node.js and React/Next.js?"**
  - **Reference:** OurNigeria, Genentech, Founders Lair.
  - **Outline:**
    - Highlight 8 years of JS/TS experience.
    - Focus on recent heavy usage of NestJS (Node) and Next.js at OurNigeria, and Next.js/React at Genentech.
- **"What are your salary expectations and notice period?"**
  - **Outline:**
    - Be prepared with a specific number or range based on the Berlin market.
    - State your current notice period clearly.

