# Career-Ops Setup for Project_Buffer

This folder was initialized from `santifer/career-ops` and personalized for your existing application workflow.

Current search bias: senior data, analytics engineering, AI automation, ML, and selective governance roles that are remote from Lagos, EMEA-friendly, CET/GMT aligned, or globally open.

## What was configured
- `config/profile.yml` was filled with your profile and role targets.
- `cv.md` was synthesized from your existing resumes.
- `portals.yml` was customized with your target role keywords and companies.
- Existing repo assets were copied into:
  - `cv-variants/`
  - `jds/`

## CV variants available
- `cv-variants/buffer_resume.md`
- `cv-variants/ai_automation_resume.md`
- `cv-variants/treasury_bi_resume.md`
- `cv-variants/moniepoint_resume.md`

## Job descriptions available
- `jds/oyster.md`
- `jds/moniepoint.md`

## Daily usage
1. Open terminal in this folder:
   - `cd career-ops`

2. Validate setup:
   - `npm run doctor`

3. Pick a CV variant (optional):
   - `cp cv-variants/ai_automation_resume.md cv.md`
   - or `cp cv-variants/buffer_resume.md cv.md`

4. Start in Claude Code:
   - `claude`

5. Run commands in Claude:
   - `/career-ops`
   - `/career-ops-evaluate --file ./jds/oyster.md`
   - `/career-ops-evaluate --file ./jds/moniepoint.md`
   - `/career-ops scan`
   - `/career-ops tracker`

## Optional Gemini path
If you prefer Gemini CLI:
1. Install:
   - `npm install -g @google/gemini-cli`
2. Login:
   - `gemini auth`
3. Start:
   - `gemini`
4. Evaluate a JD file:
   - `/career-ops-evaluate --file ./jds/oyster.md`

## Notes
- Keep sensitive personal data in local files only.
- Always review generated CVs and recommendations before applying.
