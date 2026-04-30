import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const resumeJsonPath=args['resume-json-path'];
const templatePath=args['template-path'];
const outputDir=args['output-dir'];
const companySlug=args['company-slug'];

function esc(s=''){return String(s).replace(/\\/g,'\\textbackslash{}').replace(/([{}_#%&$])/g,'\\$1').replace(/~/g,'\\textasciitilde{}').replace(/\^/g,'\\textasciicircum{}');}
function bullets(arr=[]){if(!arr.length) return ''; return ['\\begin{itemize}[leftmargin=*,itemsep=1pt,topsep=2pt]', ...arr.map(b=>`\\item ${esc(b)}`), '\\end{itemize}'].join('\n');}
function hrefOrText(url,label){return url ? `\\href{${esc(url)}}{${esc(label)}}` : esc(label);}
function nonEmpty(parts){return parts.filter(Boolean).join(' \\textbar\\ ');}

fs.mkdirSync(outputDir,{recursive:true});
const data=JSON.parse(fs.readFileSync(resumeJsonPath,'utf8'));
const resume=data.resume_json || data.resume || data;
let tex=fs.readFileSync(templatePath,'utf8');

const basics = {
  name: resume.basics?.name || resume.contact_information?.name || 'Your Name',
  location: resume.basics?.location || resume.contact_information?.location || 'Your Location',
  email: resume.basics?.email || resume.contact_information?.email || 'you@example.com',
  phone: resume.basics?.phone || resume.contact_information?.phone || '',
  website: resume.basics?.website || resume.contact_information?.portfolio || '',
  linkedin: resume.basics?.linkedin || resume.contact_information?.linkedin || '',
  github: resume.basics?.github || resume.contact_information?.github || '',
};

const summary = Array.isArray(resume.summary)
  ? resume.summary.map(esc).join('\n')
  : esc(resume.summary || '');

const exp = (resume.experience || []).map((e) => {
  const right = e.date_range || (e.duration_months ? `${e.duration_months} months` : '');
  const org = e.company || e.employer || '';
  const bulletsSource = e.bullets || e.description || [];
  return `\\entryheader{${esc(e.title || '')}}{${esc(right)}}{${esc(org)}}\n${bullets(bulletsSource)}`;
}).join('\n');

const proj = (resume.projects || []).map((p) => {
  const stack = Array.isArray(p.stack) ? p.stack.join(', ') : (Array.isArray(p.technologies) ? p.technologies.join(', ') : (p.stack || p.technologies || ''));
  const bulletsSource = p.bullets || (Array.isArray(p.description) ? p.description : [p.description].filter(Boolean)) || [];
  return `\\entryheader{${esc(p.name || p.title || '')}}{${esc(p.date_range || '')}}{${esc(stack)}}\n${bullets(bulletsSource)}`;
}).join('\n');

const edu = (resume.education || []).map((e) => {
  const degree = [e.degree, e.major].filter(Boolean).join(' in ');
  const school = e.school || e.institution || '';
  const date = e.date_range || e.graduation_year || '';
  return `\\entryheader{${esc(degree)}}{${esc(date)}}{${esc(school)}}`;
}).join('\n');

const skills = Array.isArray(resume.skills)
  ? esc(resume.skills.map((item) => typeof item === 'string' ? item : [item.name, ...(item.keywords || [])].filter(Boolean).join(': ')).join(', '))
  : Object.entries(resume.skills || {}).map(([k,v])=>`\\textbf{${esc(k)}}: ${esc(Array.isArray(v)?v.join(', '):String(v))}`).join('\\\\\n');

const cert=(resume.certifications||[]).length?`\\resheading{Certifications}\n${bullets(resume.certifications)}`:'';

const headerLine1 = nonEmpty([
  basics.location && esc(basics.location),
  basics.email && `\\href{mailto:${esc(basics.email)}}{${esc(basics.email)}}`,
  basics.phone && esc(basics.phone),
]);
const headerLine2 = nonEmpty([
  basics.website && hrefOrText(basics.website, basics.website),
  basics.linkedin && hrefOrText(basics.linkedin, 'LinkedIn'),
  basics.github && hrefOrText(basics.github, 'GitHub'),
]);

const repl={
  '<<NAME>>':esc(basics.name),
  '<<LOCATION>>':headerLine1,
  '<<EMAIL>>':'',
  '<<PHONE>>':'',
  '<<WEBSITE>>':'',
  '<<LINKEDIN>>':'',
  '<<GITHUB>>':'',
  '<<SUMMARY_BLOCK>>':summary,
  '<<EXPERIENCE_BLOCK>>':exp,
  '<<PROJECTS_BLOCK>>':proj || 'Selected projects available on request.',
  '<<EDUCATION_BLOCK>>':edu,
  '<<SKILLS_BLOCK>>':skills,
  '<<CERTIFICATIONS_BLOCK>>':cert,
  '<<UPDATED_AT>>':new Date().toISOString().slice(0,16).replace('T',' ')
};
for(const [k,v] of Object.entries(repl)) tex=tex.replaceAll(k,v);
tex = tex.replace(/\\href\{\}\{[^}]*\}/g, '');
tex = tex.replace(/\\href\{mailto:\}\{\}/g, '');
tex = tex.replace(/^.*LinkedIn.*$/m, headerLine2 || '');
tex = tex.replace(/ \\\\textbar\\ /g, ' \\textbar\\ ');

const texPath=path.join(outputDir,'resume.tex');
fs.writeFileSync(texPath,tex,'utf8');

const tectonic = fs.existsSync('/data/bin/tectonic') ? '/data/bin/tectonic' : '/data/tectonic';
const run=spawnSync(tectonic,['-X','compile',texPath,'--outdir',outputDir],{encoding:'utf8'});
fs.writeFileSync(path.join(outputDir,'compile.log'),`${run.stdout||''}\n${run.stderr||''}`,'utf8');
if(run.status!==0){ console.error('Tectonic compile failed'); process.exit(1); }

const finalPdf=path.join(outputDir,`resume_god_${companySlug}.pdf`);
fs.copyFileSync(path.join(outputDir,'resume.pdf'),finalPdf);
process.stdout.write(JSON.stringify({resume_tex:texPath,final_pdf:finalPdf,compile_log:path.join(outputDir,'compile.log')}));
