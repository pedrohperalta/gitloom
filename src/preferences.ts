import { useEffect, useMemo, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createTranslator, type Language } from "./i18n";
export const themes = [
  "dark",
  "light",
  "darcula",
  "nord",
  "sage",
  "system",
] as const;
export type Theme = (typeof themes)[number];
export const textScales = [100, 110, 125, 140, 150] as const;
export const diffFontSizes = [10, 11, 12, 13, 14, 16, 18, 20, 24] as const;
export type Preferences = {
  theme: Theme;
  language: Language;
  textScale: number;
  diffFontSize: number;
  sidebarWidth: number | null;
  sidebarCollapsed: boolean;
  historyPercent: number;
  referenceColumnWidth: number;
  collapsedSidebarSections: string[];
};
const defaults: Preferences = {
  theme: "dark",
  language: "en",
  textScale: 100,
  diffFontSize: 12,
  sidebarWidth: null,
  sidebarCollapsed: false,
  historyPercent: 58.33,
  referenceColumnWidth: 150,
  collapsedSidebarSections: [],
};
const storageKey = "gitloom.preferences";
export function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return {
      sidebarCollapsed: saved?.sidebarCollapsed === true,
      referenceColumnWidth:
        typeof saved?.referenceColumnWidth === "number" &&
        Number.isFinite(saved.referenceColumnWidth) &&
        saved.referenceColumnWidth >= 100 &&
        saved.referenceColumnWidth <= 800
          ? saved.referenceColumnWidth
          : defaults.referenceColumnWidth,
      collapsedSidebarSections: Array.isArray(saved?.collapsedSidebarSections)
        ? [
            ...new Set<string>(
              saved.collapsedSidebarSections.filter(
                (id: unknown): id is string =>
                  typeof id === "string" && id.length <= 200,
              ),
            ),
          ].slice(0, 100)
        : [],
      historyPercent:
        typeof saved?.historyPercent === "number" &&
        Number.isFinite(saved.historyPercent) &&
        saved.historyPercent >= 20 &&
        saved.historyPercent <= 80
          ? saved.historyPercent
          : defaults.historyPercent,
      sidebarWidth:
        typeof saved?.sidebarWidth === "number" &&
        Number.isFinite(saved.sidebarWidth) &&
        saved.sidebarWidth >= 228 &&
        saved.sidebarWidth <= 480
          ? saved.sidebarWidth
          : null,
      theme: themes.includes(saved?.theme) ? saved.theme : "dark",
      language: saved?.language === "pt-BR" ? "pt-BR" : "en",
      textScale: textScales.includes(saved?.textScale)
        ? saved.textScale
        : defaults.textScale,
      diffFontSize: diffFontSizes.includes(saved?.diffFontSize)
        ? saved.diffFontSize
        : defaults.diffFontSize,
    };
  } catch {
    return { ...defaults };
  }
}
export function resolveTheme(theme: Theme): Exclude<Theme, "system"> {
  return theme === "system"
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : theme;
}
export function applyPreferences(preferences: Preferences) {
  const resolved = resolveTheme(preferences.theme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme =
    resolved === "light" || resolved === "sage" ? "light" : "dark";
  document.documentElement.lang = preferences.language;
  document.documentElement.style.setProperty(
    "--ui-font-size",
    `${(13 * preferences.textScale) / 100}px`,
  );
  document.documentElement.style.setProperty(
    "--diff-font-size",
    `${preferences.diffFontSize}px`,
  );
  document.documentElement.style.setProperty(
    "--history-row-height",
    `${Math.round((48 * preferences.textScale) / 100)}px`,
  );
  document.title = createTranslator(preferences.language)("appTitle");
  return resolved;
}
export function usePreferences() {
  const [preferences, setPreferences] = useState(readPreferences);
  const t = useMemo(
    () => createTranslator(preferences.language),
    [preferences.language],
  );
  useEffect(() => {
    const update = () => applyPreferences(preferences);
    update();
    try {
      localStorage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Preferences still apply in this session. */
    }
    const media = matchMedia("(prefers-color-scheme: dark)");
    if (preferences.theme === "system")
      media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [preferences]);
  useEffect(() => {
    if (isTauri()) {
      const resolved = resolveTheme(preferences.theme);
      void getCurrentWindow()
        .setTheme(
          preferences.theme === "system"
            ? null
            : resolved === "light" || resolved === "sage"
              ? "light"
              : "dark",
        )
        .catch(console.error);
    }
  }, [preferences.theme]);
  return { preferences, setPreferences, t };
}
