---
name: studio-review-loop
description: How to process frame comments (pins/regions on frames) from the user: read snapshots, map coordinates to elements, fix, verify by rendering, resolve each comment. Use whenever a task mentions comments or review.
---

# Review loop (frame comments)

The user leaves comments on frames: project time, clip-local time, normalized point `x,y` (0..1 of frame width/height),
optional rectangle `w,h`, and text. You receive an **annotated snapshot** (numbered pins drawn on the composited frame) — Read it first.

1. `list_comments {status:'open'}` (or use the ones in the task). Read each `snapshot` image.
2. Map the pin to the element: x 0.1 = 192 px, y 0.8 = 864 px at 1080p. Find which DOM element / layer sits there at that clip-local time (render_clip at that time if unsure).
3. Interpret intent generously but precisely: "слишком быстро" → slow that specific motion, not the whole clip; "не читается" → contrast/size/hold time; "в ритм" → align to `studio.beat()`.
4. Fix in the smallest scope. Don't redesign things that weren't commented on.
5. Verify: `render_clip {clipId, times:[around each comment time]}` and `render_frame` for composite problems. Compare against the snapshot.
6. `resolve_comment {id, note}` for each comment — note says concretely what changed ("title entrance 0.4→0.8s, expo.out; plate +12% opacity").
7. If a comment is ambiguous or impossible, still resolve it with a note explaining what you did and the question.

Comments on `timeline` (no clip) are about the edit: timing of items, order, music, cuts — use the timeline tools.

## Board comments & cleanup
- Board comments (pins on scenes, storyboard frames, design tokens, layers, components) come with their note id in the task. When done: `resolve_board_note {id, note}`.
- Obsolete comments: if the object was removed/replaced or the remark no longer applies (e.g. already fixed by another change), delete it — `dismiss_comment {id, reason}` for frame comments, `delete_board_note {id, reason}` for board ones. The reason is shown to the user; never delete silently or just to make the list shorter.
- Periodically (start of a review, after big changes) check `list_comments {status:'open'}` and `list_board_notes` for stale items.
