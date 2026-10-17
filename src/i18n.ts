import { en, type MessageKey } from "./locales/en";
import { ptBR } from "./locales/pt-BR";
export type { MessageKey } from "./locales/en";
export type Language = "en" | "pt-BR";
export type MessageParams = Record<string, string | number>;
export function createTranslator(language: Language) {
  const catalog: Record<MessageKey, string> = language === "pt-BR" ? ptBR : en;
  return (key: MessageKey, params: MessageParams = {}) =>
    catalog[key].replace(/\{(\w+)\}/g, (match, name: string) =>
      params[name] === undefined ? match : String(params[name]),
    );
}
// Translate only application-owned diagnostics. Preserve raw Git output and diff content.
export function localizeBackendMessage(
  value: string,
  language: Language,
): string {
  if (Object.prototype.hasOwnProperty.call(en, value))
    return createTranslator(language)(value as MessageKey);
  if (language === "pt-BR") return value;
  for (const prefix of [
    "Não foi possível executar Git:",
    "Pasta indisponível:",
  ] as const) {
    if (value.startsWith(prefix))
      return en[prefix] + value.slice(prefix.length);
  }
  return value;
}
