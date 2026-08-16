import Config from "../types/config.type";

export function getDefaultConfig(): Config[] {
  return [
    {
      key: "general.appName",
      value: "Guarda Municipal de Londrina",
      defaultValue: "Guarda Municipal de Londrina",
      type: "string",
    },
    {
      key: "general.showHomePage",
      value: "true",
      defaultValue: "true",
      type: "boolean",
    },
    {
      key: "general.defaultLanguage",
      value: "pt-BR",
      defaultValue: "pt-BR",
      type: "string",
    },
    {
      key: "share.allowRegistration",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "smtp.enabled",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    {
      key: "legal.enabled",
      value: "false",
      defaultValue: "false",
      type: "boolean",
    },
    { key: "legal.imprintText", value: "", defaultValue: "", type: "text" },
    { key: "legal.imprintUrl", value: "", defaultValue: "", type: "string" },
    {
      key: "legal.privacyPolicyText",
      value: "",
      defaultValue: "",
      type: "text",
    },
    {
      key: "legal.privacyPolicyUrl",
      value: "",
      defaultValue: "",
      type: "string",
    },
  ];
}
