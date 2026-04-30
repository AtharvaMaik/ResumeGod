# Multi-agent workflow runbook

This setup follows the original multi-agent plan (1 parent + 5 children).

## Required env vars in n8n container
- OPENAI_API_KEY
- GEMINI_API_KEY

## Required runtime packages in n8n container
- python3
- pip install requests pypdf
- TeX engine: pdflatex (and optionally latexmk)

## Import sequence
1. Import all files under `/data/workflows/child_*.json`
2. Note each imported workflow ID and replace `workflowId` values in `parent_resume_factory.json`
3. Import `/data/workflows/parent_resume_factory.json`

## Trigger payload
POST /webhook/resume-god
{
  "request_id": "optional-id",
  "company_name": "Acme",
  "job_description_text": "..."
}
