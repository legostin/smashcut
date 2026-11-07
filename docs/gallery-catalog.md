# Smashcut: catalog of 39 new motion-graphics templates (2025–2026 research)

**About the ranking.** No marketplace publishes sales numbers by category. VideoHive, Envato and Motion Array show bestseller sorts, but nothing I could pull as data. The ranking below is my own inference from how often a pattern came up across:
- marketplace listings (Envato Elements, VideoHive, Motion Array)
- creator-tool vendors (Submagic, ClipSpeed, BlitzCut, AutoAE, Hera)
- code showcases (Codrops, GSAP, Jitter, Remotion, HyperFrames)

The caption "retention lift" figures come from vendor blogs and are marketing-grade.

**Two sites blocked my fetches.** Codrops returned 403, so its demo details come from search snippets. GSAP pages were never opened (search snippets only), and I did not open any CodePen.

**Rules that apply to every spec:**
- Seek one master GSAP timeline to `t = frame/fps`. Never use wall-clock CSS animations. If CSS keyframes are used, pause them and drive them with a negative `animation-delay` or WAAPI `currentTime`.
- All randomness (scramble glyphs, grain, glitch, jitter) comes from a seeded PRNG keyed on frame and element index.
- Audio-reactive templates read a precomputed per-frame amplitude array, never live Web Audio.
- Timings assume 30fps and a 1920×1080 base, scaled by `min(w,h)` for 1080×1920.

---

## A. Captions (highest demand in short-form)

