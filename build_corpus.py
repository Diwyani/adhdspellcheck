"""
build_corpus.py
===============
Run this ONCE locally to convert the Birkbeck corpus into the JS dictionary
the TypeEase extension uses.

Usage:
  1. Download missp.dat from: https://titan.dcs.bbk.ac.uk/~roger/missp.dat
  2. Optionally download holbrook-missp.dat from the same page (has frequency data)
  3. Run:  python3 build_corpus.py missp.dat holbrook-missp.dat
  4. Copy the output corpus.js into the typeease-v3/ extension folder

What it does:
  - Parses both corpora
  - Frequency-weights entries (Holbrook tells us how often each misspelling occurs)
  - Classifies each misspelling by ADHD error type (transposition, doubling, omission, etc.)
  - Outputs a compact JS file: window.TYPEEASE_CORPUS = { misspelling: [correct, freq, type] }

ADHD error type classification:
  T = Transposition  (adjacent letters swapped — strongest ADHD signature, Adi-Japha 2007)
  D = Doubling       (single↔double letter error — specific ADHD weak spot, Re & Cornoldi 2015)
  O = Omission       (letter dropped)
  I = Insertion      (extra letter added)
  S = Substitution   (one letter replaced)
  B = Boundary       (word merge/split)
  X = Other / mixed

Weighting: ADHD-relevant types (T, D) get a score boost so they rank first
when multiple corrections are possible for the same typo.
"""

import sys
import json
import re
from collections import defaultdict

# ── ADHD-TYPE CLASSIFIER ──────────────────────────────────────────────────────

def classify(wrong, correct):
    """Classify the dominant error type between wrong and correct."""
    w, c = wrong.lower(), correct.lower()

    # Word boundary (underscore = space in corpus)
    if '_' in w or '_' in c:
        return 'B'

    lw, lc = len(w), len(c)

    # Same length — transposition or substitution
    if lw == lc:
        diffs = [(a, b) for a, b in zip(w, c) if a != b]
        if len(diffs) == 2:
            # Classic transposition: the two differing chars are swaps of each other
            if diffs[0][0] == diffs[1][1] and diffs[0][1] == diffs[1][0]:
                return 'T'
        # Doubling check: same word with a doubled/halved consonant
        if re.sub(r'(.)\1+', r'\1', w) == re.sub(r'(.)\1+', r'\1', c):
            return 'D'
        return 'S'

    # Different length — insertion or omission
    longer, shorter = (w, c) if lw > lc else (c, w)
    diff = lw - lc

    # Doubling check first: collapsing doubles gives same word
    if re.sub(r'(.)\1+', r'\1', w) == re.sub(r'(.)\1+', r'\1', c):
        return 'D'

    if abs(diff) == 1:
        return 'O' if lw < lc else 'I'

    return 'X'

# ADHD weight boost (higher = prioritised in suggestions)
TYPE_WEIGHT = {'T': 3.0, 'D': 2.5, 'O': 2.0, 'I': 1.5, 'S': 1.0, 'B': 1.2, 'X': 0.8}

# ── PARSERS ───────────────────────────────────────────────────────────────────

def parse_birkbeck(path):
    """Parse missp.dat format: $correct_word\nmisspelling\nmisspelling\n..."""
    entries = {}  # wrong -> (correct, base_freq)
    current_correct = None
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('$'):
                current_correct = line[1:].lower().replace('_', ' ')
            elif current_correct:
                wrong = line.lower().replace('_', ' ')
                if wrong and wrong != current_correct:
                    entries[wrong] = (current_correct, 1)
    print(f"  Birkbeck: {len(entries)} entries loaded")
    return entries

def parse_holbrook(path, entries):
    """
    Parse holbrook-missp.dat (same format but with frequency counts after each misspelling).
    Format: $correct\nmisspelling COUNT\n...
    Updates existing entries with real frequency data.
    """
    current_correct = None
    holbrook_count = 0
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith('$'):
                current_correct = line[1:].lower().replace('_', ' ')
            elif current_correct:
                parts = line.rsplit(None, 1)
                if len(parts) == 2 and parts[1].isdigit():
                    wrong = parts[0].lower().replace('_', ' ')
                    freq = int(parts[1])
                else:
                    wrong = line.lower().replace('_', ' ')
                    freq = 1
                if wrong and wrong != current_correct:
                    entries[wrong] = (current_correct, freq)
                    holbrook_count += 1
    print(f"  Holbrook: {holbrook_count} entries updated with frequency data")
    return entries

# ── BUILD ─────────────────────────────────────────────────────────────────────

def build(birkbeck_path, holbrook_path=None):
    print("Loading corpora...")
    entries = parse_birkbeck(birkbeck_path)
    if holbrook_path:
        entries = parse_holbrook(holbrook_path, entries)

    print("Classifying error types and computing scores...")
    output = {}
    type_counts = defaultdict(int)

    for wrong, (correct, freq) in entries.items():
        error_type = classify(wrong, correct)
        score = round(freq * TYPE_WEIGHT[error_type], 2)
        output[wrong] = [correct, score, error_type]
        type_counts[error_type] += 1

    print("\nError type breakdown:")
    total = sum(type_counts.values())
    for t, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        label = {'T':'Transposition','D':'Doubling','O':'Omission',
                 'I':'Insertion','S':'Substitution','B':'Boundary','X':'Other'}[t]
        print(f"  {label:15s} {count:5d}  ({100*count/total:.1f}%)")

    # Sort by score descending within the JS output (for readability)
    sorted_output = dict(sorted(output.items(), key=lambda x: -x[1][1]))

    js = "// TypeEase corpus — auto-generated by build_corpus.py\n"
    js += "// Sources: Birkbeck (36,133 pairs) + Holbrook (frequency-weighted)\n"
    js += "// Format: wrong -> [correct, adhd_score, error_type]\n"
    js += "// Error types: T=Transposition D=Doubling O=Omission I=Insertion S=Substitution B=Boundary\n"
    js += "window.TYPEEASE_CORPUS = " + json.dumps(sorted_output, ensure_ascii=False) + ";\n"

    out_path = "corpus.js"
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(js)

    print(f"\n✓ Written {len(output)} entries to {out_path}")
    print(f"  File size: ~{len(js)//1024}KB")
    print("\nNext step: copy corpus.js into your typeease-v3/ extension folder")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 build_corpus.py missp.dat [holbrook-missp.dat]")
        sys.exit(1)
    birkbeck = sys.argv[1]
    holbrook = sys.argv[2] if len(sys.argv) > 2 else None
    build(birkbeck, holbrook)
