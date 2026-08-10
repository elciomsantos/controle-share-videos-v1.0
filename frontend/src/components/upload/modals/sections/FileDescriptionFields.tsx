import { Stack, Text, Textarea } from "@mantine/core";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../../hooks/useTranslate.hook";
import { FileUpload } from "../../../../types/File.type";
import { getNormalizedFileName } from "../../../../utils/file.util";

const FileDescriptionFields = ({
  files,
  fileDescriptions,
  onFileDescriptionChange,
}: {
  files: FileUpload[];
  fileDescriptions: Record<number, string>;
  onFileDescriptionChange: (index: number, value: string) => void;
}) => {
  const t = useTranslate();

  if (files.length === 0) {
    return null;
  }

  return (
    <Stack align="stretch" gap="xs">
      <Text size="sm" style={{ fontWeight: 600 }}>
        <FormattedMessage id="upload.modal.accordion.file-descriptions.title" />
      </Text>
      {files.map((file, index) => (
        <Stack align="stretch" gap="xs" key={index}>
          <Text size="sm" style={{ fontWeight: 600 }} truncate>
            {getNormalizedFileName(file)}
          </Text>
          <Textarea
            variant="filled"
            autosize
            minRows={1}
            placeholder={t(
              "upload.modal.accordion.file-descriptions.sei-placeholder",
            )}
            value={fileDescriptions[index] || ""}
            onChange={(event) => {
              onFileDescriptionChange(index, event.currentTarget.value);
            }}
          />
        </Stack>
      ))}
    </Stack>
  );
};

export default FileDescriptionFields;