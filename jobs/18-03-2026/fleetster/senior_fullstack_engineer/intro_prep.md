# Intro Interview Prep: Senior Full-Stack Engineer at fleetster

---

## 1. Company Deep Dive

### What They Do
fleetster is a B2B SaaS company founded in 2010, headquartered in Krailling/Munich. They build a fleet management and car-sharing platform serving **100,000+ users across 28 countries in 9 languages**. Their product portfolio includes:

- **Fleet Management** (digital vehicle files, damage management, traffic fines, procurement)
- **Corporate Car Sharing** (pool vehicle booking, RFID/keyless access, one-way trips)
- **Public Car Sharing** (white-label solution for mobility operators)
- **Electronic Driver Log** (tax-compliant digital logging via OBD telematics)
- **Driver License Check** (electronic validation with hardware + smartphone photo)
- **Geo & Tracking** (live GPS, route documentation, geofencing, 250+ OBD data points)
- **Bike Sharing**, **Billing Tool**, **White-Label Solutions**

They also produce hardware: OBD-Plug, Car Sharing Kit (smartphone digital car key), and Electronic Key Cabinets.

### What They Offer Employees
- ~27 employees, ~15 in the engineering/implementation team
- English-only communication within the team
- International, diverse workforce
- Annual training budget via Lotaro platform
- German language courses + Udemy access
- Furnished company apartments near the office
- Hybrid work culture (Munich area)
- Weekly gaming nights with pizza every Thursday
- ISO 27001 certified (passed compliance audit recently)

### Recent News & Developments
- **US market expansion** is a 2026 priority, hired Maria Tabush for US customer success (ex-airfocus, Actimo)
- **New Head of Sales**: Christian Weisbrodt (from Personio, finway)
- **Geotab Connect** conference participation (Las Vegas, Feb 2026)
- **Flotte! trade show** exhibiting in Dusseldorf (March 25-26, 2026)
- **fleetster Reloaded 2025** annual customer event (Nov 13, 2025) with CEO Tim Ruhoff presenting industry insights
- **fleetster Reloaded 2026** already planned for Nov 19, 2026, with new product launches and 2027 roadmap
- Active **Geotab marketplace** integration for their car-sharing solution

### Why This Company Is Interesting (Genuine Reasons)
1. **Architecture modernization in progress**: They are actively migrating from Express to NestJS, which is exactly the kind of backend framework I've been building production systems with on OurNigeria. Contributing to that migration with hands-on NestJS experience is compelling.
2. **International product at real scale**: 100K+ users across 28 countries and 9 languages is a genuinely complex engineering challenge, combining i18n, multi-tenancy, and localization with real-time hardware telemetry (OBD, RFID, GPS).
3. **Small team, high ownership**: With ~15 engineers building a platform this broad (fleet management, car sharing, billing, telematics), each person has significant architectural influence, something I thrive in based on my OurNigeria and Founders Lair experience.

---

## 2. Role Analysis

### Core Responsibilities (Day-to-Day)
- Full-stack feature development across the fleetster platform (React/Redux frontend, Node.js/NestJS backend)
- Contributing to the **Express-to-NestJS migration**, introducing new tools and frameworks
- Bug investigation and analysis, supporting the customer support team
- Working within the ~15-person international implementation team

### Key Challenges This Role Likely Solves
- **Legacy modernization**: Migrating a production Express backend to NestJS without disrupting 100K+ users
- **Cross-platform consistency**: Maintaining feature parity across web (React) and mobile (React Native) apps
- **Scale in a small team**: Broad product surface (fleet mgmt, car sharing, driver logs, billing, telematics) with limited engineers
- **International complexity**: i18n across 9 languages, multi-country regulatory compliance

### Must-Have vs Nice-to-Have

| Must-Have | Nice-to-Have |
|-----------|-------------|
| React / Redux | Blueprint UI library |
| Node.js / TypeScript | B2B / SaaS experience |
| MongoDB | Fleet management domain knowledge |
| Jest / Cypress | |
| Express / NestJS | |
| AWS | |
| React Native | |

---

## 3. Background Alignment

### Strongest Matches

1. **NestJS production experience (OurNigeria)**
   - Built the entire backend as two NestJS applications (API + ingestion pipeline) with PostgreSQL, Prisma, SSE streaming, and role-based access control
   - **Frame for fleetster**: "I've recently built two production NestJS backends from scratch, so I can contribute immediately to your Express-to-NestJS migration. I understand NestJS module architecture, dependency injection, guards, interceptors, and how to structure a gradual migration."

