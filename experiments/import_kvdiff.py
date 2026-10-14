"""Import the measured figure data from a self-contained kvdiff overview.

This exports existing measurements; it does not re-run the model or fit PCA.
Re-run the analysis in kvdiff/notebooks/03_v_spectrum.py and rebuild its overview
first, then run:
    uv run experiments/import_kvdiff.py /attic/d/kvdiff/overviews/03_v_spectrum.html
Only the Python standard library is needed. The published book needs no kvdiff checkout.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path


class Overview(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = {}
        self.active = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'application/json':
            self.active = attrs['id']
            self.scripts[self.active] = ''

    def handle_data(self, data):
        if self.active:
            self.scripts[self.active] += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.active = None


def extract(path: Path) -> dict:
    raw = path.read_bytes()
    page = Overview()
    page.feed(raw.decode())
    specs = json.loads(page.scripts['kv-specs'])
    datasets = {name: list(spec['datasets'].values()) for name, spec in specs.items()}
    sources = ['same thread (cross-validated)', 'other threads', 'other head', 'next layer']
    spectra = {}
    for row in datasets['spectrum'][0]:
        spectra.setdefault(f"{row['layer']}:{row['head']}", []).append(row['variance'])
    # Store the exact values; derive shares and cumulative sums in the widget.
    transfer = [[r['case_no'], r['layer'], r['head'], r['k'], sources.index(r['source']), r['captured']]
                for r in datasets['transfer'][0]]
    out = {
        'provenance': {
            'project': 'kvdiff', 'experiment': '03_v_spectrum',
            'source': 'overviews/03_v_spectrum.html',
            'sha256': hashlib.sha256(raw).hexdigest(),
            'source_build': re.search(r'<dt>Built</dt>\s*<dd>(.*?)</dd>', raw.decode()).group(1),
            'model': 'Qwen 3.5 2B', 'dataset': '5 GSM8K sequences, greedy decoding',
            'note': 'Imported measurements, not a new run. Prompt and response positions combined.',
        },
        'sequences': json.loads(page.scripts['sequence-meta']),
        'layers': [3, 7, 11, 15, 19, 23], 'heads': [0, 1], 'dimension': 256,
        'spectra': spectra, 'sources': sources, 'transfer': transfer,
    }
    for name in ('temporal', 'pooling', 'layers', 'threads', 'rd'):
        out['layer_profile' if name == 'layers' else name] = datasets[name][0]
    out['calibration'] = [r for rows in datasets['calibration'] for r in rows if 'N' in r]
    assert sum(r['n'] for r in out['sequences']) == 4719
    assert len(spectra) == 12 and all(len(v) == 256 for v in spectra.values())
    assert len(transfer) == 60 * 18 * 4
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('overview', type=Path)
    args = parser.parse_args()
    out = extract(args.overview)
    target = Path(__file__).resolve().parents[1] / 'data/lab/kvdiff-v-spectrum.json'
    target.write_text(json.dumps(out, separators=(',', ':'), allow_nan=False) + '\n')
    print(f'Imported 12 spectra and 4,320 transfer measurements into {target}')


if __name__ == '__main__':
    main()
