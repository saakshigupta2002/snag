/**
 * Build a short, stable-ish CSS-style selector path for an element:
 * "div#app > form.checkout > button#buy.btn". Stops at the first id.
 * Used for grouping, so stability matters more than uniqueness.
 */
export function buildSelector(el: Element | null, maxDepth = 5): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && depth < maxDepth) {
    let part = node.tagName.toLowerCase();
    const id = node.getAttribute('id');
    if (id) {
      parts.unshift(`${part}#${id}`);
      break;
    }
    const classes = Array.from(node.classList)
      .filter((c) => c.length < 32)
      .slice(0, 2);
    if (classes.length) part += `.${classes.join('.')}`;
    const role = node.getAttribute('role');
    if (role) part += `[role="${role}"]`;
    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.join(' > ') || 'unknown';
}