2. **React + Redux across multiple roles (Genentech, Descasio, ActivEdge)**
   - Led React UI redesigns achieving 25% engagement boost (Descasio), built complex settlement dashboards with Redux/RxJS handling millions of daily transactions (ActivEdge), migrated Vue.js to React (Genentech)
   - **Frame for fleetster**: "I've been building production React/Redux applications for over 6 years across fintech, healthcare, and civic tech, including a major Vue-to-React migration at Genentech that mirrors the kind of framework transitions fleetster is doing."

3. **Full-stack Node.js + MongoDB (SureTrade, Founders Lair)**
   - Designed MongoDB schemas and built Node.js REST APIs at SureTrade and Founders Lair, including CI/CD pipelines for automated deployment to AWS
   - **Frame for fleetster**: "I started my career building full-stack Node.js/MongoDB applications, so the data layer and API patterns are second nature to me. At Founders Lair I owned the full stack, from database schema design through to API development and React frontend."

4. **Testing discipline (Genentech, Descasio)**
   - Introduced Jest/Enzyme at Descasio (20% decrease in bug reports), built Playwright E2E tests in CI/CD at Genentech with Allure Reports and Slack notifications
   - **Frame for fleetster**: "Testing culture is important to me. At Descasio, introducing Jest and Enzyme reduced bug reports by 20%, and at Genentech I built Playwright E2E suites that run in CI/CD with automated reporting."

5. **Small-team ownership and mentorship (Founders Lair, OurNigeria)**
   - At Founders Lair (contract, small team): full-stack ownership from DB to frontend, mentored 2 interns. At OurNigeria: architected and built 6 applications solo as an Nx monorepo
   - **Frame for fleetster**: "I'm very comfortable in lean teams where each person owns significant scope. At OurNigeria I architected and built an entire 6-app platform solo, and at Founders Lair I owned the full stack while mentoring two interns."

### Transferable Experience

- **Vue.js to React migration (Genentech)**: Direct parallel to framework migration work at fleetster (Express to NestJS), demonstrates ability to maintain legacy code while building the replacement
- **B2B SaaS patterns (ActivEdge)**: Bank settlement solution handling millions of daily transactions, with role-based permissions dashboards, similar to fleetster's enterprise fleet management needs
- **CI/CD and DevOps (Genentech, OurNigeria, Founders Lair)**: GitHub Actions, Docker Compose, automated deployment pipelines to AWS and Heroku
- **Real-time data (ActivEdge, OurNigeria)**: EventSource API for real-time streaming at ActivEdge, SSE streaming with keepalive heartbeats at OurNigeria, relevant to fleetster's live GPS/telematics

### Gaps to Address

- **React Native**: Not in my professional experience. Honest framing: "I haven't shipped a production React Native app, but with 6+ years of React experience, the transition is mostly about learning mobile-specific patterns (navigation, native modules, platform APIs). The component model and state management patterns I use daily transfer directly."
- **Blueprint UI library**: No direct experience. Honest framing: "I haven't used Blueprint specifically, but I've worked extensively with component libraries (Radix UI, Ant Design) and built a custom design system at Genentech. Picking up a new component library is straightforward."
- **Fleet management domain**: No direct industry experience. Honest framing: "I don't have fleet management domain experience, but I've consistently ramped up in complex domains, from clinical trial data workflows at Genentech to Nigerian government budget structures at OurNigeria. I learn domain contexts quickly by working closely with product and customer-facing teams."

---

## 4. "Why This Company?" Script

"What drew me to fleetster is the combination of real product complexity and a team small enough that each engineer genuinely shapes the architecture. You're serving 100,000 users across 28 countries with real-time hardware integrations, and you're doing it with a lean team, that's the kind of environment where I do my best work. I'm also genuinely excited about the Express-to-NestJS migration. I've recently built two production NestJS backends, so I can contribute to that effort from day one rather than ramping up on the framework."

---

## 5. "What Are You Looking For?" Script

"I'm looking for a role where I can work across the full stack with real ownership over architecture decisions, not just implementing specs. What stood out about fleetster is that with ~15 engineers and a product spanning fleet management, car sharing, and telematics across 28 countries, each person clearly has meaningful scope. I also care about working in a team that values quality, and the fact that you list Cypress and Jest as core parts of the stack tells me testing is taken seriously here, not bolted on as an afterthought. The hybrid setup and English-speaking international team are a great fit too."

---

## 6. "Tell Me About Yourself" Script

"I'm a full-stack engineer currently at Genentech, where I led the migration of our clinical trial data platform from Vue.js to a React Chrome extension, while maintaining the legacy app in parallel. Before that, at Descasio, I drove a 40% performance improvement in our React application and reduced bug reports by 20% through introducing automated testing frameworks.