### 1. `caption-hormozi-bold` · captions · Hormozi Bold Captions · overlay
- **Why:** The default "business/education" look on Shorts, Reels and TikTok. Every caption tool ships a preset of it. Refs: https://www.submagic.co/blog/how-to-make-alex-hormozi-captions · https://fluxnote.io/guides/how-to-make-alex-hormozi-style-captions · https://www.clipspeed.ai/blog/11-caption-styles-ranked-viral-performance-2026.html
- **Look:** Montserrat Black / Anton style, ALL CAPS, 1–3 words per page, centred at about 65% height (9:16) or 75% (16:9). White fill, 10–14px black stroke (paint-order stroke), soft drop shadow. The active word is yellow (#FFE500) or green (#3CFF5A).
- **Motion:** Each page snaps in at scale 0.8→1.08→1.0 over 6 frames (back.out(3)). The active word grows to 1.12 when it turns on. Pages hard-cut with no fade-out. Optional 2° random tilt per page.
- **Technique:** DOM text per page plus GSAP timeline built from word timestamps (Remotion-style `createTikTokStyleCaptions` page grouping). The stroke uses `-webkit-text-stroke` with `paint-order`, falling back to multi text-shadow.
- **Params:** words[{text,start,end}], maxWordsPerPage, highlightColor, altHighlightColor, font, strokeWidth, uppercase, yPosition, emphasisWords[], emoji map.

### 2. `caption-mrbeast-pop` · captions · Beast Pop Words · overlay
- **Why:** Ranked as the top "viral" caption style. Oversized single words with heavy shadow and rotation. Refs: https://www.clipspeed.ai/blog/11-caption-styles-ranked-viral-performance-2026.html · https://www.clipspeed.ai/tools/caption-style-preview.html
- **Look:** One word at a time, huge (about 14% of frame height). Komika/Burbank-like rounded heavy face. White, or a yellow/green/red keyword. 3D offset hard shadow (6–8 stacked black text-shadows) plus outer stroke.
- **Motion:** Each word pops in at scale 0→1.25→1 over 5 frames with rotation from ±8° to a random ±3°. Keywords also squash-stretch (scaleY 1.15→1). A tiny 2px positional shake runs on hold, seeded.
- **Technique:** GSAP plus seeded jitter. The stacked text-shadow gives the extrude. No SplitText needed.
- **Params:** words[], keywordColors{}, shadowDepth, rotationRange, popScale, font.

### 3. `caption-pill-highlight` · captions · Pill / Box Highlight Captions · overlay
- **Why:** BlitzCut (a competitor) reports CapCut now applies pill backgrounds by default. "Dynamic minimalism" is described as the successor to the yellow-highlight look. Refs: https://blitzcutai.com/blog/tiktok-caption-trends-2026 · https://www.remotion.dev/templates/tiktok
- **Look:** Sentence-case Inter/SF Semibold over 1–2 lines. A rounded rect (radius 0.3em, brand colour) sits behind the active word only. Other words are white at 85% opacity.
- **Motion:** The pill slides and resizes between words: x and width tween over 4 frames, power3.out, measured from word bounding boxes. A new line rises 12px with a fade over 6 frames. A soft 4px blur-in on enter is optional.
- **Technique:** DOM spans with measured `getBoundingClientRect`. One absolutely positioned pill div tweened by GSAP. Fonts must be loaded before measuring (`document.fonts.ready`).
- **Params:** words[], pillColor, textColor, inactiveOpacity, radius, maxLines, font, position.

---

## B. Social / YouTube

### 4. `social-end-screen` · social · YouTube End Screen · full-frame (or overlay with keyed slots)
- **Why:** Present in nearly every "YouTube elements" pack. Required real estate for the last 5–20 seconds of a video. Refs: https://elements.envato.com/youtube-end-screens-after-effects-2GM3U6G · https://elements.envato.com/youtube-elements-pack-3P4PWMG
- **Look:** YouTube's safe zones: two 16:9 video placeholder frames (about 560×315) on the left and right, a circular subscribe slot (about 290px) in the centre-bottom, and a headline "WATCH NEXT" at top. Background is brand gradient or transparent. Placeholders have a thin outline and corner radius.
- **Motion:** Background wipes in at 0–0.5s. Placeholders scale 0.9→1 with an 8-frame stagger. The headline uses SplitText chars at 0.02s stagger. The subscribe ring is drawn with DrawSVG. Idle float of ±4px on a sine wave. Out: reverse over 0.4s.
- **Technique:** GSAP, SplitText, DrawSVG. Placeholders can be transparent holes so the editor layers real thumbnails underneath.
- **Params:** headline, slots layout (2 videos + sub | 1 video + playlist + sub), colors, avatar image, duration (5–20s).

### 5. `social-tweet-card` · social · Animated Post Card (X/Threads/Reddit) · overlay
- **Why:** A staple of commentary and Shorts. Jitter, Envato and tweet-to-MP4 tools all ship it. Refs: https://jitter.video/template/animated-tweet/ · https://twittershots.com/changelog/2026.8.30.14 · https://open-design.ai/skills/social-reddit-card/
- **Look:** A 900px-wide card (light/dark), radius 24px. Shows avatar, name, verified badge, @handle, body text (2–6 lines), optional image, and a metrics row (replies, reposts, likes, views). Reddit variant: vote rail plus subreddit meta.
- **Motion:** Card rises 60px, fades and scales 0.96→1 (expo.out, 0.6s). Body text reveals word by word (0.03s stagger). Metrics count up from 0 over 1.2s. The heart pops (scale 1.4 plus a burst of 6 seeded particles). Out: slide down and fade.
- **Technique:** DOM/CSS, GSAP, SplitText. Counters use a deterministic tween of a number object.
- **Params:** platform (x|threads|reddit|bluesky), theme, avatar, name, handle, verified, text, image, metrics{}, timestamp.

### 6. `social-chat-bubbles` · social · Text Message Conversation · overlay
- **Why:** Story-time and skit Shorts rely on fake iMessage/WhatsApp threads. There are many marketplace packs. Refs: https://videohive.net/item/text-message/57968330 · https://motionarray.com/motion-graphics-templates/imessage-whatsapp-telegram-347543/ · https://www.premiumbeat.com/blog/how-to-create-realistic-on-screen-text-messages
- **Look:** iOS-accurate bubbles: blue #0A84FF for sent, gray #E9E9EB / #262628 for received, with tail. SF-like 17pt font scaled up. An optional contact header and a "typing…" indicator.
- **Motion:** Each message is preceded by about 0.6s of typing dots (3 dots bouncing on a sine with phase offset). The bubble scales from its tail corner, 0.6→1.04→1 over 8 frames (back.out). The stack pushes up (y tween) when it overflows. Read receipt fades in.
- **Technique:** DOM plus GSAP. Bubble heights are measured up front so all layout is computed deterministically.
- **Params:** messages[{from:me|them,text,at}], style (ios|whatsapp|android), theme, contactName, avatar, showTyping.

### 7. `social-speaker-card` · social · Event / Speaker Announcement · full-frame
- **Why:** Conference, webinar and podcast-guest promos. Pairs with the existing countdown. Refs: https://hera.video/templates/product-launch-video-script · https://elements.envato.com/social-media-posts-296T9LL
- **Look:** Modular editorial grid (Swiss/bento). Large circular or arch-masked photo, name in display weight, role, session title, date/time chip, event logo. Accent shapes: circles and pill tags. Works at 1080×1920 and 1920×1080.
- **Motion:** Grid cells clip-reveal (inset 100%→0) with a 0.06s stagger. Photo mask scales 1.15→1 inside the mask. Name uses line-mask reveal. Chips slide in from the right. Hold. Out: cells collapse in reverse order.
- **Technique:** CSS grid, clip-path, GSAP, SplitText.
- **Params:** photo, name, role, talkTitle, date, time, location/url, logo, palette, layout variant.

---

## C. Lower-thirds

### 8. `lower-third-social-handle` · lower-thirds · Social Handle Cycler · overlay
- **Why:** Every YouTube essentials pack has a "lower third for social handles". Creators put it in almost every video. Refs: https://elements.envato.com/social-titles-ae-4B3ZKBP · https://elements.envato.com/subscribe-elements-YZPLXTK
- **Look:** Compact pill (height about 72px): platform icon disc on the left, @handle text, optional follower count. Platform brand colour fills the disc.
- **Motion:** Pill grows from the disc (width 72→auto, 0.5s expo.out) and the text masks in. Every 1.5s the icon morphs to the next platform (MorphSVG between icon paths, or a flip on rotateX). The handle text slides up and the disc colour tweens. Out: collapse back into the disc, then the disc scales to 0.
- **Technique:** GSAP, MorphSVG (icon paths need compatible structure, or use a crossfade fallback). Measure text widths.
- **Params:** handles[{platform,handle}], cycleDuration, position (BL/BR/TL), theme, showFollowers.

### 9. `lower-third-glass` · lower-thirds · Liquid Glass Name Plate · overlay
- **Why:** Apple's iOS 26 "liquid glass" spilled into motion. GarageFarm lists it among the more visible 2026 trends. Refs: https://www.cssscript.com/liquid-glass-distortion/ · https://webdesign.tutsplus.com/liquid-glass-effect-svg-filters--cms-109200t · https://garagefarm.net/blog/animation-trends-to-watch
- **Look:** A frosted rounded panel (radius 28px) showing name and title. 1px inner highlight on the top edge, subtle chromatic edge fringe, soft shadow.
- **Motion:** The panel morphs in from a small blob: border-radius plus scale 0.3→1 with an elastic.out(1,0.6) feel over 0.7s. A sheen highlight sweeps once across. Text fades up 8px. Out: shrinks back to the blob and fades.
- **Feasibility caveat:** `backdrop-filter` and SVG `feDisplacementMap` only refract what is inside the HTML page. On a transparent overlay there is no backdrop, so the glass looks flat when composited over video. Two options:
  - (a) Fake the look with gradient fill, highlight stroke and noise.
  - (b) Expose an optional `backgroundImage` param that is refracted inside the template.
- **Technique:** CSS gradients plus an SVG noise filter. Displacement only when a background is supplied.
- **Params:** name, title, tint, blurStrength, position, accentColor.

---

## D. Titles & kinetic typography

### 10. `title-line-mask-reveal` · titles · Editorial Line Mask Reveal · overlay
- **Why:** The most common premium title move: lines slide up from behind masks. Jitter's "Cascading Text" and the SplitText demos are built on it. Refs: https://bobo.jitter.video/template/cascading-text/ · https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/ · https://prod.jitter.video/template/blur-text-scroller/
- **Look:** 2–4 lines of large serif or grotesk (e.g. Editorial New / Neue Montreal), tight leading (0.95), left aligned. Optional small eyebrow label and thin rule.
- **Motion:** Each line goes yPercent 110→0 inside an overflow-hidden wrapper, 0.9s, ease expo.out (or `CustomEase "0.16,1,0.3,1"`), 0.08s stagger. Variant "blur": chars come from blur(12px) and opacity 0 with letter-spacing +0.2em→0. Hold. Out: lines go yPercent 0→-110 with stagger.
- **Technique:** SplitText `type:"lines"` with `mask:"lines"` (new SplitText API), GSAP timeline.
- **Params:** lines[] (or text with auto-wrap), eyebrow, font, size, align, variant (slide|blur|rotate), stagger, color.

### 11. `title-stomp-promo` · titles · Stomp / Beat Promo · full-frame
- **Why:** "Stomp" openers are a perennial top category on Envato and Motion Array: hard cuts of big words to a beat. Refs: https://elements.envato.com/stomp-opener-RLEBKSH · https://motionarray.com/after-effects-templates/stomp-37822 · https://elements.envato.com/big-text-mogrt-pp-RFBY884
- **Look:** One word or short phrase per beat, filling 70–90% of frame width. Black/white plus one accent, alternating inverted backgrounds. Heavy condensed sans (e.g. Druk / Anton). Occasional outline-only word and full-bleed colour flash.
- **Motion:** A new word on each beat (BPM param, e.g. 120 BPM = every 15 frames). Word enters at scale 1.3→1 over 3 frames with a 2-frame white flash. Every 4th beat: whip x-offset of ±200px with a motion-blur trail (stack of 3 offset ghosts at decreasing opacity). Background inverts on downbeats.
- **Technique:** GSAP timeline generated from the BPM grid. Ghost copies stand in for motion blur. No filters required.
- **Params:** words[], bpm, offsetFrames, palette[2–3], font, invertEvery, ghostTrail on/off.

### 12. `title-marquee-repeat` · titles · Repetitive Type Marquee · full-frame or overlay
- **Why:** The repetitive and wave typography demos are recurring Codrops hits (Jan 2026 dual-wave tutorial). Common in fashion and event promos. Refs: https://tympanus.net/codrops/?p=56972 · https://tympanus.net/codrops/2026/01/15/building-a-scroll-driven-dual-wave-text-animation-with-gsap/
- **Look:** 5–9 rows of the same word or phrase, full width, alternating filled and outline (`-webkit-text-stroke` 2px). The centre row is in accent colour.
- **Motion:** Rows scroll horizontally in alternating directions at constant speed, with x = speed × t mod repeat width. A sine-wave x offset per row (amplitude 40px, phase by row index) gives a wave. Rows enter staggered from opacity 0 and y 40. Optional: the centre row scales up 1→1.4 at mid-point.
- **Technique:** Pure math from t (deterministic). Duplicate text spans to loop seamlessly. GSAP for the enter and exit.
- **Params:** text, rows, speed, waveAmplitude, waveFrequency, fill/outline pattern, colors, font.

---

## E. Text effects

### 13. `text-scramble-decode` · text-effects · Scramble / Decode Text · overlay
- **Why:** GSAP's ScrambleText is in its official "Text" showcase category and has many decode-effect threads. The terminal-like typography demo on Codrops shows the hacker/tech look. Refs: https://gsap.com/docs/v3/Plugins/ScrambleTextPlugin/ · https://gsap.com/community/forums/topic/39662-scrambletextpluginsplittext-text-decoder-animation-scrambletextplugin-child-tween-duration/ · https://tympanus.net/codrops/2024/06/19/hover-animations-for-terminal-like-typography/
- **Look:** Monospace or grotesk headline. Unresolved glyphs show in dim accent (e.g. #00FF9C at 60%) from a charset like `01!<>-_\/[]{}—=+*^?#`. Resolved chars are in the final colour.
- **Motion:** Chars resolve left to right over 1.2s (revealDelay 0.2s). Each unresolved slot re-randomises every 2 frames. Optional second line decodes 0.3s later. Hold. Out: re-scramble and fade, or reverse decode.
- **Technique:** Use your own seeded implementation, not stock ScrambleText. ScrambleText uses `Math.random`, which breaks frame determinism. Per char: resolveFrame = start + i·k + seededJitter, and glyph = charset[hash(frame, i)].
- **Params:** text, charset, duration, direction (ltr|random|center-out), scrambleColor, finalColor, font.

### 14. `text-typewriter-terminal` · text-effects · Typewriter / Terminal · overlay
- **Why:** The "typewriter" caption style is in ClipSpeed's ranked list, and terminal and code reveals are standard in dev and AI content. Refs: https://www.clipspeed.ai/blog/11-caption-styles-ranked-viral-performance-2026.html · https://autoae.online/blog/hyperframes-examples
- **Look:** JetBrains Mono / IBM Plex Mono. Optional terminal window chrome: three dots, title bar, dark #0D1117 panel. Prompt `$` in accent, block cursor █ or a thin caret.
- **Motion:**
  - Chars appear at configurable CPS (e.g. 25) with seeded micro-variance and pauses at punctuation.
  - The cursor blinks with a 0.53s period, solid while typing.
  - Lines can "execute" by printing an output block instantly after a 0.2s delay.
  - Window enter: scale 0.95→1 with fade (0.4s).
- **Technique:** Compute visible substring from t. Use a CSS class for the cursor driven by t (not CSS animation). Optional Prism-style token colouring pre-computed.
- **Params:** lines[{prompt?,text,typed:boolean}], cps, cursorStyle, showWindow, theme, syntax (none|bash|js).

### 15. `text-neon-flicker` · text-effects · Neon Sign · overlay
- **Why:** "Neon sign kits" are a long-running marketplace category. Neon is also a ranked caption style and gaming staple. Refs: https://css-tricks.com/?p=340420 · https://codepen.io/watashi-xyz/pen/jEWORXJ · https://prototypr.io/news/how-to-create-neon-text-with-css
- **Look:** Script or monoline rounded font (Monoton / Neonderthaw style). White-hot core (#fff), layered text-shadow glow in one hue (0 0 4px, 10px, 20px, 40px, 80px). Optional tube "off" state in dim desaturated hue, and a backing wall-mount outline.
- **Motion:** Power-on sequence over 0–1.2s: a seeded flicker pattern (on/off steps at about 18/22/25/55% marks, like classic keyframes) driven by t. Then a steady glow with a ±5% breathing intensity. One letter can be marked "faulty" and keep flickering occasionally (seeded). Out: hard off with a brief afterglow fade.
- **Technique:** CSS text-shadow driven from JS per frame. Optionally use an SVG `feGaussianBlur` glow for stronger bloom. Glow must not clip at layer bounds (pad the container).
- **Params:** text, color, font, flickerIntensity, faultyLetterIndex, powerOnDuration, showBacking.

### 16. `text-gradient-shine` · text-effects · Gradient Sweep / Shine · overlay
- **Why:** The Apple-keynote and SaaS hero look, and the "Modern" gradient-fill caption style. Refs: https://www.clipspeed.ai/blog/11-caption-styles-ranked-viral-performance-2026.html · https://codemyui.com/gradient-neon-text-wave-like-effect-using-variable-font/
- **Look:** Big bold sans headline. Text filled with a multi-stop gradient (e.g. #7F5AF0→#2CB1FF→#FF6AD5) via `background-clip:text`. Variant "shine": base colour with a narrow white highlight band at 20° angle.
- **Motion:** Text reveals by word (y 30→0, blur 8→0, 0.06s stagger). Then gradient background-position sweeps 0%→100% over 2.5s (sine.inOut), or one shine pass at 1.5s. Optional variable-font weight wave (wght 300→800 per char with phase) where the font supports it.
- **Technique:** CSS `background-clip:text` plus a GSAP tween of background-position. Variable font via `font-variation-settings` per SplitText char.
- **Params:** text, gradientStops[], angle, mode (sweep|shine|wave), speed, font, weightRange.

### 17. `text-3d-extrude` · text-effects · Retro 3D Extrude Type · overlay
- **Why:** 3D/extruded text animation is a top Tuts+ / Motion Array title category (e.g. "Candy Shop 3D font", "Retro Glitter 3D Title"). The fake-3D look reads as premium without WebGL. Refs: https://motionarray.com/learn/motion-array/top-10-after-effects-typography-templates-download-today/ · https://motionarray.com/after-effects-templates/animated-letters/
- **Look:** Chunky rounded display font. Face colour plus 12–24 stacked offset layers in a darker shade create the extrude, angled down-right. Optional outline and long shadow. Palette: retro (cream face, red extrude, navy outline) or candy.
- **Motion:** Letters drop in from y -200 with bounce (bounce.out, 0.04s stagger). The extrude depth animates 0→full over 0.4s, so letters "pop out of the page". During hold, the extrude angle sways ±10° via a sine on the offset vector to fake rotation. Out: depth collapses, then letters scale to 0.
- **Technique:** N duplicated text layers (or a stacked text-shadow string rebuilt per frame) with GSAP. Use canvas 2D `fillText` loops if N is large for performance.
- **Params:** text, faceColor, extrudeColor, outlineColor, depth, angle, font, sway on/off.

---

## F. Callouts

### 18. `callout-hand-drawn` · callouts · Hand-drawn Annotation (circle / underline / box / highlight) · overlay
- **Why:** The Vox / Johnny Harris explainer look: marker circles and highlighter swipes over text, maps and screenshots. Rough Notation made it a web standard. Refs: https://github.com/rough-stuff/rough-notation · https://www.premiumbeat.com/blog/replicating-vox-motion-graphic/ · https://www.framer.com/marketplace/plugins/animated-text-highlighter/
- **Look:** Wobbly 2-pass marker strokes (stroke 6–10px, round caps, multiply blend for highlight) in red #E63946, yellow highlighter #FFE066 at 70%, or white. Types: circle, underline, box, strike, bracket, highlight, arrow-scribble.
- **Motion:** The stroke draws on over 0.5–0.8s (power2.inOut). Circle overshoots its start point by about 15%. The highlight wipes left to right with a slightly tilted leading edge. Several annotations sequence with 0.3s gaps. Hold. Out: fade 0.3s, or erase in reverse.
- **Technique:** Generate rough paths with a seeded roughjs-style generator. Animate stroke-dashoffset (DrawSVG equivalent). Target rects come from params, not DOM queries, because they overlay video.
- **Params:** annotations[{type,x,y,w,h,color,delay}], strokeWidth, roughness, seed, drawDuration.

### 19. `callout-spotlight-zoom` · callouts · Spotlight Focus · overlay
- **Why:** The main move in SaaS walkthroughs and tutorials: dim everything and focus one region with a label. Refs: https://autoae.online/hooks/saas-ui-animation-or-cursor-interaction-and-text-reveal-ugz6dep9 · https://hera.video/templates/mobile-app-demo-video
- **Look:** Full-frame dark scrim at 55–70% black with a rounded-rect or circular cutout (soft 20px feather) over the target. Thin accent outline ring around the cutout. Label card (title plus 1-line body) with a connector line to the cutout edge.
- **Motion:** Scrim fades in over 0.3s while the cutout shrinks from full-frame to the target rect (0.7s expo.inOut). Ring draws on. Label slides 20px toward the target and fades in. It can hop to a second target (cutout morphs position and size, label re-anchors). Out: cutout expands to full-frame and the scrim fades.
- **Technique:** SVG mask (rect with feGaussianBlur feather) or CSS `mask-image` radial gradient. GSAP tweens the mask rect attrs.
- **Params:** targets[{x,y,w,h,shape,label,body,labelSide}], dimOpacity, accent, radius, holdPerTarget.

---

## G. Product / UI

### 20. `product-cursor-demo` · product · Cursor Click Walkthrough · overlay (or full-frame with screenshot)
- **Why:** Templates that show a cursor moving to a button, clicking, then moving on are the core of SaaS launch videos made without screen recording. Refs: https://autoae.online/blog/how-to-make-product-demo-video-without-screen-recording · https://autoae.online/hooks/saas-launch-video-10-media-cursor-selection-showcase-zxadkpad · https://elements.envato.com/ai-saas-product-launch-video-WJQ3WXT
- **Look:** macOS-style arrow cursor (white with black outline, soft shadow), scaled 1.5–2× for video. Click ripple ring in accent. Optional typed text into an input, and a tooltip "Click Export".
- **Motion:**
  - Cursor travels along a slight arc (quadratic bezier through a midpoint offset 10% of the distance) with power2.inOut, 0.6–1.0s per hop.
  - On click, the cursor scales 0.85 over 3 frames, the ripple expands to 60px and fades, and the target region gets a 1.03 scale bump.
  - An optional camera move zooms the whole screenshot (scale 1→1.6, transform-origin at the target) and eases back.
- **Technique:** GSAP with MotionPath, or manual bezier interpolation. Camera zoom is a transform on the screenshot container.
- **Params:** screenshot (optional), steps[{x,y,action:move|click|type,text?,zoom?}], cursorStyle, accent, rippleColor.

### 21. `product-phone-mockup` · product · App Promo Phone · full-frame or overlay
- **Why:** "App promo / phone mockup" is one of VideoHive's deepest categories, now refreshed for iPhone 16/17 Pro. Refs: https://videohive.net/item/app-promo-3d-phone-mockup/49665489 · https://elements.envato.com/mobile-app-promo-17-pro-max-mockup-presentation-PT2PBFW
- **Look:** CSS-built modern phone: rounded rect (radius 13% of width), titanium bezel gradient, dynamic island, side-button nubs. The screen holds an image or video. A soft floor shadow and a large headline and feature bullets sit beside it.
- **Motion:**
  - Phone rises from below with rotateX 25°→0 and rotateY -20°→-8° (CSS perspective 2000px), 1.0s expo.out.
  - Screens change by vertical slide inside the screen mask every N seconds.
  - During hold, a slow 3D sway of ±4° rotateY, and a light glare band sweeps across the glass.
  - Optional: a second and third phone fan out behind.
- **Technique:** CSS 3D transforms with no WebGL. The bezel is layered gradients. Only fake shading is possible (gradient overlays tied to rotation).
- **Params:** screens[] (img/video), headline, bullets[], deviceColor, layout (center|left|fan3), swayAmount, orientation.

### 22. `product-browser-window` · product · Browser Window Reveal · overlay or full-frame
- **Why:** The "browser window opening on a product URL" beat appears in nearly every SaaS launch and landing-page hero video. Refs: https://autoae.online/blog/how-to-make-saas-landing-page-hero-video-without-after-effects · https://autoae.online/hooks/saas-launch-video-3d-movement-website-mockup-gallery-uwjuleu5
- **Look:** Minimal browser chrome (light or dark): traffic lights, address bar pill with lock icon, tab. Content is a tall screenshot. Radius 14px, big soft shadow.
- **Motion:** Window scales 0.9→1 with y 40→0 (0.7s). The URL types character by character. Content does a skeleton shimmer, then crossfades to the screenshot. Then an auto-scroll of the long screenshot (translateY, sine.inOut) with optional pauses at sections. Optional 3D tilt (rotateX 12° to flat) on entrance.
- **Technique:** DOM/CSS plus GSAP. The screenshot is an image clipped to the viewport.
- **Params:** url, screenshot, scrollStops[], theme, tilt on/off, tabTitle, favicon.

---

## H. Infographics / data

### 23. `infographic-bar-race` · infographics · Bar Chart Race · full-frame
- **Why:** A huge YouTube genre (data channels). Flourish, amCharts and HyperFrames all ship one, and AE users ask for it constantly. Refs: https://helpcenter.flourish.studio/hc/en-us/articles/8761566757647-Bar-chart-race-an-overview · https://www.amcharts.com/demos/bar-chart-race/ · https://open-design.ai/plugins/video-template-hyperframes-data-bar-chart-race/
- **Look:** Top N (10) horizontal bars, each with a label, optional icon or flag at the bar end, and a value. A big period label (year) bottom-right in a light weight. Gridlines with an auto-rescaling axis.
- **Motion:** Interpolate values between keyframes (periods) linearly or with smoothstep. Rank changes animate y position over about 0.4s (power2.inOut). The axis max eases toward the current leader. Value labels count. Bars enter and exit at the bottom with a fade.
- **Technique:** Pure function of t → state, rendered to DOM or canvas 2D (canvas is faster for many rows). No d3 transitions, since those are time-based.
- **Params:** data CSV/JSON (period × series), topN, periodDuration, colors map, icons map, title, valueFormat.

### 24. `infographic-donut-chart` · infographics · Donut / Pie Breakdown · overlay
- **Why:** Radial and donut graph packs are standard in Envato infographic bundles. Second only to bar charts in explainers. Refs: https://elements.envato.com/minimal-round-graphs-RJSMR9Z · https://elements.envato.com/pie-charts-GPQGJ7K · https://videohive.net/item/infographics-pack/56674306
- **Look:** Donut (thickness 18–22% of radius), 3–6 segments with 2–3° gaps, rounded caps optional. Big centre stat (e.g. "64%") plus a small label. Legend list beside it with colour dots and values.
- **Motion:** Segments sweep in sequentially clockwise from 12 o'clock (each about 0.4s, power3.out, slight overlap). The centre number counts to the highlighted segment. Legend rows stagger in. A highlight can be emphasised: one segment pops out 12px radially and the others dim to 40%.
- **Technique:** SVG arcs via stroke-dasharray on circles (simplest), or path arcs. GSAP tweens per segment.
- **Params:** segments[{label,value,color}], highlightIndex, thickness, gapDeg, centerLabel, showLegend, valueFormat.

### 25. `infographic-timeline` · infographics · Milestone Timeline · overlay or full-frame
- **Why:** History, company and "how we got here" segments. Timeline and process kits are standard Envato items. Refs: https://elements.envato.com/timelines-32MSMZY · https://videohive.net/item/infographics-pack/56674306
- **Look:** Horizontal (16:9) or vertical (9:16) spine line with node dots. Each milestone card holds a year, title, 1-line text and optional icon or image. Past nodes are filled, upcoming ones outlined.
- **Motion:** The spine draws on progressively (DrawSVG / scaleX). On reaching each node, the dot pops (scale 0→1.2→1) and the card rises from the line (alternating above and below). When the timeline is wider than the frame, a camera pan tracks the progress head (translateX of the whole track, sine.inOut).
- **Technique:** SVG line plus DOM cards, GSAP timeline. Camera via container transform.
- **Params:** items[{date,title,text,icon?}], orientation, perItemDuration, colors, cameraFollow on/off.

### 26. `infographic-versus-compare` · infographics · Versus / Comparison Split · full-frame
- **Why:** "VS split screens" and comparison and before/after packs are a whole marketplace sub-category (product reviews, sports, "X vs Y" videos). Refs: https://monsterone.com/after-effects-templates/vs-versus-split-screens-v-o251577/ · https://videohive.net/item/comparison-pack/52361928 · https://videohive.net/item/vertical-before-and-after-pack/60151516
- **Look:** Two halves in contrasting colours (e.g. blue / orange) split by a diagonal seam. Each side has a title or logo and image. A centre "VS" badge. Below, 3–6 comparison rows with mirrored bars and values; the winner per row gets a checkmark or glow.
- **Motion:** Halves slam in from the left and right (0.5s expo.out), the seam flashes, and the VS badge punches in (scale 2→1 with a shake). Rows animate mirrored bars growing from the centre outward with 0.15s stagger, and values count. The winner highlight pulses once.
- **Technique:** clip-path polygons for diagonal halves, DOM bars, GSAP.
- **Params:** left{name,image,color}, right{...}, rows[{label,left,right,higherIsBetter}], seamAngle, orientation.

### 27. `infographic-wrapped-bento` · infographics · Year-in-Review Stat Bento · full-frame
- **Why:** The Spotify Wrapped and GitHub Unwrapped "personal recap" format is copied every December. HeyGen's own showcase uses count-up stat architecture. Refs: https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025 · https://www.githubunwrapped.com · https://developers.heygen.com/motion-graphics
- **Look:** Bento grid of 4–6 tiles in mixed sizes. Bold saturated "visual mixtape" palette (lime, hot pink, electric blue on near-black), big numbers in an ultra-heavy face, small labels, optional avatar or cover art. Rotated sticker shapes.
- **Motion:** Tiles flip or scale in one by one, each over about 0.5s with back.out. Numbers count up (expo.out over 1.2s). Shapes rotate slowly. Optional scene mode, one stat per full-screen beat, with a hard colour-block wipe between beats.
- **Technique:** CSS grid plus GSAP. Counters use deterministic tweens with Intl.NumberFormat.
- **Params:** stats[{value,label,prefix,suffix,icon?}], title, palette, mode (bento|sequence), avatar.

---

## I. Maps

### 28. `map-route-flight` · maps · Travel Route / Flight Path · overlay or full-frame
- **Why:** Travel-map toolkits are perennial best-sellers (VideoHive Map Route Generator, Flight Maps, Motion Array flight map). Refs: https://videohive.net/item/map-route-generator/21686169 · https://elements.envato.com/flight-maps-visualize-where-youre-travelling-VJRYQX2 · https://motionarray.com/after-effects-templates/flight-map-template-82274
- **Look:** Stylised world or regional map (flat land #E8E2D6 and sea #A9C9D9, or dark mode). Dashed great-circle arc between cities (stroke 4px, dash 10/8). A plane, car or train icon rides the path, rotated to the tangent. City pins carry name labels, with an optional distance or duration chip.
- **Motion:** Origin pin drops (y -40→0 with bounce, 0.4s). Camera eases to frame the route (scale and translate). The path draws on while the icon follows (2–4s, sine.inOut). Destination pin pops, label slides out, and a pulse ring emits from the pin. Multi-leg routes chain the legs.
- **Technique:** Pre-projected SVG world map (Natural Earth, equirectangular or Robinson) bundled as a static asset. Project lat/lng in JS, quadratic arcs for the curve. DrawSVG or dashoffset with a dashed mask (draw-on of a dashed line needs a mask path). MotionPath for the icon with autoRotate.
- **Params:** stops[{name,lat,lng}], vehicle (plane|car|train|ship), mapStyle, colors, legDuration, showDistance, cameraFollow.

### 29. `map-pin-highlight` · maps · Country Highlight + Pin (Vox style) · full-frame
- **Why:** The Vox / Johnny Harris map look (zoom to region, highlight border, label) is among the most imitated explainer styles. Refs: https://nofilmschool.com/how-create-vox-style-map-animations-after-effects · https://www.everviz.com/blog/bring-your-maps-to-life-introducing-marker-animations/ · https://elements.envato.com/map-marker-YBPH2MC
- **Look:** Paper-textured or muted map with country borders. The target country fills in accent colour (often red #D7263D), border stroke animated, neighbours desaturated. Pin plus label tag in condensed caps. Optional grain overlay and slight vignette.
- **Motion:** Starts zoomed out, then a 2.5s camera push (scale 1→4, power2.inOut) toward the country centroid. The border draws on (DrawSVG, 1s), the fill wipes in, and the pin drops with a ripple. Label slides from the pin. Optionally a second country highlights while the camera reframes.
- **Technique:** Bundled SVG country paths (ISO codes as ids), GSAP camera on an SVG group transform. Paper texture is a static image or SVG noise.
- **Params:** countries[] (ISO codes), pins[{lat,lng,label}], accent, mapStyle (paper|dark|flat), zoomLevel, grain.

---

## J. Logos

### 30. `logo-line-draw` · logos · Line-Draw Logo Sting · overlay
- **Why:** The classic DrawSVG reveal (strokes draw in sequence, then the fill fades in). It also matches the "quiet micro-motion" logo trend for 2026. Refs: https://www.renderforest.com/blog/logo-animation-trends · https://css-tricks.com/?p=210380 · https://tympanus.net/codrops/2025/05/14/from-splittext-to-morphsvg-5-creative-demos-using-free-gsap-plugins/
- **Look:** The user's SVG logo. Strokes in accent at about 2px (scaled to logo), then the fill crossfades in. Wordmark beneath appears with letter-spacing tightening. Optional tagline.
- **Motion:** Paths draw in sequence (drawSVG "0%"→"100%", 0.8s each, overlapping 60%, power2.inOut). Fill fades over 0.4s while the stroke fades out. Then a subtle settle: scale 1.02→1 and a single shine pass. Wordmark tracks in from letter-spacing 0.5em→0.05em. Total 3–4s, plus an optional 1.5s short "sting" variant.
- **Technique:** DrawSVG, or a hand-rolled stroke-dashoffset with `getTotalLength`. Requires an SVG with stroke-able paths; fill-only logos get an auto-generated stroke equal to the path outline.
- **Params:** logoSvg, wordmark, tagline, strokeColor, fillColor(s), drawDuration, variant (full|sting).

### 31. `logo-shape-assemble` · logos · Geometric Shape Build · overlay or full-frame
- **Why:** "Organic morphing" and "kinetic wordmark" logo trends. Shape-assemble reveals are a top-selling logo-reveal sub-genre. Refs: https://www.renderforest.com/blog/logo-animation-trends · https://developers.heygen.com/motion-graphics
- **Look:** 4–8 primitive shapes (circles, pills, triangles, squares) in brand palette that fly, bounce and morph into the logo mark. Flat colours, crisp, no gradients (or a subtle soft 3D shadow variant).
- **Motion:** Shapes enter from the edges on curved paths with overshoot (back.out), orbit the centre briefly (0.6s), then MorphSVG into the logo's sub-paths (0.5s, power3.inOut). A white flash ring expands. The wordmark slides out from behind the mark (x mask). Total about 3.5s.
- **Technique:** GSAP, MorphSVG. Logo paths must be split into N pieces; when the user's SVG has fewer paths, fall back to "shapes converge, then crossfade to the logo".
- **Params:** logoSvg, wordmark, palette[], shapeCount, sound-sync markers (frame numbers for SFX hits).

---

## K. Transitions (graphic cover/uncover on a transparent layer)

### 32. `transition-shape-overlay` · transitions · Gooey Wave Cover · overlay (covers the cut)
- **Why:** The Codrops shape-overlay and morphing page-transition demos remain the reference for curved, gooey wipes. Liquid and fluid transitions are a top pack category. Refs: https://tympanus.net/codrops/?p=32699 · https://tympanus.net/codrops/2017/08/08/morphing-page-transition · https://github.com/ykob/shape-overlays
- **Look:** 2–4 stacked layers in brand colours. The leading edge is a wavy bezier curve (6–10 control points with per-point delay), so the edge bulges organically.
- **Motion:** Layers sweep bottom→top (or along a chosen direction), each point with offset delay (0–0.15s) and power2.inOut. The frame is fully covered at the midpoint, which is the cut point and is exposed as a marker param. Then the layers continue off the top. Total 0.8–1.2s.
- **Technique:** SVG path recomputed per frame from t (pure function, deterministic). No MorphSVG needed.
- **Params:** colors[], layers, direction, points, duration, cutPointFrame (read-only output), waviness.

### 33. `transition-whip-streaks` · transitions · Whip Pan Streaks · overlay
- **Why:** Whip pans and "instant camera" transitions are among the most-downloaded transition styles in every 2025 pack roundup. Refs: https://www.freevisuals.net/templates/instant-camera-transitions-adobe-premiere-pro · https://misterhorse.com/products/transitions-for-premiere-pro/3280 · https://speckyboy.com/transition-packs-premiere-pro.md
- **Look:** 8–20 horizontal bands of varying height in palette colours (or white with motion blur) streaking across. Speed lines with soft ends. Optional white flash frame at the cut.
- **Motion:** Bands enter from the left with staggered random-but-seeded delays (0–6 frames) at very high velocity (expo.in), cover the frame by frame 8–10, then exit right (expo.out). Total about 18 frames. Each band carries a blurred "ghost" tail (`filter: blur` on x only isn't possible, so use a gradient-faded tail element).
- **Feasibility caveat:** this is a graphic whip. A true whip pan (blurring the underlying footage) would need the editor to blur clips; a separate effect is recommended.
- **Technique:** DOM bands plus seeded PRNG, GSAP.
- **Params:** palette[], bandCount, direction, duration, flashAtCut, seed.

### 34. `transition-ink-blob` · transitions · Ink / Liquid Blob Reveal · overlay
- **Why:** Ink and fluid transitions ("20 ink drawing-style animations", fluid ink packs) are a stable pack category, especially for lifestyle and wedding work. Refs: https://speckyboy.com/?p=161069 · https://designshack.net/articles/inspiration/premiere-pro-transitions-effects/
- **Look:** One-colour (or 2-tone) organic blots growing from 3–5 seed points, merging with gooey edges and fine splatter droplets.
- **Motion:** Blobs grow from their seeds with radius by easeInCubic and staggered starts. Edges wobble via a noise-modulated radius. Full cover by about 0.6s, then they shrink away or dissolve with the reverse blob order.
- **Technique:** Canvas 2D. Draw circles with noise-perturbed radius per angle step (polygon), merge by filling one path, and apply a "goo" threshold via an SVG filter (`feGaussianBlur` + `feColorMatrix` alpha contrast) on the canvas element. Seeded simplex noise.
- **Params:** color(s), seeds count or positions, duration, edgeNoise, splatter amount, seed.

---

## L. Broadcast / news

### 35. `broadcast-breaking-news` · broadcast · Breaking News Package · overlay
- **Why:** News broadcast packages (opener, breaking, straps, ticker) are a dedicated VideoHive category with many current listings. Commentary YouTubers use them ironically and seriously. Refs: https://motionarray.com/after-effects-templates/breaking-news-graphics-package-40219/ · https://motionarray.com/after-effects-templates/news-broadcast-pack-1007702/ · https://videohive.net/item/breaking-news-4k/56599523
- **Look:** Lower-third strap: a red "BREAKING NEWS" block with an angled edge, white headline bar, small navy subheadline bar, LIVE bug with pulsing dot, location tag, clock. Bold condensed sans (Roboto Condensed / Oswald), glossy subtle gradient, thin highlight lines.
- **Motion:** Red block extends from the left (0.35s expo.out) with a light sweep across it. The headline bar unfolds (scaleX from the red block's edge) and the text slides up from a mask. Subheadline appears 0.2s later. "BREAKING" flips 3D (rotateX) to the alt label every 4s. LIVE dot pulses at 1Hz. Out: reverse in 0.4s.
- **Technique:** DOM/CSS plus GSAP. Clock text is computed from a start-time param (deterministic, not `Date.now()`).
- **Params:** label, headline, subheadline, location, startTime, liveBug on/off, palette (red|blue|custom), logo.

### 36. `broadcast-ticker-bug` · broadcast · News Ticker + Station Bug · overlay
- **Why:** The ticker crawl is the most reused piece of every news package and also works for stream and event headlines. Refs: https://aejuice.com/blog/how-to-create-and-edit-a-news-ticker-in-adobe-after-effects/ · https://motionarray.com/after-effects-templates/breaking-news-graphics-package-40219/
- **Look:** Full-width bottom bar (height about 56px). A left category box ("MARKETS", "LATEST") and a crawling headline stream separated by bullet or logo glyphs. Optional top-corner station bug (logo plus "LIVE") and clock or weather chip.
- **Motion:** Bar wipes in (0.4s). The crawl moves at constant px/s, with x computed from t over a duplicated strip for a seamless loop. The category box flips to the next category every N seconds in sync with headline groups. The bug fades in with a slight scale.
- **Technique:** Pure t-driven translate. Measure strip width once after fonts load.
- **Params:** items[{category?,text}], speed (px/s), separator, palette, bug{logo,label}, clock on/off, startTime.

---

## M. Audio / podcast

### 37. `audio-audiogram` · audio · Podcast Audiogram · full-frame
- **Why:** The standard way to promote podcast clips. Remotion ships an official template, and Wavve, Headliner, Descript and Riverside all sell this format. Refs: https://www.remotion.dev/templates/audiogram · https://www.buzzsprout.com/blog/podcast-audiograms-tips · https://riverside.com/blog/audiogram-podcast
- **Look:** 1:1, 9:16 or 16:9. Cover art (rounded, with shadow) at top, show and episode title, a waveform (40–64 rounded bars, mirrored) in accent, live captions (word highlight), a progress bar with elapsed time. Blurred cover art as the backdrop.
- **Motion:** Bars scale in height from a per-frame amplitude array (smoothed attack 2 frames, release 6). Captions page through with the active word highlighted. The progress bar is linear. Cover art does a gentle Ken Burns (scale 1→1.04). Intro: elements stagger in over 0.6s.
- **Technique:** The amplitude array must be precomputed offline (FFT/RMS per frame) and passed as data. Bars are drawn with DOM or canvas 2D. Captions reuse the caption engine.
- **Params:** audio amplitudes[] or spectrum[][], coverArt, showName, episodeTitle, captions words[], accent, barCount, waveStyle (bars|line|mirrored), aspect.

### 38. `audio-radial-visualizer` · audio · Radial Music Visualizer · overlay or full-frame
- **Why:** Circular visualisers are the default for music uploads, lo-fi streams and DJ promos, and are cited as a modern audiogram style. Refs: https://cleanvoice.ai/audio-visualizer/ · https://riverside.com/blog/audio-waveform
- **Look:** Circular artwork or logo in the centre (with border ring), surrounded by 96–180 radial bars or a smooth closed spectrum line, colour gradient around the circle. Optional particle field and glow. Track title and artist below.
- **Motion:**
  - Bars extend from the spectrum data (mirrored left/right for symmetry), and the centre artwork scales with bass energy (1→1.06).
  - Slow rotation of the ring (6°/s), and the glow intensity follows RMS.
  - Particles drift outward faster on kicks.
- **Technique:** Canvas 2D, with spectrum frames precomputed (e.g. 64 bins per frame). Particle positions use seeded deterministic integration from t (closed-form or re-simulated from frame 0).
- **Params:** spectrum[][], artwork, title, artist, colors[], barCount, style (bars|line|dots), rotationSpeed, particles on/off.

---

## N. Backgrounds

### 39. `bg-gradient-mesh-grain` · backgrounds · Animated Mesh Gradient + Grain · full-frame
- **Why:** "Grainy mesh gradients" (Stripe-style auroras) are among the most-cloned hero backgrounds in Framer and 21st.dev. Analog grain and texture is a top 2026 trend. Refs: https://www.framer.com/marketplace/components/grainy-mesh-gradient · https://hiredigital.com/tools/animated-gradient-generator · https://www.brickslablib.it.com/components/noisemeshbackground
- **Look:** 4–6 large soft colour blobs (radius 40–70% of frame) blending on a base colour, plus a fine monochrome film grain (opacity 6–12%). Palettes: sunset, aurora, mono-brand. Optional subtle vignette.
- **Motion:** Each blob centre moves on a slow Lissajous path (period 8–20s, deterministic from t) with scale breathing. The grain re-seeds every 2 frames (film look) or stays static (paper look). Loopable when the periods divide the loop length.
- **Technique:** Canvas 2D at half resolution, upscaled with `createRadialGradient` blobs and `globalCompositeOperation` 'screen'/'lighter', or CSS radial-gradients on @property. Grain uses a pre-generated noise tile drawn with a seeded offset. WebGL is not needed.
- **Params:** colors[], baseColor, blobCount, speed, grainAmount, grainAnimated, loopDuration, blur.

### 40. `bg-tech-grid` · backgrounds · Blueprint Dot / Line Grid · full-frame or overlay
- **Why:** The "Vercel aesthetic" blueprint grid with glowing dots sits behind most SaaS and AI hero sections. Stripe, Tailwind and Linear adopted it, and it fits product videos. Refs: https://www.setproduct.com/blog/complete-guide-to-blueprint-grid-design · https://www.framer.com/marketplace/components/dot-glow-background
- **Look:** Near-black (#0A0A0B) or white base. A 48px line grid or dot grid at 6–10% opacity, a radial fade mask so edges dissolve, and a central soft glow in brand colour.
- **Motion:** The grid fades and draws in from the centre outward (ring by ring). "Light pulses" travel along random grid lines (seeded paths, 1–2s each, comet tail) and dots near pulses brighten. Optional slow parallax drift or perspective tilt (CSS rotateX 55° "floor" variant, synthwave-style).
- **Technique:** Canvas 2D for dots and pulses. Lines can be a CSS repeating-linear-gradient. Seeded pulse schedule computed from t.
- **Params:** mode (dots|lines|both), spacing, color, glowColor, pulseRate, perspective on/off, fadeRadius, theme.

> **Count note:** that is 40 entries, slightly over the ~36 asked for. If you want 36, the easiest cuts are #7 `social-speaker-card`, #12 `title-marquee-repeat`, #17 `text-3d-extrude` and #34 `transition-ink-blob`. Also considered and left out: split-flap departure-board text, grid/mosaic tile transition, glitch-slice transition, variable-font weight wave (folded into #16), chapter or section-number card, icon-array pictogram, and "stream starting soon" screen.

---

## Quality bar: what separates premium from amateur templates

1. **Custom easing with real deceleration.** Premium uses expo or quart out, and custom beziers like (0.16,1,0.3,1) for entrances. Amateur uses linear or ease-in-out on everything. Exits are faster than entrances (about 60% of the duration).
2. **Overlap and offset, never lockstep.** Elements stagger 40–80ms, and each new beat starts before the previous one finishes (about 30–60% overlap). Nothing starts and stops at the same frame.
3. **Mask-based reveals over fades.** Text slides from behind a clip or mask, or wipes. A plain opacity fade is a fallback, not the main move.
4. **One clear focal point per beat.** Hierarchy comes from a 3–4× scale contrast between headline and support text. There is one accent colour per scene, and the rest is neutral.
5. **Typography discipline.** Tight display leading (0.9–1.0), optical tracking (negative on large text), max 2 families, no faux-bold. Captions break lines at meaningful phrases, not by character count.
6. **Safe zones and responsive layout.** 16:9 and 9:16 are separately composed, not just scaled. Platform UI zones (TikTok right rail and caption area, YouTube end-screen grid) are respected. Text never sits under platform chrome.
7. **Secondary motion during holds.** Subtle drift, breathing scale (±1–2%), slow gradient shift or shine pass keep the frame alive. A dead-static hold reads cheap; constant wobble reads amateur.
8. **Beat and sound sync.** Hits land on frame-accurate markers (BPM grid, SFX cue points exposed as params). Renderforest lists sound-synced stingers as a 2026 logo trend.
9. **Texture and depth without clutter.** Grain at 4–10%, soft long shadows, inner highlights on panels. Premium uses texture to add warmth, not noise. Effects never reduce text contrast below about 4.5:1.
10. **Robust to real data.** Long names, 3-line headlines, 7-digit numbers and RTL or emoji don't break layout: auto-fit text, measured widths, min and max scale. Most amateur templates break here.
11. **A complete in/hold/out lifecycle with adjustable hold.** Exit animations are designed, not omitted, and hold length is a parameter with no re-timing artefacts.
12. **Systemised variants.** A family of linked versions (full reveal, short sting, static fallback, 16:9 and 9:16), shared palette tokens, and a light/dark theme. This is what packs on Envato sell, and what Renderforest calls "responsive motion logo systems".

---

## Five trending visual styles for 2025–2026

1. **Analog texture and imperfection.** Grain, paper fibre, dust, torn-paper edges, hand-drawn wobbly strokes, choppy reduced-frame-rate motion (12fps "on twos"). Templates it suits: #18, #29, #39 with a paper preset; a frame-step "on-twos" option on any template.
   Refs: https://blog.videobolt.net/post/top-motion-graphics-trends-2026 · https://designity.com/blog/2d-animation-trends-2026 · https://graphicdesignjunction.com/2026/01/video-and-motion-creative-trends-2026/
2. **Liquid glass, dispersion and translucency.** Frosted refractive panels, chromatic edge splitting, soft glass shapes separating layers. Driven by Apple's iOS 26 design language. Templates: #9, glass variants of the caption pill and cards.
   Refs: https://garagefarm.net/blog/animation-trends-to-watch · https://www.cssscript.com/liquid-glass-distortion/ · https://blog.videobolt.net/post/top-motion-graphics-trends-2026
3. **Kinetic, editorial, modular typography.** Bold type blocks in grid or bento editorial spreads, repetitive marquee type, variable-font weight and width morphs, words as the main visual. Templates: #10, #11, #12, #27, #7.
   Refs: https://tympanus.net/codrops/2026/01/15/building-a-scroll-driven-dual-wave-text-animation-with-gsap/ · https://www.renderforest.com/blog/logo-animation-trends · https://blog.videobolt.net/post/top-motion-graphics-trends-2026
4. **"Dynamic minimalism" captions and UI.** BlitzCut (which sells a competing caption tool) says the yellow Hormozi highlight is saturated. Its successor is cleaner sentence-case captions with a single animated pill or accent, blur-in words and restrained colour. The same applies to SaaS motion: blueprint grids, soft glow, cursor-led demos. Templates: #3, #19, #20, #40.
   Refs: https://blitzcutai.com/blog/tiktok-caption-trends-2026 · https://www.setproduct.com/blog/complete-guide-to-blueprint-grid-design
5. **Grunge, collage and mixed-media street style.** Graffiti and photocopied-flyer openers, cut-out photo collage, sticker shapes, hybrid flat 2D over textured "3D" looks, and saturated "visual mixtape" palettes in the Wrapped style. Templates: #27, #11 with a collage preset, #17.
   Refs: https://graphicdesignjunction.com/2026/01/video-and-motion-creative-trends-2026/ · https://www.renderforest.com/blog/design-trends-in-2026 · https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025

---

## Implementation caveats for the whole library

- **GSAP plugins.** SplitText, DrawSVG, MorphSVG, MotionPath, ScrambleText and CustomEase are all free since GSAP joined Webflow (2025). Still avoid ScrambleText's internal `Math.random`; use a seeded custom scramble.
- **Measured layout.** Templates that measure text (#3, #8, #22, #36) must wait on `document.fonts.ready` before building the timeline, so the first frame is identical across renders.
- **Glass on transparent overlays (#9).** It cannot refract the video underneath. Offer a faked look, or an optional baked background.
- **Maps (#28, #29).** These need bundled static SVG geodata (Natural Earth, public domain) and a fixed projection. No tile servers.
- **Audio (#37, #38).** These need an offline analysis step (per-frame RMS and FFT bins) feeding a JSON array.
