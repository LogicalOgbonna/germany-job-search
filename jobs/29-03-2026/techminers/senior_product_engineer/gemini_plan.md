# Interview Plan: Senior Product Engineer at TechMiners

## 1. The Company & Product Context
*   **What they do:** TechMiners provides data-driven Technology and Product Due Diligence for VCs, PEs, and strategic investors during M&A (Mergers & Acquisitions).
*   **The Product ("TechMiners ONE"):** A proprietary platform that automates the extraction of structured insights from code, infrastructure, and documentation. It moves due diligence away from just interviews and slide decks into objective, data-driven risk heatmaps and benchmarks.
*   **Culture:** Founded and run by ex-CTOs. They emphasize an "operator-led" methodology. They are remote-first (Berlin-based) and heavily lean into AI as a force multiplier for their own engineering team.

## 2. The Interviewers

### Robert Bordo (Senior Tech Analyst / CTO)
*   **Background:** He is an ex-CTO who transitioned into a Senior Tech Analyst role. He recently wrote an article titled *"I used to build the mess, now I analyze it (From CTO to Senior Tech Analyst)"*.
*   **Focus:** He evaluates companies' tech stacks for a living. He cares deeply about architecture, scalability, technical debt, and how engineering decisions impact business value and risk.
*   **How to connect:** Speak his language. Acknowledge that startups often have technical debt, but discuss how to manage it responsibly. Talk about building systems that are robust, secure, and easy to maintain. Show that you understand the business implications of technical choices.

### Armin Ayatollahi (Staff Product Engineer)
*   **Background:** Staff/Senior Frontend Engineer at TechMiners.
*   **Focus:** He focuses on crafting the actual tools and interfaces that TechMiners' analysts (like Robert) use to perform data-driven due diligence. 
*   **How to connect:** Discuss React, frontend architecture, and UX. Since they deal with complex data extraction, talk about how to present dense, complex data intuitively to users. Emphasize the "Product Engineer" mindset—focusing on solving the user's problem rather than just writing clever code.

## 3. The Role & Core Requirements
*   **Tech Stack:** Python, Django, React.
*   **Key Differentiator - AI-Native Development:** The job description explicitly states you must have *advanced proficiency with AI-native development and agentic tool orchestration (beyond basic copilot usage)*. They use Claude Code and Cursor heavily.
*   **Responsibilities:** Full-stack ownership (DB to UI), collaborating directly with CTOs, and maintaining a scalable/secure architecture prepared for AI integration.

## 4. What to Prepare & Look Out For

### A. Agentic AI Workflows (Crucial)
*   **Prepare:** Be ready to explain *exactly* how you use Cursor and Claude Code in your daily workflow. 
*   **Talking points:** Discuss how you use AI for scaffolding Django models, generating boilerplate React components, writing tests, or doing complex cross-file refactoring. Emphasize how AI makes you a "10x" engineer by allowing you to focus on architecture and product logic rather than syntax.

### B. Django & React Expertise
*   **Django:** Brush up on ORM optimization (e.g., `select_related`, `prefetch_related`), handling large datasets, and building robust APIs.
*   **React:** Be ready to discuss state management, component architecture, and performance optimization, especially when rendering large amounts of analytical data.

### C. Security & Data Privacy
*   **Prepare:** TechMiners handles highly confidential M&A data (other companies' proprietary source code and infrastructure details). 
*   **Look out for:** Expect questions on how you would design secure systems, handle tenant isolation in the database, and ensure data privacy.

### D. The "Product" Mindset
*   **Prepare:** Have an example ready of a time you pushed back on a complex technical solution in favor of a simpler, faster one that solved the core user problem.

## 5. Strategic Questions to Ask Them

**For Robert:**
*   *"Coming from a CTO background to analyzing other companies' codebases for DD, what are the most common architectural red flags you see? How does that influence the engineering culture and architecture internally at TechMiners?"*

**For Armin:**
*   *"Since the platform is used by tech analysts to digest massive amounts of codebase and infrastructure data, what are the biggest frontend challenges you face in presenting that data intuitively?"*

**General / Product:**
*   *"The job description mentions preparing the architecture for AI integration. Are you looking to integrate LLMs directly into the TechMiners ONE product for automated code analysis, or is the AI focus primarily on internal developer productivity right now?"*
*   *"What does the roadmap for TechMiners ONE look like for the next 6 months, and what is the biggest engineering hurdle in getting there?"*