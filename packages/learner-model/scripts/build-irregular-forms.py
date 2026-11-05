#!/usr/bin/env python3
"""Build packages/learner-model/data/irregular-forms.json (B6.7, paste import).

Offline, not part of the build. Reads the WordNet 3.0 exception lists
(verb.exc, noun.exc, adj.exc: `form base [base ...]`), keeps the rows whose
base is a catalogue lemma (or spelling variant) of the same part of speech
(packages/db/data/cefr-j-v1.5.json), drops forms rarer than Zipf 2.5 in
wordfreq (archaic forms such as `spake`), and writes the JSON with a header.
WordNet's LICENSE is copied verbatim next to it: the licence requires its
notice, statements and disclaimer on every copy of the data.

    python3 -m venv .venv && .venv/bin/pip install nltk wordfreq
    .venv/bin/python -I packages/learner-model/scripts/build-irregular-forms.py
        [--wordnet DIR]   an unpacked nltk `corpora/wordnet` (default: download)
        [--date YYYY-MM-DD]

Prints counts and 10 sample rows only.
"""
import argparse
import datetime
import json
import shutil
import sys
import tempfile
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CATALOGUE = ROOT / 'packages/db/data/cefr-j-v1.5.json'
OUT_DIR = ROOT / 'packages/learner-model/data'
OUT = OUT_DIR / 'irregular-forms.json'
LICENCE_OUT = OUT_DIR / 'WORDNET-LICENSE'
MIN_ZIPF = 2.5
# exception list -> the catalogue part of speech its bases must have
LISTS = {'verb': 'verb', 'noun': 'noun', 'adj': 'adjective'}


def wordnet_dir(arg):
    if arg:
        return Path(arg)
    import nltk  # only for the download

    target = Path(tempfile.mkdtemp(prefix='wordnet-'))
    if not nltk.download('wordnet', download_dir=str(target), quiet=True):
        sys.exit('nltk.download("wordnet") failed')
    return target / 'corpora' / 'wordnet'


def catalogue_keys():
    """Lower-case lemmas and variants of the catalogue, per part of speech."""
    entries = json.loads(CATALOGUE.read_text(encoding='utf-8'))['entries']
    keys = {pos: set() for pos in LISTS.values()}
    for e in entries:
        if e['pos'] in keys:
            for spelling in [e['lemma'], *e.get('variants', [])]:
                keys[e['pos']].add(' '.join(spelling.lower().split()))
    return keys


def rows_of(path, bases, zipf):
    kept, not_in_catalogue, rare = set(), 0, 0
    for line in path.read_text(encoding='utf-8').splitlines():
        parts = [p.replace('_', ' ') for p in line.split()]
        if len(parts) < 2:
            continue
        form, *candidates = parts
        for base in candidates:
            if base == form:
                continue
            if base not in bases:
                not_in_catalogue += 1
            elif zipf(form, 'en') < MIN_ZIPF:
                rare += 1
            else:
                kept.add((form, base))
    return sorted(kept), not_in_catalogue, rare


def write_json(header, tables):
    lines = ['{']
    for key, value in header.items():
        lines.append(f'  {json.dumps(key)}: {json.dumps(value, ensure_ascii=False)},')
    names = list(tables)
    for i, name in enumerate(names):
        rows = ',\n'.join(f'    {json.dumps(list(r), ensure_ascii=False)}' for r in tables[name])
        lines.append(f'  {json.dumps(name)}: [\n{rows}\n  ]' + (',' if i < len(names) - 1 else ''))
    lines.append('}')
    OUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wordnet')
    parser.add_argument('--date', default=datetime.date.today().isoformat())
    args = parser.parse_args()
    from wordfreq import zipf_frequency

    wn = wordnet_dir(args.wordnet)
    readme = (wn / 'README').read_text(encoding='utf-8', errors='replace')
    if 'WordNet 3.0' not in readme:
        sys.exit(f'{wn} is not WordNet 3.0')
    keys = catalogue_keys()
    tables, counts, dropped = {}, {}, {}
    for name, pos in LISTS.items():
        rows, missing, rare = rows_of(wn / f'{name}.exc', keys[pos], zipf_frequency)
        tables[name] = rows
        counts[name] = len(rows)
        dropped[name] = {'baseNotInCatalogue': missing, 'rarerThanMinZipf': rare}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(wn / 'LICENSE', LICENCE_OUT)
    licence_text = '\n'.join(
        line.rstrip() for line in (wn / 'LICENSE').read_text(encoding='utf-8').strip().splitlines()
    )
    header = {
        'source': {
            'name': 'WordNet 3.0 exception lists (verb.exc, noun.exc, adj.exc)',
            'version': '3.0',
            'url': 'https://wordnet.princeton.edu/',
            'obtainedVia': f"nltk.download('wordnet'), nltk {version('nltk')}",
            'copyright': 'WordNet 3.0 Copyright 2006 by Princeton University.  All rights reserved.',
            'licence': 'WordNet 3.0 license (Princeton University): attribution required; '
            'its notice, statements and disclaimer are in WORDNET-LICENSE next to this file',
            'citation': 'Christiane Fellbaum (ed.), WordNet: An Electronic Lexical Database. '
            'Cambridge, MA: MIT Press, 1998.',
            # Shown verbatim on /credits (legal.credits.wordnetLicence; a unit test compares).
            'licenceText': licence_text,
        },
        'generated': args.date,
        'generator': 'packages/learner-model/scripts/build-irregular-forms.py',
        'filter': {
            'catalogue': 'base is a lemma or variant of packages/db/data/cefr-j-v1.5.json '
            'with the same part of speech',
            'minZipf': MIN_ZIPF,
            'zipfSource': f"wordfreq {version('wordfreq')} zipf_frequency(form, 'en'); "
            'used only to drop rows, no frequency value is stored',
        },
        'counts': counts,
        'dropped': dropped,
        'columns': ['form', 'base'],
    }
    write_json(header, tables)

    print(f'wrote {OUT.relative_to(ROOT)} and {LICENCE_OUT.relative_to(ROOT)}')
    print('counts', json.dumps(counts), 'dropped', json.dumps(dropped))
    sample = [(n, r) for n in tables for r in tables[n][:: max(1, len(tables[n]) // 4)]][:10]
    for name, (form, base) in sample:
        print(f'  {name}: {form} -> {base}')


if __name__ == '__main__':
    main()
