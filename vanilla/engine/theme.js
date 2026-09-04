const THEMES = ["motif", "dracula", "monokai", "tokyo-night", "catppuccin", "solara"];
const THEME_LABELS = {
  motif: "Motif",
  dracula: "Dracula",
  monokai: "Monokai",
  "tokyo-night": "Tokyo Night",
  catppuccin: "Catppuccin",
  solara: "Solara",
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readTokens() {
  return {
    bg: cssVar("--bg") || "#121412",
    bgDeep: cssVar("--bg-deep") || "#090a09",
    accent: cssVar("--accent") || "#ff9166",
    text: cssVar("--text") || "#f4f2ea",
    matA: cssVar("--mat-a") || cssVar("--board-a") || "#2b2825",
    matB: cssVar("--mat-b") || cssVar("--board-b") || "#211f1d",
    matInk: cssVar("--mat-ink") || cssVar("--text") || "#f4f2ea",
    dim: cssVar("--dim-overlay") || "rgba(0,0,0,0.45)",
    boardA: cssVar("--board-a") || "#2b2825",
    boardB: cssVar("--board-b") || "#211f1d",
  };
}

export function applyTheme(name, { silent = false, announce } = {}) {
  const t = THEMES.includes(name) ? name : "motif";
  const root = document.documentElement;
  const changed = root.dataset.theme !== t;
  root.dataset.theme = t;
  try {
    localStorage.setItem("motif-theme", t);
  } catch {
    /* blocked */
  }
  document.querySelectorAll("[data-theme-set]").forEach((c) => {
    c.setAttribute("aria-pressed", String(c.dataset.themeSet === t));
  });
  if (changed) {
    root.classList.add("theme-shifting");
    setTimeout(() => root.classList.remove("theme-shifting"), 500);
    if (!silent) announce?.(`${THEME_LABELS[t]} theme`);
  }
  syncThemeColor();
  return readTokens();
}

export function applyMode(name, { announce } = {}) {
  const m = name === "light" ? "light" : "dark";
  document.documentElement.dataset.mode = m;
  try {
    localStorage.setItem("motif-mode", m);
  } catch {
    /* blocked */
  }
  document.querySelectorAll("[data-mode-set]").forEach((c) => {
    c.setAttribute("aria-pressed", String(c.dataset.modeSet === m));
  });
  announce?.(m === "dark" ? "Dark mode" : "Light mode");
  syncThemeColor();
  return readTokens();
}

export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", cssVar("--bg") || "#121412");
}

export function cycleTheme(announce) {
  const cur = document.documentElement.dataset.theme || "motif";
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  return applyTheme(next, { announce });
}

export function cycleMode(announce) {
  const cur = document.documentElement.dataset.mode || "dark";
  return applyMode(cur === "dark" ? "light" : "dark", { announce });
}

export { THEMES, THEME_LABELS };
