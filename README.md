# Resume God

Resume God is a local resume-tailoring system that turns a job description into a targeted LaTeX resume package.

The project includes:

- a local upload UI for submitting a job description PDF
- a multi-stage agent pipeline for parsing the JD, extracting candidate evidence, drafting resume content, and reviewing ATS fit
- LaTeX templating and PDF compilation
- n8n workflow assets for the original orchestrated multi-agent design

## What it does

1. Upload a JD PDF in the local UI.
2. Extract text from the PDF.
3. Run a multi-step pipeline:
   - JD parser agent
   - candidate evidence agent
   - resume strategist agent
   - ATS reviewer agent
4. Render the result into LaTeX.
5. Compile the final PDF and save it into `output/`.

## Current architecture

There are two layers in this repo:

- `ui/`: the current recommended way to run the project locally
- `workflows/`: n8n workflow JSON files representing the original multi-agent orchestration plan

The UI currently drives the pipeline through the mounted n8n container environment and shared `/data` workspace. This keeps the multi-agent assets in the repo while avoiding webhook registration issues during local development.

## Repository structure

```text
candidate_template/ Reusable starter files for candidate data
config/             JSON schemas and scoring config
docs/               Implementation notes
prompts/            System prompts for each agent
scripts/            Node scripts for agent invocation and LaTeX rendering
templates/          Base LaTeX resume template
ui/                 Upload UI and local runner
workflows/          n8n parent + child workflow exports
```

## Requirements

- Docker Desktop
- a running `n8n` container
- Node.js 18+
- a Gemini API key

## n8n container setup

Example `docker-compose.yml` service:

```yaml
services:
  n8n:
    image: n8nio/n8n
    container_name: n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=password
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - GENERIC_TIMEZONE=Asia/Kolkata
      - N8N_ENCRYPTION_KEY=replace-this-with-a-long-random-secret
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - NODES_EXCLUDE=[]
      - N8N_WORKFLOW_CALLER_POLICY_DEFAULT_OPTION=any
    volumes:
      - n8n_data:/home/node/.n8n
      - C:/Projects/RESUMEGOD:/data
    restart: always

volumes:
  n8n_data:
```

Create a `.env` file next to the compose file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

## Local UI setup

```bash
cd ui
npm install
copy .env.example .env
npm start
```

Then open:

```text
http://localhost:3000
```

## How to run

1. Make sure the `n8n` container is running.
2. Start the UI from `ui/`.
3. Upload a JD PDF and provide a company name.
4. Wait for the progress panel to move through each pipeline step.
5. Find the generated resume PDF in `output/`.

## Output locations

- Final PDFs: `output/`
- Run artifacts and intermediate JSON: `runs/`

## Notes and limitations

- Gemini free-tier quotas can interrupt runs with rate-limit or quota errors.
- The n8n workflow exports are included and useful as architecture assets, but the local UI path is the most reliable way to run the project right now.
- API keys are intentionally not stored in this repository.
- Personal reference resumes are intentionally not stored in this repository.

## Future improvements

- migrate agent execution to native Gemini nodes in n8n
- add run history and artifact browsing in the UI
- support direct LaTeX export in the Codex workflow
- add provider fallback for quota exhaustion
