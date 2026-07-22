import next from "eslint-config-next";
import eslintPluginReact from "eslint-plugin-react";
import prettier from "eslint-config-prettier";

export default [
  ...next,
  {
    plugins: {
      react: eslintPluginReact,
    },
    rules: {
      quotes: ["warn", "double", { allowTemplateLiterals: true }],
      "react-hooks/exhaustive-deps": ["off"],
      "react-hooks/set-state-in-effect": ["off"],
      "react-hooks/immutability": ["off"],
      "react-hooks/refs": ["off"],
      "import/no-anonymous-default-export": ["off"],
      "no-unused-vars": ["off"],
      "react/no-unescaped-entities": ["off"],
      "@next/next/no-img-element": ["off"],
    },
  },
  prettier,
];
