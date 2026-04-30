# Multi-Agent n8n Resume God Plan

## Summary
Build a self-hosted n8n system as a chain of separate agent-style subworkflows, each with its own fresh model call, system prompt, inputs, outputs, and artifact files. OpenAI handles all resume authoring and revision work. Gemini acts only as the ATS grader. The workflow starts from a job description, builds structured intermediate files, uses the fixed local LaTeX template, compiles a PDF, runs Gemini ATS review, and loops up to 3 times until the ATS score is `>= 90`. The final output is a compiled PDF named `resume_god_<companyname>.pdf`.

Chosen defaults:
- Runtime: self-hosted n8n in Docker
- Template source: local fixed LaTeX template from the provided code
- Reference source: local folder `C:\Projects\RESUMEGOD\candidate_template\` with starter candidate data templates
- Authoring LLM: OpenAI
- Reviewer LLM: Gemini
- ATS optimization loop cap: 3 review cycles
- Final delivery: single PDF response plus persisted intermediate artifacts

## Inputs and Local Knowledge Base
Treat these as the core local inputs:
- Fixed LaTeX template: the provided template becomes the canonical renderer skeleton
- Reference folder: `C:\Projects\RESUMEGOD\candidate_template\`
- Candidate profile template: `C:\Projects\RESUMEGOD\candidate_template\candidate_profile.template.json`

The workflow should extract and normalize candidate evidence from:
- starter candidate files in `candidate_template`
- local profile JSON if present
- GitHub profile and repos
- portfolio site
- optional manually maintained project notes folder

The candidate template data is evidence input only, not the final rendering source. Final output must always be generated through the fixed LaTeX template.

## Workflow Architecture
Create one parent orchestration workflow plus five child agent workflows.

### Parent Workflow
1. `Webhook Trigger`
   - Accept JD as text or uploaded PDF.
2. Input normalization
   - Extract JD text if PDF.
   - Normalize whitespace and section boundaries.
3. Build run workspace
   - `/data/runs/{request_id}/`
4. Load candidate evidence
   - Load structured candidate data from the template files
   - Pull GitHub and portfolio data
   - Load local profile JSON if available
5. Call child workflows in order:
   - `JD Parser Agent`
   - `Candidate Evidence Agent`
   - `Resume Strategist/Author Agent`
   - `LaTeX Renderer + Compiler Agent`
   - `Gemini ATS Reviewer Agent`
6. Loop controller
   - If ATS `>= 90`, release final PDF
   - Else send reviewer feedback back to Resume Author, then re-render, recompile, re-review
   - Stop after 3 cycles and keep best version
7. `Respond to Webhook`
   - Return `resume_god_<companyname>.pdf`

### Agent 1: JD Parser
Purpose:
- Read the incoming JD and convert it to strict structured JSON.

Inputs:
- `job_description_raw.txt`

Outputs:
- `job_description.json`

Behavior:
- OpenAI only
- strict JSON only
- exact schema requested by the user
- no prose or markdown
- normalize skill names, role, company, seniority, domain, responsibilities, ATS keywords

### Agent 2: Candidate Evidence Agent
Purpose:
- Read the JD JSON and all candidate evidence.
- Produce a ranked evidence brief for downstream authoring.

Inputs:
- `job_description.json`
- structured candidate data assembled from template files
- GitHub repo/profile metadata
- portfolio/site content
- optional local profile JSON

Outputs:
- `candidate_master_profile.json`
- `match_analysis.md`

Behavior:
- consolidate candidate facts from all available sources
- deduplicate overlapping claims across resume/GitHub/portfolio
- mark any unsupported claims as unusable
- rank projects, skills, and experience by:
  - exact skill match
  - semantic relevance
  - ATS keyword overlap
  - technical depth
  - recency
  - measurable impact
- keep strongest 2-4 projects only
- write a human-readable markdown brief for the next agent

Recommended markdown sections:
- target role and company
- strongest skill matches
- strongest project matches
- strongest experience evidence
- ATS keywords to include
- risks/gaps
- excluded unsupported claims

### Agent 3: Resume Strategist / Author
Purpose:
- Create the actual resume content in structured form.
- Own all ATS-driven revisions during the review loop.

Inputs:
- `job_description.json`
- `candidate_master_profile.json`
- `match_analysis.md`
- optional Gemini `review_feedback.json`

Outputs:
- `resume_data.json`
- optional `resume_content_audit.md`

Behavior:
- OpenAI only
- output strict JSON matching the resume schema
- no LaTeX generation in this step
- never invent metrics, employers, dates, scope, impact, or achievements
- if reviewer feedback exists, revise only within truthful evidence boundaries
- optimize toward ATS coverage and one-page density

Deterministic content limits:
- summary: 2-3 lines
- max 4 projects
- capped bullets per experience/project
- prioritize JD vocabulary naturally

### Agent 4: LaTeX Renderer + Compiler
Purpose:
- Inject validated resume JSON into the fixed local LaTeX template and compile to PDF.

Inputs:
- `resume_data.json`
- local template file created from the provided LaTeX

Outputs:
- `resume.tex`
- `resume_god_<companyname>.pdf`
- compile logs

Behavior:
- no LLM involvement in template structure
- replace only defined content areas:
  - header
  - summary or intro section
  - education
  - experience
  - projects
  - technologies/skills
  - certifications if included
- escape LaTeX special characters safely
- preserve ATS readability where possible

Template adaptation plan:
- turn the provided example into a reusable template with placeholders for:
  - name
  - location
  - email
  - phone
  - website
  - LinkedIn
  - GitHub
  - updated timestamp
  - section content blocks
- remove boilerplate demo content such as RenderCV welcome text, fake employers, and sample publications
- keep formatting minimal and ATS-safe
- prefer the existing one-column/two-column section structure already present in the template

Compilation:
- preferred engine: `pdflatex` or `latexmk` in Docker
- install packages needed by the template, including current dependencies from the pasted preamble
- output renamed final PDF

### Agent 5: Gemini ATS Reviewer
Purpose:
- Score the rendered resume against the JD and return revision feedback.

Inputs:
- `job_description.json`
- `resume_data.json`
- rendered resume text extracted from `resume.tex` or the generated PDF

Outputs:
- `review_feedback.json`

Review schema:
- `ats_score`
- `pass_threshold`
- `keyword_coverage_missing`
- `formatting_risks`
- `content_risks`
- `revision_instructions`
- `truthfulness_warnings`

Behavior:
- Gemini only
- no rewriting the resume directly
- score conservatively
- return JSON only
- if score `< 90`, feedback goes back to Resume Author
- if score `>= 90`, orchestration releases final PDF

## n8n Node Design
Main nodes:
- `Webhook Trigger`
- `IF`
- `HTTP Request`
- `Code`
- `Read Binary File`
- `Write Binary File`
- `Execute Command`
- `Execute Workflow`
- `Respond to Webhook`

Supporting nodes:
- `Set` for run metadata
- `Merge` for branch joins
- `Wait` only if any external compile/review path is asynchronous

Child workflows are preferred over a single giant workflow so each agent is independently testable and prompt-scoped.

## Prompt Strategy
Create separate system prompts for each agent.

### 1. JD Parser Prompt
- Role: recruiter-grade JD extraction engine
- Contract: emit exact schema only
- Rules: no markdown, no prose, no guessing beyond strong implication

### 2. Candidate Evidence Prompt
- Role: truth-first evidence analyst
- Contract: produce ranked evidence and exclusions
- Rules: use only supported facts from resume/GitHub/portfolio/profile

### 3. Resume Author Prompt
- Role: elite ATS resume strategist
- Contract: emit resume JSON only
- Rules: optimize for JD alignment and ATS score while staying truthful
- Include feedback-handling instructions for iterative revision

### 4. Gemini Reviewer Prompt
- Role: strict ATS evaluator
- Contract: emit review JSON only
- Rules: conservative scoring, identify missing keywords, formatting issues, weak phrasing, and overclaim risk

### 5. JSON Repair Prompt
- Role: schema repair utility
- Contract: fix malformed JSON without changing meaning

## Run Artifacts
Primary run artifacts:
- `job_description_raw.txt`
- `job_description.json`
- `candidate_master_profile.json`
- `match_analysis.md`
- `resume_data.json`
- `resume.tex`
- `resume_god_<companyname>.pdf`
- `review_feedback_cycle_1.json`
- `review_feedback_cycle_2.json`
- `review_feedback_cycle_3.json`

Recommended project files:
- `templates/base_resume_template.tex`
- `prompts/jd_parser_system.txt`
- `prompts/evidence_agent_system.txt`
- `prompts/resume_author_system.txt`
- `prompts/gemini_reviewer_system.txt`
- `prompts/json_repair_system.txt`
- `config/scoring_weights.json`
- `config/runtime_paths.json`

## Error Handling
- Invalid JD PDF
  - fail if extraction is empty or corrupted
- Missing candidate template data
  - fail startup validation if the required candidate data files are missing
- Missing profile data
  - continue with resume PDF + GitHub + portfolio if profile JSON is absent
- GitHub/portfolio fetch failure
  - continue with available local evidence and warn in artifacts
- Malformed LLM JSON
  - validator rejects
  - one repair pass
  - hard fail after second invalid response
- Template rendering failure
  - return structured internal error with saved `resume_data.json`
- LaTeX compile failure
  - save compile logs and generated `.tex`
- ATS score never reaches 90
  - stop after 3 cycles
  - keep best scored PDF and latest reviewer notes
- Resume too long
  - deterministic trim before render
  - second trim pass after review if needed

## Test Plan
- Text JD full pipeline succeeds.
- PDF JD full pipeline succeeds.
- Local candidate template data is loaded and contributes to candidate evidence.
- Candidate evidence agent correctly merges resume/GitHub/portfolio without duplicating claims.
- Resume author outputs schema-valid JSON.
- Renderer injects content into the local template and removes sample/demo content.
- Final PDF is named `resume_god_<companyname>.pdf`.
- Gemini review loop exits immediately on score `>= 90`.
- Gemini review loop iterates and improves score when `< 90`.
- Loop stops after 3 cycles if threshold is not reached.
- LaTeX special characters in links, names, and bullets compile safely.
- Generated `.tex` stays Overleaf-compatible if opened as a standalone project.

## Assumptions
- `C:\Projects\RESUMEGOD\candidate_template\` is the starter location for structured candidate input files.
- The provided LaTeX becomes the canonical template instead of the earlier Overleaf Git-sync approach.
- The final PDF is the only required webhook response artifact; intermediate files are persisted on disk.
