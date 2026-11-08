// Loads the music extensions in order. Each extension pushes (m, Tone, info) => void into window.__musicExt.
// Files: instruments.js (sampled + synth instruments, FX), mix.js (channels, buses, sidechain, master), theory.js (harmony, grooves).
(function () {
  for (const f of ['mix.js', 'instruments.js', 'theory.js']) document.write('<script src="/runtime/music-ext/' + f + '"><\/script>');
})();
