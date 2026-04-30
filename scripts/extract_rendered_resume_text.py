import argparse, json
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None


def extract_pdf_text(pdf_path: Path) -> str:
    if not pdf_path.exists() or PdfReader is None:
        return ''
    try:
        reader = PdfReader(str(pdf_path))
        return '\n'.join((p.extract_text() or '') for p in reader.pages)
    except Exception:
        return ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-dir', required=True)
    args = ap.parse_args()

    run = Path(args.run_dir)
    text = ''

    tex = run / 'resume.tex'
    if tex.exists():
        text = tex.read_text(encoding='utf-8', errors='ignore')
    else:
        pdf = next(run.glob('resume_god_*.pdf'), None)
        if pdf:
            text = extract_pdf_text(pdf)

    out = run / 'rendered_resume_text.txt'
    out.write_text(text, encoding='utf-8')
    print(json.dumps({'rendered_resume_text': str(out)}))


if __name__ == '__main__':
    main()
