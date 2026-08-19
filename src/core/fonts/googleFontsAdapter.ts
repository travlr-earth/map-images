import type { IFontLoader } from "./ports";

const WEIGHTS = [300, 400, 700] as const;

function stylesheetUrl(family: string): string {
  const familyParam = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${WEIGHTS.join(";")}&display=swap`;
}

function injectStylesheet(family: string): void {
  const id = `font-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = stylesheetUrl(family);
  document.head.appendChild(link);
}

/** Loads a Google Fonts family on demand (idempotent per family). */
export const googleFontsAdapter: IFontLoader = {
  async ensureFont(fontFamily: string): Promise<void> {
    const family = String(fontFamily ?? "").trim();
    if (!family) {
      return;
    }

    injectStylesheet(family);

    if (document.fonts?.load) {
      await Promise.allSettled(
        WEIGHTS.map((w) => document.fonts.load(`${w} 16px "${family}"`)),
      );
    }
  },
};
