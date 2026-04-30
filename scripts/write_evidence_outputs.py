import argparse, json
from pathlib import Path


def read_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run-dir', required=True)
    args = ap.parse_args()

    run_dir = Path(args.run_dir)
    llm_output = read_json(run_dir / 'llm_evidence_output.json', {})

    cmp = llm_output.get('candidate_master_profile', {})
    analysis = llm_output.get('match_analysis_md', '# match_analysis\nNo analysis generated.')

    (run_dir / 'candidate_master_profile.json').write_text(json.dumps(cmp, ensure_ascii=False, indent=2), encoding='utf-8')
    (run_dir / 'match_analysis.md').write_text(analysis, encoding='utf-8')

    print(json.dumps({
        'candidate_master_profile': str(run_dir / 'candidate_master_profile.json'),
        'match_analysis': str(run_dir / 'match_analysis.md')
    }))


if __name__ == '__main__':
    main()