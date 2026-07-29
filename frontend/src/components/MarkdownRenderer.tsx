import { useComputedColorScheme } from "@mantine/core";
import { Anchor } from "@mantine/core";
import Markdown, { MarkdownToJSX } from "markdown-to-jsx/react";
import DOMPurify from "dompurify";
import { ReactNode } from "react";

type CommonOptions = MarkdownToJSX.Options & {
  forceBlock?: boolean;
};

const baseOverrides = (colorScheme: "light" | "dark") => ({
  overrides: {
    pre: {
      props: {
        style: {
          backgroundColor:
            colorScheme === "dark"
              ? "rgba(50, 50, 50, 0.5)"
              : "rgba(220, 220, 220, 0.5)",
          padding: "0.75em",
          whiteSpace: "pre-wrap" as const,
        },
      },
    },
    table: {
      props: {
        className: "md",
      },
    },
    a: {
      props: {
        target: "_blank",
        rel: "noreferrer",
      },
      component: Anchor,
    },
  },
});

/**
 * Strip every HTML tag from the input string before markdown parsing, so any
 * raw HTML embedded in user-supplied text is removed regardless of the
 * markdown parser configuration (defense in depth for stored XSS).
 */
const sanitize = (raw: string): string =>
  typeof window === "undefined"
    ? raw
    : DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: [],
        ALLOW_DATA_ATTR: false,
      });

export const MarkdownRenderer = ({
  children,
  forceBlock,
}: {
  children: string;
  forceBlock?: boolean;
}): ReactNode => {
  const colorScheme = useComputedColorScheme("light");

  const options: CommonOptions = {
    forceBlock,
    disableParsingRawHTML: true,
    ...baseOverrides(colorScheme === "dark" ? "dark" : "light"),
  };

  const sanitized = sanitize(children ?? "");
  return <Markdown options={options}>{sanitized}</Markdown>;
};

export default MarkdownRenderer;
