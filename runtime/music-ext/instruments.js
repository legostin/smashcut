/*
 * Smashcut music ext — INSTRUMENTS & FX. Sampled where it matters (piano, strings, drums, mallets, brass, FX),
 * with designed synth fallbacks (layered/detuned oscillators, filter envelopes, velocity → level & brightness).
 * Every instrument comes with a mix channel and balanced default levels, so a song sits right without mixing.
 *
 *   const piano = m.inst.piano();                       piano.play(['C4','E4','G4'], 1.5, m.bar(0), 0.7)
 *   const keys  = m.inst.keys('rhodes'|'epiano'|'wurli'|'organ')
 *   const str   = m.inst.strings('ensemble'|'pizz'|'staccato')
 *   const pad   = m.inst.pad('warm'|'airy'|'dark'|'glass')
 *   const bass  = m.inst.bass('sub'|'808'|'pluck'|'synth'|'upright')
 *   const pl    = m.inst.pluck('bell'|'marimba'|'synth')   lead = m.inst.lead('saw'|'square'|'soft')
 *   m.inst.choir(), m.inst.brass()
 *   const dr = m.inst.drums('808'|'909'|'acoustic'|'lofi'|'trap')  dr.kick(t, v) .snare .clap .hat .openHat .rim .tom(t, v, 0|1|2) .crash .ride .perc .shaker
 *   m.fx.riser(t0, t1) .downlifter(t, dur) .impact(t, v) .whoosh(t, dur) .reverseCymbal(tEnd, dur) .snareRoll(t0, t1) .vinyl(on) .subDrop(t)
 *
 * play(noteOrNotes, dur, time, vel = 0.8, opts?) — notes: 'C#4' | midi number | array; dur/time: seconds or Tone time ('8n').
 *   opts: { strum: seconds between chord notes, detune: cents }.  Every instrument: .channel (mix strip), .volume (dB param).
 * Triggers are queued and flushed in time order after samples load (mono synths never see out-of-order events).
 */
