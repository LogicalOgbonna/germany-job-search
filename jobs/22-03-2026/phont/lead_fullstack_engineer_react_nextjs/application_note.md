# Application Note for PHONT - Lead Fullstack Engineer

**Subject:** Application - Lead Fullstack Engineer (React/Next.js)

---

Hi PHONT team,

I'm Arinze, a fullstack engineer with 8 years of experience building production-grade React/Next.js applications with real-time data systems and robust infrastructure.

**Boldest build: OurNigeria (ournigeria.ng)**

The most ambitious prototype-to-production migration I've done is OurNigeria, an AI-powered platform that lets Nigerian citizens query government budget data in plain English or Pidgin. I architected the entire system solo as an Nx monorepo managing 6 applications: two NestJS backends, three Next.js frontends, and a Remotion video service.

The hardest technical challenge was building the real-time streaming layer. The platform uses SSE to stream AI responses from a multi-agent pipeline (5 specialized LLM agents routing queries through a hybrid RAG system over 708K+ vector embeddings). I had to implement keepalive heartbeats every 15 seconds to prevent reverse proxy timeouts, token-budgeted context windows to manage conversation memory, and graceful error recovery mid-stream. Getting low-latency, reliable streaming through NestJS to the Next.js frontend while keeping the connection alive across Traefik's reverse proxy taught me more about real-time data delivery than any other project.

What I learned: production real-time systems are less about the protocol choice and more about the edge cases, timeout handling, backpressure, and making the streaming feel instantaneous to the user even when the backend is doing heavy computation.

This experience maps directly to what you're building at PHONT: real-time APIs streaming data from an audio analysis engine to an animated frontend, with the infrastructure to make it production-grade.

**Links:**
- OurNigeria: https://ournigeria.ng
- LinkedIn: https://www.linkedin.com/in/arinzeogbonna
- CV: attached

Looking forward to hearing from you.

Best,
Arinze Ogbonna
