import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const PORT = Number(process.env.PORT || 3000);
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/resume-god';
const N8N_BASIC_USER = process.env.N8N_BASIC_USER || 'admin';
const N8N_BASIC_PASSWORD = process.env.N8N_BASIC_PASSWORD || 'password';
const N8N_CONTAINER_NAME = process.env.N8N_CONTAINER_NAME || 'n8n';

const outputDir = path.resolve(__dirname, '..', 'output');
fs.mkdirSync(outputDir, { recursive: true });
const runsDir = path.resolve(__dirname, '..', 'runs');
fs.mkdirSync(runsDir, { recursive: true });

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const activeRuns = new Map();

app.use(express.static(path.join(__dirname, 'public')));

function slugifyCompany(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'target_company';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDirFor(requestId) {
  return path.join(runsDir, requestId);
}

function fileExistsLocal(localPath) {
  return fs.existsSync(localPath);
}

function getStepStatus(requestId, companySlug) {
  const runDir = runDirFor(requestId);
  const finalPdf = path.join(runDir, `resume_god_${companySlug}.pdf`);
  const compileLog = path.join(runDir, 'compile.log');
  const steps = [
    { key: 'workspace', label: 'Workspace initialized', file: path.join(runDir, 'job_description_raw.txt') },
    { key: 'jd', label: 'JD parsed', file: path.join(runDir, 'job_description.json') },
    { key: 'evidence', label: 'Evidence analyzed', file: path.join(runDir, 'candidate_master_profile.json') },
    { key: 'author', label: 'Resume drafted', file: path.join(runDir, 'resume_data.json') },
    { key: 'render', label: 'LaTeX rendered', file: path.join(runDir, 'resume.tex') },
    { key: 'review', label: 'ATS reviewed', file: path.join(runDir, 'review_feedback_cycle_1.json') },
    { key: 'final', label: 'Final PDF ready', file: finalPdf },
  ];

  const result = steps.map((s) => ({ ...s, done: fileExistsLocal(s.file) }));
  const compileError = fileExistsLocal(compileLog)
    ? fs.readFileSync(compileLog, 'utf8').split(/\r?\n/).filter((line) => /error/i.test(line)).slice(-5).join(' | ')
    : '';
  return { runDir, finalPdf, steps: result, compileError, state: activeRuns.get(requestId) || null };
}

function dockerExecArgs(command) {
  return ['exec', N8N_CONTAINER_NAME, 'sh', '-lc', command];
}

function runInContainer(command) {
  execFileSync('docker', dockerExecArgs(command), { stdio: 'pipe' });
}

async function runInContainerWithRetry(command, options = {}) {
  const attempts = options.attempts ?? 5;
  const backoffMs = options.backoffMs ?? 4000;
  let currentCommand = command;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      runInContainer(currentCommand);
      return;
    } catch (error) {
      const stderr = String(error?.stderr || error?.message || '');
      const isTransient = /UNAVAILABLE|high demand|503|429|RESOURCE_EXHAUSTED/i.test(stderr);
      if (isTransient && currentCommand.includes('gemini-2.5-flash-lite')) {
        currentCommand = currentCommand.replaceAll('gemini-2.5-flash-lite', 'gemini-2.5-flash');
      } else if (isTransient && currentCommand.includes('gemini-2.5-flash')) {
        currentCommand = currentCommand.replaceAll('gemini-2.5-flash', 'gemini-2.5-flash-lite');
      }
      if (!isTransient || attempt === attempts) {
        throw error;
      }
      await sleep(backoffMs * attempt);
    }
  }
}

