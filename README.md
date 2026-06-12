TypeEase — ADHD Spell Corrector


A Chrome extension that silently fixes the specific spelling slips ADHD brains make — as you type, on every website.

The problem

You know how to spell garlic. You just typed gralic again.
That's not bad spelling — that's ADHD. Your brain moves faster than your fingers, 
and somewhere between thinking the word and typing it, two letters swap. Or one gets dropped.
Or a double consonant goes missing. Every existing spell-check tool is built for dyslexia — a completely different cognitive mechanism. 
TypeEase is built specifically for the error patterns ADHD produces.

The problem

You know how to spell garlic. You just typed gralic again.

That's not bad spelling — that's ADHD. Your brain moves faster than your fingers, and somewhere between thinking the word and typing it, two letters swap. Or one gets dropped. Or a double consonant goes missing.

Every existing spell-check tool is built for dyslexia — a completely different cognitive mechanism. TypeEase is built specifically for the error patterns ADHD produces.


How it works

When you hit space after a word, TypeEase checks it against a research-backed dictionary and fixes it instantly. No popup. No red squiggle. No interruption. The word is just right.

It works on:


Standard text inputs and textareas (Twitter/X, Gmail, search boxes)
ContentEditable editors (Notion, Substack, Linear, Coda)



The five ADHD error types it catches

TypeWhat happensExampleTranspositionAdjacent letters swapgralic → garlicDoublingSingle↔double letter confusionoccured → occurredOmissionLetter droppedintresting → interestingInsertionExtra letter addedbetweeen → betweenBoundaryWords merged or splitalot → a lot

Homophone errors (their/there) are listed in the Homophones tab as awareness content — they can't be auto-corrected without knowing the sentence context.


Install

Option A — Load unpacked (developer mode)


Download or clone this repo
Open Chrome → chrome://extensions
Toggle Developer mode ON (top right)
Click Load unpacked → select the typeease-v3 folder
The ✦ icon appears in your toolbar


Option B — Chrome Web Store

Coming soon.


Files

typeease-v3/
├── manifest.json      Chrome extension config — permissions, file wiring
├── content.js         The engine — injected into every page, handles all correction
├── corpus.js          Misspelling dictionary — placeholder until you run build step
├── popup.html         Settings UI shell — HTML and CSS only, no inline JS
├── popup.js           Settings UI logic — tabs, stats, custom corrections
└── build_corpus.py    One-time build tool — generates corpus.js from Birkbeck data

Why 5 files and not fewer?
Chrome MV3 enforces strict separation. manifest.json is required by Chrome. popup.html and popup.js are split because Chrome bans inline <script> tags in extension HTML (Content Security Policy). corpus.js is separate so it can be regenerated without touching the engine.


Upgrade to 36,000 words (optional but recommended)

The extension ships with a ~200-word built-in dictionary. To load the full Birkbeck spelling error corpus (36,133 real misspelling pairs collected from human writers):

bash# 1. Download the corpus
#    Go to: https://titan.dcs.bbk.ac.uk/~roger/missp.dat
#    Save as missp.dat in the typeease-v3 folder

# 2. Run the build script
python3 build_corpus.py missp.dat

# 3. Refresh the extension
#    chrome://extensions → click ↺ on TypeEase

The corpus dot in the popup turns green and coverage goes from ~200 pairs to 36,133.

Optionally also download holbrook-missp.dat from the same page for frequency weighting:

bashpython3 build_corpus.py missp.dat holbrook-missp.dat


The algorithm

TypeEase uses Damerau-Levenshtein distance — the edit-distance measure that counts transpositions (swapping two adjacent letters) as a single operation, not two. This is the critical difference from regular spell-checkers.

Standard Levenshtein: gralic → garlic = distance 2 (missed by dist-1 checkers)
Damerau-Levenshtein: gralic → garlic = distance 1 (caught)

Transpositions are the #1 ADHD error type (Adi-Japha et al., 2007, Cortex). Every existing JS spell-check library uses regular Levenshtein and misses them.

For performance, the DL comparisons run on a BK-tree — a metric tree that prunes the search space from O(n) to O(log n). On a 60,000-word dictionary, a brute-force DL search takes ~200ms per keypress. The BK-tree brings it to ~2ms.


Add your own corrections

Click the ✦ icon → Dictionary tab → type your typo and the correct word → hit +.

Your corrections sync across Chrome sessions via chrome.storage.sync and always take priority over the built-in dictionary.


Research basis

TypeEase is built on primary literature, not blog posts. The error categories and algorithm choices come directly from:


Adi-Japha et al. (2007) Cortex 43:700–709 — transpositions as the dominant ADHD error type; graphemic buffer errors in children with ADHD and normal reading skills
Re & Cornoldi (2015) Journal of Learning Disabilities — geminates (double letters) as a specific ADHD weak spot
Tsai et al. (2011) PubMed 20951545 — homophone errors correlate with inattention scores
Roberts, Alderson & Bullard (2023) Neuropsychology — omission and transposition errors under working-memory load


Corpus sources:

Birkbeck spelling error corpus (Roger Mitton, Oxford Text Archive) — 36,133 pairs
Holbrook frequency-weighted misspelling corpus — frequency counts per error



What doesn't work yet
Notion / rich text editors — ContentEditable support is implemented but Notion uses a React synthetic event system that can interfere. Works on most pages; Notion is inconsistent.

Homophone correction — their vs there requires sentence context. A future version may use a local language model (no API key, runs in-browser via WebAssembly).

Google Docs — uses a canvas renderer that no content script can hook into.

Contributing

If you have a word you always misspell, open an issue or PR and add it to the DICT object in content.js. The more ADHD-specific patterns we collect the better.


License

MIT — use it, fork it, build on it.


Built by Diwyani Vajpayee · Research-backed · Free forever · No data leaves your browser
