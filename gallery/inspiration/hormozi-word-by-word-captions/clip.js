// Word-by-word captions: a locked-off talking figure, and at chest height one chunk of 1–3 words at a time.
// Chunks hard-swap twice a second with a tiny pop; the key word of the phrase is set much heavier than the rest.
const CHUNKS = [            // '*' marks the key word
  ['the', 'only'], ['*THING'], ['you', 'really'], ['*NEED'],
  ['is', 'to'], ['*START', 'now'], ['and', 'then'], ['*REPEAT'],
];
const STEP = 0.5;
let head, mouth, cap, chunks;
studio.clip({
  duration: 4,
  setup(root) {
    kit.el(root, 'torso');
    kit.el(root, 'neck');
    head = kit.el(root, 'head');
    mouth = kit.el(head, 'mouth');
    cap = kit.el(root, 'cap');
    chunks = CHUNKS.map((words) => {
      const row = kit.el(cap, 'chunk');
      for (const w of words) kit.el(row, w[0] === '*' ? 'w key' : 'w', null, w.replace('*', ''));
      return row;
    });
  },
  render(t) {
    const { clamp, ease } = studio;
    const i = Math.min(CHUNKS.length - 1, Math.floor(t / STEP));
    const local = t - i * STEP;
    const pop = 0.86 + 0.14 * ease.outBack(clamp(local / 0.12));     // hard swap + a tiny pop, no fades
    chunks.forEach((row, k) => {
      row.style.visibility = k === i ? 'visible' : 'hidden';
      if (k === i) row.style.transform = `scale(${pop})`;
    });
    // the speaker keeps talking; the camera never moves
    const open = Math.abs(Math.sin(Math.PI * t * 4));
    mouth.style.height = 14 + open * 52 + 'px';
    head.style.transform = `rotate(${Math.sin(Math.PI * t) * 2.5}deg)`;
  },
});
