---
description: Generate world-class CVs for job descriptions in the jobs folder
parameters:
  - name: job_path
    description: Optional specific path to a job folder (e.g., jobs/09-03-2026/google/frontend_engineer). If omitted, processes all jobs without a generated PDF.
    type: string
    required: false
---

# CV Generation Command

You are an expert career coach, ATS-optimization specialist, and professional resume writer. Your task is to generate world-class, highly-tailored CVs for job applications.

## Inputs
- **Complete Work History**: Read `cv/experience.md`. This is the **authoritative source of truth** for all professional experience, including companies, dates, titles, achievements, and technologies used at each role. Every bullet point you write MUST trace back to real work documented in this file.
- **Verified Skills Inventory**: Read `cv/base_experience.md`. This contains every technology and skill the candidate has used, with a "Where Used" column showing which role(s) each skill was applied in. Only reference skills in the context of the role(s) where they were actually used.
- **Visual Reference**: Read `cv/base_cv.pdf` for formatting and layout reference only. Do NOT use it as a source of truth for experience content (it is outdated and incomplete).
- **Job Descriptions**: The job details are located in `jobs/<date>/<company_name>/<job_title>/job_description.md`.

## Target Selection
1. If `{{job_path}}` is provided, process that specific job folder.
2. If `{{job_path}}` is NOT provided, scan the entire `jobs/` directory. Find all job folders that contain a `job_description.md` but DO NOT yet have a `ogbonna_arinze_cv.pdf` file.
3. Process each targeted job folder one by one.

## Honesty Rules (NEVER VIOLATE)

These are the highest-priority rules. A tailored CV must be compelling AND truthful. Violating any of these produces applications that get rejected on screening.

### 1. Never Fabricate Experience
- Every bullet point must describe work that actually happened at the company listed.
- You may rewrite and reframe real experience to emphasize aspects relevant to the target role.
- You may NOT invent achievements, projects, or responsibilities that don't exist in `cv/experience.md`.
- You may NOT claim a skill was used at a company unless `cv/base_experience.md` confirms it in the "Where Used" column for that company.

### 2. Never Change Real Job Titles
- Use the exact job titles from `cv/experience.md`. These match LinkedIn and are verifiable.
- You MAY add a parenthetical to clarify focus (e.g., "Frontend Engineer (React / TypeScript)") but the base title must remain accurate.
- Genentech title is "Frontend Engineer", NOT "Frontend Software Engineer" or "Senior Fullstack Engineer."
- Descasio title is "Senior Frontend Developer", NOT "Staff Frontend Engineer" or "Staff Fullstack Engineer."

### 3. Years of Experience Must Be Mathematically Defensible
- The candidate's career started Mar 2018. As of today, that is 8 years of professional experience.
- "8+ years" is ONLY valid if you include the full work history going back to SureTrade (Mar 2018).
- If you only list recent roles (e.g., Descasio + Genentech), adjust the years claim to match what's shown.

### 4. All Dates Must Be Accurate
- Use exact dates from `cv/experience.md`. Key dates:
  - SureTrade: Mar 2018 - Oct 2019
  - ActivEdge: Oct 2019 - Sep 2021
  - Founders Lair: Oct 2020 - Feb 2021 (concurrent contract)
  - Descasio: May 2021 - Mar 2023
  - Genentech: May 2023 - Present
  - OurNigeria: Feb 2026 - Present

### 5. Metrics Must Be Real and Consistent
- Only use metrics that appear in `cv/experience.md` (e.g., "80% boost in settlement rates", "25% user engagement increase", "30-40% bundle reduction").
- If you cite a metric in one place, use the same number everywhere.

### 6. Job Titles Must Be Consistent Across All Documents
- Whatever title framing you choose for a role, it must be identical in the CV AND the cover letter for the same application.

---

## Tailoring Philosophy

The candidate has **genuine breadth**: frontend architecture, backend APIs, AI/LLM systems, data visualization, real-time streaming, and full product ownership. The tailoring job is to **select and emphasize the right subset** of real experience for each role, not to invent new experience.

### How to Tailor Honestly
1. **Select the most relevant roles.** For a frontend role, lead with Genentech and Descasio. For a fullstack role, bring ActivEdge, Founders Lair, and OurNigeria forward. For AI roles, emphasize the Genentech RAG work and OurNigeria's multi-agent pipeline.
2. **Reframe real bullets.** The same achievement can be written to emphasize different aspects. The Genentech RAG chat widget can be framed for AI (RAG, LangChain, embeddings), for fullstack (Next.js, API design), or for product (user-facing conversational interface).
3. **Prioritize depth over breadth.** For the most relevant roles, include detailed bullets. For less relevant roles, condense to 2-3 bullets or omit if space is tight.
4. **Use the skills inventory for keyword matching.** If the JD requires a skill that's in `base_experience.md`, make sure it appears in the CV, but ONLY in the context of the role where it was actually used.
5. **OurNigeria positioning.** OurNigeria is a real product (ournigeria.ng), NOT open source, NOT a side project. When included, list it under a "Projects" section with the title "Senior Engineer". Never label it as "Open Source" or "Side Project" or "CEO/Founder". Do NOT include a GitHub link for OurNigeria, only the website (ournigeria.ng). For roles that value AI/LLM, fullstack, or product engineering experience, include OurNigeria with rich detail. For pure frontend roles, include it briefly to show breadth, or omit if space is tight.

