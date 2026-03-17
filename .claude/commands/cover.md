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
- **Base CV/Profile**: Read the base CV from `cv/base_cv.pdf` to understand the candidate's complete professional history, skills, education, and achievements.
- **Skills Inventory**: Read `cv/base_experience.md`. This contains a comprehensive list of all technologies, frameworks, and tools the candidate has experience with.
- **Job Descriptions**: The job details are located in `jobs/<date>/<company_name>/<job_title>/job_description.md`.

## Target Selection
1. If `{{job_path}}` is provided, process that specific job folder.
2. If `{{job_path}}` is NOT provided, scan the entire `jobs/` directory. Find all job folders that contain a `job_description.md` but DO NOT yet have a `cover_letter.pdf` file.
3. Process each targeted job folder one by one.

## Consistency Rules (NEVER VIOLATE)

These rules prevent the specific inconsistencies that caused the eventfirst rejection. The cover letter must be a perfect companion to the tailored CV with zero contradictions.

1. **If a tailored CV already exists** in the job folder (e.g., `<job_title>.html` or `<job_title>.pdf`), read it FIRST. The cover letter MUST use identical job titles, dates, company names, and claims. This is the #1 rule. The eventfirst rejection happened because the CV said "Staff Fullstack Engineer" but the cover letter said "Staff Frontend Engineer."
2. **Years of experience must match the CV exactly.** If the CV says "7+ years," the cover letter says "7+ years."
3. **Metrics must match.** If the CV says "30-40% bundle reduction," the cover letter must cite the same numbers.

---

## Instructions per Job
For each target job folder, execute the following steps:

1. **Deep Job Analysis**:
   - Read the `job_description.md`.
   - Extract the website for the job description, visit it and get as much information as possible about the company, the role, and the team.
   - Identify the company's mission, values, and the core problems they are trying to solve with this role.
   - Extract the most critical hard skills, soft skills, and technical requirements.

2. **Strategic Alignment & Skill Matching**:
   - Review the candidate's `cv/base_cv.pdf` and `cv/base_experience.md`.
   - **If a tailored CV already exists** in the job folder, read it and use it as the primary reference for all claims and framing.
   - Cross-reference the skills required in the job description with the candidate's complete skills inventory in `cv/base_experience.md`.
   - Identify 2-3 key achievements or experiences that align with the core needs of the role. Frame them using the same language and skills the job description uses.
   - Ensure that any critical skills from the JD that match `cv/base_experience.md` are naturally woven into the cover letter narrative.
   - Craft a narrative that connects the candidate's past successes to the company's future goals.

3. **Content & Structure**:
   - **Header**: Standard professional cover letter header (Candidate Info, Date, Employer Info).
   - **Opening**: A strong, engaging hook that clearly states the role being applied for and immediately highlights the candidate's most relevant value proposition. Include a specific, researched reason for interest in THIS company (not generic flattery). Show genuine knowledge of the company's product, industry, or founders.
   - **Body Paragraph(s)**: 1-2 focused paragraphs detailing specific, quantified achievements that demonstrate the required skills. Use the XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]) where applicable to show impact.
   - **Closing**: A confident call to action expressing eagerness to discuss how the candidate can contribute to the team, followed by a professional sign-off.

4. **Tone & Style**:
   - Keep the tone professional, confident, and enthusiastic.
   - Avoid generic buzzwords; use specific examples.
   - Ensure the letter is concise (no more than one page, typically 300-400 words).
   - Strictly avoid using em dashes (—). Use commas instead to ensure the writing feels natural and human-authored, not AI-generated.
   - Sound like a real person, not a template. Avoid phrases like "I am writing to express my strong interest in" - use a more direct, engaging opener.

5. **Pre-Output Consistency Check** (do this BEFORE generating):
   - If a tailored CV exists in the folder, diff-check every job title, date, company name, metric, and years-of-experience claim against the CV. They must match exactly.
   - Verify the experience duration claim is mathematically accurate (graduation date to present).

6. **Format & Output**:
   - Generate the final tailored cover letter as a PDF file. The visual styling, font, and formatting should match the professional look of the generated CV.
   - Save the final tailored PDF Cover Letter as `cover_letter.pdf` within that specific job's folder (e.g., `jobs/<date>/<company_name>/<job_title>/cover_letter.pdf`).

## Execution
Execute the steps meticulously. Ensure that the resulting Cover Letter is world-class, error-free, internally consistent with the CV, and maximizes the candidate's chances of securing an interview.
