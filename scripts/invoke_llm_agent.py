import argparse, json, os, sys
from pathlib import Path
import requests


def call_openai(model: str, system_prompt: str, user_content: str) -> str:
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key:
        raise RuntimeError('OPENAI_API_KEY missing')
    r = requests.post(
        'https://api.openai.com/v1/responses',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json={
            'model': model,
            'input': [
                {'role': 'system', 'content': [{'type': 'input_text', 'text': system_prompt}]},
                {'role': 'user', 'content': [{'type': 'input_text', 'text': user_content}]}
            ],
            'text': {'format': {'type': 'text'}}
        },
        timeout=180,
    )
    r.raise_for_status()
    data = r.json()
    return data.get('output_text', '').strip()


def call_gemini(model: str, system_prompt: str, user_content: str) -> str:
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY missing')
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
    payload = {
        'system_instruction': {'parts': [{'text': system_prompt}]},
        'contents': [{'parts': [{'text': user_content}]}],
        'generationConfig': {'responseMimeType': 'application/json'},
    }
    r = requests.post(url, json=payload, timeout=180)
    r.raise_for_status()
    data = r.json()
    return data['candidates'][0]['content']['parts'][0]['text'].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--provider', choices=['openai', 'gemini'], required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--system-prompt-file', required=True)
    ap.add_argument('--user-input-file', required=True)
    ap.add_argument('--output-file', required=True)
    args = ap.parse_args()

    system_prompt = Path(args.system_prompt_file).read_text(encoding='utf-8')
    user_content = Path(args.user_input_file).read_text(encoding='utf-8')

    if args.provider == 'openai':
        txt = call_openai(args.model, system_prompt, user_content)
    else:
        txt = call_gemini(args.model, system_prompt, user_content)

    try:
        parsed = json.loads(txt)
    except Exception:
        # Keep raw output for downstream repair pass.
        parsed = {'_raw': txt, '_invalid_json': True}

    Path(args.output_file).write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output_file': args.output_file}))


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)