(function () {
  'use strict';
  const EXT = (window.__musicExt = window.__musicExt || []);
  // sample index (written by the server; always valid JSON). Fetched once per page.
  const INDEX = fetch('/samples/index.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { inst: {} })).catch(() => ({ inst: {} }));
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function toMidi(n) {
    if (typeof n === 'number') return n > 127 ? 69 + 12 * Math.log2(n / 440) : n;
    const s = String(n).trim();
    const mt = /^([A-Ga-g])([#bs]*)(-?\d+)$/.exec(s);
    if (!mt) { if (window.Tone) return window.Tone.Frequency(s).toMidi(); throw new Error('bad note ' + n); }
    let v = NOTE[mt[1].toUpperCase()];
    for (const c of mt[2]) v += c === 'b' ? -1 : 1;
    return 12 * (+mt[3] + 1) + v;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const dbToGain = (db) => Math.pow(10, db / 20);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const velGain = (v) => Math.pow(clamp(v, 0, 1), 1.5);
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  EXT.push(function instrumentsExt(m, Tone, info) {
    const ctx = Tone.getContext();
    const SR = ctx.sampleRate;
    const DSP = window.__musicDSP;
    const used = [];
    info.instruments = used; // reported back in the render meta: which instruments ran on samples vs synth
    let index = { inst: {} };
    m._wait(INDEX.then((j) => (index = j && j.inst ? j : { inst: {} })));
    const bufCache = new Map();
    function loadBuf(url) {
      if (!bufCache.has(url)) {
        const p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => (ab ? ctx.decodeAudioData(ab) : null)).catch(() => null);
        bufCache.set(url, p);
        m._wait(p);
      }
      return bufCache.get(url);
    }
    /** zones for an index instrument key: [{midi, piece, vel, rr, buf, offset, gain, loop}] (empty if unavailable) */
    function zones(key) {
      const p = INDEX.then((j) => {
        const list = (j && j.inst && j.inst[key]) || [];
        return Promise.all(list.map((e) => loadBuf(e.url).then((buf) => (buf ? { ...e, buf, midi: e.note && /\d$/.test(e.note) ? toMidi(e.note) : null, piece: e.note } : null))));
      }).then((zs) => zs.filter(Boolean)).catch(() => []);
      m._wait(p);
      const z = { list: [], p };
      p.then((l) => (z.list = l));
      return z;
    }
    const toSec = (x, d = 0) => (x == null ? d : typeof x === 'number' ? x : Tone.Time(x).toSeconds());

    // ---------- small node helpers (raw nodes from Tone's context) ----------
    const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const BQ = (type, f, q = 0.7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = clamp(f, 10, SR * 0.45); b.Q.value = q; b.gain.value = gain; return b; };
    const shaperCurve = (drive) => { const n = 2048, c = new Float32Array(n), k = 1 + drive * 6, nr = Math.tanh(k); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / nr; } return c; };
    const toneIn = (node) => node.input || node; // raw input of a Tone.Gain
    /** standard instrument bus: input → [inserts] → channel strip */
    function makeBus(name, chOpts, inserts = []) {
      let nm = name, k = 2;
      while (m.channels[nm]) nm = name + k++;
      const ch = m.channel(nm, chOpts);
      const input = new Tone.Gain(1);
      let node = input;
      for (const ins of inserts) {
        if (ins && !ins.connect && ins.input && ins.output) { node.connect(ins.input); node = ins.output; } // {input, output} sub-graph
        else { node.connect(ins); node = ins; }
      }
      node.connect(ch);
      return { ch, input, raw: toneIn(input) };
    }

    // ---------- voice pools ----------
    // Offline renders pay for every connected node over the whole timeline, so per-note processing nodes would
    // make long songs quadratic. Instruments therefore own a small pool of persistent voice slots (filter, amp,
    // oscillators) that are re-automated per note; only sample sources are created per note.
    const END_T = () => info.duration + (info.tail || 0) + 0.5;
    function pool(max, make) {
      const slots = [];
      return function alloc(t) {
        let best = null;
        for (const s of slots) if (s.busy <= t && (!best || s.busy < best.busy)) best = s;
        if (!best && slots.length < max) { best = make(t); best.busy = 0; slots.push(best); }
        if (!best) for (const s of slots) if (!best || s.busy < best.busy) best = s; // steal the voice that frees first
        best.stolen = best.busy > t;
        return best;
      };
    }
    /** (re)start an amp envelope on a persistent gain param; returns release end */
    function envelope(p, t, dur, a, d, s, r, peak, stolen) {
      if (stolen) { hold(p, t); p.linearRampToValueAtTime(0, t + 0.004); t += 0.004; } else { p.cancelScheduledValues(t); p.setValueAtTime(0, t); }
      p.linearRampToValueAtTime(peak, t + a);
      if (s < 1) p.setTargetAtTime(peak * s, t + a, Math.max(0.001, d / 3));
      const tr = t + Math.max(dur, a + 0.001);
      p.setTargetAtTime(0, tr, Math.max(0.002, r / 4));
      return tr + r * 1.6 + 0.02;
    }
    function setP(p, v, t) { p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
    /** cancel future automation but keep the value the param has at t (continuous) */
    function hold(p, t) { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); } }

    // ---------- sampled voice ----------
    function samplePool(dest, o) {
      return pool(o.voices || 24, () => {
        const g = G(0); g.connect(dest);
        const f = o.velFilter ? BQ('lowpass', 8000, 0.5) : null;
        if (f) f.connect(g);
        return { g, f, input: f || g };
      });
    }
    /** play the nearest zone, repitched; looped zones sustain for `dur` */
    function samplePlay(z, midi, dur, t, vel, alloc, o) {
      const list = z.list;
      if (!list.length) return false;
      let cand = list;
      if (list.some((e) => e.vel != null)) {
        let best = Infinity;
        for (const e of list) best = Math.min(best, Math.abs((e.vel || 1) - vel));
        cand = list.filter((e) => Math.abs((e.vel || 1) - vel) <= best + 1e-6);
      }
      let zb = cand[0], dist = Infinity;
      for (const e of cand) { const dd = Math.abs(e.midi - midi) + (e.midi > midi ? 0.1 : 0); if (dd < dist) { dist = dd; zb = e; } }
      const rate = Math.pow(2, (midi - zb.midi + (o.detune || 0) / 100) / 12);
      const off = zb.offset || 0;
      const natural = zb.loop ? Infinity : (zb.buf.duration - off) / rate;
      const hold = Math.min(dur, natural);
      const v = alloc(t);
      const src = ctx.createBufferSource();
      src.buffer = zb.buf;
      src.playbackRate.value = rate;
      if (zb.loop) { src.loop = true; src.loopStart = zb.loop[0]; src.loopEnd = zb.loop[1]; }
      if (v.f) setP(v.f.frequency, clamp(o.velFilter(vel, midi), 60, SR * 0.45), t);
      const peak = velGain(vel) * dbToGain(zb.gain || 0) * (o.gain || 1);
      const a = typeof o.attack === 'function' ? o.attack(vel) : o.attack || 0.002;
      let end = envelope(v.g.gain, t, hold, a, 0, 1, o.release || 0.25, peak, v.stolen);
      end = Math.min(end, t + natural + 0.01);
      v.busy = end;
      src.connect(v.input);
      src.start(t, off);
      src.stop(end);
      return true;
    }

    // ---------- synth voice engine (pooled persistent voices) ----------
    /*
     * spec: { osc: [{type|wave, ratio, detune, gain, decay, sus}], fm: [{ratio, mod, index, indexEnd, decay, gain, ampDecay}],
     *         noise: {gain, hp, bp, q, decay, sus}, filter: {type, freq, q, key, vel, two, env:{amt (octaves), a, d, s}},
     *         amp: {a, d, s, r}, pitch: {semis, time}, vib: {rate, cents, delay}, glide, mono, voices }
     */
    let noiseBuf = null;
    function noise() {
      if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, SR * 2, SR); const d = noiseBuf.getChannelData(0), r = rng(5); for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; }
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
    }
    const waves = {};
    function wave(name, harm) {
      if (!waves[name]) { const re = new Float32Array(harm.length + 1), im = new Float32Array(harm.length + 1); harm.forEach((h, i) => (im[i + 1] = h)); waves[name] = ctx.createPeriodicWave(re, im, { disableNormalization: false }); }
      return waves[name];
    }
    function synthEngine(spec, dest) {
      const A = spec.amp || { a: 0.005, d: 0.2, s: 0.8, r: 0.2 };
      const F = spec.filter;
      const makeVoice = (t0) => {
        const amp = G(0), sum = G(1), V = { amp, oscs: [], fms: [], f: null, f2: null, f0: 0 };
        let out = sum;
        if (F) {
          V.f = BQ(F.type || 'lowpass', F.freq, F.q || 0.7); sum.connect(V.f); out = V.f;
          if (F.two) { V.f2 = BQ(F.type || 'lowpass', F.freq * 1.5, 0.5); V.f.connect(V.f2); out = V.f2; }
        }
        out.connect(amp); amp.connect(dest);
        const stopAt = END_T();
        let vibG = null;
        if (spec.vib) { const lfo = ctx.createOscillator(); lfo.frequency.value = spec.vib.rate || 5.5; vibG = G(0); lfo.connect(vibG); lfo.start(t0); lfo.stop(stopAt); }
        V.vib = vibG;
        for (const oc of spec.osc || []) {
          const os = ctx.createOscillator();
          if (oc.wave) os.setPeriodicWave(wave(oc.waveName, oc.wave)); else os.type = oc.type || 'sawtooth';
          os.detune.value = oc.detune || 0;
          if (vibG) vibG.connect(os.detune);
          const g = G(oc.gain != null ? oc.gain : 1);
          os.connect(g); g.connect(sum); os.start(t0); os.stop(stopAt);
          V.oscs.push({ os, g, oc });
        }
        for (const fm of spec.fm || []) {
          const car = ctx.createOscillator(), mod = ctx.createOscillator(), idx = G(0), g = G(fm.gain != null ? fm.gain : 1);
          mod.connect(idx); idx.connect(car.frequency); if (vibG) vibG.connect(car.detune);
          car.connect(g); g.connect(sum); car.start(t0); mod.start(t0); car.stop(stopAt); mod.stop(stopAt);
          V.fms.push({ car, mod, idx, g, fm });
        }
        if (spec.noise) {
          const n = noise(); let nn = n;
          if (spec.noise.hp) { const h = BQ('highpass', spec.noise.hp, 0.7); nn.connect(h); nn = h; }
          if (spec.noise.bp) { const h = BQ('bandpass', spec.noise.bp, spec.noise.q || 1); nn.connect(h); nn = h; }
          V.ng = G(0); nn.connect(V.ng); V.ng.connect(sum); n.start(t0, (V.oscs.length * 0.37) % 1.5); n.stop(stopAt);
        }
        return V;
      };
      const alloc = pool(spec.mono ? 1 : spec.voices || 10, makeVoice);
      let last = null;
      return function play(midi, dur, t, vel, o = {}) {
        const f = mtof(midi + (o.detune || 0) / 100);
        const V = alloc(t);
        const legato = spec.mono && last && t < last.relAt + 0.002;
        const glideFrom = legato && spec.glide ? last.f : null;
        const peak = velGain(vel) * (spec.gain || 1);
        const relAt = t + Math.max(dur, A.a);
        const freq = (p, ratio) => {
          p.cancelScheduledValues(t);
          if (glideFrom) { p.setValueAtTime(glideFrom * ratio, t); p.exponentialRampToValueAtTime(f * ratio, t + spec.glide); } else p.setValueAtTime(f * ratio, t);
        };
        for (const { os, g, oc } of V.oscs) {
          freq(os.frequency, oc.ratio || 1);
          if (spec.pitch && !legato) { const det = oc.detune || 0; os.detune.cancelScheduledValues(t); os.detune.setValueAtTime(det + spec.pitch.semis * 100, t); os.detune.setTargetAtTime(det, t, spec.pitch.time / 3); }
          if (oc.decay) { const g0 = oc.gain != null ? oc.gain : 1; setP(g.gain, g0, t); g.gain.setTargetAtTime(g0 * (oc.sus || 0), t, oc.decay / 3); }
        }
        for (const { car, mod, idx, g, fm } of V.fms) {
          freq(car.frequency, fm.ratio || 1); freq(mod.frequency, fm.mod);
          const i0 = fm.index * (0.5 + vel) * f * fm.mod, i1 = (fm.indexEnd != null ? fm.indexEnd : fm.index * 0.3) * f * fm.mod;
          setP(idx.gain, i0, t); idx.gain.setTargetAtTime(i1, t, (fm.decay || 0.3) / 3);
          if (fm.ampDecay) { const g0 = fm.gain != null ? fm.gain : 1; setP(g.gain, g0, t); g.gain.setTargetAtTime(0, t, fm.ampDecay / 3); }
        }
        if (V.ng) { const N = spec.noise, g0 = N.gain * (0.5 + vel * 0.5); setP(V.ng.gain, g0, t); if (N.decay) V.ng.gain.setTargetAtTime(g0 * (N.sus || 0), t, N.decay / 3); }
        if (V.vib) { const vd = t + (spec.vib.delay || 0.3); setP(V.vib.gain, 0, t); V.vib.gain.setValueAtTime(0, vd); V.vib.gain.linearRampToValueAtTime(spec.vib.cents || 10, vd + 0.4); }
        if (V.f) {
          const base = clamp(F.freq * Math.pow(2, ((F.key || 0) * (midi - 60)) / 12) * Math.pow(2, (F.vel || 0) * (vel - 0.7)), 30, SR * 0.45);
          const p = V.f.frequency;
          p.cancelScheduledValues(t);
          if (F.env) {
            const E = F.env, top = clamp(base * Math.pow(2, E.amt * (0.6 + 0.6 * vel)), 30, SR * 0.45), sus = clamp(base * Math.pow(2, E.amt * (E.s || 0)), 30, SR * 0.45);
            p.setValueAtTime(legato ? sus : base, t);
            if (!legato) p.exponentialRampToValueAtTime(top, t + (E.a || 0.003) + 0.001);
            p.setTargetAtTime(sus, t + (E.a || 0.003) + 0.001, (E.d || 0.3) / 3);
            p.setTargetAtTime(base, relAt, Math.max(0.01, A.r / 3));
          } else p.setValueAtTime(base, t);
          if (V.f2) setP(V.f2.frequency, clamp(base * 1.5, 30, SR * 0.45), t);
        }
        let end;
        if (legato) {
          const p = V.amp.gain; hold(p, t);
          p.linearRampToValueAtTime(peak * Math.max(A.s, 0.6), t + 0.012);
          if (A.s < 1) p.setTargetAtTime(peak * A.s, t + 0.012, Math.max(0.001, A.d / 3));
          p.setTargetAtTime(0, relAt, Math.max(0.002, A.r / 4));
          end = relAt + A.r * 1.6 + 0.02;
        } else end = envelope(V.amp.gain, t, dur, A.a, A.d, A.s, A.r, peak, V.stolen);
        V.busy = end;
        last = { f, relAt };
        return true;
      };
    }

    // ---------- mix options: defaults ← user (deep-merged; channel keys may be given top-level or under `mix`) ----------
    const CH_KEYS = ['vol', 'trim', 'pan', 'eq', 'sends', 'highpass', 'lowpass', 'lowpassQ', 'comp', 'width', 'output'];
    function mergeMix(a, b) {
      const out = Object.assign({}, a);
      for (const [k, v] of Object.entries(b || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
          out[k] = Object.assign({}, out[k], v);
          if (k === 'eq' && Array.isArray(v.bands) && Array.isArray(a[k] && a[k].bands)) out[k].bands = a[k].bands.concat(v.bands);
        } else out[k] = v;
      }
      return out;
    }
    function mixOf(o, ...defs) {
      let m0 = {};
      for (const d of defs) m0 = mergeMix(m0, d);
      const top = {}; for (const k of CH_KEYS) if (o && o[k] !== undefined) top[k] = o[k];
      return mergeMix(mergeMix(m0, top), (o && o.mix) || {});
    }

    // ---------- instrument factory ----------
    /**
     * name, kind, chOpts (default mix), opts: { key: sample index key, sample: samplePlay opts, synth: synth spec,
     *   inserts: [Tone nodes], prefer: 'sample'|'synth' }
     */
    function instrument(name, kind, chOpts, o) {
      const bus = makeBus(name, chOpts, o.inserts || []);
      const z = o.key && !(o.user && o.user.synth) && !inst.preferSynth ? zones(o.key) : { list: [] };
      const rec = { name: bus.ch.channelName, kind, source: 'synth' };
      used.push(rec);
      z.p && z.p.then((l) => { if (l.length) rec.source = 'samples'; });
      // sampled path may have its own extra gain trim (samples vs synth level match)
      const sampleDest = G(dbToGain(o.sampleTrim || 0)); sampleDest.connect(bus.raw);
      const synthDest = G(dbToGain(o.synthTrim || 0)); synthDest.connect(bus.raw);
      let synth = null, sAlloc = null;
      const getSynth = () => (synth = synth || (o.synth ? synthEngine(o.synth, synthDest) : null));
      const getSAlloc = () => (sAlloc = sAlloc || samplePool(sampleDest, o.sample || {}));
      const self = {
        name: rec.name, channel: bus.ch, input: bus.input, volume: bus.ch.volume, filter: bus.ch.filter, cutoff: bus.ch.cutoff, kind,
        get source() { return rec.source; },
        play(notes, dur, time, vel = 0.8, opts = {}) {
          const ns = Array.isArray(notes) ? notes : [notes];
          const d = Math.max(0.01, toSec(dur, 0.5)), t0 = toSec(time, 0), v = clamp(vel == null ? 0.8 : vel, 0, 1);
          ns.forEach((n, i) => {
            const t = t0 + (opts.strum || 0) * i;
            const midi = toMidi(n) + (o.transpose || 0);
            m._defer(t, () => {
              if (z.list.length && samplePlay(z, midi, d, t, v, getSAlloc(), Object.assign({}, o.sample, opts))) return;
              if (getSynth()) synth(midi, d, t, v, opts);
            });
          });
          return self;
        },
        triggerAttackRelease(notes, dur, time, vel) { return self.play(notes, dur, time, vel); },
        connect(node) { bus.ch.fader.disconnect(); bus.ch.fader.connect(node); return self; },
      };
      return self;
    }

    // ======================= melodic instruments =======================
    const inst = {};
    inst.piano = (o = {}) => instrument('piano', 'piano', mixOf(o, { vol: -5.5, highpass: 40, eq: { high: 1.5, highFreq: 8000, bands: [[300, -2.5, 1], [3500, 2, 0.8]] }, sends: { reverb: 0.16 }, width: 0.6 }), { user: o,
      key: 'piano',
      sample: { velFilter: (v, mi) => 2500 + 16000 * v * v + (mi - 60) * 40, release: 0.45, attack: 0.001, gain: 1 },
      // fallback: bright struck string — fundamental + partials decaying at different speeds, hammer noise
      synth: { osc: [{ type: 'triangle', gain: 0.8 }, { type: 'sine', ratio: 2, detune: 3, gain: 0.35, decay: 1.2 }, { type: 'sine', ratio: 3, detune: -4, gain: 0.15, decay: 0.5 }, { type: 'sine', ratio: 4.01, gain: 0.08, decay: 0.25 }],
        noise: { gain: 0.08, hp: 2500, decay: 0.02 }, filter: { freq: 2200, key: 0.6, vel: 2, q: 0.5, env: { amt: 2, a: 0.002, d: 0.6, s: 0.2 } }, amp: { a: 0.002, d: 2.6, s: 0, r: 0.35 }, gain: 0.55 },
      synthTrim: 0.9,
    });
    inst.keys = (kind = 'rhodes', o = {}) => {
      if (kind === 'organ') {
        const chorus = new Tone.Chorus({ frequency: 5.8, delayTime: 2.5, depth: 0.35, spread: 160, wet: 0.5 }).start(0);
        const drive = new Tone.Distortion({ distortion: 0.12, wet: 0.35, oversample: '2x' });
        return instrument('organ', 'keys:organ', mixOf(o, { vol: -13.5, highpass: 60, lowpass: 9000, eq: { bands: [[300, -2, 1]] }, sends: { reverb: 0.14 }, width: 0.65 }), { user: o,
          inserts: [drive, chorus],
          synth: { osc: [{ waveName: 'drawbar', wave: [1, 0.85, 0.55, 0.6, 0, 0.4, 0, 0.3], gain: 0.6 }, { type: 'sine', ratio: 0.5, gain: 0.45 }], noise: { gain: 0.05, hp: 3000, decay: 0.012 }, amp: { a: 0.006, d: 0.1, s: 1, r: 0.06 }, gain: 0.5 },
        });
      }
      if (kind === 'epiano' || kind === 'wurli') {
        const trem = new Tone.Tremolo({ frequency: 5.2, depth: 0.18, spread: 0 }).start(0);
        return instrument('epiano', 'keys:' + kind, mixOf(o, { vol: -10, highpass: 60, eq: { bands: [[300, -2.5, 1], [2800, 2, 0.9]] }, sends: { reverb: 0.14, delay: 0.04 }, width: 0.6 }), { user: o,
          key: 'keys.wurli', inserts: [trem],
          sample: { velFilter: (v) => 2000 + 11000 * v * v, release: 0.25, attack: 0.001 },
          synthTrim: 4.9,
          synth: { fm: [{ ratio: 1, mod: 1, index: 2.2, indexEnd: 0.6, decay: 0.5, gain: 0.8 }, { ratio: 1, mod: 7, index: 0.5, indexEnd: 0, decay: 0.08, gain: 0.25, ampDecay: 0.3 }], filter: { freq: 3500, key: 0.3 }, amp: { a: 0.002, d: 2.2, s: 0.0, r: 0.25 }, gain: 0.55 },
        });
      }
      // Rhodes: FM tine (index envelope = bark on hard hits) + bell partial, stereo tremolo, a touch of drive
      const pan = new Tone.AutoPanner({ frequency: 3.6, depth: 0.32 }).start(0);
      const drive = new Tone.Distortion({ distortion: 0.08, wet: 0.3, oversample: '2x' });
      return instrument('rhodes', 'keys:rhodes', mixOf(o, { vol: -9.5, highpass: 50, eq: { bands: [[280, -3, 1], [2500, 2.5, 0.9]] }, sends: { reverb: 0.15, delay: 0.03 }, width: 0.55 }), { user: o,
        inserts: [drive, pan],
        synth: { fm: [{ ratio: 1, mod: 1, index: 1.1, indexEnd: 0.18, decay: 0.7, gain: 0.85 }, { ratio: 1, mod: 13.9, index: 0.4, indexEnd: 0, decay: 0.05, gain: 0.35, ampDecay: 0.25 }, { ratio: 2, mod: 1, index: 0.3, indexEnd: 0.05, decay: 0.3, gain: 0.08, ampDecay: 0.8 }],
          filter: { freq: 4500, key: 0.4, vel: 1.2, q: 0.3 }, amp: { a: 0.002, d: 3.5, s: 0.0, r: 0.3 }, gain: 0.6 },
      });
    };
    inst.strings = (kind = 'ensemble', o = {}) => {
      if (kind === 'pizz' || kind === 'pizzicato') return instrument('pizz', 'strings:pizz', mixOf(o, { vol: -10, highpass: 60, eq: { bands: [[300, -2, 1], [3000, 2, 1]] }, sends: { reverb: 0.25 }, width: 0.6 }), { user: o,
        synthTrim: 3, key: 'strings.pizz', sample: { release: 0.2, velFilter: (v) => 1500 + 12000 * v, gain: 1 },
        synth: { osc: [{ type: 'sawtooth', gain: 0.5 }, { type: 'triangle', gain: 0.6 }], filter: { freq: 500, key: 0.7, env: { amt: 2.5, a: 0.002, d: 0.12, s: 0 } }, amp: { a: 0.002, d: 0.45, s: 0, r: 0.15 }, gain: 0.7 },
      });
      if (kind === 'staccato' || kind === 'stac' || kind === 'spiccato') return instrument('staccato', 'strings:staccato', mixOf(o, { vol: -6.2, highpass: 60, eq: { bands: [[300, -1.5, 1], [3000, 1.5, 1]] }, sends: { reverb: 0.22 }, width: 0.65 }), { user: o,
        synthTrim: 6.1, key: 'strings.stac', sample: { release: 0.12, velFilter: (v) => 1800 + 12000 * v },
        synth: { osc: [{ type: 'sawtooth', detune: -7, gain: 0.4 }, { type: 'sawtooth', detune: 7, gain: 0.4 }], filter: { freq: 900, key: 0.5, env: { amt: 1.5, a: 0.01, d: 0.12, s: 0.3 } }, amp: { a: 0.008, d: 0.18, s: 0.2, r: 0.1 }, gain: 0.6 },
      });
      return instrument('strings', 'strings:ensemble', mixOf(o, { vol: -12.5, highpass: 55, eq: { high: 1, highFreq: 7000, bands: [[300, -2.5, 0.9], [3000, 2, 0.8]] }, sends: { reverb: 0.3 }, width: 0.72 }), { user: o,
        synthTrim: 7.6, key: 'strings', sample: { attack: (v) => 0.25 - 0.17 * v, release: 0.7, velFilter: (v) => 3000 + 14000 * v * v, gain: 1 },
        synth: { osc: [{ type: 'sawtooth', detune: -9, gain: 0.35 }, { type: 'sawtooth', detune: 0, gain: 0.35 }, { type: 'sawtooth', detune: 10, gain: 0.35 }], filter: { freq: 2800, key: 0.5, vel: 1, q: 0.4, two: true },
          vib: { rate: 5.2, cents: 9, delay: 0.35 }, amp: { a: 0.3, d: 0.4, s: 0.85, r: 0.7 }, gain: 0.5 },
      });
    };
    const PADS = {
      warm: { mix: { vol: -8, highpass: 90, lowpass: 7000, eq: { bands: [[300, -3, 0.9]] }, sends: { reverb: 0.35 }, width: 0.85 },
        synth: { osc: [{ type: 'sawtooth', detune: -11, gain: 0.3 }, { type: 'sawtooth', detune: 0, gain: 0.3 }, { type: 'sawtooth', detune: 12, gain: 0.3 }, { type: 'sine', ratio: 0.5, gain: 0.25 }], filter: { freq: 1100, key: 0.3, q: 0.6, two: true, env: { amt: 1, a: 1.2, d: 2, s: 0.5 } }, amp: { a: 0.9, d: 0.8, s: 0.85, r: 2 }, gain: 0.55 } },
      airy: { mix: { vol: -7, highpass: 220, eq: { high: 2, highFreq: 8000, mid: -1.5, midFreq: 500 }, sends: { reverb: 0.5 }, width: 0.95 },
        synth: { osc: [{ type: 'sawtooth', detune: -8, gain: 0.25 }, { type: 'sawtooth', detune: 9, gain: 0.25 }, { type: 'triangle', ratio: 2, gain: 0.3 }], noise: { gain: 0.05, hp: 4000, bp: 7000, q: 0.4, decay: 0, sus: 1 }, filter: { freq: 2600, key: 0.2, q: 0.4, env: { amt: 0.7, a: 1.8, d: 2, s: 0.6 } }, amp: { a: 1.5, d: 1, s: 0.9, r: 3 }, gain: 0.5 } },
      dark: { mix: { vol: -10, highpass: 60, lowpass: 2500, sends: { reverb: 0.3 }, width: 0.7 },
        synth: { osc: [{ type: 'square', detune: -6, gain: 0.25 }, { type: 'square', detune: 6, gain: 0.25 }, { type: 'sawtooth', ratio: 0.5, gain: 0.25 }], filter: { freq: 380, key: 0.3, q: 0.8, two: true, env: { amt: 1, a: 1.5, d: 2, s: 0.4 } }, amp: { a: 1.1, d: 1, s: 0.85, r: 2.2 }, gain: 0.6 } },
      glass: { mix: { vol: -9.3, highpass: 150, sends: { reverb: 0.45, delay: 0.12 }, width: 0.85 },
        synth: { osc: [{ type: 'triangle', gain: 0.45 }, { type: 'sine', ratio: 2, detune: 4, gain: 0.25 }, { type: 'sine', ratio: 3.01, gain: 0.12, decay: 1.5, sus: 0.3 }, { type: 'sine', ratio: 5.02, gain: 0.07, decay: 0.8, sus: 0.1 }], filter: { freq: 5000, key: 0.2 }, vib: { rate: 4.5, cents: 5, delay: 0.5 }, amp: { a: 0.35, d: 1.5, s: 0.6, r: 2.5 }, gain: 0.55 } },
    };
    inst.pad = (kind = 'warm', o = {}) => { const P = PADS[kind] || PADS.warm; return instrument('pad', 'pad:' + kind, mixOf(o, {}, P.mix), { user: o, synth: P.synth }); };

    const BASSES = {
      sub: { mix: { vol: -8.4, highpass: 28, lowpass: 900, width: 0 }, drive: 0.15, synth: { osc: [{ type: 'sine', gain: 1 }, { type: 'triangle', ratio: 1, gain: 0.12 }], amp: { a: 0.006, d: 0.2, s: 0.9, r: 0.08 }, mono: true, glide: 0.04, gain: 0.8 } },
      808: { mix: { vol: -6.5, highpass: 28, width: 0, eq: { mid: 3, midFreq: 800 } }, drive: 0.75, synth: { osc: [{ type: 'sine', gain: 1 }], pitch: { semis: 4, time: 0.06 }, amp: { a: 0.003, d: 1.6, s: 0.25, r: 0.1 }, mono: true, glide: 0.08, gain: 0.85 } },
      pluck: { mix: { vol: -6, highpass: 35, width: 0 }, drive: 0.2, synth: { osc: [{ type: 'sawtooth', gain: 0.45 }, { type: 'square', gain: 0.25 }, { type: 'sine', ratio: 0.5, gain: 0.35 }], filter: { freq: 220, key: 0.5, vel: 1, q: 1.2, env: { amt: 2.8, a: 0.002, d: 0.18, s: 0.1 } }, amp: { a: 0.002, d: 0.35, s: 0.45, r: 0.07 }, mono: true, gain: 0.7 } },
      synth: { mix: { vol: -6.2, highpass: 32, width: 0 }, drive: 0.3, synth: { osc: [{ type: 'sawtooth', detune: -7, gain: 0.35 }, { type: 'sawtooth', detune: 7, gain: 0.35 }, { type: 'square', ratio: 0.5, gain: 0.3 }], filter: { freq: 380, key: 0.4, vel: 1, q: 2, env: { amt: 1.8, a: 0.003, d: 0.3, s: 0.35 } }, amp: { a: 0.003, d: 0.3, s: 0.8, r: 0.09 }, mono: true, glide: 0.03, gain: 0.7 } },
      upright: { mix: { vol: -3, highpass: 35, width: 0, sends: { reverb: 0.06 } }, drive: 0, synthTrim: -3.8, key: 'bass.upright', sample: { release: 0.18, velFilter: (v) => 900 + 5000 * v, gain: 1 },
        synth: { osc: [{ type: 'triangle', gain: 0.8 }, { type: 'sine', gain: 0.5 }, { type: 'sawtooth', ratio: 1, gain: 0.08, decay: 0.15 }], filter: { freq: 500, key: 0.5, env: { amt: 1.2, a: 0.003, d: 0.2, s: 0 } }, amp: { a: 0.004, d: 1.4, s: 0, r: 0.15 }, gain: 0.8 } },
    };
    inst.bass = (kind = 'sub', o = {}) => {
      const B = BASSES[kind] || BASSES.sub;
      const inserts = B.drive ? [new Tone.WaveShaper(shaperCurve(B.drive), 2048)] : [];
      if (B.drive) inserts.push(new Tone.Gain(dbToGain(-B.drive * 4)));
      return instrument('bass', 'bass:' + kind, mixOf(o, { comp: { threshold: -20, ratio: 3, attack: 0.01, release: 0.12 } }, B.mix), { user: o, key: B.key, sample: B.sample, synth: B.synth, synthTrim: B.synthTrim, inserts });
    };
    inst.pluck = (kind = 'synth', o = {}) => {
      if (kind === 'bell' || kind === 'glock') return instrument('bell', 'pluck:bell', mixOf(o, { vol: -15, highpass: 300, sends: { reverb: 0.3, delay: 0.12 }, width: 0.6 }), { user: o,
        synthTrim: 3, key: 'glock', sample: { release: 0.8, velFilter: (v) => 3000 + 15000 * v, gain: 1 },
        synth: { osc: [{ type: 'sine', gain: 0.6 }, { type: 'sine', ratio: 2.76, gain: 0.3, decay: 0.6 }, { type: 'sine', ratio: 5.4, gain: 0.15, decay: 0.25 }, { type: 'sine', ratio: 8.93, gain: 0.08, decay: 0.1 }], amp: { a: 0.001, d: 2, s: 0, r: 0.8 }, gain: 0.6 },
      });
      if (kind === 'marimba') return instrument('marimba', 'pluck:marimba', mixOf(o, { vol: -13.5, highpass: 90, sends: { reverb: 0.2 }, width: 0.55 }), { user: o,
        synthTrim: 5.5, key: 'marimba', sample: { release: 0.3, velFilter: (v) => 1500 + 12000 * v },
        synth: { osc: [{ type: 'sine', gain: 0.8 }, { type: 'sine', ratio: 4, gain: 0.35, decay: 0.08 }, { type: 'sine', ratio: 9.9, gain: 0.12, decay: 0.03 }], noise: { gain: 0.05, bp: 3000, decay: 0.01 }, amp: { a: 0.001, d: 0.7, s: 0, r: 0.2 }, gain: 0.7 },
      });
      return instrument('pluck', 'pluck:synth', mixOf(o, { vol: -2, highpass: 150, sends: { reverb: 0.2, delay: 0.2 }, width: 0.65 }), { user: o,
        synth: { osc: [{ type: 'sawtooth', detune: -6, gain: 0.35 }, { type: 'square', detune: 6, gain: 0.25 }, { type: 'triangle', ratio: 2, gain: 0.15 }], filter: { freq: 450, key: 0.5, vel: 1, q: 1.5, env: { amt: 3.2, a: 0.002, d: 0.16, s: 0.05 } }, amp: { a: 0.002, d: 0.45, s: 0, r: 0.2 }, gain: 0.6 },
      });
    };
    const LEADS = {
      saw: { osc: [{ type: 'sawtooth', detune: -6, gain: 0.35 }, { type: 'sawtooth', detune: 6, gain: 0.35 }, { type: 'sawtooth', ratio: 0.5, gain: 0.15 }], filter: { freq: 1800, key: 0.4, vel: 1, q: 1, env: { amt: 1.2, a: 0.005, d: 0.3, s: 0.5 } } },
      square: { osc: [{ type: 'square', gain: 0.3 }, { type: 'square', detune: 7, gain: 0.25 }, { type: 'triangle', ratio: 2, gain: 0.12 }], filter: { freq: 1600, key: 0.4, vel: 1, q: 0.8, env: { amt: 1, a: 0.005, d: 0.25, s: 0.5 } } },
      soft: { osc: [{ type: 'triangle', gain: 0.6 }, { type: 'sine', ratio: 2, gain: 0.15 }, { type: 'sawtooth', gain: 0.06 }], filter: { freq: 2600, key: 0.3 } },
    };
    inst.lead = (kind = 'saw', o = {}) => {
      const L = LEADS[kind] || LEADS.saw;
      return instrument('lead', 'lead:' + kind, mixOf(o, { vol: { saw: -3, square: -5, soft: -5.3 }[kind] || -3, highpass: 180, eq: { mid: 1, midFreq: 2000 }, sends: { reverb: 0.16, delay: 0.14 }, width: 0.55 }), { user: o,
        synth: Object.assign({ vib: { rate: 5.6, cents: 14, delay: 0.3 }, amp: { a: kind === 'soft' ? 0.03 : 0.008, d: 0.25, s: 0.85, r: kind === 'soft' ? 0.35 : 0.18 }, mono: true, glide: 0.035, gain: 0.55 }, L),
      });
    };
    inst.choir = (o = {}) => {
      // formant 'aah' (shared formant bank on the bus) over a detuned saw ensemble with vibrato
      const split = new Tone.Gain(1), sumF = new Tone.Gain(1);
      for (const [f, q, g] of [[800, 5, 1], [1150, 7, 0.55], [2900, 9, 0.28], [3300, 10, 0.12]]) { const b = new Tone.Filter({ type: 'bandpass', frequency: f, Q: q }); const gg = new Tone.Gain(g * 3); split.chain(b, gg, sumF); }
      split.connect(new Tone.Gain(0.08).connect(sumF));
      const self = instrument('choir', 'choir', mixOf(o, { vol: -7.6, highpass: 140, sends: { reverb: 0.45 }, width: 0.8 }), { user: o,
        inserts: [{ input: split, output: sumF }],
        synth: { osc: [{ type: 'sawtooth', detune: -14, gain: 0.3 }, { type: 'sawtooth', detune: 0, gain: 0.3 }, { type: 'sawtooth', detune: 13, gain: 0.3 }], noise: { gain: 0.03, hp: 2000, sus: 1 }, filter: { freq: 3800, q: 0.5 }, vib: { rate: 4.8, cents: 16, delay: 0.25 }, amp: { a: 0.45, d: 0.5, s: 0.9, r: 0.9 }, gain: 0.5 },
      });
      return self;
    };
    inst.brass = (o = {}) => instrument('brass', 'brass', mixOf(o, { vol: -15, highpass: 70, eq: { bands: [[350, -2, 1], [2500, 1.5, 1]] }, sends: { reverb: 0.3 }, width: 0.6 }), { user: o,
      synthTrim: 8.9, key: 'brass', sample: { attack: (v) => 0.12 - 0.09 * v, release: 0.35, velFilter: (v) => 1500 + 10000 * v * v },
      synth: { osc: [{ type: 'sawtooth', detune: -5, gain: 0.4 }, { type: 'sawtooth', detune: 5, gain: 0.4 }], filter: { freq: 750, key: 0.5, vel: 1.2, q: 0.7, env: { amt: 2.2, a: 0.08, d: 0.4, s: 0.6 } }, vib: { rate: 5, cents: 6, delay: 0.5 }, amp: { a: 0.05, d: 0.3, s: 0.9, r: 0.22 }, gain: 0.55 },
    });

    // ======================= drums =======================
    // Synth one-shots are rendered in JS once per kit (exactly reproducible, cheap to trigger).
    function oneShot(dur, fn, ch = 1) {
      const n = Math.ceil(dur * SR), b = ctx.createBuffer(ch, n, SR);
      const data = []; for (let c = 0; c < ch; c++) data.push(b.getChannelData(c));
      fn(data, n);
      // fade the last 5 ms
      for (const d of data) for (let i = Math.max(0, n - Math.round(0.005 * SR)); i < n; i++) d[i] *= (n - i) / (0.005 * SR);
      return b;
    }
    const filtA = (x, type, f, q = 0.707, g = 0) => DSP.filt(x, DSP.biquad(type, f, SR, q, g));
    function synthKick({ f0 = 50, f1 = 160, sweep = 0.035, decay = 0.5, click = 0.25, drive = 0, dur = 1 } = {}) {
      return oneShot(dur, ([d], n) => {
        let ph = 0; const tau = decay / 6.9, r = rng(3);
        const k = 1 + drive * 5, nk = Math.tanh(k);
        for (let i = 0; i < n; i++) {
          const t = i / SR, f = f0 + (f1 - f0) * Math.exp(-t / sweep);
          ph += (2 * Math.PI * f) / SR;
          const env = Math.min(1, t / 0.0015) * Math.exp(-t / tau);
          let s = Math.sin(ph) * env;
          if (drive) s = Math.tanh(k * s) / nk;
          d[i] = s * 0.9 + (r() * 2 - 1) * click * Math.exp(-t / 0.0018);
        }
        filtA(d, 'hp', 25);
      });
    }
    function synthSnare({ tones = [180, 330], toneDecay = 0.1, noiseDecay = 0.17, hp = 1200, lp = 9000, tone = 0.55, nse = 0.6, sweep = 0.25 } = {}) {
      return oneShot(0.6, ([d], n) => {
        const nz = new Float32Array(n), r = rng(9);
        for (let i = 0; i < n; i++) nz[i] = r() * 2 - 1;
        filtA(nz, 'hp', hp); filtA(nz, 'lp', lp);
        const ph = tones.map(() => 0);
        for (let i = 0; i < n; i++) {
          const t = i / SR; let s = 0;
          tones.forEach((f, j) => { ph[j] += (2 * Math.PI * f * (1 + sweep * Math.exp(-t / 0.012))) / SR; s += Math.sin(ph[j]) / tones.length; });
          d[i] = s * tone * Math.exp(-t / (toneDecay / 6.9)) + nz[i] * nse * Math.exp(-t / (noiseDecay / 6.9)) * Math.min(1, t / 0.0008);
        }
      });
    }
    function synthClap({ bp = 1150, decay = 0.22, bright = 0 } = {}) {
      return oneShot(0.7, ([d], n) => {
        const r = rng(13);
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          let e = 0;
          for (const s of [0, 0.011, 0.021, 0.031]) if (t >= s) e += Math.exp(-(t - s) / (s === 0.031 ? decay / 6.9 : 0.0035)) * (s === 0.031 ? 1 : 0.8);
          d[i] = (r() * 2 - 1) * e;
        }
        filtA(d, 'bp', bp, 1.1); filtA(d, 'hp', 500); if (bright) filtA(d, 'highshelf', 4000, 0.7, bright);
      });
    }
    const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
    function synthMetal({ decay = 0.05, hp = 7000, bp = 10000, freqs = METAL, mult = 1, nse = 0.15, dur, ch = 1 } = {}) {
      return oneShot(dur || Math.min(3, decay * 1.3 + 0.05), (data, n) => {
        data.forEach((d, c) => {
          const ph = freqs.map((_, j) => (j * 0.37 + c * 0.11) % 1), r = rng(17 + c);
          for (let i = 0; i < n; i++) {
            let s = 0;
            for (let j = 0; j < freqs.length; j++) { ph[j] = (ph[j] + (freqs[j] * mult * (1 + c * 0.002)) / SR) % 1; s += ph[j] < 0.5 ? 1 : -1; }
            const t = i / SR;
            d[i] = (s / freqs.length + (r() * 2 - 1) * nse) * Math.exp(-t / (decay / 6.9)) * Math.min(1, t / 0.0004);
          }
          filtA(d, 'bp', bp, 0.6); filtA(d, 'hp', hp); filtA(d, 'hp', hp);
        });
      }, ch);
    }
    function synthTom(f0) { return synthKick({ f0, f1: f0 * 1.7, sweep: 0.06, decay: 0.45, click: 0.08, dur: 0.6 }); }
    function synthRim() {
      return oneShot(0.08, ([d], n) => { let a = 0, b = 0; for (let i = 0; i < n; i++) { const t = i / SR; a += (2 * Math.PI * 1720) / SR; b += (2 * Math.PI * 480) / SR; d[i] = (Math.sin(a) * 0.6 + (Math.sin(b) > 0 ? 0.4 : -0.4)) * Math.exp(-t / 0.006); } filtA(d, 'bp', 1600, 0.9); });
    }
    function synthCowbell() {
      return oneShot(0.5, ([d], n) => { let a = 0, b = 0; for (let i = 0; i < n; i++) { const t = i / SR; a = (a + 540 / SR) % 1; b = (b + 800 / SR) % 1; const s = (a < 0.5 ? 1 : -1) + (b < 0.5 ? 1 : -1); d[i] = s * 0.4 * (0.7 * Math.exp(-t / 0.012) + 0.4 * Math.exp(-t / 0.09)); } filtA(d, 'bp', 2400, 1.2); filtA(d, 'hp', 600); });
    }
    function synthShaker() {
      return oneShot(0.12, ([d], n) => { const r = rng(21); for (let i = 0; i < n; i++) { const t = i / SR; d[i] = (r() * 2 - 1) * Math.sin(Math.PI * Math.min(1, t / 0.09)) * Math.exp(-t / 0.03); } filtA(d, 'hp', 5000); filtA(d, 'bp', 9000, 0.7); });
    }
    function synthCrash(decay = 2.2) { return synthMetal({ decay, hp: 4000, bp: 8000, mult: 2.6, nse: 0.6, ch: 2 }); }

    // kit designs: per piece → source ('sample:<key>' or a synth buffer factory), level (dB), tune (semitones), sends
    const SYN = {
      '808': { kick: () => synthKick({ f0: 49, f1: 125, sweep: 0.03, decay: 0.75, click: 0.12, dur: 1.1 }), snare: () => synthSnare({ tones: [185, 335], toneDecay: 0.12, noiseDecay: 0.16, hp: 1600, tone: 0.6, nse: 0.45 }), clap: () => synthClap({ bp: 1100 }),
        hat: () => synthMetal({ decay: 0.045 }), openHat: () => synthMetal({ decay: 0.38 }), rim: synthRim, tom: [() => synthTom(85), () => synthTom(120), () => synthTom(165)], crash: () => synthCrash(), ride: () => synthMetal({ decay: 1.2, hp: 5000, bp: 9000, mult: 1.9, nse: 0.3, ch: 2 }), perc: synthCowbell, shaker: synthShaker },
      '909': { kick: () => synthKick({ f0: 54, f1: 290, sweep: 0.03, decay: 0.42, click: 0.35, drive: 0.25, dur: 0.6 }), snare: () => synthSnare({ tones: [190, 290], toneDecay: 0.09, noiseDecay: 0.22, hp: 1000, lp: 11000, tone: 0.45, nse: 0.8 }), clap: () => synthClap({ bp: 1300, bright: 3 }),
        hat: () => synthMetal({ decay: 0.06, nse: 0.5, hp: 8000 }), openHat: () => synthMetal({ decay: 0.45, nse: 0.5, hp: 7500 }), rim: synthRim, tom: [() => synthTom(95), () => synthTom(135), () => synthTom(180)], crash: () => synthCrash(1.8), ride: () => synthMetal({ decay: 1.4, hp: 5000, bp: 9000, mult: 2.2, nse: 0.35, ch: 2 }), perc: synthCowbell, shaker: synthShaker },
    };
    const KITS = {
      '808': { src: 'kit.808', syn: '808', bus: { vol: -2 }, pieces: {} },
      '909': { src: 'kit.909', syn: '909', bus: { vol: -2 }, pieces: { crash: { src: 'kit.acoustic' }, ride: { src: 'kit.acoustic' } } },
      acoustic: { src: 'kit.acoustic', syn: '909', bus: { vol: -1, comp: { threshold: -16, ratio: 2.5, attack: 0.015, release: 0.15 }, sends: { reverb: 0.08 } }, pieces: {} },
      lofi: { src: 'kit.acoustic', syn: '808', bus: { vol: -2, lowpass: 5500, highpass: 35, comp: { threshold: -20, ratio: 4, attack: 0.02, release: 0.2 }, eq: { low: 2, lowFreq: 120 } }, tune: -1.2, drive: 0.25, pieces: { kick: { layer: true } } },
      trap: { src: 'kit.808', syn: '808', bus: { vol: -2 }, pieces: { kick: { src: 'kit.909', level: -1 }, snare: { src: 'kit.909', layerClap: true }, clap: { src: 'kit.909' }, hat: { level: -1.5 }, crash: { src: 'kit.acoustic' } } },
    };
    // relative piece levels (dB, at vel 0.8) and sends — the drum bus is mixed so a basic beat is balanced
    const PIECE = {
      kick: { level: 0, pan: 0 }, snare: { level: -3, pan: 0, reverb: 0.12 }, clap: { level: -4, pan: 0, reverb: 0.15 }, hat: { level: -12, pan: 0.18, eq: { high: -3.5, highFreq: 7500 }, lowpass: 14000 }, openHat: { level: -13, pan: 0.18, eq: { high: -3.5, highFreq: 7500 }, lowpass: 14000 },
      rim: { level: -9, pan: -0.1, reverb: 0.08 }, tom: { level: -5, pan: 0, reverb: 0.1 }, crash: { level: -14, pan: -0.25, reverb: 0.06, eq: { high: -2, highFreq: 8000 } }, ride: { level: -15.5, pan: 0.3, eq: { high: -2.5, highFreq: 8000 } }, perc: { level: -13, pan: -0.3, reverb: 0.1 }, shaker: { level: -17, pan: 0.35 },
      cowbell: { level: -13, pan: -0.3 }, claves: { level: -12, pan: 0.3 },
    };
    // per-source loudness trims (dB) so every piece lands on its PIECE level whatever the source (measured, BS.1770)
    const TRIM = {
      'kit.808': { kick: 0, snare: 8.3, clap: -4.2, hat: 8.4, openHat: 0.4, rim: 8.1, tom: -1.3, crash: 2.1, perc: 5.3, cowbell: 5.3 },
      'kit.909': { kick: 0.2, snare: 6.5, clap: 8, hat: 14.5, openHat: 10.3, rim: 8.4 },
      'kit.acoustic': { kick: 6.2, snare: 8.4, clap: 13.5, hat: 7.3, openHat: 8, rim: 14.4, tom: 8.5, crash: 17.6, ride: 8.3, perc: 10, shaker: 4, cowbell: 6, claves: 4 },
      'syn.808': { snare: 9.8, clap: 13.1, hat: 26.7, openHat: 20, rim: 11.3, tom: 1.9, crash: 8.5, ride: 14.2, perc: 13, shaker: 6 },
      'syn.909': { kick: -4, snare: 5.5, clap: 11.3, hat: 18, openHat: 11.6, rim: 11.3, tom: 1.7, crash: 9, ride: 12.5, perc: 13, shaker: 6 },
    };
    inst.drums = (kitName = '808', o = {}) => {
      const K = KITS[kitName] || KITS['808'];
      const busName = 'drums' + (kitName === '808' ? '' : '-' + kitName);
      const bus = makeBus(busName, mixOf(o, { vol: -2 }, K.bus), K.drive ? [new Tone.WaveShaper(shaperCurve(K.drive), 2048), new Tone.Gain(dbToGain(-K.drive * 3))] : []);
      const rec = { name: bus.ch.channelName, kind: 'drums:' + kitName, source: 'synth' };
      used.push(rec);
      const zsets = {};
      const noSamples = o.synth || inst.preferSynth;
      const getZ = (key) => (zsets[key] = zsets[key] || (noSamples ? { list: [], p: Promise.resolve([]) } : zones(key)));
      for (const k of new Set([K.src, ...Object.values(K.pieces).map((p) => p.src).filter(Boolean)])) getZ(k).p.then((l) => { if (l.length) rec.source = 'samples'; });
      const synthCache = {};
      const synthBuf = (piece, n) => {
        const f = SYN[K.syn][piece];
        if (!f) return null;
        const key = piece + (Array.isArray(f) ? n : '');
        return (synthCache[key] = synthCache[key] || (Array.isArray(f) ? f[clamp(n, 0, f.length - 1)] : f)());
      };
      // per-piece strip: gain → panner → bus; kick gets its own duck-able channel for sidechain-free mixing
      const strips = {};
      const strip = (piece) => {
        if (strips[piece]) return strips[piece];
        const P = PIECE[piece] || PIECE.perc, KP = K.pieces[piece] || {};
        const ch = m.channel(rec.name + '.' + piece, { vol: P.level + (KP.level || 0) + (o.levels && o.levels[piece] || 0), pan: P.pan, sends: { reverb: P.reverb || 0 }, eq: P.eq, lowpass: P.lowpass, output: bus.input });
        return (strips[piece] = ch);
      };
      const rr = {};
      let openVoice = null;
      // per-piece pool of persistent gain slots (velocity / choke); only the buffer source is created per hit
      const hitPools = {};
      function hitBuf(piece, buf, t, v, gainDb, rate, dest, offset = 0) {
        const alloc = (hitPools[piece] = hitPools[piece] || pool(piece === 'crash' || piece === 'ride' ? 3 : 4, () => { const g = G(0); g.connect(toneIn(dest)); return { g }; }));
        const slot = alloc(t);
        const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
        const lv = velGain(v) * dbToGain(gainDb);
        const p = slot.g.gain;
        if (slot.stolen) { hold(p, t); p.linearRampToValueAtTime(lv, t + 0.002); } else { p.cancelScheduledValues(t); p.setValueAtTime(lv, t); }
        src.connect(slot.g);
        src.start(t, offset);
        const end = t + (buf.duration - offset) / rate;
        slot.busy = end;
        return { src, g: slot.g, end };
      }
      function trigger(piece, t, v, n) {
        const KP = K.pieces[piece] || {};
        const key = KP.src || K.src;
        let z = getZ(key).list.filter((e) => e.piece === piece || (piece === 'perc' && e.piece === 'cowbell' && key !== 'kit.acoustic'));
        if (piece === 'perc' && key === 'kit.acoustic') z = getZ(key).list.filter((e) => e.piece === 'perc');
        let tomShift = 0;
        if (piece === 'tom' && z.length) {
          // toms sorted low → high by rr; n: 0 low, 1 mid, 2 high (a 2-tom kit makes the mid from the high tom)
          const toms = z.slice().sort((x, y) => (x.rr || 0) - (y.rr || 0)), k = n == null ? 1 : clamp(n, 0, 2);
          if (toms.length >= 3) z = [toms[k]];
          else { z = [k === 0 ? toms[0] : toms[toms.length - 1]]; if (k === 1 && toms.length > 1) tomShift = -2.5; if (k === 1 && toms.length === 1) tomShift = 0; }
        }
        const dest = strip(piece);
        const tune = Math.pow(2, ((K.tune || 0) + (o.tune || 0) + tomShift) / 12);
        let voice = null;
        if (z.length) {
          // velocity layer + round robin
          let best = Infinity; for (const e of z) best = Math.min(best, Math.abs((e.vel || 1) - v));
          const layer = z.filter((e) => Math.abs((e.vel || 1) - v) <= best + 1e-6);
          const i = (rr[piece] = (rr[piece] || 0) + 1) % layer.length;
          const e = layer[i];
          voice = hitBuf(piece, e.buf, t, v, (e.gain || 0) - 2 + ((TRIM[key] || {})[piece] || 0), tune, dest, e.offset || 0);
        } else {
          const b = synthBuf(piece === 'cowbell' ? 'perc' : piece, n == null ? 1 : n);
          if (!b) return;
          voice = hitBuf(piece, b, t, v, -1 + ((TRIM['syn.' + K.syn] || {})[piece === 'cowbell' ? 'perc' : piece] || 0), tune, dest);
        }
        // layers
        if (piece === 'kick' && KP.layer) { const b = synthBuf('kick'); hitBuf('kick', b, t, v, -6, 1, dest); }
        if (piece === 'snare' && KP.layerClap) { const cz = getZ(KP.src || K.src).list.filter((e) => e.piece === 'clap'); if (cz.length) hitBuf('clap', cz[0].buf, t + 0.004, v, (cz[0].gain || 0) - 7, 1, dest, cz[0].offset || 0); else hitBuf('clap', synthBuf('clap'), t + 0.004, v, -7, 1, dest); }
        // hi-hat choke
        if (piece === 'openHat') openVoice = voice;
        else if (piece === 'hat' && openVoice) { if (t < openVoice.end) { const p = openVoice.g.gain; hold(p, t); p.linearRampToValueAtTime(0, t + 0.03); } openVoice = null; }
        if (piece === 'crash' || piece === 'ride' || piece === 'openHat') { /* long tails: let them ring */ }
      }
      const kickTimes = [];
      const kit = {
        name: rec.name, kit: kitName, channel: bus.ch, volume: bus.ch.volume, filter: bus.ch.filter, cutoff: bus.ch.cutoff, kickTimes,
        get source() { return rec.source; },
        /** channel strip of one piece (e.g. kit.strip('kick') for EQ / sends) */
        strip,
        play(piece, time, vel = 0.8, n) {
          const t = toSec(time, 0), v = clamp(vel == null ? 0.8 : vel, 0, 1);
          if (piece === 'kick') kickTimes.push(t);
          m._defer(t, () => trigger(piece, t, v, n));
          return kit;
        },
      };
      for (const p of ['kick', 'snare', 'clap', 'hat', 'openHat', 'rim', 'crash', 'ride', 'perc', 'shaker']) kit[p] = (t, v, n) => kit.play(p, t, v, n);
      kit.tom = (t, v, n = 1) => kit.play('tom', t, v, n);
      return kit;
    };

    // ======================= FX =======================
    let fxBus = null;
    const fxb = () => (fxBus = fxBus || makeBus('fx', { vol: -6, highpass: 25, sends: { reverb: 0.3 } }));
    const fxZ = {};
    const fz = (key) => (fxZ[key] = fxZ[key] || zones(key));
    function playBuf(buf, t, gainDb, o = {}) {
      const src = ctx.createBufferSource(); src.buffer = buf;
      if (o.rate) src.playbackRate.value = o.rate;
      const g = G(dbToGain(gainDb));
      src.connect(g); g.connect(o.dest || fxb().raw);
      const off = o.offset || 0;
      if (t < 0) { src.start(0, off - t); } else src.start(t, off);
      if (o.fadeAt != null) { g.gain.setValueAtTime(dbToGain(gainDb), o.fadeAt); g.gain.linearRampToValueAtTime(0, o.fadeAt + (o.fade || 0.02)); src.stop(o.fadeAt + (o.fade || 0.02) + 0.01); }
      return { src, g };
    }
    /** JS-rendered stereo sweep: noise through a moving band-pass, gain curve p→gain */
    function sweepBuf(dur, fFrom, fTo, gainCurve, { q = 1.2, pan = null, tone = null, seed = 31 } = {}) {
      return oneShot(dur, (data, n) => {
        data.forEach((d, c) => {
          const r = rng(seed + c);
          let x1 = 0, x2 = 0, y1 = 0, y2 = 0, co = null;
          let ph = 0;
          for (let i = 0; i < n; i++) {
            const p = i / n;
            if (i % 64 === 0) co = DSP.biquad('bp', fFrom * Math.pow(fTo / fFrom, p), SR, q);
            const v = r() * 2 - 1;
            const y = co[0] * v + co[1] * x1 + co[2] * x2 - co[3] * y1 - co[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y;
            let s = y * gainCurve(p);
            if (tone) { ph += (2 * Math.PI * tone(p)) / SR; s += Math.sin(ph) * 0.25 * gainCurve(p) + (((ph / (2 * Math.PI)) % 1) * 2 - 1) * 0.08 * gainCurve(p); }
            if (pan) { const a = (pan(p) + 1) * Math.PI / 4; s *= c === 0 ? Math.cos(a) * 1.41 : Math.sin(a) * 1.41; }
            d[i] = s;
          }
        });
      }, 2);
    }
    const fx = {};
    fx.riser = (t0, t1, o = {}) => {
      const a = toSec(t0), b = toSec(t1), dur = Math.max(0.2, b - a), v = o.vel != null ? o.vel : 0.8;
      fxb(); const sw = fz('fx.swell'), rs = fz('fx.riser');
      m._defer(a, () => {
        // noise sweep + rising detuned tone, cut right at t1
        const buf = sweepBuf(dur, o.from || 250, o.to || 9000, (p) => Math.pow(p, 1.8) * (p > 0.995 ? (1 - p) * 200 : 1), { q: 1.6, tone: o.tone === false ? null : (p) => 110 * Math.pow(4, p) });
        playBuf(buf, a, -10 + 20 * Math.log10(v + 1e-3));
        if (sw.list.length && dur > 1) { const s = sw.list[0]; playBuf(s.buf, b - s.buf.duration, -15 + 20 * Math.log10(v + 1e-3), { fadeAt: b - 0.01, fade: 0.03 }); }
        if (rs.list.length && dur > 2 && o.sample !== false) { const s = rs.list[0]; playBuf(s.buf, b - Math.min(s.buf.duration, dur), (s.gain || 0) - 19 + 20 * Math.log10(v + 1e-3), { offset: Math.max(0, s.buf.duration - dur), fadeAt: b - 0.01, fade: 0.03 }); }
      });
    };
    fx.downlifter = (t, dur = 2, o = {}) => {
      const a = toSec(t), d = toSec(dur), v = o.vel != null ? o.vel : 0.8;
      fxb();
      m._defer(a, () => playBuf(sweepBuf(d, 7000, 180, (p) => Math.pow(1 - p, 1.6) * Math.min(1, p * 60), { q: 1.4, tone: (p) => 380 * Math.pow(0.15, p), seed: 37 }), a, -9 + 20 * Math.log10(v + 1e-3)));
    };
    fx.whoosh = (t, dur = 1, o = {}) => {
      const a = toSec(t), d = toSec(dur), v = o.vel != null ? o.vel : 0.8;
      fxb(); const wz = fz('fx.whoosh');
      m._defer(a, () => {
        playBuf(sweepBuf(d, 400, 3500, (p) => Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 2), { q: 0.9, pan: (p) => (o.pan === false ? 0 : p * 1.6 - 0.8), seed: 41 }), a, -6 + 20 * Math.log10(v + 1e-3));
        if (wz.list.length && o.sample !== false) { const s = wz.list[d > 1.2 && wz.list[1] ? 1 : 0]; playBuf(s.buf, a, (s.gain || 0) - 13 + 20 * Math.log10(v + 1e-3), { rate: clamp(s.buf.duration / Math.max(0.3, d * 1.4), 0.7, 1.5) }); }
      });
    };
    fx.subDrop = (t, o = {}) => {
      const a = toSec(t), d = o.dur || 1.6, v = o.vel != null ? o.vel : 0.9;
      fxb();
      m._defer(a, () => {
        const buf = oneShot(d, ([x], n) => { let ph = 0; const f0 = o.from || 85, f1 = o.to || 32; for (let i = 0; i < n; i++) { const p = i / n, t2 = i / SR; ph += (2 * Math.PI * (f1 + (f0 - f1) * Math.exp(-t2 / (d * 0.3)))) / SR; x[i] = Math.tanh(1.6 * Math.sin(ph)) * 0.8 * Math.min(1, t2 / 0.004) * Math.pow(1 - p, 1.3); } });
        playBuf(buf, a, -2 + 20 * Math.log10(v + 1e-3));
      });
    };
    fx.impact = (t, vel = 1, o = {}) => {
      const a = toSec(t), v = clamp(vel, 0, 1), vdb = 20 * Math.log10(v + 1e-3);
      fxb(); const bd = fz('fx.bassdrum'), tp = fz('fx.timpani'), im = fz('fx.impact'), cl = fz('fx.clash'), gg = fz('fx.gong');
      m._defer(a, () => {
        // synth core: sub boom + body thump + noise crack
        const boom = oneShot(3, ([x], n) => {
          let ph = 0; const r = rng(51);
          for (let i = 0; i < n; i++) { const t2 = i / SR; ph += (2 * Math.PI * (34 + 70 * Math.exp(-t2 / 0.09))) / SR; x[i] = Math.tanh(1.8 * Math.sin(ph) * Math.exp(-t2 / 0.9)) * 0.8 + (r() * 2 - 1) * 0.5 * Math.exp(-t2 / 0.025); }
          filtA(x, 'lp', 5000);
        });
        playBuf(boom, a, -4 + vdb);
        if (bd.list.length) playBuf(bd.list[0].buf, a, -5 + vdb, { offset: bd.list[0].offset || 0 });
        if (tp.list.length) playBuf(tp.list[0].buf, a, -8 + vdb);
        if (im.list.length) { const s = im.list[o.variant || 0] || im.list[0]; playBuf(s.buf, a, (s.gain || 0) - 6 + vdb, { offset: s.offset || 0 }); }
        if (o.tail !== false) {
          if (gg.list.length && o.gong) playBuf(gg.list[0].buf, a, -10 + vdb);
          if (cl.list.length) playBuf(cl.list[0].buf, a, -12 + vdb);
          else playBuf(synthCrash(2.5), a, -16 + vdb);
        }
      });
    };
    fx.reverseCymbal = (tEnd, dur = 2, o = {}) => {
      const b = toSec(tEnd), d = toSec(dur), v = o.vel != null ? o.vel : 0.8;
      fxb(); const rc = fz('fx.revcymbal'), cy = fz('fx.cymbal');
      m._defer(b - d, () => {
        let src = cy.list.length ? cy.list[0].buf : synthCrash(Math.max(2, d + 0.5));
        const len = Math.min(src.length, Math.round(d * SR));
        const rev = ctx.createBuffer(src.numberOfChannels, len, SR);
        for (let c = 0; c < src.numberOfChannels; c++) { const s = src.getChannelData(c), r = rev.getChannelData(c); for (let i = 0; i < len; i++) r[i] = s[len - 1 - i] * Math.min(1, i / (0.05 * SR)); }
        playBuf(rev, b - len / SR, -10 + 20 * Math.log10(v + 1e-3));
        if (rc.list.length && o.sample !== false && d >= 1.2) { const s = rc.list[0]; const dd = Math.min(d, s.buf.duration); playBuf(s.buf, b - dd, (s.gain || 0) - 14 + 20 * Math.log10(v + 1e-3), { offset: s.buf.duration - dd }); }
      });
    };
    let rollKit = null;
    fx.snareRoll = (t0, t1, o = {}) => {
      const a = toSec(t0), b = toSec(t1);
      rollKit = rollKit || inst.drums(o.kit || 'acoustic', { mix: { vol: -4, sends: { reverb: 0.15 } } });
      const v0 = o.from != null ? o.from : 0.3, v1 = o.to != null ? o.to : 1;
      for (let t = a; t < b - 1e-4;) {
        const p = (t - a) / (b - a);
        rollKit.snare(t, v0 + (v1 - v0) * Math.pow(p, 1.3));
        t += m.spb * (p < 0.4 ? 0.5 : p < 0.75 ? 0.25 : p < 0.92 ? 0.125 : 1 / 12);
      }
      return rollKit;
    };
    fx.vinyl = (on = true, o = {}) => {
      if (on === false) return;
      const from = toSec(o.from, 0), to = toSec(o.to, info.duration + (info.tail || 0)), level = o.level != null ? o.level : -26;
      fxb(); const vz = fz('fx.vinyl');
      const vbus = makeBus('vinyl', { vol: level, highpass: 300, lowpass: 9000, sends: {} });
      m._defer(from, () => {
        // generated crackle + hiss loop (deterministic), plus the recorded crackle if available
        const loop = oneShot(5.3, (data, n) => {
          data.forEach((d, c) => {
            const r = rng(61 + c);
            for (let i = 0; i < n; i++) d[i] = (r() * 2 - 1) * 0.05;
            filtA(d, 'bp', 3500, 0.5);
            for (let k = 0; k < 90; k++) { const p = Math.floor(r() * (n - 300)), amp = Math.pow(r(), 3) * 0.9 * (r() > 0.5 ? 1 : -1); for (let j = 0; j < 200; j++) d[p + j] += amp * Math.exp(-j / 18) * (j % 2 ? -0.6 : 1); }
          });
        });
        const src = ctx.createBufferSource(); src.buffer = loop; src.loop = true;
        const g = G(0); src.connect(g); g.connect(vbus.raw);
        g.gain.setValueAtTime(0, from); g.gain.linearRampToValueAtTime(1, from + 1); g.gain.setValueAtTime(1, Math.max(from + 1, to - 1)); g.gain.linearRampToValueAtTime(0, to);
        src.start(from); src.stop(to + 0.05);
        if (vz.list.length) {
          const s = vz.list[0], src2 = ctx.createBufferSource(); src2.buffer = s.buf; src2.loop = true;
          const g2 = G(0); src2.connect(g2); g2.connect(vbus.raw);
          const lv = dbToGain((s.gain || 0) - 2);
          g2.gain.setValueAtTime(0, from); g2.gain.linearRampToValueAtTime(lv, from + 1); g2.gain.setValueAtTime(lv, Math.max(from + 1, to - 1)); g2.gain.linearRampToValueAtTime(0, to);
          src2.start(from); src2.stop(to + 0.05);
        }
      });
      return vbus.ch;
    };

    m.inst = inst;
    m.fx = fx;
    m.toMidi = m.toMidi || toMidi;
  });
})();