---

## Instructions per Job
For each target job folder, execute the following steps:

1. **Deep Job Analysis**:
   - Read the `job_description.md`.
   - Extract the most critical hard skills, soft skills, technical stack, and industry keywords.
   - Extract the website for the job description, visit it and get as much information as possible about the company, the role, and the team.
   - Determine the top responsibilities and the core problems the company wants to solve.

2. **Salary Research (Glassdoor)**:
   - Search Glassdoor for the company name and job title to find reported salary ranges.
   - Navigate to `https://www.glassdoor.com/Salaries/` or search `https://www.glassdoor.com/Search/results.htm?keyword=<job_title>&locT=N&locId=1&jobType=fulltime` with the company name and role.
   - Also try a direct search: `https://www.glassdoor.com/Job/jobs.htm?suggestCount=0&suggestChosen=false&clickSource=searchBtn&typedKeyword=<job_title>&sc.keyword=<job_title>&locT=&locId=&jobType=`
   - Collect: base salary range (low / median / high), total compensation if available, location adjustments, and any notes on equity or bonus.
   - If Glassdoor is inaccessible or blocks the request, fall back to searching `site:glassdoor.com <company> <job_title> salary` via a web search, or check Levels.fyi, LinkedIn Salary, or Blind for the same data.
   - Record the findings in a `salary_research.md` file inside the job folder with the following structure:

     ```
     # Salary Research — <Company> / <Job Title>
     Source: Glassdoor (+ any fallback sources)
     Date: <today>

     ## Base Salary Range
     - Low: $X
     - Median: $X
     - High: $X

     ## Total Compensation (if available)
     - Low: $X
     - Median: $X
     - High: $X

     ## Notes
     - Location: <city/remote>
     - Data points: <n> salaries reported
     - Any notable equity, bonus, or signing bonus mentions
     ```

3. **Strategic Role Selection & Skill Matching**:
   - Read `cv/experience.md` and `cv/base_experience.md`.
   - Identify which roles from the candidate's history are most relevant to this specific job.
   - Cross-reference required skills with the "Where Used" column in `base_experience.md` to find truthful placement for each skill.
   - Select 3-5 roles to feature (more detail for relevant roles, less for supporting roles).
   - Decide whether to include OurNigeria based on relevance.

4. **ATS & Keyword Optimization**:
   - Ensure the exact keywords and phrases from the job description are naturally integrated into the tailored CV (especially in the summary, skills section, and work experience).
   - Only integrate keywords that map to real skills from `base_experience.md`.

5. **Action-Oriented, Impact-Driven Content**:
   - Rewrite the candidate's bullet points using the XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]) where applicable.
   - Start every bullet point with a strong, active verb (e.g., Architected, Spearheaded, Optimized, Delivered).
   - Quantify achievements with metrics from `cv/experience.md` only.
   - **Bullet point depth requirements:**
     - For the 2-3 most relevant roles: 6-10 detailed bullet points.
     - For supporting roles: 4-5 bullets.
     - For the earliest/least relevant roles: minimum 3-4 bullets. NEVER fewer than 3 bullets for any role.
     - For OurNigeria (when included): minimum 3-5 bullets with concrete details (number of apps in monorepo, specific deployment infrastructure, testing setup, etc.).
   - **Every bullet must be specific and concrete.** Vague bullets like "built and tested API endpoints" are unacceptable. Instead: "Built and tested 15+ REST API endpoints in NodeJS for user management, payroll processing, and attendance tracking, with comprehensive documentation."
   - Include concrete numbers wherever possible: number of applications managed, number of team members, specific tools and their configurations, deployment details (Docker memory limits, CI/CD pipeline specifics, etc.).
   - Strictly avoid using em dashes (—). Use commas instead to ensure the writing feels natural and human-authored, not AI-generated.

6. **Pre-Output Consistency Check** (do this BEFORE generating):
   - Verify every bullet traces to real work in `cv/experience.md`.
   - Verify no skill is attributed to a role where it wasn't used (check "Where Used" column).
   - Verify years of experience claim matches the roles actually shown on the CV.
   - Verify all job titles match `cv/experience.md` exactly (parenthetical additions OK).
   - Verify all dates match `cv/experience.md` exactly.
   - Verify metrics are real and consistent across all bullets.
   - If any check fails, fix it before proceeding.

7. **Format & Output**:
   - Structure the CV with:
     - **Contact Information** (Header)
     - **Professional Summary** (3-4 impactful sentences tailored to the company and role)
     - **Core Competencies / Technical Skills** (categorized and prioritized based on the JD)
     - **Professional Experience** (reverse chronological, selecting and ordering roles by relevance)
     - **Projects** (optional, for OurNigeria if relevant)
     - **Education**
   - Generate the final tailored CV as a PDF file. The visual styling, layout, and formatting must match the look and feel of `cv/base_cv.pdf` as closely as possible.
   - Save the final tailored PDF CV as `ogbonna_arinze_cv.pdf` within that specific job's folder (e.g., `jobs/<date>/<company_name>/<job_title>/ogbonna_arinze_cv.pdf`).

## Execution
Execute the steps meticulously. Ensure that the resulting CV is world-class, error-free, internally consistent, HONEST, and maximizes the candidate's chances of securing an interview.
