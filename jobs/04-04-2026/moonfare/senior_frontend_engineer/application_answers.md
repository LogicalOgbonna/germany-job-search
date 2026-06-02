### Describe a recent complex React/TypeScript feature you built. What made it complex, and how did you approach the architecture?
I recently built a real-time AI chat interface with dynamic data visualization for a platform called OurNigeria, using React 19, Next.js, and TypeScript. The complexity stemmed from handling Server-Sent Events (SSE) for streaming LLM responses while simultaneously parsing and rendering 22 different interactive chart types (using Recharts) dynamically based on the AI's output. To manage this, I approached the architecture by decoupling the streaming logic from the UI. I created a robust custom hook to manage the SSE connection with 15s keepalive heartbeats (to prevent proxy timeouts) and token-budgeted context management. For the UI, I implemented a factory pattern to dynamically render the appropriate chart components based on structured JSON payloads embedded within the stream. This ensured a highly responsive, non-blocking user experience even during heavy data processing.

### Describe how you utilize AI in your daily development work.
I leverage AI extensively both as a developer productivity multiplier and as a core product capability. For daily development, I use AI coding assistants (like Cursor/GitHub Copilot) for boilerplate generation, rapid refactoring, writing complex TypeScript utility types, and generating unit/E2E tests (Jest, Playwright). I also use LLMs for architectural brainstorming and debugging stack traces. On the product side, I actively build AI-powered features into applications, utilizing tools like the Vercel AI SDK, LangChain, and Mastra to integrate LLMs, RAG pipelines, and vector databases (pgvector, Chroma) directly into the frontend and backend architectures.

### Do you have enterprise platform development experience? If yes, please describe
Yes. At Genentech (Roche), I spearheaded the frontend development of an enterprise clinical trial data platform, migrating it from Vue.js to a React Chrome extension that securely transfers sensitive data to various upstream EHR systems. This required strict adherence to security protocols (HTTP-only cookies, JWT, RBAC) and scalable design system architecture. Additionally, at ActivEdge Technologies, I built a high-volume bank settlement and reconciliation platform that processes millions of transactions daily, which required deep performance optimization and real-time data streaming using the EventSource API and RxJS.

### How do you ensure alignment when working with cross-functional stakeholders in a remote environment?
I ensure alignment through proactive, asynchronous communication and robust documentation. I collaborate closely with backend engineers by defining strict API contracts before starting UI work to prevent blockers. I use Storybook to document UI components, allowing designers and product managers to review visual progress and interact with components asynchronously. I also rely on detailed PR descriptions, short Loom videos for feature demos, and active participation in agile ceremonies to keep all stakeholders informed, gather early feedback, and ensure we are always building towards the same goal.

### Where are you located?
Berlin, Germany

### What is your desired annual compensation?
€85,000 - €100,000 (Negotiable based on the overall package)
