# Langdock Video Interview Scripts

## Video 1: How do you currently utilize AI at work or in your personal life? (2.5 min)

**Opening (15s):**
"Hi, I'm Arinze. AI isn't just a tool I use occasionally, it's embedded in how I build software every day."

**At work - Genentech (45s):**
"At Genentech, I co-developed a full-stack RAG-powered chat widget using OpenAI's GPT models, LangChain, Vercel AI SDK, and Chroma vector database. It lets users connect their data
sources and query them in real time through a conversational interface. So I'm not just using AI, I'm building AI-powered products."

**Personal project - OurNigeria (60s):**
"Outside work, I built OurNigeria, an AI platform for Nigerian budget analysis and corruption tracking. I designed a multi-agent system with 5 specialized agents, a hybrid RAG pipeline
over 708,000+ vector embeddings from 700+ government documents across 37 states. Citizens can ask questions about government spending in plain English or Pidgin and get sourced,
data-backed answers. The technical challenges were real: SSE streaming with keepalive heartbeats, pgvector plus BM25 search with Reciprocal Rank Fusion and Cohere reranking, all running
reliably in production."

**Nerding about the setup (60s):**
"Beyond building AI products, I actively nerd out about my development setup. My primary coding tool is Claude Code, but I don't just use it out of the box. I've written custom slash
commands that chain together web scraping, document generation, and PDF rendering into automated pipelines. I experiment with different models constantly. For OurNigeria, I benchmarked
Voyage AI's voyage-3-large against OpenAI's embeddings for retrieval quality, tested Cohere reranking versus raw similarity scores, and tuned embedding dimensions and chunk sizes until
the RAG pipeline actually returned useful answers. I have strong opinions from that work: hybrid search with Reciprocal Rank Fusion consistently beats pure vector similarity, reranking
is not optional for production RAG, and the difference between a good and bad chunking strategy matters more than which embedding model you pick. I also use Langfuse to trace every LLM
call in production, so I'm not guessing about what works, I'm measuring it."

**Close (10s):**
"So I don't just use AI daily, I build AI systems, experiment obsessively with what works, and have the production data to back up my opinions."

---

## Video 2: What exceptional thing have you done/achieved? (2.5 min)

**Opening (10s):**
"The most exceptional thing I've built is OurNigeria, at ournigeria.ng."

**The problem (20s):**
"Nigeria publishes hundreds of budget documents every year across 37 states, buried in PDFs, spreadsheets, and opaque formats. Citizens have no practical way to understand where their
money goes or hold officials accountable."

**What I built (60s):**
"I built the entire platform solo, end to end. It's an Nx monorepo with 6 applications: a NestJS API, a Next.js citizen-facing app, an admin dashboard, a document ingestion pipeline
that processes PDFs with OCR, spreadsheets, and more, a marketing site, and a video generation service. The core is a multi-agent AI system with 5 specialized agents, a Router, Budget
Analyst, Corruption Analyst, GovSpend Analyst, and Impact Analyst, with three-stage intent classification and domain-specific RAG analysis."

**Technical depth (40s):**
"The RAG pipeline combines pgvector similarity search with BM25 full-text search, merged via Reciprocal Rank Fusion and reranked with Cohere. It processes 700+ documents, 708,000+
vector embeddings. I built SSE streaming with heartbeats to prevent proxy timeouts, custom Prisma migration tooling for pgvector, Docker Compose production deployment with health checks
and memory limits, and integrated Langfuse for LLM observability."

**Why it matters (20s):**
"What makes this exceptional isn't just the technical depth. It's that real citizens use it to query government spending in plain English or Pidgin and get sourced answers. Every
architectural decision had to work reliably, not as a demo, but in production."

**Close (10s):**
"Building a system this complex solo, from database schema to AI agents to frontend, and shipping it to real users, is the work I'm most proud of."

---

## Recording Tips

- Speak conversationally, not like you're reading a script. Use these as talking points, not verbatim lines.
- Keep energy up but natural. They said "no need for anything polished."
- For Video 1, the key message is: you BUILD AI systems, not just use ChatGPT.
- For Video 2, the key message is: you shipped something technically deep, solo, for real users, with social impact.
