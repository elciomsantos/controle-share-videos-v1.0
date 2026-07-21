import portuguese from "./translations/pt-BR";

export interface Locale {
  name: string;
  code: string;
  messages: Record<string, string>;
  direction?: string;
}

export const LOCALES: Record<string, Locale> = {
  PORTUGUESE_BRAZIL: {
    name: "Português (Brasil)",
    code: "pt-BR",
    messages: portuguese,
  },
};
