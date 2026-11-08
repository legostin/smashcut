/*
 * Smashcut music ext — MIX: channel strips, shared reverb/delay buses, sidechain ducking, mastering.
 *
 *   const ch = m.channel('keys', { vol: -6, trim: 0, pan: -0.2, eq: { low: -2, mid: 0, high: 1, bands: [[300, -2, 1]] }, highpass: 120, lowpass: 9000,
 *                                  comp: { threshold: -18, ratio: 3 }, sends: { reverb: 0.25, delay: 0.1 }, width: 0.7 });
 *   synth.connect(ch);                        // ch is a Tone node (input of the strip) → music bus
 *   ch.filter / ch.cutoff (lowpass Hz, open at 20 kHz) · ch.volume (dB) · ch.pan · ch.sweep(fromHz, toHz, t0, t1) · ch.send('reverb', 0.3)
 *   m.reverb / m.delay                        // shared FX buses (Tone nodes): connect anything into them
 *   m.sidechain(pad, kickTimes, { depth: -8, release: 0.18 })   // channel / instrument / drums object
 *   m.master({ preset: 'clean'|'warm'|'punchy', lufs: -14 })    // default: clean, −14 LUFS, −1 dBTP
 *
 * Mastering runs OFFLINE on the rendered buffer (window.__musicPost, called by runtime/music.js):
 *   subsonic HP → tilt EQ → mono below ~120 Hz → glue compressor → saturation → loudness normalise (BS.1770)
 *   → 4× oversampled true-peak lookahead limiter at −1 dBTP. Results land in meta.mastering.
 * Also provides the shared deferred-scheduling core used by instruments.js (m._defer / m._load).
 */
