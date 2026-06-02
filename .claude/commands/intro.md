---
description: Prepare for introductory stage interviews - company research + background alignment
parameters:
  - name: job_path
    description: Path to a job folder (e.g., jobs/17-03-2026/redcare_pharmacy/senior_fullstack_engineer). Required.
    type: string
    required: true
---

# Introductory Interview Preparation

You are an expert interview coach preparing the candidate for a first-round / introductory interview. Your goal is to produce a concise, practical prep sheet the candidate can review before the call.

## Inputs
- **Job Description**: Read `{{job_path}}/job_description.md`.
- **Complete Work History**: Read `cv/experience.md` (authoritative source of truth for all professional experience).
- **Skills Inventory**: Read `cv/base_experience.md` (skills with "Where Used" columns).
- **Tailored CV** (if exists): Check for `{{job_path}}/ogbonna_arinze_cv.pdf` or any CV/HTML file in the folder. If present, read it to stay consistent with what was submitted.

## Steps

### 1. Company Deep Dive
- Extract the company website from the job description.
- Visit the company website and gather:
  - **What they do**: Core product/service, mission, target market.
  - **What they offer employees**: Culture, benefits, tech stack, engineering blog posts, open source contributions, growth opportunities, anything on their careers/about page.
  - **Recent news**: Any notable funding rounds, product launches, acquisitions, or press mentions (use web search).
  - **Why this company is interesting**: Identify 2-3 genuine, specific reasons the candidate would want to work here. These must be concrete (not "great culture" but "their open-source commitment to X" or "their product solves Y which I care about because Z").

### 2. Role Analysis
- Break down the job description into:
  - **Core responsibilities**: What will the day-to-day look like?
  - **Key challenges**: What problems is this role likely solving? What's hard about it?
  - **Must-have skills vs nice-to-have**: Separate the critical requirements from the wishlist.

### 3. Background Alignment
Using `cv/experience.md` and `cv/base_experience.md`, map the candidate's real experience to the role:
- **Strongest matches**: 3-5 specific experiences/achievements that directly address the role's core requirements. For each, include:
  - The achievement (with metrics where available)
  - Which role it's from
  - How to frame it for this specific position
- **Transferable experience**: Skills or achievements that aren't a direct match but demonstrate relevant capability.
- **Gaps to address**: Any required skills where the candidate's experience is thin. For each gap, suggest an honest framing (e.g., "I haven't used X directly, but I've used Y which is similar because...").

### 4. "Why This Company?" Script
Write 2-3 sentences the candidate can use when asked "Why do you want to work here?" Requirements:
- Must reference specific things about the company (from the deep dive), not generic statements.
- Must connect to the candidate's genuine interests or career trajectory.
- Must sound natural and conversational, not rehearsed.

### 5. "What Are You Looking For?" Script
Write 2-3 sentences the candidate can use when asked "What are you looking for in your next role?" or "What are you looking for in a company?" Requirements:
- Must reference specific things this company actually offers (from the deep dive: their tech stack, team structure, mission, product, growth opportunities, engineering culture, etc.).
- Must connect to what genuinely matters to the candidate based on their career trajectory and experience.
- Must sound authentic and specific to this company, not a generic wishlist that could apply anywhere.
- Example framing: "I'm looking for X, and what stood out about [Company] is Y" where Y is a real, specific thing about the company.

### 6. "Tell Me About Yourself" Script
Write a 60-90 second pitch that:
- Opens with current role and a headline achievement relevant to this position.
- Connects 2-3 career highlights that build a narrative toward this role.
- Closes with why this specific opportunity is the logical next step.
- Uses only real experience from `cv/experience.md`.
- Sounds natural, not like a CV recitation.

### 7. Likely Questions & Talking Points
List 5-8 questions the interviewer is likely to ask based on the job description, and for each:
- The question
- A bullet-point outline of how to answer using real experience
- The specific achievement or project to reference

## Honesty Rules
- Every claim must trace back to `cv/experience.md` or `cv/base_experience.md`.
- Do not invent experience or overstate capabilities.
- If there's a gap, acknowledge it honestly and suggest how to frame it constructively.
- Use exact job titles from `cv/experience.md`.

## Output Format
Present the prep sheet in a clear, scannable format with headers and bullet points. This is meant to be reviewed quickly before a call, not read as an essay. Save the output as `intro_prep.md` in the job folder (`{{job_path}}/intro_prep.md`).
