# Career-Ops in Chat-Only Mode

This workflow lets you use Career-Ops without Claude CLI, Gemini CLI, or ChatGPT API keys.

Current search bias: senior data science, analytics engineering, data engineering, AI automation, ML, and selective governance roles that are remote from Lagos, EMEA-friendly, CET/GMT aligned, or globally open.

## What works in chat-only mode

- Setup and configuration
- Job scanning from portals (API-based)
- PDF generation from tailored CV HTML
- Tracker maintenance and normalization scripts
- Full JD evaluation using this chat assistant as the reasoning engine

## What does not run natively

- Native slash commands inside external CLIs (for example /career-ops inside Claude CLI or Gemini CLI)
- Built-in command routing from .gemini and .claude command folders

Those command files are wrappers for external CLIs. In chat-only mode, this chat performs the same steps directly.

## Core execution logic (simple)

1. Read user profile and CV context
2. Evaluate one JD using A-G framework from modes
3. Save report into reports folder
4. Generate tailored CV PDF
5. Update tracker row

## Day-to-day commands

Run from the career-ops folder.

- Health check
  - npm run doctor

- Scan for new jobs (zero-token API scanner)
  - npm run scan

The scanner works best with API-compatible Greenhouse, Ashby, and Lever boards. Your portals config is now biased toward remote-first and EMEA-friendly companies on those board types.

- Check pipeline consistency
  - npm run verify

- Normalize statuses
  - npm run normalize

- Deduplicate tracker
  - npm run dedup

- Merge tracker updates
  - npm run merge

## Chat prompts to use with this interface

Use these exact prompt patterns in this chat:

- Evaluate JD from file
  - Evaluate this JD file using career-ops A-G and save report plus tracker entry: ./jds/oyster.md

- Evaluate JD from pasted text
  - Evaluate this job description with career-ops A-G and create report plus tracker row.

- Generate tailored PDF for a company
  - Use current cv.md and generate ATS PDF tailored to Oyster from latest report.

- Scan and shortlist
  - Run scan, then rank top 10 new pipeline jobs by fit for my profile.

- Keep system clean
  - Run verify, normalize, dedup, and summarize what changed.

## Recommended operating routine

1. Morning: run scan and shortlist
2. Evaluate top roles one by one
3. Generate one tailored PDF per high-score role
4. Track status changes in applications tracker
5. Weekly: run verify, normalize, dedup

## Files that matter most

- cv.md
- config/profile.yml
- portals.yml
- reports/
- data/applications.md
- data/pipeline.md

## Notes

- The scanner and PDF tools are local scripts and do not require external chat subscriptions.
- Evaluation quality improves as you enrich profile, CV, and prior reports.
- Always review generated outputs before applying.
