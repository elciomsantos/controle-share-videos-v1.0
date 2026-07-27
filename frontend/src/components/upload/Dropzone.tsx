import { Button, Center, Text, useMantineTheme } from "@mantine/core";
import React, { useRef } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import { FileUpload } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";

const Dropzone = ({
  title,
  isUploading,
  maxShareSize,
  currentFilesSize = 0,
  onFilesChanged,
}: {
  title?: string;
  isUploading: boolean;
  maxShareSize: number;
  currentFilesSize?: number;
  onFilesChanged: (files: FileUpload[]) => void;
}) => {
  const t = useTranslate();
  const theme = useMantineTheme();
  const folderInputRef = useRef<HTMLInputElement>(null);

  const isFolderUploadSupported =
    typeof window !== "undefined" &&
    typeof HTMLInputElement !== "undefined" &&
    "webkitdirectory" in HTMLInputElement.prototype;

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = event.target.files;
    if (!filesList) return;
    const filesArray = Array.from(filesList) as FileUpload[];

    const files = filesArray.map((newFile) => {
      newFile.uploadingProgress = 0;
      return newFile;
    });

    const fileSizeSum = files.reduce((n, { size }) => n + size, 0);

    if (fileSizeSum + currentFilesSize > maxShareSize) {
      toast.error(
        t("upload.dropzone.notify.file-too-big", {
          maxSize: byteToHumanSizeString(maxShareSize),
        }),
      );
    } else {
      onFilesChanged(files);
    }

    event.target.value = "";
  };

  return (
    <div style={{ position: "relative", marginBottom: 30 }}>
      <input
        type="file"
        ref={folderInputRef}
        style={{ display: "none" }}
        {...({
          webkitdirectory: "",
          directory: "",
        } as any)}
        multiple
        onChange={handleFolderSelect}
      />
      <Center>
        {isFolderUploadSupported && (
          <Button
            variant="filled"
            size="lg"
            radius="xl"
            disabled={isUploading}
            onClick={() => folderInputRef.current?.click()}
            leftSection={<img src="/img/images/subir.png" alt="" width={22} height={22} />}
          >
            {currentFilesSize > 0 ? (
              <FormattedMessage id="upload.button.folder.append" />
            ) : (
              "Carregar Videos"
            )}
          </Button>
        )}
      </Center>
    </div>
  );
};
export default Dropzone;
