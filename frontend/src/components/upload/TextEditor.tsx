import { useState } from "react";
import { Button, Group, Box, useComputedColorScheme } from "@mantine/core";
import dynamic from "next/dynamic";
import { commands } from "@uiw/react-md-editor";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { FormattedMessage } from "react-intl";

const MDEditor = dynamic(
  () => import("@uiw/react-md-editor").then((mod) => mod.default),
  { ssr: false },
);

// VULN-18: o preview interno do editor renderiza o markdown do próprio autor
// (self-XSS). Sanitizamos com schema estilo GitHub — remove <script>, handlers
// on* e esquemas javascript:/data:. className é liberado para não quebrar o
// realce de sintaxe (classes CSS não executam código).
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), ["className"]],
  },
};

const TextEditor = ({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (newText: string) => void;
  onCancel: () => void;
}) => {
  const [text, setText] = useState<string | undefined>(initialText);
  const colorScheme = useComputedColorScheme("light");

  return (
    <Box>
      <Box
        data-color-mode={colorScheme}
        style={{
          ".w-md-editor-toolbar": {
            flexWrap: "wrap",
            height: "auto",
            minHeight: "auto",
            padding: "8px",
          },
          ".w-md-editor-toolbar li > button": {
            "@media (max-width: 767px)": {
              padding: "8px",
              minWidth: "36px",
              minHeight: "36px",
            },
          },
          ".w-md-editor-toolbar li > button svg": {
            "@media (max-width: 767px)": {
              width: "18px",
              height: "18px",
            },
          },
        }}
      >
        <MDEditor
          value={text}
          onChange={setText}
          height={400}
          preview="live"
          previewOptions={{ rehypePlugins: [[rehypeSanitize, sanitizeSchema]] }}
          extraCommands={[
            commands.codeEdit,
            commands.codeLive,
            commands.codePreview,
          ]}
        />
      </Box>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onCancel}>
          <FormattedMessage id="common.button.cancel" />
        </Button>
        <Button onClick={() => onSave(text || "")}>
          <FormattedMessage id="common.button.save" />
        </Button>
      </Group>
    </Box>
  );
};

export default TextEditor;
