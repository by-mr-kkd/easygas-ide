/**
 * The code editor's look: Monaco's own light / dark themes with faint scrollbars, so the bars sit back like
 * the rest of the app's (app/globals.css). Monaco draws its scrollbars itself, so CSS cannot reach them.
 * Pass `defineEgsThemes` as `beforeMount` and `egsTheme(dark)` as `theme` on <Editor> / <DiffEditor>.
 */

type ThemeApi = { editor: { defineTheme: (name: string, data: { base: "vs" | "vs-dark"; inherit: boolean; rules: []; colors: Record<string, string> }) => void } };

const LIGHT = "egs-light";
const DARK = "egs-dark";

export const egsTheme = (dark: boolean): string => (dark ? DARK : LIGHT);

export function defineEgsThemes(monaco: ThemeApi): void {
  monaco.editor.defineTheme(LIGHT, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#64748b1f",
      "scrollbarSlider.hoverBackground": "#64748b40",
      "scrollbarSlider.activeBackground": "#64748b59",
    },
  });
  monaco.editor.defineTheme(DARK, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#94a3b81a",
      "scrollbarSlider.hoverBackground": "#94a3b838",
      "scrollbarSlider.activeBackground": "#94a3b852",
    },
  });
}

/** Thinner bars than Monaco's 14 px default. */
export const EGS_SCROLLBAR = { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false } as const;
