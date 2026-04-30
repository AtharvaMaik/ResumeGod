import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const runDir = args['run-dir'];
let data={};
try{data=JSON.parse(fs.readFileSync(path.join(runDir,'llm_evidence_output.json'),'utf8'));}catch{}
fs.writeFileSync(path.join(runDir,'candidate_master_profile.json'), JSON.stringify(data.candidate_master_profile||{},null,2),'utf8');
fs.writeFileSync(path.join(runDir,'match_analysis.md'), data.match_analysis_md || '# match_analysis\nNo analysis generated.','utf8');
process.stdout.write(JSON.stringify({ok:true}));