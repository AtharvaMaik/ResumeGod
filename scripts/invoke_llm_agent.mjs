import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean));
const provider = args.provider;
const model = args.model;
const systemPrompt = fs.readFileSync(args['system-prompt-file'],'utf8');
const userContent = fs.readFileSync(args['user-input-file'],'utf8');

async function callOpenAI(){
  const apiKey = process.env.OPENAI_API_KEY;
  if(!apiKey) throw new Error('OPENAI_API_KEY missing');
  const res = await fetch('https://api.openai.com/v1/responses', {
    method:'POST',
    headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body: JSON.stringify({
      model,
      input:[
        {role:'system',content:[{type:'input_text',text:systemPrompt}]},
        {role:'user',content:[{type:'input_text',text:userContent}]}
      ],
      text:{format:{type:'text'}}
    })
  });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.output_text || '').trim();
}

async function callGemini(){
  const apiKey = process.env.GEMINI_API_KEY;
  if(!apiKey) throw new Error('GEMINI_API_KEY missing');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      system_instruction:{parts:[{text:systemPrompt}]},
      contents:[{parts:[{text:userContent}]}],
      generationConfig:{responseMimeType:'application/json'}
    })
  });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
}

(async ()=>{
  const txt = provider === 'gemini' ? await callGemini() : await callOpenAI();
  let parsed;
  try { parsed = JSON.parse(txt); } catch { parsed = {_raw: txt, _invalid_json: true}; }
  fs.writeFileSync(args['output-file'], JSON.stringify(parsed,null,2), 'utf8');
  process.stdout.write(JSON.stringify({output_file: args['output-file']}));
})().catch(err=>{ console.error(err.message); process.exit(1); });