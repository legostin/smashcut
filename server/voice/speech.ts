/**
 * Speech text — what the narrator actually says — is separate from the on-screen copy.
 *
 * Markup (written by the agent, editable by the user):
 *   {2026|две тысячи двадцать шестой}   display|spoken: captions show "2026", the voice says the words
 *   за́мок                               stress: combining acute accent (U+0301) after the stressed vowel
 *   [pause 0.6]  or  [...]               a pause (seconds; "[...]" = 0.5 s) → <break time="0.6s" />
 *
 * The voice gets the spoken text; captions (studio.words) get the display text with the voice's timing.
 */

export interface SpeechToken { display: string; spoken: string }
export interface ParsedSpeech { /** text sent to the TTS engine (with <break/> tags) */ tts: string; /** plain spoken text (no tags), for previous/next context */ plain: string; /** display tokens with the number of spoken words they cover */ tokens: { display: string; words: number }[] }

const STRESS = /́/g;
const stripStress = (s: string) => s.replace(STRESS, '');

export function parseSpeech(markup: string): ParsedSpeech {
  const tokens: { display: string; words: number }[] = [];
  let tts = '';
  let plain = '';
  const re = /\{([^{}|]*)\|([^{}]*)\}|\[pause\s+([\d.]+)\s*s?\]|\[\.\.\.\]|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup))) {
    if (m[1] != null) {
      const spoken = m[2].trim();
      const n = spoken.split(/\s+/).filter(Boolean).length;
      // keep punctuation glued to the group (e.g. "{2026|…}," → the comma is a separate token below)
      tokens.push({ display: m[1].trim(), words: n });
      tts += spoken + ' ';
      plain += spoken + ' ';
    } else if (m[3] != null || m[0] === '[...]') {
      const sec = Math.max(0.1, Math.min(3, m[3] != null ? Number(m[3]) : 0.5));
      tts += `<break time="${sec.toFixed(1)}s" /> `;
      plain += ' ';
    } else {
      const w = m[4];
      // punctuation-only token (e.g. a comma after a group) → attach to the previous display token
      if (/^[^\p{L}\p{N}]+$/u.test(w) && tokens.length) {
        // closing punctuation glues to the word; dashes and the like keep their space
        const glue = /^[,.!?;:…)\]»”"']+$/.test(w);
        tokens[tokens.length - 1].display += (glue ? '' : ' ') + w;
        tts = (glue ? tts.trimEnd() : tts) + w + ' ';
        plain = (glue ? plain.trimEnd() : plain) + w + ' ';
        continue;
      }
      tokens.push({ display: stripStress(w), words: 1 });
      tts += w + ' ';
      plain += w + ' ';
    }
  }
  return { tts: tts.replace(/\s+/g, ' ').trim(), plain: stripStress(plain).replace(/\s+/g, ' ').trim(), tokens };
}

type W = { text: string; start: number; end: number };

/** turn the voice's word timings into display words (captions) using the markup's token map */
export function displayWords(spoken: W[], parsed: ParsedSpeech): W[] {
  const ws = spoken.filter((w) => !/[<>=]/.test(w.text) && /[\p{L}\p{N}]/u.test(w.text));
  const need = parsed.tokens.reduce((a, t) => a + t.words, 0);
  if (ws.length !== need) return ws.map((w) => ({ ...w, text: stripStress(w.text) })); // engine normalised differently — fall back to spoken words
  const out: W[] = [];
  let i = 0;
  for (const tk of parsed.tokens) {
    const span = ws.slice(i, i + tk.words);
    i += tk.words;
    if (!span.length) continue;
    out.push({ text: tk.display, start: span[0].start, end: span[span.length - 1].end });
  }
  return out;
}

/** rough syllable count (vowels) — works for Russian, English and most European languages */
export const syllables = (s: string) => (stripStress(s).toLowerCase().match(/[аеёиоуыэюяaeiouyäöüéèêáíóúàìòùãõâôîûœæ]/g) || []).length || 1;

export interface PaceSentence { text: string; start: number; end: number; rate: number; dev: number; flag?: 'fast' | 'slow' }
export interface PaceReport { rate: number; sentences: PaceSentence[]; gaps: { at: number; len: number }[]; flagged: number; duration: number }

/**
 * Pace check from word timings: syllables per second per sentence (pauses between sentences excluded),
 * deviation from the reference rate (the project's median, or this take's own median), long unexpected gaps.
 */
export function paceReport(words: W[], ref?: number, tol = 0.15): PaceReport {
  const ws = words.filter((w) => /[\p{L}\p{N}]/u.test(w.text));
  const sentences: PaceSentence[] = [];
  const gaps: { at: number; len: number }[] = [];
  let cur: W[] = [];
  const close = () => {
    if (!cur.length) return;
    let speech = 0;
    for (let k = 0; k < cur.length; k++) speech += Math.max(0.04, cur[k].end - cur[k].start) + (k ? Math.min(0.25, Math.max(0, cur[k].start - cur[k - 1].end)) : 0);
    const syl = cur.reduce((a, w) => a + syllables(w.text), 0);
    sentences.push({ text: cur.map((w) => w.text).join(' '), start: cur[0].start, end: cur[cur.length - 1].end, rate: +(syl / Math.max(0.2, speech)).toFixed(2), dev: 0 });
    cur = [];
  };
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (cur.length && w.start - cur[cur.length - 1].end > 1.2) gaps.push({ at: +cur[cur.length - 1].end.toFixed(2), len: +(w.start - cur[cur.length - 1].end).toFixed(2) });
    if (cur.length && w.start - cur[cur.length - 1].end > 0.45) close();
    cur.push(w);
    if (/[.!?…]["»”)]*$/.test(w.text)) close();
  }
  close();
  const rates = sentences.filter((s) => s.text.split(' ').length >= 3).map((s) => s.rate).sort((a, b) => a - b);
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : sentences[0]?.rate || 0;
  const base = ref || median;
  let flagged = 0;
  for (const s of sentences) {
    s.dev = base ? +((s.rate - base) / base).toFixed(3) : 0;
    if (s.text.split(' ').length >= 3 && Math.abs(s.dev) > tol) { s.flag = s.dev > 0 ? 'fast' : 'slow'; flagged++; }
  }
  return { rate: median, sentences, gaps, flagged: flagged + gaps.length, duration: ws.length ? ws[ws.length - 1].end : 0 };
}
