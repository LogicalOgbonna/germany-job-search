What leads you to apply to Qonto and to this specific role? What difference/impact do you think you'll be making?

Qonto's mission to simplify financial management for European SMEs resonates with me because I've seen firsthand how well-built tools change how people work. At ActivEdge, I built a bank settlement solution that processed millions of daily transactions, so I understand the fintech space and what it takes to build reliable, high-quality financial interfaces at scale.

What drew me specifically to this role is the Ember.js to React migration. At Genentech, I led a very similar effort, migrating a production clinical trial platform from Vue.js to React while keeping the existing app running in parallel. I know the challenges: maintaining two codebases simultaneously, making incremental migration decisions, rewriting components without breaking user workflows, and keeping the team aligned throughout. That experience translates directly to what Qonto is doing with 1.1 million lines of code.

Beyond the migration, I bring strong experience building design systems (I architected one with React and Radix UI at Genentech that improved consistency and accessibility across multiple product teams), driving frontend performance optimization, and establishing testing and code quality standards. I'm also comfortable working within large engineering guilds, collaborating across product, design, and backend teams, which matches how Qonto operates.

I believe I can make an immediate impact by contributing to the migration with confidence, improving the quality bar through thorough code reviews and testing practices, and helping shape the React architecture and design system that will serve Qonto's 600,000+ customers for years to come.


Tell us about a recent feature or web application where you built custom UI components or worked on a design system from scratch. Which tools did you use to manage this system?

At Genentech, I architected a reusable design system from scratch for our clinical trial data platform. The goal was to unify the UI across multiple product teams that had been building components independently, leading to inconsistent styling, accessibility gaps, and duplicated effort.

I built the system using React and Radix UI as the foundation. Radix provided unstyled, accessible primitives (dialogs, dropdowns, tooltips, tabs) that gave us full control over visual design while handling keyboard navigation, focus management, and ARIA attributes out of the box. This was critical in a healthcare setting where accessibility compliance (WCAG) was non-negotiable.

Each component was designed as a composable building block with clearly defined props, variants, and states. I established patterns for consistent spacing, typography, and color usage across the system. Components were documented and reviewed through pull requests, ensuring the team understood the API surface and design intent before adoption.

The design system improved UI consistency across products, reduced the time engineers spent building common patterns from scratch, and gave our design team confidence that what they specified would be implemented faithfully. It also made the Vue-to-React migration smoother because new React components had a clear, consistent foundation to build on rather than each team inventing their own approach.

More recently, on OurNigeria (ournigeria.ng), I built 3 Next.js frontend applications within an Nx monorepo, creating shared React 19 component libraries used across a citizen-facing web app, admin dashboard, and marketing landing page. The citizen-facing app includes 22 interactive chart types rendered inline within AI chat responses, responsive mobile layouts, and dark mode support, all managed through a shared component architecture within the monorepo using pnpm workspaces.


ADDITIONAL INFORMATION

A few things that may be useful context:

I'm currently based in Berlin and available for Qonto's remote-friendly model. I hold a valid work permit for Germany.

I'm an active user of AI-assisted development tools, including Claude Code and Cursor, which I use daily in my workflow. I noticed Qonto provides unlimited access to these tools, and I'd be productive with them from day one.

You can see a live example of my recent frontend work at ournigeria.ng, a full-stack platform I built end-to-end with React 19, Next.js, and an Nx monorepo managing 6 applications. It demonstrates my approach to component architecture, responsive design, and shipping production-quality interfaces.

I'm happy to discuss any of the above in more detail during the interview process.