(function () {
  'use strict';
  const EXT = (window.__musicExt = window.__musicExt || []);
  const dbToGain = (db) => Math.pow(10, db / 20);
  const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, g));

  // ---------------- mastering presets ----------------
  const PRESETS = {
    clean: { hp: 22, low: { f: 90, g: 0 }, high: { f: 9000, g: 0.5 }, mud: { f: 320, g: -0.6, q: 0.9 }, comp: { ratio: 1.5, above: 7, attack: 0.03, release: 0.25, knee: 6 }, sat: 0, maxGR: 4.5 },
    warm: { hp: 24, low: { f: 110, g: 1.2 }, high: { f: 8500, g: -1.2 }, mud: { f: 350, g: -0.6, q: 0.8 }, comp: { ratio: 2, above: 5, attack: 0.035, release: 0.3, knee: 8 }, sat: 0.35, maxGR: 5 },
    punchy: { hp: 28, low: { f: 70, g: 1.5 }, high: { f: 10000, g: 1.5 }, mud: { f: 300, g: -1.2, q: 0.9 }, comp: { ratio: 3, above: 3, attack: 0.022, release: 0.12, knee: 6 }, sat: 0.55, maxGR: 6.5 },
  };
  let MASTER = null; // current render's mastering settings (set per render by the ext)

  // ---------------- offline DSP helpers ----------------
  /** RBJ biquad coefficients: type 'lp' | 'hp' | 'bp' (0 dB peak) | 'peak' | 'lowshelf' | 'highshelf' */
  function biquad(type, f, fs, q = 0.7071, gainDb = 0) {
    const A = Math.pow(10, gainDb / 40), w = (2 * Math.PI * f) / fs, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === 'lowshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * (A + 1 - (A - 1) * cs + s); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - s); a0 = A + 1 + (A - 1) * cs + s; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - s; }
    else { const s = 2 * Math.sqrt(A) * al; b0 = A * (A + 1 + (A - 1) * cs + s); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - s); a0 = A + 1 - (A - 1) * cs + s; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - s; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function filt(x, c, out = x) {
    const [b0, b1, b2, a1, a2] = c;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; out[i] = y; }
    return out;
  }
  /** BS.1770-4 K-weighting coefficients for any sample rate */
  function kWeights(fs) {
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    let K = Math.tan((Math.PI * f0) / fs);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan((Math.PI * f0) / fs);
    a0 = 1 + K / Q + K * K;
    const s2 = [1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
    return [s1, s2];
  }
  /** integrated loudness (LUFS), loudness range (LU) and short-term max */
  function loudness(chs, fs) {
    const [s1, s2] = kWeights(fs);
    const n = chs[0].length, sq = chs.map((c) => { const k = filt(filt(c, s1, new Float32Array(n)), s2); for (let i = 0; i < n; i++) k[i] *= k[i]; return k; });
    // prefix sums of channel-summed squares
    const ps = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { let v = 0; for (const c of sq) v += c[i]; ps[i + 1] = ps[i] + v; }
    const ms = (a, b) => (ps[b] - ps[a]) / (b - a);
    const L = (z) => -0.691 + 10 * Math.log10(Math.max(1e-20, z));
    const blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs), blocks = [];
    for (let s = 0; s + blk <= n; s += hop) blocks.push(ms(s, s + blk));
    if (!blocks.length && n) blocks.push(ms(0, n));
    const abs = blocks.filter((z) => L(z) > -70);
    let integrated = -70;
    if (abs.length) {
      const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
      const g = abs.filter((z) => L(z) > rel);
      if (g.length) integrated = L(g.reduce((a, b) => a + b, 0) / g.length);
    }
    const st = [], sblk = Math.round(3 * fs), shop = Math.round(0.1 * fs);
    for (let s = 0; s + sblk <= n; s += shop) st.push(L(ms(s, s + sblk)));
    let lra = 0, stMax = -70;
    if (st.length) {
      stMax = Math.max(...st);
      const a = st.filter((l) => l > -70);
      if (a.length) {
        const zr = 10 * Math.log10(a.reduce((x, l) => x + Math.pow(10, l / 10), 0) / a.length) - 20;
        const g = a.filter((l) => l > zr).sort((x, y) => x - y);
        if (g.length > 1) lra = g[Math.floor(0.95 * (g.length - 1))] - g[Math.floor(0.1 * (g.length - 1))];
      }
    }
    return { integrated, lra, stMax };
  }
  // 4× oversampling interpolator (windowed sinc, 12 taps per phase) for true-peak detection
  const OS = 4, TAPS = 12;
  const PHASES = (() => {
    const ph = [];
    for (let p = 1; p < OS; p++) {
      const h = new Float32Array(TAPS); let sum = 0;
      for (let k = 0; k < TAPS; k++) {
        const t = k - TAPS / 2 + 1 - p / OS; // fractional offset relative to sample n
        const x = Math.PI * t, w = 0.5 + 0.5 * Math.cos((Math.PI * t) / (TAPS / 2 + 1));
        h[k] = (t === 0 ? 1 : Math.sin(x) / x) * w; sum += h[k];
      }
      for (let k = 0; k < TAPS; k++) h[k] /= sum;
      ph.push(h);
    }
    return ph;
  })();
  /** per-sample linked true-peak magnitude */
  function truePeakTrack(chs) {
    const n = chs[0].length, out = new Float32Array(n);
    for (const c of chs) {
      for (let i = 0; i < n; i++) {
        let m = Math.abs(c[i]);
        if (i >= TAPS && i < n - TAPS) {
          for (const h of PHASES) {
            let s = 0;
            for (let k = 0; k < TAPS; k++) s += h[k] * c[i - TAPS / 2 + 1 + k];
            const a = Math.abs(s); if (a > m) m = a;
          }
        }
        if (m > out[i]) out[i] = m;
      }
    }
    return out;
  }
  function maxOf(a) { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  /** lookahead brickwall limiter driven by a true-peak track; returns max gain reduction (dB) */
  function limit(chs, fs, ceiling, lookahead = 0.003, release = 0.06) {
    const n = chs[0].length, tp = truePeakTrack(chs);
    const L = Math.max(1, Math.round(lookahead * fs));
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = tp[i] > ceiling ? ceiling / tp[i] : 1;
    // sliding minimum over [i, i+L]
    const mn = new Float32Array(n), dq = new Int32Array(n + L + 1);
    let h = 0, t = 0;
    for (let i = n - 1; i >= 0; i--) {
      while (t > h && g[dq[t - 1]] >= g[i]) t--;
      dq[t++] = i;
      while (dq[h] > i + L) h++;
      mn[i] = g[dq[h]];
    }
    // moving average over the past L samples (attack ramp that completes before each peak)
    const sm = new Float32Array(n); let acc = 0;
    for (let i = 0; i < n; i++) { acc += mn[i]; if (i >= L) acc -= mn[i - L]; sm[i] = acc / Math.min(L, i + 1); }
    // release
    const rc = 1 - Math.exp(-1 / (release * fs));
    let env = 1, maxGR = 0;
    for (let i = 0; i < n; i++) {
      const target = sm[i]; // ≤ the gain every peak within the lookahead needs
      env = target < env ? target : env + (target - env) * rc;
      const gr = -gainToDb(env); if (gr > maxGR) maxGR = gr;
      for (const c of chs) c[i] *= env;
    }
    return maxGR;
  }
  function compress(chs, fs, thrDb, ratio, attack, release, knee) {
    const n = chs[0].length, ra = Math.exp(-1 / (0.005 * fs)), ca = Math.exp(-1 / (attack * fs)), cr = Math.exp(-1 / (release * fs));
    let e2 = 0, gs = 0;
    for (let i = 0; i < n; i++) {
      let v = 0; for (const c of chs) { const a = c[i] * c[i]; if (a > v) v = a; }
      e2 = ra * e2 + (1 - ra) * v;
      const x = 10 * Math.log10(e2 + 1e-12) + 3;
      let y;
      if (2 * (x - thrDb) < -knee) y = x;
      else if (2 * Math.abs(x - thrDb) <= knee) { const d = x - thrDb + knee / 2; y = x + ((1 / ratio - 1) * d * d) / (2 * knee); }
      else y = thrDb + (x - thrDb) / ratio;
      const gc = y - x;
      gs = gc < gs ? ca * gs + (1 - ca) * gc : cr * gs + (1 - cr) * gc;
      const lin = dbToGain(gs);
      for (const c of chs) c[i] *= lin;
    }
  }
  /** soft saturation (unity slope at 0, gently rounds the peaks; slight asymmetry = even harmonics) */
  function saturate(chs, amount) {
    if (!amount) return;
    const k = 1 + amount * 2, mix = Math.min(1, amount * 1.5), bias = 0.1 * amount, b0 = Math.tanh(bias);
    for (const c of chs) {
      let dc = 0;
      for (let i = 0; i < c.length; i++) {
        const x = c[i];
        const y = (Math.tanh(k * x + bias) - b0) / k;
        const out = x + (y - x) * mix;
        dc += (out - dc) * 0.0002; // remove the asymmetry's DC offset
        c[i] = out - dc;
      }
    }
  }
  window.__musicDSP = { biquad, filt, loudness, truePeakTrack, dbToGain, gainToDb };

  /** offline master: runs on the rendered buffer (Float32Array per channel), in place */
  window.__musicPost = function (chs, fs, info) {
    const cfg = MASTER || { preset: 'clean', lufs: -14, ceiling: -1 };
    if (cfg.preset === 'off' || cfg.preset === 'none') return;
    const P = Object.assign({}, PRESETS[cfg.preset] || PRESETS.clean, cfg.custom || {});
    if (chs.length === 1) chs.push(new Float32Array(chs[0]));
    const t0 = performance.now();
    const pre = loudness(chs, fs);
    if (pre.integrated <= -69) { info.mastering = { preset: cfg.preset, lufs: null, note: 'silent' }; return; }
    // 1) reference level −18 LUFS so thresholds are level-independent
    const ref = -18, g0 = dbToGain(ref - pre.integrated);
    for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g0;
    // 2) EQ: subsonic HP, low shelf, mud dip, high shelf
    for (const c of chs) {
      filt(c, biquad('hp', P.hp, fs, 0.7071));
      if (P.low.g) filt(c, biquad('lowshelf', P.low.f, fs, 0.7071, P.low.g));
      if (P.mud.g) filt(c, biquad('peak', P.mud.f, fs, P.mud.q, P.mud.g));
      if (P.high.g) filt(c, biquad('highshelf', P.high.f, fs, 0.7071, P.high.g));
    }
    // 3) mono low end: high-pass the side signal (24 dB/oct) at monoHz
    const monoHz = cfg.monoBelow != null ? cfg.monoBelow : 120;
    if (monoHz > 0) {
      const [L, R] = chs, n = L.length, S = new Float32Array(n);
      for (let i = 0; i < n; i++) S[i] = (L[i] - R[i]) * 0.5;
      const c = biquad('hp', monoHz, fs, 0.7071); filt(S, c); filt(S, c);
      for (let i = 0; i < n; i++) { const M = (L[i] + R[i]) * 0.5; L[i] = M + S[i]; R[i] = M - S[i]; }
    }
    // 4) glue compressor (threshold relative to the reference loudness)
    const C = P.comp;
    if (C && C.ratio > 1) compress(chs, fs, ref + C.above, C.ratio, C.attack, C.release, C.knee);
    // 5) saturation
    saturate(chs, P.sat);
    // 6) loudness normalise, capped so the limiter never has to work harder than maxGR on the loud parts
    const ceiling = dbToGain(cfg.ceiling != null ? cfg.ceiling : -1);
    const mid = loudness(chs, fs);
    let gain = cfg.lufs - mid.integrated;
    const tp = truePeakTrack(chs), blk = Math.round(0.05 * fs), peaks = [];
    for (let s = 0; s < tp.length; s += blk) { let m = 0; for (let i = s; i < Math.min(tp.length, s + blk); i++) if (tp[i] > m) m = tp[i]; peaks.push(m); }
    peaks.sort((a, b) => a - b);
    const p98 = gainToDb(peaks[Math.floor(0.98 * (peaks.length - 1))] || 1e-9), pmax = gainToDb(peaks[peaks.length - 1] || 1e-9);
    const ceilDb = gainToDb(ceiling) - 0.3, maxGR = cfg.maxGR != null ? cfg.maxGR : P.maxGR;
    const capped = Math.min(gain, ceilDb + maxGR - p98, ceilDb + maxGR + 3 - pmax);
    gain = capped;
    // the limiter itself shaves a little loudness: re-run from the pre-limit signal with a corrected gain (≤ 2 passes)
    const src = chs.map((c) => c.slice());
    let gr = 0, post = null, tpOut = 0;
    for (let pass = 0; pass < 3; pass++) {
      const g1 = dbToGain(Math.min(gain, capped + 1));
      for (let k = 0; k < chs.length; k++) { const c = chs[k], o = src[k]; for (let i = 0; i < c.length; i++) c[i] = o[i] * g1; }
      // 7) true-peak limiter (internal ceiling 0.3 dB under the target so external meters agree)
      gr = limit(chs, fs, ceiling * dbToGain(-0.3));
      // safety: residual overs (interpolation error)
      tpOut = maxOf(truePeakTrack(chs));
      if (tpOut > ceiling * dbToGain(-0.2)) { const s = (ceiling * dbToGain(-0.25)) / tpOut; for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= s; }
      post = loudness(chs, fs);
      const miss = cfg.lufs - post.integrated;
      if (miss < 0.1 || gain >= capped + 1 - 1e-6) break;
      gain = Math.min(gain + miss, capped + 1);
    }
    info.mastering = {
      preset: cfg.preset, targetLufs: cfg.lufs, lufs: +post.integrated.toFixed(1), truePeak: +gainToDb(Math.min(tpOut, ceiling * dbToGain(-0.25))).toFixed(1), lra: +post.lra.toFixed(1),
      limiterMaxGR: +gr.toFixed(1), inputLufs: +pre.integrated.toFixed(1), ms: Math.round(performance.now() - t0),
      ...(post.integrated < cfg.lufs - 1 ? { note: 'very dynamic material: kept below the loudness target instead of over-limiting' } : {}),
    };
  };

  // ---------------- reverb impulse (deterministic, generated) ----------------
  function makeImpulse(ctx, { decay = 2.6, predelay = 0.025, damp = 5500, size = 1, seed = 11, early = true } = {}) {
    const sr = ctx.sampleRate, len = Math.ceil((decay * 1.15 + 0.05) * sr);
    const buf = ctx.createBuffer(2, len, sr);
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      const tau = decay / 6.9; // −60 dB at `decay`
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // damping: the lowpass closes over time (highs decay faster)
        const fc = damp * Math.exp(-t / (decay * 0.45)) + 400;
        const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
        lp += k * (rnd() - lp);
        const fadeIn = Math.min(1, t / (0.012 * size + 0.003));
        d[i] = lp * Math.exp(-t / tau) * fadeIn;
      }
      if (early) {
        // a few early reflections (different per side)
        for (let r = 0; r < 9; r++) {
          const t = 0.006 + r * 0.0085 * size + Math.abs(rnd()) * 0.006;
          const i = Math.floor(t * sr);
          if (i < len) d[i] += (0.5 - r * 0.045) * (rnd() > 0 ? 1 : -1);
        }
      }
      // normalise energy
      let e = 0; for (let i = 0; i < len; i++) e += d[i] * d[i];
      const g = 0.6 / Math.sqrt(e + 1e-9);
      for (let i = 0; i < len; i++) d[i] *= g;
    }
    // predelay by shifting
    if (predelay > 0) {
      const off = Math.floor(predelay * sr);
      for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); d.copyWithin(off, 0, len - off); d.fill(0, 0, off); }
    }
    return buf;
  }

  EXT.push(function mixExt(m, Tone, info) {
    const ctx = Tone.getContext();
    MASTER = { preset: 'clean', lufs: -14, ceiling: -1 };
    // music bus straight to the destination: peaks are handled offline by the master (window.__musicPost),
    // the runtime's in-graph limiter/soft-clip would only add distortion before it.
    try { m.out.disconnect(); m.out.connect(Tone.getDestination()); } catch (e) {}

    // ---------- deferred scheduling core (shared with instruments.js) ----------
    // Instruments queue their triggers; the queue is flushed sorted by time once the sample index and every
    // requested buffer has loaded. The flush promise is registered in Tone's download list, so the
    // runtime's `await Tone.loaded()` waits for it before rendering starts.
    const core = { pending: [], loads: [], seq: 0, flushing: null, built: false };
    const downloads = Tone.ToneAudioBuffer && Tone.ToneAudioBuffer.downloads;
    function runJob(fn) { try { fn(); } catch (e) { (window.__music && window.__music.errors ? window.__music.errors : []).push('music ext: ' + (e && e.message ? e.message : e)); } }
    function kick() {
      if (core.flushing) return;
      const p = (async () => {
        await Promise.resolve();
        for (let guard = 0; guard < 50; guard++) {
          for (let i = 0; i < core.loads.length; i++) { try { await core.loads[i]; } catch (e) {} }
          if (!core.pending.length) break;
          const jobs = core.pending.splice(0).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          for (const j of jobs) runJob(j[2]);
        }
        core.built = true;
        core.flushing = null;
        if (downloads) { const k = downloads.indexOf(p); if (k >= 0) downloads.splice(k, 1); }
      })();
      core.flushing = p;
      if (downloads) downloads.push(p);
    }
    /** queue fn to run (sorted by `time`) after all sample loads; immediate once the render is under way */
    m._defer = (time, fn) => { if (core.built && !core.flushing) return runJob(fn); core.pending.push([time, core.seq++, fn]); kick(); };
    /** register a promise the flush must wait for (sample index, buffers) */
    m._wait = (p) => { core.loads.push(Promise.resolve(p).catch(() => null)); return p; };

    // ---------- shared FX buses (created on first use) ----------
    let reverb = null, delay = null;
    function makeReverb(o = {}) {
      const input = new Tone.Gain(1);
      const hp = new Tone.Filter({ type: 'highpass', frequency: o.highpass || 220, Q: 0.5 });
      const lp = new Tone.Filter({ type: 'lowpass', frequency: o.lowpass || 9500, Q: 0.5 });
      const conv = new Tone.Convolver({ normalize: false });
      conv.buffer = new Tone.ToneAudioBuffer(makeImpulse(ctx, { decay: o.decay || 2.8, predelay: o.predelay != null ? o.predelay : 0.03, damp: o.damp || 5200, size: o.size || 1.2, seed: o.seed || 11 }));
      const ret = new Tone.Gain(dbToGain(o.vol != null ? o.vol : -4));
      input.chain(hp, lp, conv, ret, m.out);
      input.returnGain = ret.gain; input.decay = o.decay || 2.8;
      return input;
    }
    function makeDelay(o = {}) {
      const time = o.time != null ? o.time : m.spb * 0.75; // dotted 1/8
      const input = new Tone.Gain(1);
      const hp = new Tone.Filter({ type: 'highpass', frequency: o.highpass || 350, Q: 0.5 });
      const lp = new Tone.Filter({ type: 'lowpass', frequency: o.lowpass || 4200, Q: 0.5 });
      const dl = new Tone.Delay(time, 4), dr = new Tone.Delay(time, 4);
      const fb = new Tone.Gain(o.feedback != null ? o.feedback : 0.38), fbF = new Tone.Filter({ type: 'lowpass', frequency: 3200, Q: 0.4 }), fbH = new Tone.Filter({ type: 'highpass', frequency: 300, Q: 0.4 });
      const merge = new Tone.Merge(), ret = new Tone.Gain(dbToGain(o.vol != null ? o.vol : -6));
      // ping-pong: in → L → R → (filtered feedback) → L …
      input.chain(hp, lp, dl);
      dl.connect(dr); dr.chain(fbF, fbH, fb, dl);
      dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
      merge.chain(ret, m.out);
      if (reverbBus()) ret.connect(new Tone.Gain(0.25).connect(reverbBus()));
      input.returnGain = ret.gain; input.time = time;
      return input;
    }
    const reverbBus = () => (reverb = reverb || makeReverb());
    Object.defineProperty(m, 'reverb', { get: reverbBus, configurable: true, enumerable: true });
    Object.defineProperty(m, 'delay', { get: () => (delay = delay || makeDelay()), configurable: true, enumerable: true });
    /** reconfigure the shared buses before use: m.reverbSetup({ decay: 4, predelay: 0.04 }), m.delaySetup({ time: m.beat(0.5) }) */
    m.reverbSetup = (o) => (reverb = makeReverb(o));
    m.delaySetup = (o) => (delay = makeDelay(o));

    // ---------- channel strip ----------
    const channels = {};
    function channel(name, o = {}) {
      if (typeof name === 'object') { o = name; name = o.name; }
      name = name || 'ch' + Object.keys(channels).length;
      const input = new Tone.Gain(1);
      let node = input;
      const link = (n) => { node.connect(n); node = n; return n; };
      if (o.highpass) link(new Tone.Filter({ type: 'highpass', frequency: o.highpass, Q: 0.6, rolloff: -24 }));
      // sweepable lowpass on every strip (open at 20 kHz unless set): ch.filter / ch.cutoff (Hz param) for builds & sweeps
      const lpf = link(new Tone.Filter({ type: 'lowpass', frequency: o.lowpass || 20000, Q: o.lowpassQ || 0.6, rolloff: -12 }));
      const eq = o.eq || {};
      if (eq.low) link(new Tone.Filter({ type: 'lowshelf', frequency: eq.lowFreq || 200, gain: eq.low }));
      if (eq.mid) link(new Tone.Filter({ type: 'peaking', frequency: eq.midFreq || 1000, Q: eq.q || 0.8, gain: eq.mid }));
      if (eq.high) link(new Tone.Filter({ type: 'highshelf', frequency: eq.highFreq || 5000, gain: eq.high }));
      // extra bands: eq.bands = [[freqHz, gainDb, q?, type?='peaking'], …]
      for (const b of eq.bands || []) if (b && b[1]) link(new Tone.Filter({ type: b[3] || 'peaking', frequency: b[0], Q: b[2] || 1, gain: b[1] }));
      let comp = null;
      if (o.comp) {
        const c = Object.assign({ threshold: -18, ratio: 3, attack: 0.01, release: 0.15, knee: 6 }, o.comp);
        comp = link(new Tone.Compressor({ threshold: c.threshold, ratio: c.ratio, attack: c.attack, release: c.release, knee: c.knee }));
        // undo the Web Audio compressor's automatic make-up gain so the channel level stays put
        const makeup = 0.6 * -c.threshold * (1 - 1 / c.ratio);
        link(new Tone.Gain(dbToGain(-makeup + (c.makeup || 0))));
      }
      if (o.width != null && Math.abs(o.width - 0.5) > 1e-3) {
        // 0 = mono, 0.5 = unchanged, 1 = extra wide (adds a decorrelated side component for mono sources)
        const w = Math.max(0, Math.min(1, o.width));
        const split = new Tone.MidSideSplit(), merge = new Tone.MidSideMerge();
        node.connect(split);
        split.mid.connect(merge.mid);
        const sideG = new Tone.Gain(Math.min(2, w * 2)); split.side.chain(sideG, merge.side);
        if (w > 0.5) {
          const haas = new Tone.Delay(0.011), hp = new Tone.Filter({ type: 'highpass', frequency: 350, Q: 0.5 }), amt = new Tone.Gain((w - 0.5) * 0.9);
          split.mid.chain(haas, hp, amt, merge.side);
        }
        node = merge;
      }
      const pan = link(new Tone.Panner(o.pan || 0));
      const duck = link(new Tone.Gain(1));
      const fader = link(new Tone.Volume((o.vol || 0) + (o.trim || 0))); // trim: relative dB on top of vol
      fader.connect(o.output || m.out);
      const ch = input;
      ch.channelName = name; ch.duck = duck; ch.fader = fader; ch.volume = fader.volume; ch.panner = pan; ch.comp = comp; ch.sends = {};
      ch.filter = lpf; ch.cutoff = lpf.frequency; ch.pan = pan.pan;
      /** filter sweep helper: ch.sweep(fromHz, toHz, t0, t1) (exponential) */
      ch.sweep = (from, to, t0, t1) => { const p = lpf.frequency; p.setValueAtTime(from, t0); p.exponentialRampToValueAtTime(to, t1); return ch; };
      const s = o.sends || {};
      for (const bus of ['reverb', 'delay']) {
        if (s[bus] > 0) { const g = new Tone.Gain(s[bus]); fader.connect(g); g.connect(m[bus]); ch.sends[bus] = g.gain; }
      }
      /** add / change a send later: ch.send('reverb', 0.3) */
      ch.send = (bus, amount) => {
        if (ch.sends[bus]) { ch.sends[bus].value = amount; return ch; }
        const g = new Tone.Gain(amount); fader.connect(g); g.connect(bus === 'reverb' || bus === 'delay' ? m[bus] : bus); ch.sends[bus] = g.gain; return ch;
      };
      channels[name] = ch;
      return ch;
    }
    m.channel = channel;
    m.channels = channels;

    // ---------- sidechain ducking (scheduled gain automation — exact in offline renders) ----------
    function duckParamOf(target) {
      if (!target) return null;
      if (target.duck && target.duck.gain) return target.duck.gain;
      if (target.channel && target.channel.duck) return target.channel.duck.gain;
      if (target.gain && target.gain.setValueAtTime) return target.gain;
      return null;
    }
    function sidechain(target, times, o = {}) {
      const targets = Array.isArray(target) ? target : [target];
      const depth = dbToGain(o.depth != null ? -Math.abs(o.depth) : -8), release = o.release || 0.18, attack = o.attack || 0.006;
      const apply = () => {
        let ts = typeof times === 'function' ? times() : times && times.kickTimes ? times.kickTimes : times;
        ts = (ts || []).map(Number).filter((t) => isFinite(t) && t >= 0).sort((a, b) => a - b);
        ts = ts.filter((t, i) => i === 0 || t - ts[i - 1] > 0.02);
        const tau = release / 3;
        for (const tg of targets) {
          const p = duckParamOf(tg);
          if (!p) continue;
          let prev = -1;
          for (const t of ts) {
            let v = 1;
            if (prev >= 0) { const dt = t - (prev + attack); v = dt > 0 ? 1 - (1 - depth) * Math.exp(-dt / tau) : depth; }
            p.setValueAtTime(v, t);
            p.linearRampToValueAtTime(depth, t + attack);
            p.setTargetAtTime(1, t + attack, tau);
            prev = t;
          }
        }
      };
      // times may be filled later (e.g. drums.kickTimes) → resolve after all triggers are queued
      if (typeof times === 'function' || (times && times.kickTimes)) m._defer(1e9, apply); else apply();
    }
    m.sidechain = sidechain;

    // ---------- master ----------
    m.master = (o = {}) => {
      if (typeof o === 'string') o = { preset: o };
      MASTER = Object.assign({}, MASTER, o);
      if (!PRESETS[MASTER.preset] && MASTER.preset !== 'off') MASTER.preset = 'clean';
      return MASTER;
    };
    m.mix = { channel, channels, sidechain, master: m.master, get reverb() { return m.reverb; }, get delay() { return m.delay; }, presets: Object.keys(PRESETS) };
    m.dbToGain = dbToGain;
    m.gainToDb = gainToDb;
  });
})();
