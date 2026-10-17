import { FlatSelect } from "./FlatSelect";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { Check, Globe2, Palette, X } from "lucide-react";
import {
  themes,
  textScales,
  diffFontSizes,
  type Preferences,
} from "./preferences";
import type { createTranslator, Language } from "./i18n";
export function SettingsDialog({
  preferences,
  setPreferences,
  t,
  onClose,
}: {
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
  t: ReturnType<typeof createTranslator>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal settings-dialog"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="settings-header">
        <h2 id="settings-title">{t("settings")}</h2>
        <button
          className="icon-button"
          aria-label={t("Fechar")}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>{t("settingsSubtitle")}</p>
      <fieldset className="typography-settings">
        <legend>{t("typography")}</legend>
        <div className="type-setting">
          <label htmlFor="preferences-text-scale">{t("textSize")}</label>
          <FlatSelect
            id="preferences-text-scale"
            value={preferences.textScale}
            onChange={(e) =>
              setPreferences((p) => ({
                ...p,
                textScale: Number(e.target.value),
              }))
            }
          >
            {textScales.map((size) => (
              <option key={size} value={size}>
                {size}%
              </option>
            ))}
          </FlatSelect>
        </div>
        <div className="type-setting">
          <label htmlFor="preferences-diff-font">{t("diffFontSize")}</label>
          <FlatSelect
            id="preferences-diff-font"
            value={preferences.diffFontSize}
            onChange={(e) =>
              setPreferences((p) => ({
                ...p,
                diffFontSize: Number(e.target.value),
              }))
            }
          >
            {diffFontSizes.map((size) => (
              <option key={size} value={size}>
                {size} px
              </option>
            ))}
          </FlatSelect>
        </div>
        <p>{t("textSizeHint")}</p>
      </fieldset>
      <fieldset className="theme-fieldset">
        <legend>
          <Palette size={16} />
          {t("appearance")}
        </legend>
        <div
          className="theme-options"
          role="radiogroup"
          aria-label={t("themeLabel")}
        >
          {themes.map((theme) => (
            <label
              className={`theme-option ${preferences.theme === theme ? "active" : ""}`}
              key={theme}
            >
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={preferences.theme === theme}
                onChange={() => setPreferences((p) => ({ ...p, theme }))}
              />
              <div
                className={`theme-preview preview-${theme}`}
                aria-hidden="true"
              >
                <i />
                <div>
                  <b />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <span className="theme-name">
                {theme === "system"
                  ? t("systemTheme")
                  : theme === "darcula"
                    ? "Darcula"
                    : theme === "nord"
                      ? "Nord"
                      : theme === "sage"
                        ? "Sage"
                        : theme === "dark"
                          ? "Dark"
                          : "Light"}
                {preferences.theme === theme && <Check size={13} />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="language-setting">
        <label htmlFor="preferences-language">
          <Globe2 size={16} />
          {t("language")}
        </label>
        <FlatSelect
          id="preferences-language"
          value={preferences.language}
          onChange={(e) =>
            setPreferences((p) => ({
              ...p,
              language: e.target.value as Language,
            }))
          }
        >
          <option value="en">English</option>
          <option value="pt-BR">Português (Brasil)</option>
        </FlatSelect>
      </div>
      <div className="settings-footer">
        <button className="primary" onClick={onClose}>
          {t("done")}
        </button>
      </div>
    </dialog>
  );
}
