# Atolls Application Answers

## Q1: Tell us about a platform or internal tool you built that was primarily used by other engineers. What problem did it solve, and what architectural decisions were most important?

At Roche Genentech, I built a shared design system and component library in React and TypeScript that was adopted by 5+ product teams working on our clinical trial data platform. The problem was fragmentation: each team was building UI components independently, leading to inconsistent user experiences, duplicated effort, and accessibility gaps across products.

The most important architectural decisions were: (1) Using Radix UI as the unstyled primitive layer, which gave us full accessibility (WCAG) compliance out of the box while allowing flexible theming per product. (2) Publishing the library as a versioned package via a Turborepo monorepo, so teams could adopt updates incrementally without breaking changes. (3) Building a comprehensive Storybook instance as living documentation, with visual regression tests in the CI pipeline to catch unintended changes. (4) Designing a token-based theming system that separated design decisions from component logic, making it easy for teams to customize without forking.

The result was a 40% reduction in frontend development time for new features, and a consistent, accessible experience across all products. Beyond the components themselves, I created shared TypeScript utilities for API integration patterns, error handling, and data validation that standardized how teams interacted with our backend services.

## Q2: Describe a complex application you built using React, TypeScript, and Node.js. What challenges did you face in maintaining scalability or code organization, and how did you solve them?

At DESCASIO, I architected a data-heavy analytics dashboard built with React and TypeScript on the frontend, backed by Node.js/TypeScript services with both REST and GraphQL APIs. The application processed and visualized large datasets for enterprise clients, with complex filtering, real-time updates, and role-based views.

The main scalability challenges were: (1) Rendering performance with large datasets, which I solved through virtualization (only rendering visible rows), React.memo and useMemo for expensive computations, and strategic code splitting to keep initial bundle sizes small. I used React Profiler and webpack-bundle-analyzer to identify bottlenecks, ultimately reducing bundle size by 30-40% and achieving 35% faster load times. (2) State management complexity, where I separated concerns by using Redux for client-side UI state and React Query for server state/caching, which eliminated redundant API calls and made data flow predictable. (3) Backend scalability, where I implemented Redis caching for frequently accessed endpoints (reducing database load by 50%) and designed the PostgreSQL schema with proper indexing and query optimization for the reporting queries.

For code organization, the key decision was structuring the codebase by feature domain rather than technical layer, with shared utilities extracted into internal packages. I also established strict ESLint rules, Prettier formatting, Husky pre-commit hooks, and comprehensive CI/CD pipelines via GitHub Actions, which kept code quality consistent as the team grew.

## Q3: Have you heard of Atolls before finding out about this role?

Yes, I was familiar with Atolls through its previous identity as Global Savings Group. I've used some of the platforms in the Atolls portfolio, and the rebrand caught my attention. What drew me to this role specifically is the Admin Experience team's focus on building internal tooling and reusable frameworks for engineering teams, which is exactly the kind of high-leverage work I enjoy most and have deep experience with.
