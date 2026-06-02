# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Candidate Contact
- **Email:** arinzeogbo@gmail.com
- **LinkedIn:** https://linkedin.com/in/arinze-ogbonna

Use these in CV headers, cover letter headers, and any generated application documents.

## What This Repo Is

A job application management system that automates CV generation, cover letter creation, job searching, and interview preparation. Documents are tailored per job description while enforcing strict honesty rules.

## Commands

```bash
# Generate PDF from HTML (requires puppeteer)
node cv/generate_base_cv.mjs

# Per-job PDF generation scripts are created in each job folder
node jobs/<date>/<company>/<title>/generate_cv.mjs
node jobs/<date>/<company>/<title>/generate_cover_letter.mjs

# Batch convert HTML CVs to PDFs
node generate_all_pdfs.mjs
```

## Architecture

### Source of Truth Files
- `cv/experience.md` — **Authoritative** complete work history. Every CV/cover letter claim must trace here.
- `cv/base_experience.md` — Verified skills inventory with "Where Used" columns. Skills can only be attributed to roles listed in this file.
- `cv/base_cv.html` / `cv/base_cv.pdf` — Visual formatting reference only (not a content source).

### Job Application Structure
```
jobs/<DD-MM-YYYY>/<company_name>/<job_title>/
  job_description.md       # Created by /jobs command
  ogbonna_arinze_cv.html   # Tailored CV (HTML source)
  ogbonna_arinze_cv.pdf    # Tailored CV (generated PDF)
  cover_letter.html        # Cover letter (HTML source)
  cover_letter.pdf         # Cover letter (generated PDF)
  intro_prep.md            # Interview preparation notes
```

### Custom Slash Commands (`.claude/commands/`)
- `/jobs` — Search for jobs in a location, create `job_description.md` files
- `/cv` — Generate tailored CV PDF for a job (or all jobs missing one)
- `/cover` — Generate tailored cover letter PDF (must match CV exactly)
- `/intro` — Prepare interview notes with scripted answers and likely questions

### PDF Generation
HTML → PDF conversion uses Puppeteer with A4 format, zero margins (CSS handles padding), `printBackground: true`, and `preferCSSPageSize: true`. Font is Times New Roman 10pt. Each job folder gets its own generation script.

## Critical Rules

- Career start: Mar 2018. Current valid claim: 8 years of experience.
- Genentech title is "Frontend Engineer" (not "Frontend Software Engineer").
- Descasio title is "Senior Frontend Developer" (not "Staff Frontend Engineer").
- OurNigeria is listed under "Projects" as "Senior Engineer". Never label it "Open Source" or "Side Project". Website only (ournigeria.ng), no GitHub link.
- Python is "Personal projects" only — no production Python/Django claims.
- No em dashes in generated documents — use commas instead.
- CV and cover letter for the same job must have identical titles, dates, metrics, and claims.
