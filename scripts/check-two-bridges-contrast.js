/* Read-only browser regression probe. Paste this entire expression into DevTools,
   or pass it to the browser tool's read-only evaluate API after each real UI state.
   It reads the live CSS cascade; it does not inject classes, colors or fake states.
   Re-run while keyboard-focused/hovered, in review, Help, results and retry.
   Require failures.length === 0. A snapshot covers only the states actually present.
   Fixed SVG shore fills are sampled separately; inspect painted overlaps and
   clipping visually too. This is a contrast check, not an accessibility audit. */
(() => {
  const root = document.querySelector('.twoBridges');
  if (!root) throw new Error('Open Two Bridges before checking contrast.');
  const rgba = value => {
    const parts = value.match(/[\d.]+/g)?.map(Number);
    if (!parts || parts.length < 3) throw new Error(`Unsupported computed color: ${value}`);
    return [...parts.slice(0, 3), parts[3] ?? 1];
  };
  const over = (front, back) => [...front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3])), 1];
  const background = element => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) layers.unshift(rgba(getComputedStyle(node).backgroundColor));
    return layers.reduce((back, front) => over(front, back), [255, 255, 255, 1]);
  };
  const focusSurface = (style, outside) => {
    // A flat opaque spread shadow can back an offset outline. Read its actual
    // computed color/geometry rather than assuming a theme color or selector.
    const flat = style.boxShadow.match(/(rgba?\([^)]+\))\s+0px\s+0px\s+0px\s+([\d.]+)px/);
    const extent = Number(style.outlineOffset.replace('px', '')) + Number(style.outlineWidth.replace('px', ''));
    return flat && Number(flat[2]) >= extent ? over(rgba(flat[1]), outside) : outside;
  };
  const luminance = rgb => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  const color = rgb => '#' + rgb.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const failures = [], controls = [];
  // Hubs sit on the fixed shore, over the SVG base/park fills rather than a CSS
  // background. Check both opaque paint colors conservatively (parks are translucent).
  const shorePaint = [...root.querySelectorAll('.bayMap svg > rect[fill],.bayMap svg > g[fill]')]
    .map(node => getComputedStyle(node).fill).filter(fill => fill.startsWith('rgb')).map(rgba);
  for (const element of root.querySelectorAll('button,input[type=file]')) {
    if (!element.getClientRects().length || element.closest('[hidden],[inert],[aria-hidden=true],details:not([open])')) continue;
    const style = getComputedStyle(element), bg = background(element), outside = background(element.parentElement);
    const label = element.textContent?.trim().replace(/\s+/g, ' ') || element.getAttribute('aria-label') || 'Import file';
    const states = ['hover', 'focus-visible', 'active', 'disabled'].filter(state => element.matches(`:${state}`));
    if (element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true') states.push('selected');
    const sample = { label, id: element.id, states, background: color(bg), color: color(rgba(style.color)), opacity: style.opacity, texts: [] };
    for (const node of [element, ...element.querySelectorAll('small,span,strong')]) {
      const textStyle = getComputedStyle(node), size = Number(textStyle.fontSize.replace("px", "")), large = size >= 24 || (size >= 18.6667 && Number(textStyle.fontWeight) >= 700);
      const textRatio = ratio(over(rgba(textStyle.color), bg), bg), minimum = large ? 3 : 4.5;
      sample.texts.push({text: node.textContent?.trim().replace(/\s+/g, ' '), color: color(rgba(textStyle.color)), sizePx: size, ratio: textRatio, minimum});
      if (textRatio < minimum) failures.push(`${label}: text contrast ${textRatio.toFixed(2)} < ${minimum}`);
    }
    sample.boundaryRatio = Math.max(ratio(over(rgba(style.borderTopColor), outside), outside), ratio(bg, outside));
    if (sample.boundaryRatio < 3) failures.push(`${label}: control boundary ${sample.boundaryRatio.toFixed(2)} < 3`);
    if (states.includes('focus-visible')) {
      sample.focus = {color: color(rgba(style.outlineColor)), width: style.outlineWidth, offset: style.outlineOffset, ratio: ratio(over(rgba(style.outlineColor), focusSurface(style, outside)), focusSurface(style, outside))};
      if (style.outlineStyle === 'none' || Number(style.outlineWidth.replace("px", "")) < 2 || sample.focus.ratio < 3) failures.push(`${label}: missing/low-contrast focus indicator`);
    }
    if (Number(style.opacity) < 1) failures.push(`${label}: opacity needs composited contrast review`);
    if (element.matches('input[type=file]')) {
      const fileStyle = getComputedStyle(element, '::file-selector-button');
      sample.fileButton = {color: fileStyle.color, background: fileStyle.backgroundColor, ratio: ratio(rgba(fileStyle.color), rgba(fileStyle.backgroundColor))};
      if (sample.fileButton.ratio < 4.5) failures.push(`${label}: file button text contrast < 4.5`);
    }
    if (element.matches('.bayHub')) {
      sample.shoreBoundaries = shorePaint.map(paint => ({background: color(paint), ratio: Math.max(ratio(rgba(style.borderTopColor), paint), ratio(bg, paint))}));
      for (const painted of sample.shoreBoundaries) if (painted.ratio < 3) failures.push(`${label}: painted shore boundary ${painted.ratio.toFixed(2)} < 3`);
      if (states.includes('focus-visible')) {
        sample.shoreFocus = shorePaint.map(paint => ({background: color(paint), ratio: ratio(rgba(style.outlineColor), paint)}));
        for (const painted of sample.shoreFocus) if (painted.ratio < 3) failures.push(`${label}: focus against painted shore < 3`);
      }
    }
    controls.push(sample);
  }
  const active = document.activeElement;
  let focusedElement = null;
  if (active && root.contains(active)) {
    const style = getComputedStyle(active);
    focusedElement = {tag: active.tagName, id: active.id, label: active.getAttribute('aria-label') || active.textContent?.trim().slice(0, 100),
      focusVisible: active.matches(':focus-visible'), outline: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset,
      color: style.outlineColor, backing: color(focusSurface(style, background(active.parentElement))), shadow: style.boxShadow, ratio: ratio(rgba(style.outlineColor), focusSurface(style, background(active.parentElement)))};
    if (focusedElement.focusVisible && (style.outlineStyle === 'none' || Number(style.outlineWidth.replace('px', '')) < 2 || focusedElement.ratio < 3)) failures.push('Active element has missing/low-contrast focus indicator');
  }
  return { focusedElement, viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }, controls, failures };
})()
