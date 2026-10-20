import { useId, useLayoutEffect, useRef, type ReactNode } from "react";

type Layer = { root: HTMLElement; panel: HTMLElement };
const layers: Layer[] = [];
const originals = new Map<HTMLElement, { inert: boolean; hidden: string | null }>();
function isolate() {
  // Restore first, then isolate the sibling branches along the active dialog's path.
  // This also works for a confirmation nested inside results or Help.
  for (const [element, original] of originals) {
    element.inert = original.inert;
    element.toggleAttribute("inert", original.inert);
    if (original.hidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", original.hidden);
  }
  let branch: HTMLElement | null = layers.at(-1)?.root ?? null;
  if (!branch) { originals.clear(); return; }
  while (branch && branch !== document.body) {
    const parent: HTMLElement | null = branch.parentElement;
    for (const child of Array.from(parent?.children ?? [])) {
      if (!(child instanceof HTMLElement) || child === branch) continue;
      if (!originals.has(child)) originals.set(child, { inert: child.inert === true || child.hasAttribute("inert"), hidden: child.getAttribute("aria-hidden") });
      child.inert = true; child.setAttribute("inert", ""); child.setAttribute("aria-hidden", "true");
    }
    branch = parent;
  }
}
const controls = (panel: HTMLElement) => Array.from(panel.querySelectorAll<HTMLElement>(
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]'
)).filter(element => !element.closest('[inert],[hidden],details:not([open]) > :not(summary)') && !element.hidden);

/** A single modal stack owns focus and background isolation, including nested confirmations. */
export function Modal({ title, children, onDismiss, className = "helpPanel", label }: {
  title: string; children: ReactNode; onDismiss?: () => void; className?: string; label?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null);
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  useLayoutEffect(() => {
    const element = panel.current!, container = root.current!;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = { root: container, panel: element };
    layers.push(layer); isolate(); element.focus();
    const top = () => layers.at(-1) === layer;
    const focus = (event: FocusEvent) => { if (top() && !element.contains(event.target as Node)) element.focus(); };
    const key = (event: KeyboardEvent) => {
      if (!top()) return;
      if (!element.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation(); element.focus(); return; }
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss.current?.(); }
      if (event.key !== "Tab") return;
      const available = controls(element), first = available[0], last = available.at(-1);
      if (!first) { event.preventDefault(); element.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last!.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
    };
    // Capture also guards synthetic keyboard activation in environments without native inert.
    const block = (event: Event) => { if (top() && !element.contains(event.target as Node)) { event.preventDefault(); event.stopImmediatePropagation(); } };
    document.addEventListener("keydown", key, true); document.addEventListener("focusin", focus, true);
    document.addEventListener("click", block, true);
    return () => {
      document.removeEventListener("keydown", key, true); document.removeEventListener("focusin", focus, true); document.removeEventListener("click", block, true);
      const wasTop = top(); layers.splice(layers.indexOf(layer), 1); isolate();
      if (wasTop) {
        const active = layers.at(-1)?.panel;
        if (origin?.isConnected && !origin.closest('[inert]') && (!active || active.contains(origin))) origin.focus();
        else if (active) active.focus();
        else document.querySelector<HTMLElement>('[data-focus-fallback]')?.focus();
        queueMicrotask(() => { if (!layers.length && document.activeElement === document.body) document.querySelector<HTMLElement>('[data-focus-fallback]')?.focus(); });
      }
    };
  }, []);
  useLayoutEffect(() => {
    // A completed async task may remove the currently focused Retry control.
    if (layers.at(-1)?.panel === panel.current && !panel.current?.contains(document.activeElement)) panel.current?.focus();
  });
  return <div ref={root} className="modalBackdrop">
    <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} aria-label={label} className={className}>
      <h2 id={id}>{title}</h2>{children}
    </section>
  </div>;
}
