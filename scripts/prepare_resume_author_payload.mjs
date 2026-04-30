import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const runDir=args['run-dir'];
const cycle=Number(args['cycle']||1);
function readJson(p,d){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return d;}}
const payload={
  job_description: readJson(path.join(runDir,'job_description.json'),{}),
  candidate_master_profile: readJson(path.join(runDir,'candidate_master_profile.json'),{}),
  match_analysis_md: fs.existsSync(path.join(runDir,'match_analysis.md'))?fs.readFileSync(path.join(runDir,'match_analysis.md'),'utf8'):'',
  review_feedback: cycle>1?readJson(path.join(runDir,`review_feedback_cycle_${cycle-1}.json`),{}):null
};
const out=path.join(runDir,'resume_author_payload.json');
fs.writeFileSync(out, JSON.stringify(payload,null,2),'utf8');
process.stdout.write(JSON.stringify({resume_author_payload:out}));