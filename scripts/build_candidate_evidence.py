import argparse, json, os, re
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None


def read_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def extract_pdf_text(pdf_path: Path) -> str:
    if not pdf_path.exists() or PdfReader is None:
        return ""
    try:
        reader = PdfReader(str(pdf_path))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception:
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-dir', required=True)
    ap.add_argument('--reference-pdf', required=True)
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)

    jd = read_json(run_dir / 'job_description.json', {})
    profile = read_json(run_dir / 'profile.json', {})
    github = read_json(run_dir / 'github_profile.json', {})
    portfolio = read_json(run_dir / 'portfolio.json', {})
    resume_text = extract_pdf_text(Path(args.reference_pdf))

    bundle = {
        'job_description': jd,
        'profile_json': profile,
        'github_profile': github,
        'portfolio': portfolio,
        'baseline_resume_text': resume_text,
    }

    (run_dir / 'evidence_bundle.json').write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'evidence_bundle': str(run_dir / 'evidence_bundle.json')}))


if __name__ == '__main__':
    main()