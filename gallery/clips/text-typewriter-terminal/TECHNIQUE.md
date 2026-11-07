# Typewriter Terminal

A terminal window where commands type out at a human, slightly irregular pace with a blinking cursor, syntax colouring and output that prints instantly after each "enter".

## Use it for
- Dev tools, CLIs, SDK and API launches: "one command and it's done".
- AI/agent demos (prompt in, answer out), tutorials, code reveals.
- Any "typing" beat: a search query, a chat prompt, a note being written (use `~ ` lines and `showWindow: false`).

## Avoid when
- The audience is non-technical and the command means nothing to them — show the result instead.
- The script is long (10+ lines with long commands): typing time gets compressed until it looks fake. Split into two clips.
- You need real code highlighting for a language other than shell — the colouring is a bash-ish heuristic only.

## Anatomy
- `.tt` wrapper centred with `translate(-50%,-50%)`; `.win` panel (radius 20px, 1px edge ring + two big soft shadows, inset top highlight via `::before`).
- `.bar` title bar 58 px with three traffic-light dots and a centred title; hidden (and the panel made transparent) when `showWindow` is off → "bare" text with a text-shadow for footage.
- Themes are JS objects (`dark` GitHub-dark, `light` GitHub-light) written to CSS custom properties: `--panel --bar --edge --fg --dim --path --flag --str --num --ok --err`. The default neon accent is swapped for a darker green on the light theme.
- Script parsing: `$ ` = typed command with prompt (`path $`), `~ ` = typed text without prompt, anything else = output line. Output starting with `✓` gets `.ok`, `✗`/`error` gets `.err`. An idle prompt is appended after the last output if `finalPrompt`.
- Each typed character is its own `<span>` (with token class `k-cmd`/`k-flag`/`k-str`/`k-num` from a regex tokenizer); a zero-width `tail` span marks the caret position after the last char.
- `.scroll` inside a fixed-height `.body` (`maxLines × fontSize × 1.6 + 64`) — older lines scroll up by whole line heights.
- `.cur` is one absolutely positioned div (block / bar / underline sized from the measured width of an `M`), moved in `render(t)` to the anchor span's position.
- JetBrains Mono 500, `line-height: 1.6`, `white-space: pre-wrap; word-break: break-all`.

## Motion
- 0–0.45 s: window enters `opacity 0, scale .95, y 26 → 1, 1, 0` with `expo.out`. Whole clip: `win` scales 1 → 1.015 linearly (slow push).
- Schedule (computed once in setup, all in seconds): first prompt at 0.7 s; 0.32 s "thinking" pause before typing; each char takes `(1/cps) × (0.55 + rnd × 0.9)`, ×3.5 after punctuation, ×1.5 for spaces; "enter" pause 0.28 s after a command (0.15 s after `~` text); output prints 0.2 s after enter, 0.07 s between output lines.
- If the schedule does not fit, it is linearly compressed so typing ends before `D - exitDur - min(1.6, D×0.22)` — a guaranteed reading hold at the end.
- `render(t)` toggles `display` per line and `visibility` per character from `t` (no tweens), sets the scroll offset and positions the cursor.
- Cursor blink: solid while typing and for 0.12 s after any event, then a 0.53 s on/off blink derived from time since the last event — exactly like a real terminal.
- Exit: last `min(0.4, D×0.1)` s → `opacity 0, scale .97, y 14`, `power2.in`.
- The seeded `studio.random(seed)` jitter is what sells "human"; constant cps looks robotic.

## Adapt to the design system
- Map the theme to tokens: `--panel` → `surface`, `--bar` → a slightly lighter surface, `--fg` → `text`, `--dim` → `muted`, `--accent` (prompt `$`, command name, cursor) → `accent`. Keep the `ok/err` semantic colours unless the system defines them.
- Keep a monospace family (JetBrains Mono is the only bundled mono); the title bar can use the body font.
- Radius 20px → the system's large radius; shadows softer on light designs.
- 9:16: width is clamped to `studio.width - 160`; use `fontSize` 28–32, fewer `maxLines` (6–8), short commands (wrapping with `break-all` looks messy).
- Short durations: cut lines rather than raising cps beyond ~45 — compression already speeds things up. Long durations: keep cps 25–35 and let the idle prompt blink as the hold.

## Variations
- **AI prompt**: one `~ ` line typed into a chat-style input (`showWindow: false` inside your own UI card), answer as output lines.
- **Bare overlay**: no chrome, text shadow, typed over footage as a "hacker" caption.
- **Code reveal**: output lines as code with per-line colour classes; type only the first line.
- **Beat-typed**: snap each command's start (`it.at`) to `studio.beat(n)` and let output print on the next beat.
- **Error then fix**: an `✗ error` output, then a corrected command — a mini story in one clip.

## Pitfalls
- Never animate the typing with `setInterval`/real time — derive visibility from `t` as here.
- Per-char `visibility: hidden` (not `display:none`) keeps layout stable so the cursor and wrapping do not jump.
- Too-high `maxLines` with a short script leaves a big empty panel; the body height uses `min(maxLines, items.length)`.
- The light theme needs a darker accent — check contrast of the prompt colour against the panel.
- Long output lines wrap mid-word (`break-all`); keep them under the window width.

## Reference
Reference implementation: gallery/clips/text-typewriter-terminal/ (clip.js, style.css). Key snippet:

```js
    for (const it of items) {
      if (it.kind === 'out') { it.at = t + 0.2; t = it.at + 0.07; continue; }
      it.at = it.idle ? t + 0.25 : t; // line (prompt) appears
      t = it.at + (it.idle ? 0 : 0.32);  // small "thinking" pause before typing
      it.times = it.chars.map((s) => {
        const c = s.textContent;
        let d = (1 / cps) * (0.55 + rnd() * 0.9);
        if (/[.,;:!?]/.test(c)) d *= 3.5;
        else if (c === ' ') d *= 1.5;
        t += d;
        return t;
      });
      it.done = t;
      t += it.kind === 'cmd' ? 0.28 : 0.15; // "enter"
    }
    // compress the schedule so typing + a ≥1 s hold fit inside the item
    const exitDur = Math.min(0.4, D * 0.1);
    const avail = Math.max(0.5, D - exitDur - Math.min(1.6, D * 0.22) - 0.05);
    const total = t;
    const sc = total > avail ? (avail - enter) / Math.max(0.01, total - enter) : 1;
    const remap = (x) => enter + (x - enter) * sc;
```

```js
        const lastEvent = events.filter((x) => x <= tt).pop() || 0;
        const since = tt - lastEvent;
        const on = typing || since < 0.12 || Math.floor((since - 0.12) / 0.53) % 2 === 1;
```
