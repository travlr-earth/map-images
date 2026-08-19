// Palette bridge — when the editor is embedded in the TRAVLR app, the host posts
// its active style-switcher palette across (the editor is a separate document and
// can't inherit the app's :root tokens). We map those tokens onto the editor's own
// design tokens so the UI stays consistent with the host, and follows the switcher.

type Vars = Record<string, string>;

function applyPalette(vars: Vars, mode?: string): void {
  const root = document.documentElement.style;
  const set = (token: string, value?: string) => {
    if (value && value.trim()) root.setProperty(token, value.trim());
  };
  set("--bg", vars["--surface-app"]);
  set("--bg2", vars["--surface-selector"]);
  set("--bg3", vars["--surface-menu"]);
  set("--text", vars["--text-primary"]);
  set("--muted", vars["--text-subtle"]);
  set("--accent", vars["--accent-tracking"]);
  set("--accent-rgb", vars["--accent-tracking-rgb"]);
  const borderRgb = vars["--border-inactive-rgb"];
  if (borderRgb && borderRgb.trim()) {
    root.setProperty("--border", `rgba(${borderRgb.trim()}, 0.28)`);
  }
  if (mode) document.documentElement.dataset.styleMode = mode;
}

let _installed = false;
export function initPaletteBridge(): void {
  if (_installed || typeof window === "undefined" || window.parent === window) return;
  _installed = true;

  window.addEventListener("message", (e: MessageEvent) => {
    const d = e.data;
    if (d && d.type === "travlr:palette" && d.vars) applyPalette(d.vars, d.mode);
  });

  // Ask the host for the current palette (we may have mounted after its last change).
  try {
    window.parent.postMessage({ type: "travlr:palette-request" }, "*");
  } catch {
    /* not embedded / blocked */
  }
}
