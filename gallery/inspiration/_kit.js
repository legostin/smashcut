// Inspiration mini-scenes — tiny helpers shared by every scene (plain script, loaded before clip.js).
// A scene is a normal clip: studio.clip({ duration, setup(root, p, { tl }) }). It must LOOP: the last frame flows into the first.
window.kit = {
  /** create an element: kit.el(parent, 'cls other', { css }, 'text') */
  el(parent, cls = '', css = null, text = '') {
    const e = document.createElement('div');
    if (cls) e.className = cls;
    if (css) Object.assign(e.style, css);
    if (text) e.textContent = text;
    parent.appendChild(e);
    return e;
  },
  /** an SVG covering the stage (1920×1080 user units) */
  svg(parent, inner = '') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 1920 1080');
    s.setAttribute('class', 'fill');
    s.innerHTML = inner;
    parent.appendChild(s);
    return s;
  },
};
