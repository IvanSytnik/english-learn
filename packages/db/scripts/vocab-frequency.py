"""Offline: wordfreq Zipf frequency of every catalogue lemma (B6.2).

Reads packages/db/data/cefr-j-v1.5.json and writes
packages/db/data/frequency-wordfreq-en.json:

    { "source": { name, version, licence, attribution },
      "entries": { lemmaKey: zipf } }

lemmaKey is computed exactly as src/vocab/normalize.ts normalizeLemma does
(NFC, whitespace runs collapsed, trimmed, lower-cased); rows of the closed
classes the import leaves out are skipped. Multiword lemmas ("look up") are
supported by wordfreq itself. A zipf of 0 means wordfreq does not know the
word; vocab:sync-frequency stores it as null.

The frequency values are wordfreq data, licensed CC BY-SA 4.0 — keep them
identifiable (Lexeme.frequencyZipf) and credited on /credits.

Usage (from packages/db; the venv lives outside the repo):
    python3 -m venv /tmp/wordfreq-venv
    /tmp/wordfreq-venv/bin/pip install -r scripts/vocab-frequency.requirements.txt
    /tmp/wordfreq-venv/bin/python3 -I scripts/vocab-frequency.py
"""

import json
import pathlib
import re
import sys
import unicodedata
from importlib.metadata import version

from wordfreq import zipf_frequency

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
SOURCE = DATA / "cefr-j-v1.5.json"
OUTPUT = DATA / "frequency-wordfreq-en.json"

# src/vocab/normalize.ts CEFR_J_POS: the classes mapped to null.
LEFT_OUT_POS = {"determiner", "modal auxiliary", "be-verb", "do-verb", "have-verb", "infinitive-to"}

# Copied from the "License" and "Citing wordfreq" sections of the wordfreq
# README (v3.1.1): the citation, and the credits its data sources require.
ATTRIBUTION = (
    "Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. "
    "https://doi.org/10.5281/zenodo.7199437. "
    "wordfreq includes data files that may be redistributed under a Creative Commons "
    "Attribution-ShareAlike 4.0 license (https://creativecommons.org/licenses/by-sa/4.0/). "
    "It contains data extracted from Google Books Ngrams (http://books.google.com/ngrams); "
    "data derived from the Leeds Internet Corpus, from the University of Leeds Centre for "
    "Translation Studies (http://corpus.leeds.ac.uk/list.html), Wikipedia, the free "
    "encyclopedia (http://www.wikipedia.org) and ParaCrawl (https://paracrawl.eu); data from "
    "OPUS OpenSubtitles 2018 (http://opus.nlpl.eu/OpenSubtitles.php), whose data originates "
    "from the OpenSubtitles project (http://www.opensubtitles.org/); and the SUBTLEX word "
    "lists (SUBTLEX-US, SUBTLEX-UK, SUBTLEX-CH, SUBTLEX-DE, SUBTLEX-NL) created by Marc "
    "Brysbaert et al., freely available at http://crr.ugent.be/programs-data/subtitle-frequencies."
)


def lemma_key(raw: str) -> str:
    lemma = re.sub(r"\s+", " ", unicodedata.normalize("NFC", raw)).strip()
    return lemma.lower()


def main() -> int:
    dataset = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries: dict[str, float] = {}
    for row in dataset["entries"]:
        if row["pos"].strip().lower() in LEFT_OUT_POS:
            continue
        key = lemma_key(row["lemma"])
        if key not in entries:
            entries[key] = zipf_frequency(key, "en")
    out = {
        "source": {
            "name": "wordfreq",
            "version": version("wordfreq"),
            "licence": "CC BY-SA 4.0",
            "attribution": ATTRIBUTION,
        },
        "entries": dict(sorted(entries.items())),
    }
    OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    unknown = sum(1 for z in entries.values() if z == 0)
    print(f"{len(entries)} lemma keys, {unknown} unknown to wordfreq -> {OUTPUT.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
