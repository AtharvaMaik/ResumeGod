# Resume UI

## One-time setup
```bash
cd ui
npm install
copy .env.example .env
```

## Run
```bash
npm start
```

Open: http://localhost:3000

## What it does
- Upload JD PDF
- Extract text
- Run the Resume God pipeline through the mounted `n8n` container environment
- Copy final PDF from container to `../output/`
- Show step-by-step progress from run artifacts in `../runs/`

## Requirements
- n8n container name is `n8n` (or set `N8N_CONTAINER_NAME` in `.env`)
- Docker CLI available on host
- The project folder mounted into the container as `/data`
- `GEMINI_API_KEY` set in the n8n container