On the backend side, I've been building Node.js APIs since the start of my career, and more recently I've been deep in NestJS, where I architected a full platform as a monorepo with two NestJS backends, PostgreSQL, and real-time SSE streaming for a civic tech project serving 37 Nigerian states.

What brings me to fleetster specifically is the architecture modernization work. You're migrating from Express to NestJS, which is exactly what I've been building production systems in. Combined with the React/Redux frontend and the engineering ownership that comes with a lean international team, this feels like a natural next step where I can contribute immediately."

---

## 7. Likely Questions & Talking Points

### Q1: "Can you walk us through your experience with React and Redux?"
- 6+ years of production React across Genentech, Descasio, ActivEdge, and Founders Lair
- Introduced Redux at Genentech alongside React Query for caching
- Built complex Redux/RxJS state management for real-time bank settlement dashboards at ActivEdge (millions of daily transactions)
- Led React UI redesign at Descasio with 25% engagement boost
- **Reference**: ActivEdge settlement solution and Genentech migration

### Q2: "Tell us about your Node.js / backend experience."
- Started building Node.js + MongoDB APIs at SureTrade (2018), continued at Founders Lair
- Recently built two full NestJS backends for OurNigeria: API server with PostgreSQL/Prisma, and a document ingestion pipeline processing 700+ documents
- Implemented JWT auth, RBAC, SSE streaming, and CI/CD pipelines
- **Reference**: OurNigeria NestJS backends, Founders Lair REST APIs

### Q3: "We're migrating from Express to NestJS. Have you done anything similar?"
- Direct parallel: migrated Vue.js to React at Genentech while maintaining the legacy app
- Built NestJS from scratch at OurNigeria, understand module architecture, DI, guards, interceptors, pipes
- Key insight: migration requires maintaining the old system while building the new, shipping features in both during transition, and having a clear boundary strategy
- **Reference**: Genentech Vue-to-React migration (same pattern, different layer), OurNigeria NestJS expertise

### Q4: "How do you approach testing?"
- At Descasio: introduced Jest + Enzyme, achieved 20% drop in bug reports
- At Genentech: built Playwright E2E suites in CI/CD with Allure Reports on GitHub Pages, Slack notifications
- At OurNigeria: Playwright across 4 test projects (web auth, dashboard auth, desktop Chrome, mobile Pixel 5)
- Philosophy: tests should run in CI, report clearly, and catch regressions before customers do
- **Reference**: Descasio testing culture, Genentech Playwright CI/CD

### Q5: "Do you have experience with MongoDB?"
- Designed MongoDB schemas at SureTrade and Founders Lair
- At SureTrade: built database schemas for SureEdu school management portal (staff, students, guardians, payroll, attendance)
- At Founders Lair: translated business requirements into MongoDB data models, built REST APIs on top
- Also have PostgreSQL experience (OurNigeria with pgvector, Prisma)
- **Reference**: SureTrade MongoDB schemas, Founders Lair data modeling

### Q6: "Have you worked with React Native?"
- Be honest: no production React Native specifically
- Emphasize: 6+ years of React, which shares the component model, state management (Redux), and TypeScript patterns
- Mobile-adjacent: built responsive layouts, PWA patterns, tested on mobile viewports (Playwright mobile Pixel 5 tests)
- Quick learner: picked up NestJS rapidly and built production systems, same approach applies
- **Reference**: Acknowledge the gap, pivot to React depth

### Q7: "How do you handle working in a small team with broad product scope?"
- OurNigeria: single-handedly architected and built 6 applications in an Nx monorepo (2 NestJS backends, 3 Next.js frontends, 1 Remotion service)
- Founders Lair: owned the full stack from DB schema to React frontend to CI/CD, while mentoring 2 interns
- ActivEdge: team of 3 frontend engineers building a bank settlement solution
- Thrive with ownership and broad scope, not a specialist who needs narrow lanes
- **Reference**: OurNigeria full-platform ownership, ActivEdge small team

### Q8: "What's your experience with AWS?"
- Genentech: CloudFront, S3 for asset delivery and CDN optimization
- Founders Lair: CI/CD pipeline deploying APIs to AWS production servers
- OurNigeria: Docker Compose deployment with health checks, memory limits, and reverse proxy routing
- Comfortable with deployment pipelines, infrastructure configuration, and cloud services
- **Reference**: Founders Lair AWS deployment, Genentech CloudFront/S3


Three steps
Coding challenge
Technical interview
On-site interview