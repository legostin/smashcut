/*
 * Smashcut — music theory extension (the composer's toolbox). Loaded after mix.js / instruments.js.
 * Adds composition helpers to the score helper object `m`:
 *   harmony  m.key, m.progression, m.voiceLead, m.chordOf, m.comp
 *   lines    m.bassline, m.arp, m.melody
 *   rhythm   m.groove, m.swing, m.humanize, m.velocity, m.dur
 *   form     m.arrange (energy curve → layers, fills, transitions, automation)
 *   video    m.snap, m.barAt, m.beatAt, m.cuts, m.avoid, m.bpmFor
 *   play     m.perform(instrument, events) — schedules events on m.inst.* / Tone instruments / drum kits
 * Every helper returns plain data ({note,time,dur,vel} events, chord objects) so you can inspect, filter
 * and combine before playing. Everything is deterministic: randomness comes from `seed` options.
 * Pure-JS helpers that need no bpm are also on window.musicTheory (usable at the top of score.js).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- notes
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function pcOf(name) {
    const mt = /^([A-Ga-g])([#b]*)/.exec(String(name).trim());
    if (!mt) throw new Error('theory: bad note name ' + name);
    let pc = PC[mt[1].toUpperCase()];
    for (const a of mt[2]) pc += a === '#' ? 1 : -1;
    return mod(pc, 12);
  }
  function toMidi(n) {
    if (typeof n === 'number') return n;
    const mt = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(String(n).trim());
    if (!mt) throw new Error('theory: bad note ' + n + ' (use names like "C4", "F#3", "Bb2")');
    let pc = PC[mt[1].toUpperCase()];
    for (const a of mt[2]) pc += a === '#' ? 1 : -1;
    return 12 * (parseInt(mt[3], 10) + 1) + pc;
  }
  const midiName = (x, flats) => (flats ? FLAT : SHARP)[mod(x, 12)] + (Math.floor(x / 12) - 1);
  const transpose = (note, semis) => midiName(toMidi(note) + semis, /b/.test(String(note).slice(1)));

  // seeded PRNG (mulberry32) + tiny string hash so seeds can be words
  function rng(seed) {
    let a = typeof seed === 'string' ? hash(seed) : (seed == null ? 7 : seed) | 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  // ---------------------------------------------------------------- keys & modes
  const MODES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], locrian: [0, 1, 3, 5, 6, 8, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11], melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  };
  const MODE_ALIAS = { ionian: 'major', maj: 'major', aeolian: 'minor', min: 'minor', m: 'minor', harmonic: 'harmonicMinor', melodic: 'melodicMinor' };
  const MINORISH = (mode) => /minor|dorian|phrygian|locrian/.test(mode);
  // keys whose signature uses flats (major tonic pcs / minor tonic pcs)
  const FLAT_MAJOR = new Set([5, 10, 3, 8, 1, 6]), FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);

  function makeKey(root, mode) {
    if (root && typeof root === 'object' && root.isKey) return root;
    root = root == null ? 'C' : String(root).trim();
    if (/\s/.test(root)) { const p = root.split(/\s+/); root = p[0]; mode = mode || p[1]; }
    const short = /^([A-Ga-g][#b]?)(m|min)$/.exec(root);
    if (short) { root = short[1]; mode = mode || 'minor'; }
    mode = MODE_ALIAS[mode] || mode || 'major';
    if (!MODES[mode]) throw new Error('theory: unknown mode ' + mode + ' (' + Object.keys(MODES).join(', ') + ')');
    root = root[0].toUpperCase() + root.slice(1);
    const tonic = pcOf(root), iv = MODES[mode];
    const flats = /b/.test(root.slice(1)) || (!/#/.test(root) && (MINORISH(mode) ? FLAT_MINOR : FLAT_MAJOR).has(tonic));
    const pcs = iv.map((i) => mod(tonic + i, 12));
    const key = {
      isKey: true, root, mode, tonic, intervals: iv, pcs, flats, minor: MINORISH(mode), name: root + ' ' + mode,
      /** midi of scale degree d (0 = tonic, 7 = tonic an octave up, -1 = leading tone below) */
      degreeMidi(d, octave = 4) { return 12 * (octave + 1) + tonic + iv[mod(d, 7)] + 12 * Math.floor(d / 7); },
      /** note name of 1-based degree n (1 = tonic) */
      degree(n, octave = 4) { return midiName(key.degreeMidi(n - 1, octave), flats); },
      /** scale notes from the tonic at `octave` */
      scale(octave = 4, octaves = 1) { const out = []; for (let d = 0; d < 7 * octaves; d++) out.push(midiName(key.degreeMidi(d, octave), flats)); out.push(midiName(key.degreeMidi(7 * octaves, octave), flats)); return out; },
      /** pentatonic subset (major: 1 2 3 5 6, minor: 1 b3 4 5 b7) */
      pentatonic(octave = 4, octaves = 1) { const deg = key.minor ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5]; const out = []; for (let o = 0; o < octaves; o++) for (const d of deg) out.push(midiName(key.degreeMidi(d + 7 * o, octave), flats)); return out; },
      contains(note) { return pcs.includes(mod(typeof note === 'number' ? note : pcOf(note), 12)); },
      /** nearest in-key note */
      snap(note) { const x = toMidi(note); for (let d = 0; d < 7; d++) { if (pcs.includes(mod(x - d, 12))) return midiName(x - d, flats); if (pcs.includes(mod(x + d, 12))) return midiName(x + d, flats); } return midiName(x, flats); },
      /** chord on a roman numeral / degree, e.g. key.chord('vi'), key.chord('V7') */
      chord(roman, octave = 3) { return romanChord(roman, key, octave); },
      relative() { return key.minor ? makeKey(midiName(tonic + 3, true).replace(/-?\d+$/, ''), 'major') : makeKey(midiName(tonic + 9, false).replace(/-?\d+$/, ''), 'minor'); },
      name2: (x) => midiName(x, flats),
      toString() { return key.name; },
    };
    return key;
  }

  // ---------------------------------------------------------------- chords
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], 5: [0, 7], sus2: [0, 2, 7], sus4: [0, 5, 7],
    6: [0, 4, 7, 9], m6: [0, 3, 7, 9], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9],
    mMaj7: [0, 3, 7, 11], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], 9: [0, 4, 7, 10, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14],
    '7sus4': [0, 5, 7, 10], '6/9': [0, 4, 7, 9, 14], m11: [0, 3, 7, 10, 14, 17], add11: [0, 4, 7, 17], maj7sus2: [0, 2, 7, 11],
  };
  const QUAL_ALIAS = { maj: '', M: '', min: 'm', '-': 'm', mi: 'm', 'ø': 'm7b5', o: 'dim', '°': 'dim', '+': 'aug', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', min7: 'm7', '-7': 'm7', sus: 'sus4', 2: 'add9', add2: 'add9', madd2: 'madd9', 69: '6/9', 'm(add9)': 'madd9', o7: 'dim7', '°7': 'dim7' };
  function buildChord(rootPc, quality, key, octave = 3, extra = {}) {
    const q = QUAL_ALIAS[quality] != null ? QUAL_ALIAS[quality] : quality;
    const iv = QUAL[q];
    if (!iv) throw new Error('theory: unknown chord quality "' + quality + '" (' + Object.keys(QUAL).filter(Boolean).join(', ') + ')');
    const flats = key ? key.flats : false;
    const base = 12 * (octave + 1) + rootPc;
    const midis = iv.map((i) => base + i);
    const rootName = (flats ? FLAT : SHARP)[rootPc];
    return {
      name: rootName + q, root: rootName, rootPc, quality: q, intervals: iv.slice(),
      pcs: [...new Set(iv.map((i) => mod(rootPc + i, 12)))],
      notes: midis.map((x) => midiName(x, flats)), midi: midis,
      bass: midiName(28 + mod(rootPc - 4, 12), flats), // root in E1..D#2
      ...extra,
    };
  }
  /** 'F#m7' → chord object; also accepts slash chords 'C/E' (bass on E) */
  function chordOf(name, octave = 3, key) {
    const [main, slash] = String(name).split('/');
    const mt = /^([A-G][#b]?)(.*)$/.exec(main.trim());
    if (!mt) throw new Error('theory: bad chord name ' + name);
    const c = buildChord(pcOf(mt[1]), mt[2], key, octave);
    if (slash) { c.bassPc = pcOf(slash); c.bass = midiName(24 + 4 + mod(c.bassPc - 4, 12), key ? key.flats : false); c.name += '/' + slash; }
    return c;
  }
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };
  /** roman numeral → chord in key. Case = quality (V major, vi minor), °/+ dim/aug, suffix 7 maj7 9 add9 sus2 sus4 6 5, b/# alter the root (relative to the parallel major). */
  function romanChord(token, key, octave = 3, extOverride) {
    const mt = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|o|ø|\+)?(.*)$/.exec(String(token).trim());
    if (!mt) return null;
    const [, acc, num, sym] = mt;
    let suffix = mt[4] || '';
    const deg = ROMAN[num.toLowerCase()];
    const upper = num === num.toUpperCase();
    let rootPc;
    if (acc) rootPc = mod(key.tonic + MODES.major[deg - 1] + (acc === 'b' ? -1 : 1), 12);
    else rootPc = key.pcs[deg - 1];
    if (extOverride != null && !suffix) suffix = extOverride;
    let q;
    if (/^sus|^5$/.test(suffix)) q = suffix;
    else if (sym === '°' || sym === 'o') q = suffix === '7' ? 'dim7' : 'dim';
    else if (sym === 'ø') q = 'm7b5';
    else if (sym === '+') q = 'aug';
    else {
      const map = upper ? { '': '', 7: '7', maj7: 'maj7', 9: '9', maj9: 'maj9', add9: 'add9', 6: '6', '6/9': '6/9', '7sus4': '7sus4', add11: 'add11' }
        : { '': 'm', 7: 'm7', maj7: 'mMaj7', 9: 'm9', m9: 'm9', add9: 'madd9', madd9: 'madd9', 6: 'm6', 11: 'm11', m7: 'm7', m7b5: 'm7b5' };
      q = map[suffix];
      if (q == null) q = suffix; // let buildChord validate
    }
    return buildChord(rootPc, q, acc ? { ...key, flats: acc === 'b' } : key, octave, { roman: token, degree: deg });
  }

  // ---------------------------------------------------------------- moods → progressions
  // progs: proven progressions (first = default); ext: colour added when the token has no suffix (auto extensions)
  const MOODS = {
    uplifting:   { key: 'C major', progs: ['I V vi IV', 'vi IV I V', 'I IV vi V', 'IV I V vi'], ext: { I: 'add9', IV: 'add9', vi: 'm7', V: 'sus4' }, bpm: [110, 128], genre: 'pop' },
    corporate:   { key: 'G major', progs: ['I V vi IV', 'IV I V vi', 'vi IV I V', 'I IV vi V'], ext: { I: 'add9', IV: 'add9', vi: 'm7' }, bpm: [110, 124], genre: 'corporate' },
    epic:        { key: 'D minor', progs: ['i VI III VII', 'i VII VI VII', 'VI VII i i', 'i iv VI V'], ext: {}, bpm: [85, 100], genre: 'cinematic' },
    triumphant:  { key: 'D major', progs: ['I bVI bVII I', 'I IV V I', 'I V IV V', 'IV V I I'], ext: { V: 'sus4' }, bpm: [90, 120], genre: 'cinematic' },
    melancholic: { key: 'A minor', progs: ['i VI III VII', 'i iv VI V', 'VI VII i i', 'i VII VI v'], ext: { i: 'm7', VI: 'maj7', iv: 'm7', III: 'maj7' }, bpm: [70, 95], genre: 'lofi' },
    tense:       { key: 'E minor', progs: ['i bVI i V', 'i bII i bII', 'i iv bVI V', 'i i bVI bVII'], ext: {}, bpm: [90, 140], genre: 'cinematic' },
    dark:        { key: 'C minor', progs: ['i VI iv V', 'i bII bVII i', 'i v VI iv', 'i iv i v'], ext: { i: 'madd9' }, bpm: [70, 140], genre: 'trap' },
    chill:       { key: 'F major', progs: ['ii V I vi', 'I vi ii V', 'IV iii ii I', 'vi ii V I'], ext: { I: 'maj9', ii: 'm9', V: '9', vi: 'm7', IV: 'maj7', iii: 'm7' }, bpm: [70, 90], genre: 'lofi' },
    dreamy:      { key: 'F major', progs: ['I II IV I', 'I iii IV iv', 'IV V iii vi', 'I IV I IV'], ext: { I: 'maj7', II: 'add9', IV: 'maj7', iii: 'm7', iv: 'm6' }, bpm: [70, 100], genre: 'ambient' },
    playful:     { key: 'C major', progs: ['I vi IV V', 'I IV I V', 'I iii IV V', 'I V I IV'], ext: { I: '6', V: '7' }, bpm: [100, 128], genre: 'pop' },
    hopeful:     { key: 'D major', progs: ['IV I V vi', 'I V vi IV', 'vi IV I V'], ext: { I: 'add9', IV: 'maj7' }, bpm: [90, 120], genre: 'corporate' },
    calm:        { key: 'C major', progs: ['I IV vi IV', 'IV I IV I', 'I iii vi IV'], ext: { I: 'maj7', IV: 'maj7', vi: 'm7', iii: 'm7' }, bpm: [70, 100], genre: 'ambient' },
    jazz:        { key: 'Bb major', progs: ['ii V I vi', 'I vi ii V', 'iii vi ii V'], ext: { I: 'maj7', ii: 'm7', V: '7', vi: 'm7', iii: 'm7' }, bpm: [80, 130], genre: 'lofi' },
  };
  const MOOD_ALIAS = { happy: 'playful', fun: 'playful', inspiring: 'uplifting', motivational: 'uplifting', sad: 'melancholic', emotional: 'melancholic', nostalgic: 'melancholic', lofi: 'chill', relaxed: 'chill', ambient: 'calm', mysterious: 'tense', suspense: 'tense', horror: 'dark', aggressive: 'dark', heroic: 'triumphant', victory: 'triumphant', trailer: 'epic', cinematic: 'epic', tech: 'corporate', business: 'corporate', explainer: 'calm', hope: 'hopeful' };
  const RICH = { I: 'maj7', IV: 'maj7', ii: 'm7', iii: 'm7', vi: 'm7', V: '7', i: 'm7', iv: 'm7', VI: 'maj7', III: 'maj7', VII: '', v: 'm7' };

  // ---------------------------------------------------------------- note values
  function makeDur(spb, bpb) {
    return function dur(x) {
      if (typeof x === 'number') return x;
      const mt = /^(\d+)(n|t|m)(\.)?$/.exec(String(x).trim());
      if (!mt) throw new Error('theory: bad note value ' + x + " (use '4n', '8n', '16n', '8t', '1m', '4n.' or seconds)");
      const n = parseInt(mt[1], 10);
      let beats = mt[2] === 'm' ? n * bpb : (4 / n) * (mt[2] === 't' ? 2 / 3 : 1);
      if (mt[3]) beats *= 1.5;
      return beats * spb;
    };
  }

  // ---------------------------------------------------------------- grooves (16 steps per bar; 32 = 2-bar cycle)
  // X accent 1.0 · x hit 0.8 · o ghost 0.4 · r 32nd roll (2 hits) · t 16th-triplet roll (3 hits) · . rest
  const GROOVES = {
    house: { bpm: [120, 128], swing: 0.12, parts: {
      kick: 'X...X...X...X...', clap: '....X.......X...', openHat: '..X...X...X...X.', hat: '.o.o.o.o.o.o.o.o', perc: '.......x.......x' + '.......x..x....x' },
      minimal: ['kick', 'hat', 'openHat'], intro: ['hat', 'perc'], peak: ['ride'], ride: 'x.x.x.x.x.x.x.x.', fill: { clap: '........xxxxxxxx', snare: '........oxoxxxXX' } },
    techno: { bpm: [125, 135], swing: 0, parts: {
      kick: 'X...X...X...X...', clap: '....x.......x...', hat: '..X...X...X...X.', rim: '...x..x....x..x.' + '...x..x...x..x..', shaker: 'o.o.o.o.o.o.o.o.' },
      minimal: ['kick', 'hat'], intro: ['hat', 'rim'], peak: ['ride'], ride: 'xoxoxoxoxoxoxoxo', fill: { clap: '............xxxx', rim: '........x.x.x.xx' } },
    trap: { bpm: [130, 150], swing: 0, halfTime: true, parts: {
      kick: 'X......x..X.....' + 'X.....x...X..x..', clap: '........X.......', hat: 'x.x.x.x.x.x.x.x.' + 'x.x.x.x.xtx.rrrr', openHat: '..............x.' + '................', perc: '................' + '.....o.......o..' },
      minimal: ['hat', 'clap'], intro: ['hat'], peak: ['openHat'], fill: { hat: 'xxxxttttrrrrtttt', kick: '................', clap: '........X.....xX' } },
    hiphop: { bpm: [84, 96], swing: 0.4, parts: {
      kick: 'X.........X.....' + 'X......X..X...x.', snare: '....X.......X...' + '....X..o....X..o', hat: 'x.x.x.x.x.x.x.x.', openHat: '..............x.' + '................' },
      minimal: ['kick', 'hat'], intro: ['hat'], peak: ['perc'], perc: '..x...x...x...x.', fill: { snare: '....X..o.oX.X.xX', kick: 'X.........x.....' } },
    lofi: { bpm: [70, 88], swing: 0.55, parts: {
      kick: 'X.....x...X.....' + 'X.......x.X...x.', snare: '....X.......X...' + '....X.......X..o', hat: 'x.ox.ox.x.ox.ox.', rim: '................' + '..........o.....' },
      minimal: ['kick', 'hat'], intro: ['hat', 'rim'], peak: ['openHat'], openHat: '..............x.', fill: { snare: '....X.....o.X.oo', hat: 'x.ox.ox.x.......' } },
    pop: { bpm: [100, 128], swing: 0, parts: {
      kick: 'X.......X.x.....' + 'X.......X.....x.', snare: '....X.......X...', clap: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
      minimal: ['kick', 'hat'], intro: ['hat'], peak: ['openHat', 'shaker'], openHat: '..x...x...x...x.', shaker: 'oxoxoxoxoxoxoxox', fill: { snare: '........x.x.xxXX', tom: '........x.x.x.x.' } },
    rock: { bpm: [100, 140], swing: 0, parts: {
      kick: 'X.......X.X.....' + 'X.......X.....x.', snare: '....X.......X...', hat: 'X.x.X.x.X.x.X.x.' },
      minimal: ['kick', 'hat'], intro: ['hat'], peak: ['ride'], ride: 'X.x.X.x.X.x.X.x.', fill: { tom: '........x.x.xxxx', snare: '........X.x.....', hat: '........' + '........' } },
    cinematic: { bpm: [85, 100], swing: 0, halfTime: true, parts: {
      kick: 'X.......X.......' + 'X.....x.X.......', snare: '........X.......', tom: 'X..x..x.x..x.x..' + 'X..x..x.x.x.x.xx', perc: '..x...x...x...x.' },
      minimal: ['tom'], intro: ['perc'], peak: ['hat'], hat: 'xoxoxoxoxoxoxoxo', fill: { tom: '....x.x.xxxxXXXX', snare: '............xxXX' } },
    corporate: { bpm: [108, 124], swing: 0, parts: {
      kick: 'X...X...X...X...', clap: '....X.......X...', hat: '..x...x...x...x.', shaker: 'oxoxoxoxoxoxoxox' },
      minimal: ['kick', 'hat'], intro: ['shaker'], peak: ['openHat'], openHat: '..............x.', fill: { clap: '........x.x.xxxx', snare: '............oxxX' } },
    dnb: { bpm: [165, 178], swing: 0, parts: {
      kick: 'X.........X.....' + 'X.........x.X...', snare: '....X.......X...' + '....X..o.o..X..o', hat: 'x.x.x.x.x.x.x.x.', ride: '................' },
      minimal: ['hat', 'snare'], intro: ['hat'], peak: ['openHat', 'ride'], openHat: '..x.......x.....', fill: { snare: '....X.xx.xX.xxXX', kick: 'X.........x.....' } },
    afro: { bpm: [100, 124], swing: 0.3, parts: {
      kick: 'X...X...X...X...', rim: 'x..x..x...x.x...', perc: '..x.x..x..x.x..x', shaker: 'xoxoxoxoxoxoxoxo', clap: '....x.......x...' },
      minimal: ['kick', 'rim', 'shaker'], intro: ['rim', 'perc'], peak: ['openHat'], openHat: '..x...x...x...x.', fill: { tom: '........x.xx.xxx', perc: '........xxxxxxxx' } },
    latin: { bpm: [88, 100], swing: 0, parts: {
      kick: 'X...X...X...X...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.', rim: '..x...x...x...x.' },
      minimal: ['kick', 'snare'], intro: ['hat', 'rim'], peak: ['shaker'], shaker: 'oxoxoxoxoxoxoxox', fill: { snare: '........xxx.xxxx', tom: '............x.xx' } },
    ambient: { bpm: [70, 100], swing: 0, parts: { kick: 'X...............', perc: '........x.......', hat: '..o...o...o...o.' }, minimal: ['perc'], intro: [], peak: ['hat'], fill: {} },
  };
  const GENRE_ALIAS = { 'boom-bap': 'hiphop', boombap: 'hiphop', 'hip-hop': 'hiphop', rap: 'hiphop', 'drum&bass': 'dnb', 'drum-and-bass': 'dnb', dnb: 'dnb', jungle: 'dnb', edm: 'house', dance: 'house', 'deep-house': 'house', trailer: 'cinematic', orchestral: 'cinematic', epic: 'cinematic', reggaeton: 'latin', dembow: 'latin', afrobeats: 'afro', 'afro-house': 'afro', 'lo-fi': 'lofi', chillhop: 'lofi', explainer: 'corporate', bed: 'ambient', 'half-time': 'trap', drill: 'trap', synthwave: 'pop', funk: 'pop' };
  const genreOf = (g) => { const k = GENRE_ALIAS[String(g || 'pop').toLowerCase()] || String(g || 'pop').toLowerCase(); if (!GROOVES[k]) throw new Error('theory: unknown groove genre "' + g + '" (' + Object.keys(GROOVES).join(', ') + ')'); return k; };

  // ---------------------------------------------------------------- briefs (pure; for the top of score.js)
  const BRIEF = {
    corporate: { bpm: 116, key: 'G major', mood: 'corporate', groove: 'corporate', inst: 'pluck(marimba|bell) + piano + pad(warm) + bass(pluck) + drums(909) claps, shaker' },
    uplifting: { bpm: 120, key: 'C major', mood: 'uplifting', groove: 'pop', inst: 'piano + strings(staccato) + pad(airy) + bass(synth) + drums(acoustic|909)' },
    lofi: { bpm: 80, key: 'F major', mood: 'chill', groove: 'lofi', inst: 'keys(rhodes) + bass(upright|sub) + drums(lofi) + fx.vinyl' },
    cinematic: { bpm: 94, key: 'D minor', mood: 'epic', groove: 'cinematic', inst: 'strings(ensemble|staccato) + choir + pad(dark) + bass(sub) + drums(acoustic) toms + fx riser/impact/subDrop' },
    trap: { bpm: 140, key: 'C minor', mood: 'dark', groove: 'trap', inst: 'drums(trap) + bass(808) glides + pluck(bell) + pad(dark)' },
    house: { bpm: 124, key: 'A minor', mood: 'uplifting', groove: 'house', inst: 'drums(909) + bass(synth) + keys(organ|epiano) stabs + pad(warm) + lead(saw) + sidechain' },
    ambient: { bpm: 90, key: 'D major', mood: 'calm', groove: 'ambient', inst: 'pad(airy|glass) + piano (sparse) + pluck(bell) + bass(sub) — no busy 1–4 kHz melody under VO' },
    hiphop: { bpm: 90, key: 'A minor', mood: 'melancholic', groove: 'hiphop', inst: 'drums(lofi|acoustic) + keys(rhodes) + bass(sub|upright)' },
    dnb: { bpm: 172, key: 'F minor', mood: 'tense', groove: 'dnb', inst: 'drums(acoustic) breaks + bass(sub|synth) + pad(dark)' },
  };

  // ---------------------------------------------------------------- bpm fitting for video (pure)
  /** best bpm in [min,max] so the given cut times (s, relative to the music start) land on the grid */
  function bpmFor(cuts, opts = {}) {
    const { min = 80, max = 140, grid = 1 /* beats */, offset = 0, integer = false } = opts;
    let best = null;
    for (let b = min; b <= max + 1e-9; b += integer ? 1 : 0.5) {
      const g = (60 / b) * grid;
      let err = 0;
      const per = cuts.map((c) => { const x = c - offset; const d = Math.abs(x - Math.round(x / g) * g); err += d; return +(d * 1000).toFixed(0); });
      const mean = err / Math.max(1, cuts.length);
      const score = mean - (Number.isInteger(b) ? 0.002 : 0); // prefer integer bpm when equal
      if (!best || score < best.score - 1e-6) best = { bpm: b, meanErrorMs: +(mean * 1000).toFixed(1), perCutMs: per, score };
    }
    delete best.score;
    return best;
  }
  /** bpm in [min,max] that makes `seconds` an exact number of bars (prefers multiples of 4 bars) */
  function fitBpm(seconds, opts = {}) {
    const { min = 80, max = 140, beatsPerBar = 4, multiple = 4 } = opts;
    const out = [];
    for (let bars = multiple; bars <= 256; bars += multiple) { const bpm = (bars * beatsPerBar * 60) / seconds; if (bpm >= min && bpm <= max) out.push({ bpm: +bpm.toFixed(3), bars }); }
    if (!out.length && multiple > 1) return fitBpm(seconds, { ...opts, multiple: 1 });
    const mid = (min + max) / 2;
    out.sort((a, b) => Math.abs(a.bpm - mid) - Math.abs(b.bpm - mid));
    return out[0] || null;
  }
  const barsFor = (seconds, bpm, beatsPerBar = 4) => Math.ceil((seconds * bpm) / 60 / beatsPerBar - 1e-6);

  window.musicTheory = {
    key: makeKey, chordOf, toMidi, midiName, transpose, rng, bpmFor, fitBpm, barsFor,
    moods: Object.keys(MOODS), genres: Object.keys(GROOVES),
    mood: (name) => MOODS[MOOD_ALIAS[name] || name],
    brief: (name) => BRIEF[name] || BRIEF[genreOf(name)] || null,
    genre: (name) => { const g = GROOVES[genreOf(name)]; return { bpm: g.bpm, swing: g.swing, halfTime: !!g.halfTime }; },
  };

  // ================================================================ the extension (per render)
  window.__musicExt = window.__musicExt || [];
  window.__musicExt.push(function theory(m, Tone, info) {
    const spb = 60 / info.bpm, bpb = info.beatsPerBar;
    const barLen = spb * bpb, six = spb / 4;
    const dur = makeDur(spb, bpb);
    const barAt = (t) => t / barLen;
    const beatAt = (t) => t / spb;
    const bar = (b, beat = 0) => (b * bpb + beat) * spb;

    // ---------- harmony
    function progression(spec, keyArg, opts = {}) {
      if (keyArg && typeof keyArg === 'object' && !keyArg.isKey && !Array.isArray(keyArg)) { opts = keyArg; keyArg = undefined; }
      let tokens, mood = null;
      if (Array.isArray(spec)) tokens = spec.slice();
      else {
        const name = MOOD_ALIAS[String(spec).trim()] || String(spec).trim();
        if (MOODS[name]) { mood = MOODS[name]; tokens = mood.progs[mod(opts.variant || 0, mood.progs.length)].split(/\s+/); }
        else tokens = String(spec).trim().split(/[\s,|–-]+/).filter(Boolean);
      }
      let key = makeKey(keyArg || (mood ? mood.key : 'C major'));
      // a mood's numerals are written for its mode: in a key of the other colour use the relative key (vi IV I V in A minor = Am F C G)
      if (mood) { const moodMinor = MINORISH(makeKey(mood.key).mode); if (moodMinor !== key.minor) key = key.relative(); }
      const { chordsPerBar = 1, octave = 3, from = 0 } = opts;
      const bars = opts.bars != null ? opts.bars : info.bars - from;
      const ext = opts.ext == null ? 'auto' : opts.ext; // 'auto' (mood colours) | 'none' | 'rich' (7ths) | {numeral: suffix}
      // expand "I*2" (two slots)
      const slots = [];
      for (const tk of tokens) { const mt = /^(.*?)\*(\d+)$/.exec(tk); if (mt) for (let i = 0; i < +mt[2]; i++) slots.push(mt[1]); else slots.push(tk); }
      const slotBeats = bpb / chordsPerBar;
      const n = Math.max(1, Math.round(bars * chordsPerBar));
      // cadence: replace the last slot(s) — true → tonic, or numerals like 'V I' / 'IV V I'
      const cad = opts.cadence === true ? [key.minor ? 'i' : 'I'] : opts.cadence ? String(opts.cadence).trim().split(/\s+/) : [];
      const out = [];
      for (let i = 0; i < n; i++) {
        const ci = i - (n - cad.length);
        const tk = ci >= 0 ? cad[ci] : slots[i % slots.length];
        const bare = tk.replace(/^[b#]/, '').replace(/[^IVXivx].*$/, '');
        let suffix = null;
        if (ext === 'auto' && mood) suffix = mood.ext[tk] != null ? mood.ext[tk] : null;
        else if (ext === 'rich') suffix = RICH[bare] != null ? RICH[bare] : null;
        else if (ext && typeof ext === 'object') suffix = ext[tk] != null ? ext[tk] : null;
        let c = romanChord(tk, key, octave, suffix);
        if (!c) c = chordOf(tk, octave, key);
        const time = bar(from) + i * slotBeats * spb;
        Object.assign(c, { index: i, time, dur: slotBeats * spb, end: time + slotBeats * spb, bar: from + (i * slotBeats) / bpb, token: tk });
        out.push(c);
      }
      // merge consecutive identical slots into one longer chord only when asked
      return decorateChords(out, key, mood ? (MOOD_ALIAS[spec] || spec) : null);
    }
    function decorateChords(arr, key, mood) {
      arr.key = key; arr.mood = mood;
      arr.names = arr.map((c) => c.name);
      arr.chordAt = (t) => { for (let i = arr.length - 1; i >= 0; i--) if (t >= arr[i].time - 1e-6) return arr[i]; return arr[0]; };
      arr.start = arr.length ? arr[0].time : 0; arr.end = arr.length ? arr[arr.length - 1].end : 0;
      return arr;
    }

    /** smooth voicings: minimal total movement, no parallel 5ths/8ves, no low mud, root-position start */
    function voiceLead(chords, opts = {}) {
      const range = (opts.range || ['C3', 'C5']).map(toMidi);
      const lo = range[0], hi = range[1], V = opts.voices || 4;
      const center = opts.center != null ? toMidi(opts.center) : (lo + hi) / 2;
      const bassPlaysRoot = opts.bassPlaysRoot !== false;
      const key = chords.key;
      let prev = opts.start ? opts.start.map(toMidi) : null;
      const out = [];
      for (const c of chords) {
        const pcs = c.intervals.map((i) => mod(c.rootPc + i, 12));
        const rootPc = c.rootPc, fifthPc = mod(rootPc + 7, 12);
        const thirdPc = pcs.find((p) => [3, 4].includes(mod(p - rootPc, 12)));
        let required = [...new Set(pcs)];
        // too many tones for the voices: drop the 5th, then the root (the bass has it), then the 11th
        const dropOrder = [fifthPc, bassPlaysRoot ? rootPc : null, mod(rootPc + 5, 12)].filter((x) => x != null);
        for (const d of dropOrder) if (required.length > V && required.includes(d) && required.length > 2) required = required.filter((p) => p !== d);
        while (required.length > V) required.pop();
        const cand = [];
        for (let x = lo; x <= hi; x++) if (pcs.includes(mod(x, 12))) cand.push(x);
        let best = null, bestCost = Infinity;
        const combo = [];
        const evalCombo = () => {
          const v = combo;
          for (const p of required) if (!v.some((x) => mod(x, 12) === p)) return;
          let cost = 0;
          // doubled 3rds / 7ths sound thick
          const counts = {};
          for (const x of v) counts[mod(x, 12)] = (counts[mod(x, 12)] || 0) + 1;
          if (thirdPc != null && counts[thirdPc] > 1) cost += 4;
          // spacing: no gap > octave between upper voices; no close intervals low down (mud)
          for (let i = 1; i < v.length; i++) {
            const gap = v[i] - v[i - 1];
            if (gap > 12) cost += 3 + (gap - 12);
            if (v[i - 1] < 52 && gap < 7) cost += 5; // below E3 keep 5ths or wider
            else if (v[i - 1] < 57 && gap < 3) cost += 3; // below A3 no seconds
          }
          if (v[v.length - 1] - v[v.length - 2] === 1) cost += 3; // minor-2nd rub in the top voice
          const mean = v.reduce((a, b) => a + b, 0) / v.length;
          cost += Math.abs(mean - center) * 0.35;
          if (prev && prev.length === v.length) {
            let move = 0;
            for (let i = 0; i < v.length; i++) move += Math.abs(v[i] - prev[i]);
            cost += move;
            const topLeap = Math.abs(v[v.length - 1] - prev[prev.length - 1]);
            if (topLeap > 4) cost += (topLeap - 4) * 1.5;
            // parallel perfect intervals between any two voices that both move the same way
            for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
              const a = mod(prev[j] - prev[i], 12), b = mod(v[j] - v[i], 12);
              const mi = v[i] - prev[i], mj = v[j] - prev[j];
              if ((a === 7 && b === 7) || (a === 0 && b === 0)) if (mi !== 0 && Math.sign(mi) === Math.sign(mj)) cost += j === v.length - 1 ? 10 : 5;
            }
          } else {
            if (mod(v[0], 12) !== rootPc) cost += 4; // first chord: root position
          }
          if (cost < bestCost - 1e-9) { bestCost = cost; best = v.slice(); }
        };
        const rec = (start) => {
          if (combo.length === V) return evalCombo();
          for (let i = start; i < cand.length; i++) { combo.push(cand[i]); rec(i + 1); combo.pop(); }
        };
        rec(0);
        if (!best) best = c.midi.slice(0, V); // range too narrow — fall back to close position
        prev = best;
        const flats = key ? key.flats : false;
        out.push(Object.assign({}, c, { midi: best, notes: best.map((x) => midiName(x, flats)), voicing: best.map((x) => midiName(x, flats)) }));
      }
      return decorateChords(out, chords.key, chords.mood);
    }

    /** rhythmic chord stabs/comping: m.comp(chords, 'x..x..x.', { div: 16, gate: 0.8 }) */
    function comp(chords, pattern, opts = {}) {
      const { div = 16, gate = 0.85, vel = 0.8 } = opts;
      const p = String(pattern).replace(/\s|\|/g, '');
      const step = barLen / div;
      const from = opts.from != null ? bar(opts.from) : chords.start, to = opts.to != null ? bar(opts.to) : chords.end;
      const hits = [];
      for (let i = 0, t = from; t < to - 1e-6; i++, t += step) { const ch = p[i % p.length]; if (ch === 'x' || ch === 'X' || ch === 'o') hits.push({ t, v: ch === 'X' ? 1 : ch === 'o' ? 0.45 : 0.75 }); }
      return hits.map((h, k) => {
        const c = chords.chordAt(h.t);
        const next = hits[k + 1] ? hits[k + 1].t : to;
        return { notes: c.notes, note: c.notes, time: h.t, dur: Math.max(0.05, Math.min(next, c.end) - h.t) * gate, vel: clamp((h.v * vel) / 0.75, 0.05, 1), chord: c.name };
      });
    }

    // ---------- lines
    function bassNote(pc, octave, flats) { const lo = 12 * (octave + 1) + 4; return lo + mod(pc - 4, 12); } // E..D# of that octave
    function bassline(chords, style = 'root', opts = {}) {
      if (typeof opts === 'string') opts = { groove: opts };
      const octave = opts.octave != null ? opts.octave : 1;
      const vel = opts.vel != null ? opts.vel : 0.9;
      const r = rng(opts.seed != null ? opts.seed : 11);
      const key = chords.key || makeKey('C');
      const flats = key.flats;
      const N = (x) => midiName(x, flats);
      const ev = [];
      const rootOf = (c) => bassNote(c.bassPc != null ? c.bassPc : c.rootPc, octave, flats);
      const grooveHits = (pattern, c) => {
        const p = String(pattern).replace(/\s|\|/g, '');
        const step = barLen / 16, hits = [];
        for (let t = c.time, i = Math.round((c.time - chords.start) / step); t < c.end - 1e-6; t += step, i++) { const ch = p[i % p.length]; if (ch === 'x' || ch === 'X' || ch === 'o' || ch === 's') hits.push({ t, ch }); }
        return hits;
      };
      const pushHits = (hits, c, endT, noteFor) => hits.forEach((h, k) => {
        const next = k + 1 < hits.length ? hits[k + 1].t : endT;
        ev.push({ note: N(noteFor(h, k, hits.length)), time: h.t, dur: Math.max(0.06, (next - h.t) * (opts.gate || 0.92)), vel: vel * (h.ch === 'X' ? 1 : h.ch === 'o' ? 0.6 : 0.85), slide: h.ch === 's' || undefined });
      });
      chords.forEach((c, ci) => {
        const root = rootOf(c), next = chords[ci + 1];
        const nextRoot = next ? rootOf(next) : root;
        const fifth = root + 7 <= bassNote(0, octave) + 19 ? root + 7 : root - 5;
        if (style === 'root') {
          if (opts.groove) return pushHits(grooveHits(opts.groove, c), c, c.end, () => root);
          for (let t = c.time; t < c.end - 1e-6; t += barLen) ev.push({ note: N(root), time: t, dur: Math.min(barLen, c.end - t) * 0.95, vel: vel * (t === c.time ? 1 : 0.85) });
        } else if (style === 'octave') {
          const step = dur(opts.rate || '8n');
          let k = 0;
          for (let t = c.time; t < c.end - 1e-6; t += step, k++) ev.push({ note: N(k % 2 ? root + 12 : root), time: t, dur: step * 0.7, vel: vel * (k % 2 ? 0.7 : 1) });
        } else if (style === 'walking') {
          const beats = Math.max(1, Math.round(c.dur / spb));
          const scalePcs = key.pcs;
          let cur = root;
          for (let b = 0; b < beats; b++) {
            const t = c.time + b * spb;
            let note;
            if (b === 0) note = root;
            else if (b === beats - 1 && next) note = nextRoot + (r() < 0.5 ? -1 : 1); // chromatic approach
            else {
              // walk toward the next root through chord/scale tones
              const dir = nextRoot >= cur ? 1 : -1;
              const tones = [];
              for (let x = cur + dir; Math.abs(x - cur) <= 5; x += dir) if (scalePcs.includes(mod(x, 12))) tones.push(x);
              const chordT = tones.filter((x) => c.pcs.includes(mod(x, 12)));
              note = (b % 2 === 0 && chordT.length ? chordT[0] : tones[0]) || fifth;
            }
            const lowest = bassNote(4, octave) - 0, highest = lowest + 19;
            while (note < lowest) note += 12;
            while (note > highest) note -= 12;
            cur = note;
            ev.push({ note: N(note), time: t, dur: spb * 0.9, vel: vel * (b === 0 ? 1 : 0.8) });
          }
        } else if (style === 'syncopated') {
          const hits = grooveHits(opts.groove || 'X..x..x...x.x...', c);
          pushHits(hits, c, c.end, (h, k, n) => {
            if (k === n - 1 && next && nextRoot !== root && n > 2) { // approach the next root by a scale step
              const below = [nextRoot - 1, nextRoot - 2, nextRoot + 1, nextRoot + 2].find((x) => key.pcs.includes(mod(x, 12)) && x !== root);
              return below != null ? below : root;
            }
            if (k === 2 && n > 3 && r() < 0.5) return root + 12;
            if (k === 3 && n > 4 && r() < 0.35) return fifth;
            return root;
          });
        } else if (style === '808-glide' || style === '808') {
          const hits = grooveHits(opts.groove || 'X......x..X.....' + 'X.....x...X..x..', c);
          pushHits(hits, c, c.end, (h, k, n) => {
            if (h.ch === 's') return root + 12;
            if (k === n - 1 && n > 2 && r() < 0.45) { h.ch = 's'; return root + 12; } // octave slide at the end of the chord
            return root;
          });
          // mark slides from the hit's own symbol
          for (const e of ev) if (e.note === N(root + 12) && e.time >= c.time && e.time < c.end) { e.slide = true; e.glide = opts.glide || 0.07; }
        } else throw new Error('theory: unknown bass style ' + style + " (root|octave|walking|syncopated|808-glide)");
      });
      // slides: the previous note overlaps the slide note → mono synths (bass/808/lead) glide legato
      for (let i = 1; i < ev.length; i++) if (ev[i].slide) ev[i - 1].dur = Math.max(ev[i - 1].dur, ev[i].time - ev[i - 1].time + 0.03);
      return ev;
    }

    /** arpeggio over a chord, a notes array, or a whole progression (follows the chords) */
    function arp(src, pattern = 'up', rate = '16n', opts = {}) {
      if (rate && typeof rate === 'object') { opts = rate; rate = opts.rate || '16n'; }
      const step = dur(rate);
      const r = rng(opts.seed != null ? opts.seed : 5);
      const octaves = opts.octaves || 1;
      const vel = opts.vel != null ? opts.vel : 0.75;
      const gate = opts.gate != null ? opts.gate : 0.8;
      const isProg = Array.isArray(src) && src.length && typeof src[0] === 'object';
      const single = !Array.isArray(src) ? src : null;
      const chordAt = isProg ? (t) => src.chordAt ? src.chordAt(t) : src.find((c) => t >= c.time && t < c.end) || src[src.length - 1] : () => (single || { notes: src });
      let start, end;
      if (opts.from != null) start = bar(opts.from); else if (isProg) start = src[0].time; else if (single && single.time != null) start = single.time; else start = 0;
      if (opts.to != null) end = bar(opts.to); else if (isProg) end = src[src.length - 1].end; else if (single && single.end != null) end = single.end; else end = info.duration;
      const order = opts.order ? (typeof opts.order === 'string' ? opts.order.trim().split(/\s+/).map(Number) : opts.order) : null;
      const ev = [];
      let k = 0, lastChord = null, last = -1;
      for (let t = start; t < end - 1e-6; t += step) {
        const c = chordAt(t);
        if (opts.restart !== false && c !== lastChord) { k = 0; lastChord = c; }
        const base = (c.notes || c).map(toMidi).sort((a, b) => a - b);
        const pool = [];
        for (let o = 0; o < octaves; o++) for (const x of base) pool.push(x + 12 * o);
        if (opts.top) pool.push(base[0] + 12 * octaves);
        const n = pool.length;
        let idx;
        if (order) idx = mod(order[k % order.length], n);
        else if (pattern === 'up') idx = k % n;
        else if (pattern === 'down') idx = n - 1 - (k % n);
        else if (pattern === 'updown') { const per = Math.max(1, 2 * n - 2); const q = k % per; idx = q < n ? q : per - q; }
        else if (pattern === 'downup') { const per = Math.max(1, 2 * n - 2); const q = k % per; idx = n - 1 - (q < n ? q : per - q); }
        else if (pattern === 'converge') { const q = k % n; idx = q % 2 ? n - 1 - (q >> 1) : q >> 1; }
        else if (pattern === 'random') { do { idx = Math.floor(r() * n); } while (n > 1 && idx === last); }
        else if (pattern === 'pattern') idx = [0, 2, 1, 2, 3, 2, 1, 2][k % 8] % n;
        else throw new Error('theory: unknown arp pattern ' + pattern);
        last = idx;
        const onBeat = Math.abs(beatAt(t) - Math.round(beatAt(t))) < 1e-3;
        ev.push({ note: midiName(pool[idx], chords0Flats(src)), time: t, dur: step * gate, vel: vel * (onBeat ? 1 : 0.78) });
        k++;
      }
      return ev;
    }
    const chords0Flats = (src) => (src && src.key ? src.key.flats : false);

    // ---------- melody: motif-based (state → repeat → vary → resolve)
    const CELLS = {
      straight: [[[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]], [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]], [[0, 6], [6, 2], [8, 4], [12, 4]], [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4]]],
      syncopated: [[[0, 3], [3, 3], [6, 2], [8, 2], [10, 6]], [[2, 2], [4, 3], [7, 3], [10, 2], [12, 4]], [[0, 2], [3, 3], [6, 4], [10, 2], [12, 4]], [[0, 3], [3, 5], [8, 3], [11, 5]]],
      sparse: [[[0, 8], [8, 8]], [[0, 12], [12, 4]], [[0, 4], [4, 12]], [[2, 6], [8, 8]]],
      driving: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]], [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], [[0, 2], [2, 1], [3, 1], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]]],
      hook: [[[0, 2], [2, 2], [4, 2], [6, 4], [10, 2], [12, 4]], [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4]], [[2, 2], [4, 2], [6, 2], [8, 6], [14, 2]]],
    };
    const ENDINGS = {
      straight: [[[0, 4], [4, 4], [8, 8]], [[0, 2], [2, 2], [4, 4], [8, 8]], [[0, 6], [6, 2], [8, 8]]],
      syncopated: [[[0, 3], [3, 3], [6, 10]], [[0, 2], [3, 3], [6, 10]], [[0, 3], [3, 5], [8, 8]]],
      sparse: [[[0, 16]], [[0, 4], [4, 12]], [[0, 8], [8, 8]]],
      driving: [[[0, 2], [2, 2], [4, 4], [8, 8]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 8]]],
      hook: [[[0, 2], [2, 2], [4, 4], [8, 8]], [[0, 3], [3, 3], [6, 10]]],
    };
    const CONTOURS = { arch: (x) => Math.sin(Math.PI * x), rise: (x) => x, fall: (x) => 1 - x, wave: (x) => 0.5 - 0.5 * Math.cos(4 * Math.PI * x), flat: () => 0.3, valley: (x) => 1 - Math.sin(Math.PI * x) };
    function melody(keyArg, opts = {}) {
      if (Array.isArray(keyArg)) { opts = { chords: keyArg, ...opts }; keyArg = keyArg.key; }
      const key = makeKey(keyArg || (opts.chords && opts.chords.key) || 'C major');
      const chords = opts.chords || null;
      const r = rng(opts.seed != null ? opts.seed : 1);
      const from = opts.from != null ? opts.from : chords ? barAt(chords.start) : 0;
      const totalBars = opts.bars != null ? opts.bars : chords ? barAt(chords.end) - from : 8;
      const unitBars = opts.motifBars || 2;
      const units = Math.max(1, Math.round(totalBars / unitBars));
      const style = CELLS[opts.rhythm] ? opts.rhythm : 'straight';
      const contour = CONTOURS[opts.contour] || CONTOURS.arch;
      const stepsPerBar = Math.round(bpb * 4);
      const sixT = barLen / stepsPerBar;
      // pitch pool: in-key (or pentatonic) notes inside the range
      const range = (opts.range || [midiName(key.degreeMidi(-3, 4)), midiName(key.degreeMidi(9, 4))]).map(toMidi);
      const allowed = opts.scale === 'pentatonic' ? (key.minor ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5]).map((d) => key.pcs[d]) : key.pcs;
      const pool = [];
      for (let x = range[0]; x <= range[1]; x++) if (allowed.includes(mod(x, 12))) pool.push(x);
      const isTonic = (i) => mod(pool[i], 12) === key.tonic;
      const nearestIdx = (midi) => { let b = 0; for (let i = 1; i < pool.length; i++) if (Math.abs(pool[i] - midi) < Math.abs(pool[b] - midi)) b = i; return b; };
      const chordPcsAt = (t) => (chords ? chords.chordAt(t).pcs : [key.tonic, key.pcs[2], key.pcs[4]]);
      const snapToChord = (idx, t, maxD = 2) => { const pcs = chordPcsAt(t); for (let d = 0; d <= maxD; d++) { if (pool[idx - d] != null && pcs.includes(mod(pool[idx - d], 12))) return idx - d; if (pool[idx + d] != null && pcs.includes(mod(pool[idx + d], 12))) return idx + d; } return idx; };
      // ---- base rhythm for each letter
      const formStr = opts.form || null;
      let letters = [];
      if (formStr) { const re = /([A-Z])('*)/g; let mt; while ((mt = re.exec(formStr))) letters.push({ L: mt[1], v: mt[2].length }); }
      else { const cyc = [{ L: 'A', v: 0 }, { L: 'A', v: 1 }, { L: 'B', v: 0 }, { L: 'A', v: 2 }]; for (let u = 0; u < units; u++) letters.push(units === 2 && u === 1 ? { L: 'A', v: 1 } : cyc[u % 4]); }
      while (letters.length < units) letters.push(letters[letters.length % Math.max(1, letters.length)]);
      letters = letters.slice(0, units);
      const motifs = {};
      const makeMotif = (L) => {
        const cells = CELLS[style], ends = ENDINGS[style];
        const notes = [];
        for (let b = 0; b < unitBars; b++) {
          const cell = b === unitBars - 1 ? pick(r, ends) : pick(r, cells);
          for (const [s, l] of cell) notes.push({ step: b * stepsPerBar + Math.round((s * stepsPerBar) / 16), len: Math.max(1, Math.round((l * stepsPerBar) / 16)) });
        }
        // density: thin weak notes
        const dens = opts.density != null ? opts.density : 1;
        const kept = notes.filter((n, i) => i === 0 || i === notes.length - 1 || n.step % 8 === 0 || r() < dens);
        // pitches as pool indices following the contour
        const lowIdx = nearestIdx(key.degreeMidi(0, 4) - (L === 'B' ? -2 : 0));
        const span = Math.min(pool.length - 1 - lowIdx, opts.span || 6);
        let idx = null, lastMove = 0;
        kept.forEach((n, i) => {
          const x = kept.length > 1 ? i / (kept.length - 1) : 0;
          const target = clamp(Math.round(lowIdx + (L === 'B' ? 2 : 0) + contour(x) * span), 0, pool.length - 1);
          if (idx == null) idx = snapToChord(target, 0);
          else {
            const dir = Math.sign(target - idx) || (r() < 0.5 ? 1 : -1);
            const roll = r();
            let move;
            if (Math.abs(lastMove) >= 3) move = -Math.sign(lastMove); // gap-fill: step back after a leap
            else if (roll < 0.15) move = 0; // repeated note
            else if (roll < 0.65) move = dir; // step
            else if (roll < 0.88) move = 2 * dir; // skip
            else move = (3 + Math.floor(r() * 2)) * dir; // leap 4th/5th
            idx = clamp(idx + move, 0, pool.length - 1);
            lastMove = move;
          }
          n.idx = idx;
        });
        return kept;
      };
      const ev = [];
      letters.forEach(({ L, v }, u) => {
        if (!motifs[L]) motifs[L] = makeMotif(L);
        let mot = motifs[L].map((n) => ({ ...n }));
        const u0 = bar(from + u * unitBars);
        const timeOf = (n) => u0 + n.step * sixT;
        // fit the restated motif to the chords under it: shift by the amount that lands most strong notes on chord tones
        if (chords && u > 0) {
          let bestD = 0, bestScore = -1;
          for (const d of [0, 1, -1, 2, -2]) {
            let s = 0;
            for (const n of mot) { const i = n.idx + d; if (i < 0 || i >= pool.length) { s -= 5; continue; } if ((n.step % 8 === 0 || n.len >= 4) && chordPcsAt(timeOf(n)).includes(mod(pool[i], 12))) s += 1; }
            s -= Math.abs(d) * 0.3;
            if (s > bestScore) { bestScore = s; bestD = d; }
          }
          mot.forEach((n) => (n.idx = clamp(n.idx + bestD, 0, pool.length - 1)));
        }
        // variations: v=1 new ending, v=2 + rhythmic split, v>=3 + sequence up a step
        if (v >= 1 && mot.length > 2) { const tail = mot[mot.length - 2]; tail.idx = clamp(tail.idx + (r() < 0.5 ? 1 : -1) * (1 + Math.floor(r() * 2)), 0, pool.length - 1); }
        if (v >= 2) {
          let li = 0; mot.forEach((n, i) => { if (n.len > mot[li].len && i < mot.length - 1) li = i; });
          const n = mot[li];
          if (n.len >= 4) { const h = Math.floor(n.len / 2); mot.splice(li + 1, 0, { step: n.step + h, len: n.len - h, idx: clamp(n.idx + (r() < 0.5 ? 1 : -1), 0, pool.length - 1) }); n.len = h; }
        }
        if (v >= 3) mot.forEach((n) => (n.idx = clamp(n.idx + 1, 0, pool.length - 1)));
        // strong beats on chord tones
        mot.forEach((n) => { if (n.step % 8 === 0 || n.len >= 6) n.idx = snapToChord(n.idx, timeOf(n), 1); });
        // cadences: end of a 4-unit phrase (or the piece) on the tonic; mid-phrase on 2nd/5th (half cadence)
        const last = mot[mot.length - 1];
        const phraseEnd = u === units - 1 || u % 4 === 3 || (units <= 2 && u === units - 1);
        if (phraseEnd || opts.resolveEvery === 1) {
          let best = null;
          for (let i = 0; i < pool.length; i++) if (isTonic(i) && (best == null || Math.abs(i - mot[Math.max(0, mot.length - 2)].idx) < Math.abs(best - mot[Math.max(0, mot.length - 2)].idx))) best = i;
          if (best != null) last.idx = best;
          if (u === units - 1) last.len = Math.max(last.len, unitBars * stepsPerBar - last.step);
        } else if (u % 4 === 1) {
          const pcs = chordPcsAt(timeOf(last));
          const want = [key.pcs[4], key.pcs[1]].filter((p) => pcs.includes(p) || !chords);
          if (want.length) { let best = null; for (let i = 0; i < pool.length; i++) if (want.includes(mod(pool[i], 12)) && (best == null || Math.abs(i - last.idx) < Math.abs(best - last.idx))) best = i; if (best != null) last.idx = best; }
        }
        // velocities: downbeats lean, phrase peaks a touch louder, the final note settles
        const hiIdx = Math.max(...mot.map((n) => n.idx));
        mot.forEach((n, i) => {
          const t = timeOf(n);
          const down = n.step % stepsPerBar === 0 ? 0.12 : n.step % 4 === 0 ? 0.05 : 0;
          const peak = n.idx === hiIdx ? 0.06 : 0;
          ev.push({ note: midiName(pool[n.idx], key.flats), time: t, dur: n.len * sixT * (opts.legato != null ? opts.legato : 0.92), vel: clamp((opts.vel != null ? opts.vel : 0.72) + down + peak - (i === mot.length - 1 ? 0.04 : 0), 0.1, 1), unit: u, motif: L + "'".repeat(v) });
        });
      });
      const out = opts.avoid ? avoid(ev, opts.avoid) : ev;
      out.form = letters.map((x) => x.L + "'".repeat(x.v)).join(' ');
      return out;
    }

    // ---------- rhythm
    function swingFn(amount = 0.5, grid = '16n') {
      let a = amount > 1 ? (amount - 50) / (100 / 6) : amount; // MPC 50% straight … 66% triplet
      a = clamp(a, 0, 1);
      const g = dur(grid); // the swung note value; pairs of g form one "beat" of 2g
      const pair = 2 * g;
      const f = (t) => {
        const k = Math.floor(t / pair + 1e-9), x = t - k * pair, half = g, mid = half + a * (pair / 6);
        const y = x <= half ? (x / half) * mid : mid + ((x - half) / half) * (pair - mid);
        return k * pair + y;
      };
      f.events = (evs) => evs.map((e) => ({ ...e, time: f(e.time) }));
      f.amount = a;
      return f;
    }
    function humanize(x, opts = {}) {
      const ms = (opts.timing != null ? opts.timing : 8) / 1000;
      const vj = opts.vel != null ? opts.vel : 0.06;
      const seed = opts.seed != null ? opts.seed : 3;
      const jitter = (t, salt) => { const rr = rng(hash(String(Math.round(t * 1e4)) + ':' + seed + ':' + salt)); return (rr() + rr() - 1); }; // triangular −1..1
      if (typeof x === 'number') return Math.max(0, x + jitter(x, 't') * ms);
      return x.map((e) => ({ ...e, time: Math.max(0, e.time + jitter(e.time, 't' + (e.note || e.part || '')) * ms), vel: e.vel != null ? clamp(e.vel * (1 + jitter(e.time, 'v' + (e.note || e.part || '')) * vj), 0.05, 1) : e.vel }));
    }
    function velocity(evs, curve = 'accent', opts = {}) {
      const amt = opts.amount != null ? opts.amount : 0.25;
      const t0 = evs.length ? Math.min(...evs.map((e) => e.time)) : 0, t1 = evs.length ? Math.max(...evs.map((e) => e.time)) : 1;
      const r = rng(opts.seed != null ? opts.seed : 9);
      const lo = opts.from != null ? opts.from : 0.45, hi = opts.to != null ? opts.to : 1;
      return evs.map((e) => {
        const v = e.vel != null ? e.vel : 0.8;
        const x = t1 > t0 ? (e.time - t0) / (t1 - t0) : 0;
        const bt = beatAt(e.time), onBeat = Math.abs(bt - Math.round(bt)) < 1e-3, onBar = onBeat && mod(Math.round(bt), bpb) === 0;
        let nv = v;
        if (curve === 'accent') nv = v * (onBar ? 1 : onBeat ? 1 - amt * 0.4 : 1 - amt);
        else if (curve === 'crescendo') nv = v * (lo + (hi - lo) * x);
        else if (curve === 'decrescendo') nv = v * (hi - (hi - lo) * x);
        else if (curve === 'arch') nv = v * (lo + (hi - lo) * Math.sin(Math.PI * x));
        else if (curve === 'random') nv = v * (1 + (r() * 2 - 1) * amt);
        else throw new Error('theory: unknown velocity curve ' + curve);
        return { ...e, vel: clamp(nv, 0.03, 1) };
      });
    }

    const VEL = { X: 1, x: 0.8, o: 0.4 };
    function expandPattern(p, b0, b1, cb) {
      const s = String(p).replace(/\s|\|/g, '');
      const len = s.length, stepT = barLen / 16;
      for (let b = b0; b < b1; b++) {
        const off = (b * 16) % len;
        for (let i = 0; i < 16; i++) {
          const ch = s[(off + i) % len];
          const t = bar(b) + i * stepT;
          if (VEL[ch]) cb(t, VEL[ch], i, b);
          else if (ch === 'r') { cb(t, 0.7, i, b); cb(t + stepT / 2, 0.55, i, b); }
          else if (ch === 't') for (let k = 0; k < 3; k++) cb(t + (k * stepT) / 3, 0.5 + 0.12 * k, i, b);
        }
      }
    }
    /** drum pattern for a genre over bars [from,to): parts {kick:[{time,vel}],…} + fills + .perform(kit) */
    function groove(genre, opts = {}) {
      const g = GROOVES[genreOf(genre)];
      const from = opts.from != null ? opts.from : 0, to = opts.to != null ? opts.to : info.bars;
      let variant = opts.variant || null;
      if (!variant && opts.energy != null) variant = opts.energy < 0.3 ? 'intro' : opts.energy < 0.55 ? 'minimal' : opts.energy < 0.82 ? 'full' : 'peak';
      variant = variant || 'full';
      const fillEvery = opts.fills === false || opts.fills === 0 ? 0 : opts.fills || 8;
      const fillBars = new Set(opts.fillBars || []);
      if (fillEvery) for (let b = from + fillEvery - 1; b < to; b += fillEvery) fillBars.add(b);
      if (opts.fillLast) fillBars.add(to - 1);
      const smallFills = new Set();
      if (fillEvery >= 8 && opts.smallFills !== false) for (let b = from + 3; b < to; b += 8) if (!fillBars.has(b)) smallFills.add(b);
      let parts = Object.assign({}, g.parts);
      for (const extra of ['ride', 'openHat', 'perc', 'shaker', 'hat', 'rim', 'snare', 'clap', 'tom']) if (g[extra] && !parts[extra] && (g.peak || []).includes(extra)) parts['_' + extra] = g[extra];
      const include = (name) => {
        const base = name.replace(/^_/, '');
        if (opts.parts) return opts.parts.includes(base);
        if (variant === 'intro') return g.intro.includes(base);
        if (variant === 'minimal') return g.minimal.includes(base);
        if (variant === 'peak') return true;
        return !name.startsWith('_');
      };
      if (variant === 'half') parts = { kick: 'X.......X.......', snare: '........X.......', hat: 'x...x...x...x...' };
      if (opts.override) Object.assign(parts, opts.override);
      const sw = swingFn(opts.swing != null ? opts.swing : g.swing, opts.swingGrid || '16n');
      const out = {};
      for (const name of Object.keys(parts)) {
        if (variant !== 'half' && !include(name)) continue;
        const part = name.replace(/^_/, '');
        const list = out[part] || (out[part] = []);
        expandPattern(parts[name], from, to, (t, v, i, b) => {
          const fill = fillBars.has(b) && g.fill && Object.keys(g.fill).length;
          if (fill && i >= 8 && (g.fill[part] != null || ['kick', 'hat', 'openHat', 'ride'].includes(part) && opts.fillMute !== false)) return; // fill replaces the 2nd half
          if (smallFills.has(b) && i >= 12 && g.fill && g.fill[part] != null) return;
          list.push({ time: t, vel: v });
        });
      }
      // fills (2nd half of the bar; small fills = last beat), velocities ramp up into the downbeat
      const fills = [];
      if (g.fill) for (const b of [...fillBars, ...smallFills]) {
        if (b < from || b >= to) continue;
        const small = smallFills.has(b);
        fills.push({ bar: b, small });
        for (const part of Object.keys(g.fill)) {
          if (!include(part) && !['snare', 'clap', 'tom'].includes(part)) continue;
          const pat = g.fill[part];
          const list = out[part] || (out[part] = []);
          expandPattern(pat, b, b + 1, (t, v, i) => {
            if (i < (small ? 12 : 8)) return;
            const ramp = 0.55 + 0.45 * ((i - 8) / 8);
            list.push({ time: t, vel: clamp(v * ramp + (small ? -0.15 : 0), 0.1, 1), fill: true, n: part === 'tom' ? (i < 11 ? 0 : i < 14 ? 1 : 2) : undefined });
          });
        }
        if (!small && b + 1 < info.bars && opts.crash !== false) (out.crash || (out.crash = [])).push({ time: bar(b + 1), vel: 0.85 });
      }
      if (opts.crashAt) for (const b of opts.crashAt) (out.crash || (out.crash = [])).push({ time: bar(b), vel: 0.9 });
      const hum = opts.humanize === false ? null : (opts.humanize || { timing: 4, vel: 0.05 });
      for (const part of Object.keys(out)) {
        let list = out[part].map((e) => ({ ...e, time: part === 'crash' ? e.time : sw(e.time), part }));
        if (hum) list = humanize(list, { ...hum, seed: (opts.seed || 0) + hash(part) });
        // dedupe & sort
        list.sort((a, b) => a.time - b.time);
        out[part] = list.filter((e, i) => i === 0 || e.time - list[i - 1].time > 0.004);
      }
      const events = Object.values(out).flat().sort((a, b) => a.time - b.time);
      return {
        genre: genreOf(genre), variant, bpm: g.bpm, halfTime: !!g.halfTime, parts: out, events, fills,
        /** kicks (for sidechain / 808 alignment) */
        times: (part) => (out[part] || []).map((e) => e.time),
        get kickTimes() { return (out.kick || []).map((e) => e.time); }, // m.sidechain(pad, groove)
        perform(kit, popts) { performDrums(kit, out, popts); return this; },
      };
    }
    const FALLBACK = { shaker: ['perc', 'hat'], clap: ['snare', 'rim'], snare: ['clap', 'rim'], openHat: ['hat'], ride: ['hat', 'openHat'], rim: ['perc', 'snare'], perc: ['rim', 'hat'], tom: ['perc', 'kick'], crash: ['ride', 'openHat'], hat: ['openHat'] };
    function drumFn(kit, part) {
      const f = kit[part];
      if (typeof f === 'function') return (t, v, n) => (n != null ? kit[part](t, v, n) : kit[part](t, v));
      if (f && (f.play || f.triggerAttackRelease)) return (t, v) => trigger(f, part === 'kick' ? 'C1' : part === 'tom' ? 'G1' : 'C4', part === 'crash' ? 1.5 : 0.1, t, v, {});
      return null;
    }
    function performDrums(kit, parts, opts = {}) {
      if (!kit) throw new Error('theory: groove.perform(kit) needs a kit (m.inst.drums(…) or {kick, snare, hat…})');
      const gain = opts.vel || {};
      for (const part of Object.keys(parts)) {
        let fn = drumFn(kit, part);
        if (!fn && opts.substitute !== false) for (const alt of FALLBACK[part] || []) { fn = drumFn(kit, alt); if (fn) { const g0 = fn; fn = (t, v) => g0(t, v * 0.8); break; } }
        if (!fn) continue;
        const k = gain[part] != null ? gain[part] : 1;
        for (const e of parts[part]) m.at(e.time, (t) => fn(t, clamp(e.vel * k, 0.02, 1), e.n));
      }
    }

    // ---------- playing events
    const isNoise = (inst) => inst && inst.name === 'NoiseSynth';
    function trigger(inst, note, d, t, vel, e) {
      if (typeof inst === 'function') return inst(note, d, t, vel, e);
      if (typeof inst.play === 'function' && !(inst.name === 'Player')) return inst.play(note, d, t, vel, e && e.strum ? { strum: e.strum } : undefined);
      if (isNoise(inst)) return inst.triggerAttackRelease(d, t, vel);
      const poly = inst.name === 'PolySynth' || inst.name === 'Sampler';
      const n = Array.isArray(note) && !poly ? note[0] : note;
      if ('portamento' in inst && !poly) inst.portamento = e && e.slide ? (e.glide || 0.07) : 0;
      return inst.triggerAttackRelease(n, d, t, vel);
    }
    /** schedule events ({note|notes, time, dur, vel}) on an instrument; returns the events */
    function perform(inst, evs, opts = {}) {
      if (!inst) throw new Error('theory: m.perform(instrument, events) — instrument missing');
      if (evs && evs.parts && evs.perform) return evs.perform(inst, opts);
      const list = Array.isArray(evs) ? evs : [evs];
      const T = opts.transpose || 0, vm = opts.vel != null ? opts.vel : 1, gate = opts.gate != null ? opts.gate : 1;
      const tr = (n) => (T ? (Array.isArray(n) ? n.map((x) => transpose(x, T)) : transpose(n, T)) : n);
      for (const e of list) {
        if (!e || e.time == null) continue;
        const note = tr(e.notes || e.note);
        const d = Math.max(0.02, (e.dur != null ? e.dur : spb / 2) * gate);
        const vel = clamp((e.vel != null ? e.vel : 0.8) * vm, 0.01, 1);
        const at = opts.offset ? e.time + opts.offset : e.time;
        if (at < 0 || at > info.duration + info.tail) continue;
        m.at(at, (t) => trigger(inst, note, d, t, vel, e));
      }
      return list;
    }

    // ---------- video sync
    function gridLen(grid) { if (typeof grid === 'number') return grid * spb; if (grid === 'beat') return spb; if (grid === 'bar') return barLen; return dur(grid); }
    function snap(t, grid = 'beat', mode = 'nearest') {
      const g = gridLen(grid);
      const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
      return f(t / g - (mode === 'nearest' ? 0 : 1e-9)) * g;
    }
    /** video cut times (s, relative to the music start) → grid-aligned hit times; optional hit: 'impact'|'crash'|'whoosh'|fn(t, cut) */
    function cuts(times, opts = {}) {
      const { grid = 'beat', tolerance = 0.12, hit = null, vel = 0.9 } = opts;
      const res = times.map((c) => {
        const s = snap(c, grid);
        const onGrid = Math.abs(s - c) <= tolerance;
        const time = onGrid ? s : c;
        return { cut: c, time, grid: s, shift: +(s - c).toFixed(3), onGrid, bar: Math.floor(barAt(s) + 1e-6), beat: +mod(beatAt(s), bpb).toFixed(2) };
      });
      if (hit) for (const r of res) {
        if (typeof hit === 'function') hit(r.time, r);
        else if (m.fx && hit === 'whoosh' && m.fx.whoosh) { const d = opts.dur || spb; m.fx.whoosh(Math.max(0, r.time - d * 0.75), d); }
        else if (m.fx && typeof m.fx[hit] === 'function') m.fx[hit](r.time, vel);
      }
      return res;
    }
    /** drop / duck events that fall inside windows ([[t0,t1]] or [{start,end}]) — e.g. keep the melody out of voice-over lines */
    function avoid(evs, windows, opts = {}) {
      const W = (windows || []).map((w) => (Array.isArray(w) ? { start: w[0], end: w[1] } : w));
      const pad = opts.pad != null ? opts.pad : 0.05;
      const inside = (e) => W.some((w) => e.time < w.end + pad && e.time + (e.dur || 0) > w.start - pad);
      if (opts.mode === 'duck') return evs.map((e) => (inside(e) ? { ...e, vel: (e.vel != null ? e.vel : 0.8) * (opts.amount != null ? opts.amount : 0.5) } : e));
      return evs.filter((e) => !inside(e));
    }

    // ---------- form: energy curve → layers, fills, transitions
    const DEFAULT_LAYERS = { pad: 0, keys: 0.2, perc: 0.3, bass: 0.35, kick: 0.45, drums: 0.45, hats: 0.55, arp: 0.6, lead: 0.75, top: 0.85 };
    function arrange(sections, opts = {}) {
      let list;
      if (!Array.isArray(sections)) list = info.sections.map((s) => ({ name: s.name, from: barAt(s.start), to: barAt(s.end), energy: sections[s.name] != null ? sections[s.name] : 0.5 }));
      else {
        let cursor = 0;
        list = sections.map((s, i) => {
          const known = info.sections.find((x) => x.name === s.name);
          const fromB = s.bar != null ? s.bar : known && s.bars == null ? barAt(known.start) : cursor;
          cursor = fromB + (s.bars != null ? s.bars : 0);
          return { ...s, from: fromB };
        });
        list.forEach((s, i) => { s.to = list[i + 1] ? list[i + 1].from : s.bars != null ? s.from + s.bars : info.bars; });
      }
      const layers = Object.assign({}, DEFAULT_LAYERS, opts.layers || {});
      for (const s of list) {
        s.energy = clamp(s.energy != null ? s.energy : 0.5, 0, 1);
        s.start = bar(s.from); s.end = bar(s.to);
        const on = new Set(Object.keys(layers).filter((l) => s.energy >= layers[l]));
        (s.add || []).forEach((l) => on.add(l));
        (s.mute || []).forEach((l) => on.delete(l));
        if (s.layers) { on.clear(); s.layers.forEach((l) => on.add(l)); }
        s.on = on;
        s.variant = s.energy < 0.3 ? 'intro' : s.energy < 0.55 ? 'minimal' : s.energy < 0.82 ? 'full' : 'peak';
      }
      const sectionAt = (t) => { for (let i = list.length - 1; i >= 0; i--) if (t >= list[i].start - 1e-6) return list[i]; return list[0]; };
      const plan = {
        sections: list, layers,
        sectionAt, energyAt: (t) => sectionAt(t).energy,
        has: (layer, b) => { const s = sectionAt(bar(b)); return !!s && s.on.has(layer); },
        playing: (layer, t) => { const s = sectionAt(t); return !!s && s.on.has(layer); },
        /** contiguous spans where a layer plays: [{from,to,start,end,energy}] */
        spans(layer) {
          const out = [];
          for (const s of list) if (s.on.has(layer)) { const l = out[out.length - 1]; if (l && Math.abs(l.to - s.from) < 1e-6) { l.to = s.to; l.end = s.end; l.energy = Math.max(l.energy, s.energy); } else out.push({ from: s.from, to: s.to, start: s.start, end: s.end, energy: s.energy }); }
          return out;
        },
        each(layer, cb) { list.filter((s) => s.on.has(layer)).forEach((s) => cb(s)); },
        /** keep only the events that fall where `layer` plays; velocities follow the energy (dynamics: [min,max] factor, false = off) */
        filter(evs, layer, fo = {}) {
          const dyn = fo.dynamics === false ? null : fo.dynamics || opts.dynamics || [0.55, 1];
          return evs.filter((e) => plan.playing(layer, e.time)).map((e) => (dyn ? { ...e, vel: clamp((e.vel != null ? e.vel : 0.8) * (dyn[0] + (dyn[1] - dyn[0]) * sectionAt(e.time).energy), 0.03, 1) } : e));
        },
        /** velocity factor for a time (same curve as filter) — for hand-scheduled parts */
        gain(t) { const dyn = opts.dynamics || [0.55, 1]; return dyn[0] + (dyn[1] - dyn[0]) * sectionAt(t).energy; },
        /** a drum groove that follows the energy curve: variant per section, fills into rises, crash on the new section */
        groove(genre, gopts = {}) {
          const layer = gopts.layer || 'drums';
          const merged = {};
          const fills = [];
          list.forEach((s, i) => {
            if (!s.on.has(layer)) return;
            const next = list[i + 1];
            const rise = next && next.energy > s.energy + 0.1;
            const g = groove(genre, { ...gopts, from: s.from, to: s.to, energy: gopts.variant ? undefined : s.energy, variant: gopts.variant, fillLast: rise || (next && gopts.fillEvery !== false), crash: true, seed: (gopts.seed || 0) + i });
            const dyn = gopts.dynamics === false ? 1 : 0.7 + 0.3 * s.energy; // drums follow the energy too
            for (const p of Object.keys(g.parts)) (merged[p] || (merged[p] = [])).push(...g.parts[p].map((e) => ({ ...e, vel: clamp(e.vel * dyn, 0.02, 1) })));
            fills.push(...g.fills);
            if (i > 0 && s.energy >= list[i - 1].energy + 0.15 && !g.fills.some((f) => f.bar === s.from - 1)) (merged.crash || (merged.crash = [])).push({ time: s.start, vel: 0.9, part: 'crash' });
          });
          for (const p of Object.keys(merged)) { merged[p].sort((a, b) => a.time - b.time); merged[p] = merged[p].filter((e, i, a) => i === 0 || e.time - a[i - 1].time > 0.004); }
          return { genre: genreOf(genre), parts: merged, fills, events: Object.values(merged).flat().sort((a, b) => a.time - b.time), times: (p) => (merged[p] || []).map((e) => e.time), get kickTimes() { return (merged.kick || []).map((e) => e.time); }, perform(kit, po) { performDrums(kit, merged, po); return this; } };
        },
        /** automate a Tone param by energy (filter sweep in builds): plan.automate(filter.frequency, {lo: 300, hi: 12000}) */
        automate(param, aopts = {}) {
          const { lo = 300, hi = 12000, curve = 'exp', build = 'auto' } = aopts;
          const val = (e) => (curve === 'exp' ? lo * Math.pow(hi / lo, e) : lo + (hi - lo) * e);
          list.forEach((s, i) => {
            const v = val(s.energy);
            param.setValueAtTime(v, s.start);
            const next = list[i + 1];
            const isBuild = next && next.energy > s.energy && (build === true || (build === 'auto' && /build|rise|pre/i.test(s.name)));
            if (isBuild) (curve === 'exp' ? param.exponentialRampToValueAtTime : param.linearRampToValueAtTime).call(param, val(next.energy), s.end - 0.01);
            else if (next) param.setValueAtTime(v, Math.max(s.start, s.end - 0.02));
          });
          return param;
        },
        transitions: [],
        markers: [],
      };
      // automatic transitions (needs m.fx from instruments.js; silently skipped otherwise). Sized to the jump:
      // risers only into big sections (energy ≥ 0.6), 1 bar for moderate jumps, 2 for big ones; level follows the music around it.
      const want = Object.assign({ riser: true, reverseCymbal: true, impact: true, downlifter: true, subDrop: 'auto', snareRoll: false, whoosh: false }, opts.fx && typeof opts.fx === 'object' ? opts.fx : {});
      const fxLevel = opts.fxLevel != null ? opts.fxLevel : 1;
      if (opts.transitions !== false && opts.fx !== false) list.forEach((s, i) => {
        if (i === 0) return;
        const prev = list[i - 1], d = s.energy - prev.energy, t = s.start;
        const add = (type, time, fn) => { plan.transitions.push({ type, time: +time.toFixed(3), section: s.name }); if (m.fx && typeof m.fx[type] === 'function') fn(m.fx); };
        const vel = (base) => clamp(base * fxLevel, 0.05, 1);
        if (d >= 0.25 && s.energy >= 0.6) {
          const bars = Math.min(d >= 0.4 ? (opts.riserBars || 2) : 1, (prev.to - prev.from) / 2);
          const len = Math.max(1, bars) * barLen;
          const rv = vel(0.1 + 0.6 * Math.pow(prev.energy, 1.5) + 0.2 * d); // ≈ −10 dB out of a 0.35 section, −6 dB out of a 0.7 build
          if (want.riser) add('riser', t - len, (fx) => fx.riser(t - len, t, { vel: rv }));
          if (want.reverseCymbal && d >= 0.35 && s.energy >= 0.7) add('reverseCymbal', t, (fx) => fx.reverseCymbal(t, Math.min(2, barLen), { vel: vel(0.6) }));
          if (want.snareRoll && d >= 0.4) add('snareRoll', t - barLen, (fx) => fx.snareRoll(t - barLen, t));
          if (want.impact && s.energy >= 0.75) add('impact', t, (fx) => fx.impact(t, vel(0.45 + s.energy * 0.45)));
          if ((want.subDrop === true || (want.subDrop === 'auto' && s.energy >= 0.85 && d >= 0.35))) add('subDrop', t, (fx) => fx.subDrop(t, { vel: vel(0.8) }));
          plan.markers.push({ name: s.name, time: t, kind: 'drop' });
        } else if (d <= -0.3 && want.downlifter && prev.energy >= 0.6) {
          add('downlifter', t, (fx) => fx.downlifter(t, Math.min(2 * barLen, s.end - t), { vel: vel(0.15 + 0.45 * Math.pow(prev.energy, 1.5)) }));
          plan.markers.push({ name: s.name, time: t, kind: 'breakdown' });
        }
        if (want.whoosh && Math.abs(d) < 0.25) add('whoosh', t - spb, (fx) => fx.whoosh(t - spb, spb, { vel: vel(0.5) }));
      });
      return plan;
    }

    Object.assign(m, {
      theory: { MOODS, GROOVES, QUAL, MODES },
      key: makeKey, chordOf: (name, octave = 3) => chordOf(name, octave), progression, voiceLead, comp,
      bassline, arp, melody,
      groove, swing: swingFn, humanize, velocity, dur,
      arrange, snap, barAt, beatAt, cuts, avoid,
      bpmFor, fitBpm, barsFor, toMidi, midiName, transpose,
      perform,
    });
  });
})();
