import { describe, it, expect, vi, afterEach } from "vitest";
import { en } from "./locales/en";
import { ptBR } from "./locales/pt-BR";
import { createTranslator, localizeBackendMessage } from "./i18n";
import { readPreferences, resolveTheme } from "./preferences";
afterEach(() => vi.unstubAllGlobals());
describe("localization", () => {
  it("keeps the two catalogs complete with identical interpolation parameters", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(ptBR[key].length).toBeGreaterThan(0);
      expect(en[key].match(/\{\w+\}/g) || []).toEqual(
        ptBR[key].match(/\{\w+\}/g) || [],
      );
    }
  });
  it("formats whole phrases with counts in each language", () => {
    expect(createTranslator("en")("changedFile", { count: 1 })).toBe(
      "1 changed file",
    );
    expect(createTranslator("pt-BR")("changedFiles", { count: 12 })).toBe(
      "12 arquivos alterados",
    );
    expect(createTranslator("en")("movedToStageOther", { count: 8 })).toBe(
      "8 files staged.",
    );
  });
  it("translates app-owned diagnostics without changing Git output or diff contents", () => {
    expect(localizeBackendMessage("Commit inválido", "en")).toBe(
      "Invalid commit",
    );
    expect(localizeBackendMessage("Pasta indisponível: ENOENT", "en")).toBe(
      "Folder unavailable: ENOENT",
    );
    expect(localizeBackendMessage("fatal: not a git repository", "pt-BR")).toBe(
      "fatal: not a git repository",
    );
    const patch = "diff --git a/test b/test\n+Commit inválido\n";
    expect(localizeBackendMessage(patch, "en")).toBe(patch);
  });
});
describe("preferences", () => {
  it("defaults to English and Dark even when saved data is invalid", () => {
    for (const saved of [
      null,
      "broken json",
      '{"theme":"missing","language":"fr"}',
      "null",
    ]) {
      vi.stubGlobal("localStorage", { getItem: () => saved });
      expect(readPreferences()).toEqual({
        theme: "dark",
        language: "en",
        textScale: 100,
        diffFontSize: 12,
        sidebarWidth: null,
      });
    }
  });
  it("validates saved font choices and migrates older preferences", () => {
    for (const [textScale, diffFontSize, expectedScale, expectedFont] of [
      [125, 18, 125, 18],
      [-1, 999, 100, 12],
      ["150", null, 100, 12],
    ]) {
      vi.stubGlobal("localStorage", {
        getItem: () => JSON.stringify({ textScale, diffFontSize }),
      });
      expect(readPreferences()).toMatchObject({
        textScale: expectedScale,
        diffFontSize: expectedFont,
      });
    }
  });
  it("reads explicit choices and resolves system theme", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => '{"theme":"darcula","language":"pt-BR"}',
    });
    expect(readPreferences()).toEqual({
      theme: "darcula",
      language: "pt-BR",
      textScale: 100,
      diffFontSize: 12,
      sidebarWidth: null,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(resolveTheme("system")).toBe("dark");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(resolveTheme("system")).toBe("light");
  });
});
