# Hostaway — Senior Frontend Engineer (Communications) — Application Answers

## Have you used webhooks?
Yes

### Explain when you most recently used webhooks
Most recently at OurNigeria (2026), where I built a Telegram bot integration with webhook-based message handling: Telegram POSTs incoming user messages to a NestJS endpoint, which validates the update, routes it through the multi-agent AI pipeline, and replies via the Bot API. Earlier I integrated GitHub Actions webhooks for CI events into Slack notifications on every test run at Genentech, posting Allure Report deep links into the team channel.

---

## Have you used websockets?
Yes

### Explain when you most recently used websockets
I built a peer-to-peer chat application where WebSockets were the signaling layer for connecting browser clients. A lightweight Node.js WebSocket server handled room creation, peer discovery, and the exchange of WebRTC SDP offers/answers and ICE candidates between participants; once peers were connected, chat messages flowed directly over WebRTC data channels rather than through the server, keeping the relay surface small and latency low. I handled the usual edge cases: heartbeat pings to detect dropped connections, reconnect with backoff on the client, room cleanup when the last peer left, and a fallback to relay messages over the WebSocket when a NAT traversal failed.

Outside that project, I have shipped adjacent real-time server-push patterns at scale: SSE streaming with 15-second keepalive heartbeats for the OurNigeria LLM chat (token-by-token responses, token-budgeted context windows), and the native EventSource API at ActivEdge replacing socket.io for streaming bank settlement updates, which cut latency and removed a heavy dependency.

---

## What project are you most proud of? What did you learn from it?
OurNigeria (ournigeria.ng), an AI-powered budget transparency platform I architected and built end-to-end. It is an Nx monorepo of 6 apps (NestJS API, NestJS ingestion pipeline, three Next.js frontends, a Remotion video service) running a multi-agent LLM system on the Mastra framework over 708K+ vector embeddings extracted from 700+ Nigerian government documents across 37 states. Citizens can ask, in English or Pidgin, where the money went, and get back charts, sources, and plain-language analysis.

What I learned: (1) LLM products live or die by observability, I wired Langfuse in from week one and it caught more issues than my unit tests; (2) hybrid retrieval (pgvector + BM25 + Reciprocal Rank Fusion + Cohere rerank) outperforms any single retrieval strategy on noisy government PDFs; (3) shipping solo forces ruthless prioritization, Docker Compose with health checks and memory limits beat reaching for Kubernetes, and Infisical beat hand-rolled secrets; (4) most importantly, building for users in your own market exposes assumptions you didn't know you had, especially around language, mobile-first layouts, and data trust.
