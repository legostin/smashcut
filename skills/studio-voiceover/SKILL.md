---
name: studio-voiceover
description: Voice-over that sounds natural — turn the script copy into speech text (numbers, dates, units and abbreviations spelled out in the right grammatical form, stress marks, pauses, {display|spoken} so captions keep digits), generate per scene with ElevenLabs, check the pace and fix flagged sentences. Use whenever a video needs narration.
---

# Voice-over as a process

This skill is about the **synthetic** voice (ElevenLabs). When the user records the narration themself (teleprompter, microphone, a narration file; scenes with `vo.source: "mic"`), follow **studio-author-voice** instead — and never overwrite a recorded scene with `generate_voiceover`. The speech-text rules in step 1 apply to both: the teleprompter shows the same `speech` text to the reader.

Voice engines read digits, dates, units and abbreviations badly — especially in Russian, where the number's form depends on case and gender ("в 2026 году" → "в две тысячи двадцать шестом году"). They also speed up or slow down when a sentence is long, dense or oddly punctuated. So narration is three steps. Never skip the first one.

## 1. Speech text — `update_scene {id, patch:{speech}}`

The scene's `voiceover` is the copy as it appears (captions, on-screen). `speech` is what the narrator says. Write it for every scene that has narration.

Markup:
- `{display|spoken}` — captions show `display`, the voice says `spoken`: `{2026|две тысячи двадцать шестом}`, `{500 ₽|пятьсот рублей}`, `{AI|эй-ай}`, `{3D|три-дэ}`, `{14:30|четырнадцать тридцать}`.
- Stress — a combining acute accent (U+0301) right after the stressed vowel: `за́мок` / `замо́к`, `мука́`, `а́тлас`, `большинство́`. Mark homographs, rare words, names, terms the engine may misread. Don't mark every word.
- `[pause 0.4]` (seconds, 0.1–3) or `[...]` (= 0.5 s) — breaths between thoughts, before a reveal, after a question. Don't add pauses where a comma already does the job.

Rules for the spoken part (any language; examples in Russian):
- **Numbers and dates in words, with the right case/gender/number:** "7 ноября" → "седьмого ноября"; "в 1998 г." → "в тысяча девятьсот девяносто восьмом году"; "2,5 млн" → "два с половиной миллиона"; "21 пользователь" → "двадцать один пользователь"; "с 9 до 18" → "с девяти до восемнадцати"; ordinals and years agree with the noun.
- **Units, currency, percent, symbols:** "45%" → "сорок пять процентов", "10 км/ч" → "десять километров в час", "$3" → "три доллара", "№ 5" → "номер пять", "&" → "и".
- **Abbreviations:** say them the way people do: "т.е." → "то есть", "и т.д." → "и так далее", "МГУ" → "эм-гэ-у", "ИИ" → "искусственный интеллект" (or "и-и" if that's the brand voice), "CEO" → "си-и-о". Latin words in Russian speech: transliterate the way a Russian speaker says them ("Figma" → "фигма", "YouTube" → "ютуб") unless the voice is bilingual and handles it.
- **Rhythm:** sentences of 6–18 words; split long ones. Avoid nested clauses, parentheses and lists of more than three items. Put the key word at the end of the sentence. Read it aloud in your head — if you'd run out of breath, split it.
- **Punctuation shapes delivery:** a full stop gives a fall and a short pause, a comma a small rise. An em dash gives a pause too. Use "…" sparingly — it makes some voices slow down a lot. Don't write ALL CAPS: it makes the voice shout or spell the word.
- Keep the meaning and the length roughly the same as the copy: the scene's duration was planned for it.

## 2. Generate — `generate_voiceover {sceneId}`

- One scene at a time, in order. The neighbours' speech goes in as context automatically so intonation flows across cuts.
- Settings are steady by default: stability 0.55, low style, fixed speed. Don't raise style or lower stability to make the voice "livelier" — that causes the speed jumps the user hates.
- The response has `pace` and `overflow`:
  - `pace.flagged` > 0: some sentences run >15% faster or slower than the project's voice pace, or there's an odd gap. Fix the speech text of those sentences (split, simplify, add or remove a pause, fix a number), then generate again. Takes are re-rolled automatically, but the text is usually the cause.
  - `overflow` > 0: the voice runs past the scene end. Trim the copy or re-time the scene and the following ones. Don't speed the voice up past 1.1.
- Use one voice for the whole video. Change the voice only when the user asks — the pace reference is per voice.

## 3. Check — `voice_report`

After voicing everything, call `voice_report`. All scenes should sit within ±10% of `projectRate` with no flagged sentences. For scenes without `hasSpeech`, write speech text and regenerate. Then check captions: `get_timing` words show the display text with the voice's timing.

## Checklist before you say "done"

- [ ] Every narrated scene has `speech`. No digits, symbols or abbreviations remain outside `{…|…}` groups.
- [ ] Homographs and names have stress marks where they could be misread.
- [ ] `voice_report` shows no flagged sentences and no scene more than 10% off the project pace.
- [ ] No overflow, or the scenes were re-timed.
- [ ] Captions (if any) read correctly: digits in captions, words in the voice.
