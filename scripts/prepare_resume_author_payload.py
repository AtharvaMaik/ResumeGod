import argparse, json
from pathlib import Path


def read_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-dir', required=True)
    ap.add_argument('--cycle', required=True, type=int)
    args = ap.parse_args()

    run = Path(args.run_dir)
    payload = {
        'job_description': read_json(run / 'job_description.json', {}),
        'candidate_master_profile': read_json(run / 'candidate_master_profile.json', {}),
        'match_analysis_md': (run / 'match_analysis.md').read_text(encoding='utf-8') if (run / 'match_analysis.md').exists() else '',
        'review_feedback': read_json(run / f'review_feedback_cycle_{args.cycle-1}.json', {}) if args.cycle > 1 else None,
    }

    out = run / 'resume_author_payload.json'
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'resume_author_payload': str(out)}))


if __name__ == '__main__':
    main()