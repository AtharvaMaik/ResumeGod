import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const runDir = args['run-dir'];
fs.mkdirSync(runDir,{recursive:true});

function readJson(p,d){ try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return d; } }

const bundle = {
  job_description: readJson(path.join(runDir,'job_description.json'), {}),
  profile_json: readJson(path.join(runDir,'profile.json'), {}),
  github_profile: readJson(path.join(runDir,'github_profile.json'), {}),
  portfolio: readJson(path.join(runDir,'portfolio.json'), {}),
  baseline_resume_text: ''
};

const out = path.join(runDir,'evidence_bundle.json');
fs.writeFileSync(out, JSON.stringify(bundle,null,2),'utf8');
process.stdout.write(JSON.stringify({evidence_bundle: out}));