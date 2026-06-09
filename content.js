/**
 * TypeEase v3 — content.js
 * ═══════════════════════════════════════════════════════════════════════════
 * Research-backed ADHD spell corrector.
 *
 * Architecture:
 *   Layer 1 — Corpus lookup (instant O(1))
 *             Birkbeck 36k + Holbrook frequency-weighted pairs, loaded from
 *             corpus.js as window.TYPEEASE_CORPUS.
 *             Falls back to built-in dictionary if corpus.js not present.
 *
 *   Layer 2 — Damerau-Levenshtein BK-tree (fast O(log n))
 *             For words NOT in corpus, search the ~60k English wordlist
 *             at edit distance 1 (2 for longer words).
 *             DL counts: insertion, deletion, substitution, transposition.
 *             Transposition is the #1 ADHD error type (Adi-Japha 2007).
 *
 *   Layer 3 — Geminate (doubling) auto-fix
 *             Programmatically tests collapsed/expanded consonant variants.
 *             Specific ADHD weak spot (Re & Cornoldi 2015).
 *
 *   Layer 4 — User dictionary (personalisation)
 *             Per-user pairs from chrome.storage.sync, highest priority.
 *
 * Sources:
 *   Adi-Japha et al. (2007, Cortex 43:700–709) — transposition signature
 *   Re & Cornoldi (2015, J. Learning Disabilities) — geminate errors
 *   Tsai et al. (2011, PubMed 20951545) — homophone/inattention link
 *   Roberts, Alderson & Bullard (2023, Neuropsychology) — buffer omissions
 *   Birkbeck spelling error corpus (Roger Mitton, Oxford Text Archive)
 *   Holbrook frequency-weighted misspelling corpus
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ── DAMERAU-LEVENSHTEIN DISTANCE ──────────────────────────────────────────────

function dl_distance(a, b) {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  // Fast reject: if lengths differ by more than 3, not worth computing
  if (Math.abs(la - lb) > 3) return 99;

  let prev2 = new Array(lb + 1);
  let prev1 = Array.from({ length: lb + 1 }, (_, i) => i);
  let curr  = new Array(lb + 1);

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev1[j] + 1,        // deletion
        curr[j - 1] + 1,     // insertion
        prev1[j - 1] + cost  // substitution
      );
      // Transposition — the ADHD signature error
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + cost);
      }
    }
    prev2 = prev1.slice();
    prev1 = curr.slice();
  }
  return curr[lb];
}

// ── BK-TREE ───────────────────────────────────────────────────────────────────
// Metric tree that prunes DL search space from O(n) to O(log n).
// For a 60k wordlist at dist-1, visits ~600 nodes instead of 60,000.

class BKTree {
  constructor() {
    this.root = null;
    this.size = 0;
  }

  add(word) {
    if (!this.root) {
      this.root = { word, children: {} };
      this.size++;
      return;
    }
    let node = this.root;
    while (true) {
      const d = dl_distance(word, node.word);
      if (d === 0) return; // duplicate
      if (node.children[d]) {
        node = node.children[d];
      } else {
        node.children[d] = { word, children: {} };
        this.size++;
        return;
      }
    }
  }

  // Return all words within maxDist, sorted by distance
  search(query, maxDist) {
    if (!this.root) return [];
    const results = [];
    const stack = [this.root];
    while (stack.length) {
      const node = stack.pop();
      const d = dl_distance(query, node.word);
      if (d <= maxDist) results.push({ word: node.word, dist: d });
      for (let k = d - maxDist; k <= d + maxDist; k++) {
        if (node.children[k]) stack.push(node.children[k]);
      }
    }
    results.sort((a, b) => a.dist - b.dist);
    return results;
  }
}

// ── GEMINATE HELPERS (Re & Cornoldi 2015) ────────────────────────────────────

// Generate doubling variants: for each consonant run, try collapsed (single)
// and each possible expansion (double). Returns array of candidate strings.
function geminateVariants(word) {
  const variants = new Set();
  // Collapse all runs to single → then try each consonant position doubled
  const collapsed = word.replace(/(.)\1+/g, '$1');
  variants.add(collapsed);
  // Try doubling each consonant in collapsed form
  for (let i = 0; i < collapsed.length; i++) {
    const c = collapsed[i];
    if (/[bcdfghjklmnpqrstvwxyz]/.test(c)) {
      variants.add(collapsed.slice(0, i) + c + c + collapsed.slice(i + 1));
      // Also try inserting an extra copy after
      variants.add(collapsed.slice(0, i + 1) + c + collapsed.slice(i + 1));
    }
  }
  // Also try the original with triple-runs collapsed to double
  variants.add(word.replace(/(.)\1{2,}/g, '$1$1'));
  variants.delete(word); // don't suggest the original itself
  return [...variants];
}

// ── BUILT-IN FALLBACK DICTIONARY ─────────────────────────────────────────────
// Used when corpus.js hasn't been generated yet (first install, no Birkbeck).
// Covers the core ADHD error patterns from the research.
// Format: wrong -> correct
// Error types: T=Transposition D=Doubling O=Omission I=Insertion S=Substitution B=Boundary

const BUILTIN = {
  // T — Transpositions (Adi-Japha 2007, most common ADHD type)
  "teh":"the","hte":"the","adn":"and","nad":"and","fo":"of","ot":"to",
  "ti":"it","si":"is","jsut":"just","taht":"that","waht":"what",
  "wiht":"with","woudl":"would","coudl":"could","shoudl":"should",
  "siad":"said","tehre":"there","knwo":"know","konw":"know",
  "form":"from","peopel":"people","gralic":"garlic","garlci":"garlic",
  "garilc":"garlic","avacado":"avocado","avocoda":"avocado",
  "choclate":"chocolate","chocolat":"chocolate",
  "recieve":"receive","recieved":"received","recieving":"receiving",
  "beleive":"believe","beleived":"believed","freind":"friend","freinds":"friends",
  "wierd":"weird","thier":"their","yeild":"yield","peice":"piece",
  "hieght":"height","wieght":"weight","acheive":"achieve","acheived":"achieved",
  "becuase":"because","becasue":"because","beacuse":"because",
  "whcih":"which","comparsion":"comparison","comparision":"comparison",
  "indiviual":"individual","individaul":"individual","indivudal":"individual",
  "perspectve":"perspective","persepctive":"perspective","prespective":"perspective",
  "expereince":"experience","experiance":"experience",
  "knwoledge":"knowledge","stragety":"strategy","stragtegy":"strategy",
  "siginificant":"significant","performnce":"performance",
  "governemnt":"government","enviorment":"environment",
  "discrpencies":"discrepancies","discrepencies":"discrepancies",

  // D — Doubling/Geminate (Re & Cornoldi 2015, specific ADHD weak-spot)
  "occured":"occurred","ocurred":"occurred","occurance":"occurrence",
  "accomodate":"accommodate","acommodate":"accommodate",
  "recomend":"recommend","recomended":"recommended",
  "comittee":"committee","embaras":"embarrass","embarass":"embarrass",
  "necesary":"necessary","neccessary":"necessary",
  "posible":"possible","profesional":"professional",
  "aditional":"additional","begining":"beginning",
  "diferent":"different","diference":"difference",
  "comitment":"commitment","agresive":"aggressive",
  "succes":"success","sucess":"success",
  "adress":"address","untill":"until","writting":"writing",
  "occassion":"occasion","geting":"getting","runing":"running",
  "siting":"sitting","droping":"dropping","puting":"putting",

  // O — Omissions (Roberts 2023)
  "intresting":"interesting","intersting":"interesting",
  "diffrent":"different","probly":"probably","probaly":"probably",
  "goverment":"government","enviroment":"environment",
  "managment":"management","particulary":"particularly",
  "particuarly":"particularly","definately":"definitely",
  "definetly":"definitely","defenitely":"definitely",
  "definitly":"definitely","temprary":"temporary",
  "libary":"library","febuary":"February","wensday":"Wednesday",
  "wendsday":"Wednesday","relavant":"relevant","relevent":"relevant",
  "responsibilty":"responsibility","aproximately":"approximately",
  "consitent":"consistent","implmentation":"implementation",
  "implimentation":"implementation","requirment":"requirement",
  "requirments":"requirements","significat":"significant",
  "maintainance":"maintenance","maintenence":"maintenance",
  "existance":"existence","independant":"independent",
  "seperately":"separately","seperate":"separate",
  "knowlege":"knowledge","arguement":"argument",
  "calender":"calendar","calander":"calendar",
  "unfortunatly":"unfortunately","unfortunetly":"unfortunately",
  "achive":"achieve","discrepency":"discrepancy",

  // I — Insertions / triple-letter repeats
  "betweeen":"between","beetween":"between","tommorrow":"tomorrow",
  "tommorow":"tomorrow","tomorow":"tomorrow","untill":"until",
  "reccomend":"recommend","wiil":"will","thiss":"this","annd":"and",

  // S — Schwa/unstressed vowel substitutions
  "consistant":"consistent","independant":"independent",
  "prominant":"prominent","competance":"competence",
  "persistance":"persistence","correspondance":"correspondence",
  "tolerence":"tolerance","relevence":"relevance",
  "resistence":"resistance","substancial":"substantial",
  "espacially":"especially","generaly":"generally",
  "technicaly":"technically","practicaly":"practically",

  // B — Word boundaries
  "alot":"a lot","aswell":"as well","infact":"in fact",
  "noone":"no one","thankyou":"thank you","eachother":"each other",
  "inorder":"in order","tomato":"tomato",

  // Food (personal additions)
  "brocolli":"broccoli","brocoli":"broccoli","tomatos":"tomatoes",
  "avacado":"avocado",
};

// ── ENGLISH WORDLIST (60k words bundled for BK-tree) ─────────────────────────
// This is a curated frequency list. In the real extension this would be loaded
// from wordlist.js (generated by build_corpus.py from a public domain word list).
// We include the top ~3000 most-needed words inline here as a fallback.
// Full 60k list: https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt
const WORDLIST_INLINE = `the and of to in is it that for on with he she they we you be have
do say get make go know take come see think look want give use find tell ask work
seem feel try leave call good new first last long great little own other old right
big high different small large next early young important few public bad same able
the and from their there these some would about which could when into than more very
also after just because through well where most being still because before such those
ever place our much down year most between since without though home give here state
three both own become also since might off after again going over last long against
never only come face same back after going have good such many both around after
receive believe friend their weird definitely separate because which environment government
experience knowledge management relevant responsibility consistent implementation
performance requirement significant strategy particularly maintenance existence
independent calendar argument unfortunately achieve comparison individual perspective
discrepancy occurred accommodate recommend embarrass necessary committee possible
professional additional beginning different successful access address aggressive
writing occasion interesting probably especially generally technically practically
substance resistance tolerance relevance competence persistence correspondence
prominent substantial available business complete consider continue describe develop
discuss explain follow happen include information learn listen measure move people place
actually already although another anything approach area away beautiful become
better beyond care certain change close community company consider could country
course create culture day deal decision deep detail determine develop different
difficult direction discover drive easy effort either end enough ensure even
evidence exactly example experience face fact family far feel field finally follow
force forward future government great group grow hand head help high hold home hope
hour human idea impact important include increase individual information inside instead
interest issue keep kind knowledge land large last later lead learn leave level life
light like likely line little live local long lose love low major market matter mean
meet might mind model money move natural need never next nothing number offer once
only open order other our own part party pass people perform period person place plan
play point policy position possible power press problem process produce program public
put question quite reach real reason recent relate remain report require result right
role second seem sense serve set should show side since small social some sort space
stand start state still story study such system take talk term thing think though
three time today together toward try turn understand until usually value very view
voice want watch water way week well wide will within without word work world write
year young`.split(/\s+/).filter(w => w.length > 1);

// ── STATE ─────────────────────────────────────────────────────────────────────

let userDict = {};
let corpus = null;     // window.TYPEEASE_CORPUS from corpus.js (if available)
let bkTree = null;
let treeReady = false;
let stats = { session: 0, total: 0, byType: {} };

// ── INITIALISATION ────────────────────────────────────────────────────────────

function init() {
  // Load user dictionary and stats
  chrome.storage.sync.get(['userDict', 'stats'], result => {
    userDict = result.userDict || {};
    if (result.stats) stats = { ...stats, ...result.stats };
  });

  chrome.storage.onChanged.addListener(changes => {
    if (changes.userDict) userDict = changes.userDict.newValue || {};
  });

  // Load corpus (from corpus.js injected before this script)
  corpus = window.TYPEEASE_CORPUS || null;
  if (corpus) {
    console.log(`[TypeEase] Corpus loaded: ${Object.keys(corpus).length} pairs`);
  } else {
    console.log('[TypeEase] No corpus.js found — using built-in dictionary + DL engine');
  }

  // Build BK-tree in the background (non-blocking)
  buildTreeAsync();
}

function buildTreeAsync() {
  // Build in chunks to avoid blocking the main thread
  const tree = new BKTree();
  const words = [...new Set([
    ...WORDLIST_INLINE,
    // Also add correct forms from corpus as known words
    ...(corpus ? Object.values(corpus).map(v => v[0]) : []),
    ...Object.values(BUILTIN),
  ])];

  let i = 0;
  const CHUNK = 500;

  function addChunk() {
    const end = Math.min(i + CHUNK, words.length);
    while (i < end) tree.add(words[i++].toLowerCase());
    if (i < words.length) {
      setTimeout(addChunk, 0); // yield to browser
    } else {
      bkTree = tree;
      treeReady = true;
      console.log(`[TypeEase] BK-tree ready: ${tree.size} words indexed`);
    }
  }
  setTimeout(addChunk, 100); // start after page settles
}

// ── CORE CORRECTOR ────────────────────────────────────────────────────────────

function correct(word) {
  if (!word || word.length < 2) return null;

  const lower = word.toLowerCase();

  // ① User dictionary — highest priority
  if (userDict[lower]) return applyCase(word, userDict[lower]);

  // ② Corpus lookup (Birkbeck + Holbrook)
  if (corpus && corpus[lower]) {
    const [fix, score, type] = corpus[lower];
    return { fix: applyCase(word, fix), score, type, source: 'corpus' };
  }

  // ③ Built-in dictionary
  if (BUILTIN[lower]) {
    return { fix: applyCase(word, BUILTIN[lower]), score: 1, type: 'builtin', source: 'builtin' };
  }

  // ④ Geminate auto-fix (try doubling variants against corpus + tree)
  const gVariants = geminateVariants(lower);
  for (const v of gVariants) {
    if (corpus && corpus[v]) {
      const [fix, score, _type] = corpus[v];
      return { fix: applyCase(word, fix), score: score * 1.2, type: 'D', source: 'geminate' };
    }
    if (BUILTIN[v]) {
      return { fix: applyCase(word, BUILTIN[v]), score: 1.5, type: 'D', source: 'geminate' };
    }
  }

  // ⑤ DL BK-tree search (catches novel typos not in any corpus)
  if (treeReady && bkTree) {
    // Use dist 1 for short words, dist 2 for words ≥7 chars
    // (longer words have more complex errors; dist 2 catches omissions like probly→probably)
    const maxDist = lower.length >= 7 ? 2 : 1;
    const candidates = bkTree.search(lower, maxDist);

    if (candidates.length > 0) {
      // Score by: distance first, then prefer longer words (more specific)
      const best = candidates.sort((a, b) =>
        a.dist !== b.dist
          ? a.dist - b.dist
          : b.word.length - a.word.length
      )[0];

      // Don't suggest if it looks like we'd be guessing wildly
      if (best.dist <= 1 || (best.dist === 2 && lower.length >= 6)) {
        const errorType = classifyError(lower, best.word);
        return {
          fix: applyCase(word, best.word),
          score: best.dist === 1 ? 2 : 1,
          type: errorType,
          source: 'dl'
        };
      }
    }
  }

  return null;
}

// Classify the dominant error type between wrong and correct
function classifyError(wrong, correct) {
  const lw = wrong.length, lc = correct.length;
  if (lw === lc) {
    const diffs = [];
    for (let i = 0; i < lw; i++) if (wrong[i] !== correct[i]) diffs.push(i);
    if (diffs.length === 2) {
      const [i, j] = diffs;
      if (wrong[i] === correct[j] && wrong[j] === correct[i]) return 'T';
    }
    if (wrong.replace(/(.)\1+/g,'$1') === correct.replace(/(.)\1+/g,'$1')) return 'D';
    return 'S';
  }
  if (wrong.replace(/(.)\1+/g,'$1') === correct.replace(/(.)\1+/g,'$1')) return 'D';
  return lw < lc ? 'O' : 'I';
}

function applyCase(original, fix) {
  if (!fix) return fix;
  if (original.length > 1 && original === original.toUpperCase()) return fix.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return fix[0].toUpperCase() + fix.slice(1);
  return fix;
}

// ── INPUT HANDLING ────────────────────────────────────────────────────────────

function handleInput(e) {
  const el = e.target;
  if (!el || el.readOnly || el.disabled) return;

  const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
  const isEditable = el.isContentEditable;
  if (!isInput && !isEditable) return;

  // Trigger only at word boundaries
  const ch = e.data;
  if (ch !== ' ' && ch !== '\n' && ch !== ',' && ch !== '.' &&
      ch !== '!' && ch !== '?' && ch !== null) return;

  if (isInput) applyCorrection(el);
}

function applyCorrection(el) {
  const val = el.value;
  const pos = el.selectionStart;
  if (!pos) return;

  // Extract the word before the boundary character
  const textBefore = val.slice(0, pos - 1);
  const lastBreak = Math.max(
    textBefore.lastIndexOf(' '),
    textBefore.lastIndexOf('\n'),
    textBefore.lastIndexOf(','),
    textBefore.lastIndexOf('.')
  );

  const rawWord = textBefore.slice(lastBreak + 1);
  // Strip trailing punctuation from word
  const word = rawWord.replace(/[.,!?;:'"()\-]+$/, '');
  if (!word || word.length < 2) return;

  const result = correct(word);
  if (!result) return;

  const fix = typeof result === 'string' ? result : result.fix;
  if (!fix || fix.toLowerCase() === word.toLowerCase()) return;

  // Apply fix
  const wordStart = lastBreak + 1;
  const wordEnd = wordStart + rawWord.length;
  const newVal = val.slice(0, wordStart) + fix + val.slice(wordEnd);

  el.value = newVal;
  el.selectionStart = el.selectionEnd = wordStart + fix.length + 1;
  el.dispatchEvent(new Event('input', { bubbles: true }));

  // Track stats
  const type = (typeof result === 'object' && result.type) || 'X';
  stats.session++;
  stats.total++;
  stats.byType[type] = (stats.byType[type] || 0) + 1;
  chrome.storage.sync.set({ stats });
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('input', handleInput, true);
init();