async function runPipeline({ requestId, company, jdText }) {
  const companySlug = slugifyCompany(company);
  const runDir = runDirFor(requestId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'job_description_raw.txt'), jdText, 'utf8');

  activeRuns.set(requestId, { phase: 'starting', companySlug, error: null });

  const qRunDir = `/data/runs/${requestId}`;
  const steps = [
    {
      phase: 'jd',
      command: `node /data/scripts/invoke_llm_agent.mjs --provider gemini --model gemini-2.5-flash-lite --system-prompt-file /data/prompts/jd_parser_system.txt --user-input-file ${qRunDir}/job_description_raw.txt --output-file ${qRunDir}/job_description.json`,
    },
    {
      phase: 'evidence-build',
      command: `node /data/scripts/build_candidate_evidence.mjs --run-dir ${qRunDir} --reference-pdf /data/candidate_template/candidate_profile.template.json`,
    },
    {
      phase: 'evidence-analyze',
      command: `node /data/scripts/invoke_llm_agent.mjs --provider gemini --model gemini-2.5-flash-lite --system-prompt-file /data/prompts/evidence_agent_system.txt --user-input-file ${qRunDir}/evidence_bundle.json --output-file ${qRunDir}/llm_evidence_output.json`,
    },
    {
      phase: 'evidence-write',
      command: `node /data/scripts/write_evidence_outputs.mjs --run-dir ${qRunDir}`,
    },
  ];

  try {
    runInContainer(`mkdir -p ${qRunDir}`);
    for (const step of steps) {
      activeRuns.set(requestId, { phase: step.phase, companySlug, error: null });
      await runInContainerWithRetry(step.command);
    }

    let bestScore = -1;
    let lastScore = null;
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      activeRuns.set(requestId, { phase: `author-cycle-${cycle}`, companySlug, error: null });
      await runInContainerWithRetry(`node /data/scripts/prepare_resume_author_payload.mjs --run-dir ${qRunDir} --cycle ${cycle}`);
      await runInContainerWithRetry(`node /data/scripts/invoke_llm_agent.mjs --provider gemini --model gemini-2.5-flash-lite --system-prompt-file /data/prompts/resume_author_system.txt --user-input-file ${qRunDir}/resume_author_payload.json --output-file ${qRunDir}/resume_data.json`);

      activeRuns.set(requestId, { phase: `render-cycle-${cycle}`, companySlug, error: null });
      await runInContainerWithRetry(`node /data/scripts/render_compile_resume.mjs --resume-json-path ${qRunDir}/resume_data.json --template-path /data/templates/base_resume_template.tex --output-dir ${qRunDir} --company-slug ${companySlug}`);

      activeRuns.set(requestId, { phase: `review-cycle-${cycle}`, companySlug, error: null });
      await runInContainerWithRetry(`node /data/scripts/extract_rendered_resume_text.mjs --run-dir ${qRunDir}`);
      await runInContainerWithRetry(`node /data/scripts/invoke_llm_agent.mjs --provider gemini --model gemini-2.5-flash-lite --system-prompt-file /data/prompts/gemini_reviewer_system.txt --user-input-file ${qRunDir}/rendered_resume_text.txt --output-file ${qRunDir}/review_feedback_cycle_${cycle}.json`);

      const reviewPath = path.join(runDir, `review_feedback_cycle_${cycle}.json`);
      const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
      lastScore = Number(review.ats_score || 0);
      bestScore = Math.max(bestScore, lastScore);
      if (lastScore >= 90) break;
    }

    const finalName = `resume_god_${companySlug}.pdf`;
    const localOut = path.join(outputDir, finalName);
    fs.copyFileSync(path.join(runDir, finalName), localOut);

    activeRuns.set(requestId, { phase: 'done', companySlug, error: null, ats_score: lastScore, best_score: bestScore });
    return {
      ok: true,
      request_id: requestId,
      status: (lastScore ?? 0) >= 90 ? 'passed' : 'max_cycles_reached',
      ats_score: lastScore,
      best_score: bestScore,
      output_file: localOut,
      filename: finalName,
      download_url: `/output/${encodeURIComponent(finalName)}`,
      status_url: `/status/${encodeURIComponent(requestId)}?company=${encodeURIComponent(company)}`,
    };
  } catch (error) {
    activeRuns.set(requestId, { phase: 'failed', companySlug, error: error.message });
    throw error;
  }
}

app.post('/run', upload.single('jd_pdf'), async (req, res) => {
  try {
    const company = String(req.body.company_name || '').trim();
    if (!company) return res.status(400).json({ error: 'company_name is required' });
    if (!req.file) return res.status(400).json({ error: 'jd_pdf is required' });

    const parsed = await pdfParse(req.file.buffer);
    const jdText = (parsed.text || '').trim();
    if (!jdText) return res.status(400).json({ error: 'Could not extract text from PDF' });

    const requestId = `ui_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const result = await runPipeline({ requestId, company, jdText });
    return res.json(result);
  } catch (err) {
    const message = String(err?.message || 'Unexpected error');
    if (/RESOURCE_EXHAUSTED|quota exceeded|rate-limit|rate limit/i.test(message)) {
      return res.status(429).json({ error: 'Gemini free-tier quota is exhausted right now. Wait for quota reset or use a paid key / lower-volume model.' });
    }
    if (/UNAVAILABLE|high demand|503/i.test(message)) {
      return res.status(503).json({ error: 'Gemini is under high demand right now. Please try again in a few minutes.' });
    }
    return res.status(500).json({ error: message || 'Unexpected error' });
  }
});

app.get('/status/:requestId', (req, res) => {
  const requestId = String(req.params.requestId || '').trim();
  const company = String(req.query.company || '').trim();
  if (!requestId) return res.status(400).json({ error: 'requestId required' });
  const companySlug = slugifyCompany(company);
  const status = getStepStatus(requestId, companySlug);
  return res.json({ request_id: requestId, company_slug: companySlug, ...status });
});

app.get('/output/:name', (req, res) => {
  const target = path.join(outputDir, path.basename(req.params.name));
  if (!fs.existsSync(target)) return res.status(404).send('File not found');
  res.download(target);
});

app.listen(PORT, () => {
  console.log(`Resume UI running at http://localhost:${PORT}`);
});
