import { Button, Center, Text, useMantineTheme } from "@mantine/core";
import React, { useEffect, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import { FileUpload } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import toast from "../../utils/toast.util";
import { uuid } from "../../utils/uuid.util";
import {
  isFileSystemAccessSupported,
  listDirectoryFiles,
  pickDirectory,
} from "../../utils/fileSystem.util";

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

  // Detectado no efeito (não no render) para evitar hydration mismatch:
  // no SSR `window` não existe e o botão sumiria no HTML do servidor,
  // reaparecendo no cliente — o que dispara o React error #418.
  const [isFolderUploadSupported, setIsFolderUploadSupported] = useState(false);
  const [isFileSystemApi, setIsFileSystemApi] = useState(false);

  useEffect(() => {
    setIsFolderUploadSupported(
      typeof HTMLInputElement !== "undefined" &&
        "webkitdirectory" in HTMLInputElement.prototype,
    );
    setIsFileSystemApi(isFileSystemAccessSupported());
  }, []);

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = event.target.files;
    if (!filesList) return;
    const filesArray = Array.from(filesList);

    const files: FileUpload[] = filesArray.map((newFile) => ({
      id: uuid(),
      name: newFile.webkitRelativePath || newFile.name,
      size: newFile.size.toString(),
      description: undefined,
      shareId: "",
      createdAt: new Date(),
      mimeType: newFile.type || false,
      uploadingProgress: 0,
      file: newFile,
    }));

    const fileSizeSum = files.reduce((n, { size }) => n + Number(size), 0);

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

  const handlePickDirectory = async () => {
    const dirHandle = await pickDirectory();
    if (!dirHandle) return;

    const entries = await listDirectoryFiles(dirHandle);

    const files: FileUpload[] = entries.map(({ file, relativePath }) => ({
      id: uuid(),
      name: relativePath,
      size: file.size.toString(),
      description: undefined,
      shareId: "",
      createdAt: new Date(),
      mimeType: file.type || false,
      uploadingProgress: 0,
      file,
      dirHandle,
      relativeDirPath: relativePath.split("/").slice(0, -1).join("/"),
    }));

    const fileSizeSum = files.reduce((n, { size }) => n + Number(size), 0);

    if (fileSizeSum + currentFilesSize > maxShareSize) {
      toast.error(
        t("upload.dropzone.notify.file-too-big", {
          maxSize: byteToHumanSizeString(maxShareSize),
        }),
      );
      return;
    }

    onFilesChanged(files);
  };

  const handleSelect = () => {
    if (isFileSystemApi) {
      void handlePickDirectory();
    } else {
      folderInputRef.current?.click();
    }
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
        } as React.InputHTMLAttributes<HTMLInputElement>)}
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
            onClick={handleSelect}
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
