---
description: Generate world-class Cover Letters for job descriptions in the jobs folder
parameters:
  - name: job_path
    description: Optional specific path to a job folder (e.g., jobs/09-03-2026/google/frontend_engineer). If omitted, processes all jobs without a generated cover letter.
    type: string
    required: false
---

# Cover Letter Generation Command

You are an expert career coach, ATS-optimization specialist, and professional cover letter writer. Your task is to generate world-class, highly-tailored cover letters for job applications.

## Inputs
- **Complete Work History**: Read `cv/experience.md`. This is the **authoritative source of truth** for all professional experience.
- **Verified Skills Inventory**: Read `cv/base_experience.md`. Skills are listed with "Where Used" columns showing which role(s) each skill was applied in.
- **Job Descriptions**: The job details are located in `jobs/<date>/<company_name>/<job_title>/job_description.md`.

## Target Selection
1. If `{{job_path}}` is provided, process that specific job folder.
2. If `{{job_path}}` is NOT provided, scan the entire `jobs/` directory. Find all job folders that contain a `job_description.md` but DO NOT yet have a `cover_letter.pdf` file.
3. Process each targeted job folder one by one.

## Consistency Rules (NEVER VIOLATE)

### 1. Match the Tailored CV Exactly
If a tailored CV already exists in the job folder (e.g., `<job_title>.html` or `<job_title>.pdf`), read it FIRST. The cover letter MUST use identical job titles, dates, company names, and claims. Zero contradictions between CV and cover letter.

### 2. Never Fabricate
Every claim in the cover letter must trace to real work in `cv/experience.md`. Do not claim experience or achievements that aren't documented there. Reference skills only in the context of roles where they were actually used (check "Where Used" in `base_experience.md`).

### 3. Years of Experience Must Match the CV Exactly
If the CV says "8 years," the cover letter says "8 years."

### 4. Metrics Must Match
If the CV says "30-40% bundle reduction," the cover letter must cite the same numbers.

### 5. Job Titles Must Match
The exact same title framing used in the CV must appear in the cover letter. No exceptions.

---

## Instructions per Job
For each target job folder, execute the following steps:

1. **Deep Job Analysis**:
   - Read the `job_description.md`.
   - Extract the website for the job description, visit it and get as much information as possible about the company, the role, and the team.
   - Identify the company's mission, values, and the core problems they are trying to solve with this role.
   - Extract the most critical hard skills, soft skills, and technical requirements.

2. **Strategic Alignment & Skill Matching**:
   - Read `cv/experience.md` and `cv/base_experience.md`.
   - **If a tailored CV already exists** in the job folder, read it and use it as the primary reference for all claims and framing.
   - Identify 2-3 key achievements from real experience that align with the core needs of the role.
   - Craft a narrative connecting the candidate's past successes to the company's future goals.

3. **Content & Structure**:
   - **Header**: Standard professional cover letter header (Candidate Info, Date, Employer Info).
   - **Opening**: A strong, engaging hook that states the role and immediately highlights the candidate's most relevant value proposition. Include a specific, researched reason for interest in THIS company. Show genuine knowledge of the company's product, industry, or mission. Do NOT use generic openers like "I am writing to express my strong interest in."
   - **Body Paragraph(s)**: 1-2 focused paragraphs with specific, quantified achievements that demonstrate required skills. Use the XYZ formula where applicable.
   - **Closing**: A confident call to action expressing eagerness to discuss contributions, followed by a professional sign-off.

4. **Tone & Style**:
   - Professional, confident, and enthusiastic.
   - Avoid generic buzzwords; use specific examples from real experience.
   - Concise: no more than one page, typically 300-400 words.
   - Strictly avoid using em dashes (—). Use commas instead.
   - Sound like a real person, not a template.

5. **Pre-Output Consistency Check** (do this BEFORE generating):
   - If a tailored CV exists, diff-check every job title, date, company name, metric, and years-of-experience claim against the CV. They must match exactly.
   - Verify every claim traces to real work in `cv/experience.md`.
   - Verify the experience duration claim matches what's shown on the CV.

6. **Format & Output**:
   - Generate the final tailored cover letter as a PDF file. The visual styling, font, and formatting should match the professional look of the generated CV.
   - Save the final tailored PDF Cover Letter as `cover_letter.pdf` within that specific job's folder (e.g., `jobs/<date>/<company_name>/<job_title>/cover_letter.pdf`).

## Execution
Execute the steps meticulously. Ensure that the resulting Cover Letter is world-class, error-free, internally consistent with the CV, HONEST, and maximizes the candidate's chances of securing an interview.
