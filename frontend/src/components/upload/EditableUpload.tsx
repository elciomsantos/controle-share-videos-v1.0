import { Button, Group } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { AxiosError } from "axios";
import { useRouter } from "next/router";
import pLimit from "p-limit";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import Dropzone from "../../components/upload/Dropzone";
import FileList from "../../components/upload/FileList";
import { showBlockingErrorModal } from "../core/showBlockingErrorModal";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileListItem, FileMetaData, FileUpload, FileRecord } from "../../types/File.type";
import toast from "../../utils/toast.util";
import { getNormalizedFileName, filterDuplicateFiles } from "../../utils/file.util";

const promiseLimit = pLimit(3);
const EDITABLE_ERROR_TOAST_ID = "editable-upload-error-toast";

const EditableUpload = ({
  maxShareSize,
  shareId,
  files: savedFiles = [],
}: {
  maxShareSize?: number;
  shareId: string;
  files?: FileRecord[];
}) => {
  const t = useTranslate();
  const router = useRouter();
  const config = useConfig();
  const modals = useModals();

  const chunkSize = useRef(config.get("share.chunkSize"));

  const [existingFiles, setExistingFiles] =
    useState<Array<FileRecord & { deleted?: boolean }>>(savedFiles);
  const [uploadingFiles, setUploadingFiles] = useState<FileUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorToastShown, setErrorToastShown] = useState(false);

  const existingAndUploadedFiles: FileListItem[] = useMemo(
    () => [...uploadingFiles, ...existingFiles],
    [existingFiles, uploadingFiles],
  );
  const dirty = useMemo(() => {
    return (
      existingFiles.some((file) => !!file.deleted) || !!uploadingFiles.length
    );
  }, [existingFiles, uploadingFiles]);

  const setFiles = (files: FileListItem[]) => {
    const _uploadFiles = files.filter(
      (file) => "uploadingProgress" in file,
    ) as FileUpload[];
    const _existingFiles = files.filter(
      (file) => !("uploadingProgress" in file),
    ) as FileRecord[];

    setUploadingFiles(_uploadFiles);
    setExistingFiles(_existingFiles);
  };

  maxShareSize ??= config.get("share.maxSize");

  const currentFilesSize = useMemo(() => {
    return (
      existingFiles
        .filter((file) => !file.deleted)
        .reduce((acc, file) => acc + Number(file.size), 0) +
      uploadingFiles.reduce((acc, file) => acc + Number(file.size), 0)
    );
  }, [existingFiles, uploadingFiles]);

  const uploadFiles = async (files: FileUpload[]) => {
    const fileUploadPromises = files.map(async (file, fileIndex) =>
      // Limit the number of concurrent uploads to 3
      promiseLimit(async () => {
        let fileId: string | undefined;

        const setFileProgress = (progress: number) => {
          setUploadingFiles((files) =>
            files.map((file, callbackIndex) =>
              fileIndex == callbackIndex
                ? { ...file, uploadingProgress: progress }
                : file,
            ),
          );
        };

        setFileProgress(1);

        let chunks = Math.ceil(Number(file.size) / chunkSize.current);

        // If the file is 0 bytes, we still need to upload 1 chunk
        if (chunks == 0) chunks++;

        for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
          const from = chunkIndex * chunkSize.current;
          const to = from + chunkSize.current;
          const blob = file.file!.slice(from, to);
          try {
            await shareService
              .uploadFile(
                shareId,
                blob,
                {
                  id: fileId,
                  name: getNormalizedFileName(file),
                  description: file.description,
                },
                chunkIndex,
                chunks,
              )
              .then((response) => {
                fileId = response.id;
              });

            setFileProgress(((chunkIndex + 1) / chunks) * 100);
          } catch (e) {
            if (
              e instanceof AxiosError &&
              e.response?.data.error == "unexpected_chunk_index"
            ) {
              // Retry with the expected chunk index
              chunkIndex = e.response!.data!.expectedChunkIndex - 1;
              continue;
            } else {
              setFileProgress(-1);
              // Retry after 5 seconds
              await new Promise((resolve) => setTimeout(resolve, 5000));
              chunkIndex = -1;

              continue;
            }
          }
        }
      }),
    );

    await Promise.all(fileUploadPromises);
  };

  const removeFiles = async () => {
    const removedFiles = existingFiles.filter((file) => !!file.deleted);

    if (removedFiles.length > 0) {
      await Promise.all(
        removedFiles.map(async (file) => {
          await shareService.removeFile(shareId, file.id);
        }),
      );

      setExistingFiles(existingFiles.filter((file) => !file.deleted));
    }
  };

  const revertComplete = async () => {
    await shareService.revertComplete(shareId).then();
  };

  const completeShare = async () => {
    return await shareService.completeShare(shareId);
  };

  const save = async () => {
    setIsUploading(true);
    try {
      try {
        await revertComplete();
        await uploadFiles(uploadingFiles);

        const hasFailed = uploadingFiles.some(
          (file) => file.uploadingProgress == -1,
        );

        if (!hasFailed) {
          await removeFiles();
        }

        await completeShare();

        if (!hasFailed) {
          toast.success(t("share.edit.notify.save-success"));
          router.back();
        }
      } catch {
        const retry = () => save();
        showBlockingErrorModal(modals, {
          title: t("upload.save.error.title"),
          description: t("upload.save.error.description"),
          actions: [
            {
              label: t("common.button.retry"),
              color: "blue",
              variant: "filled",
              onClick: retry,
            },
            {
              label: t("common.button.go-back"),
              onClick: () => router.back(),
            },
          ],
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  const appendFiles = (appendingFiles: FileUpload[]) => {
    const combinedExisting = [...existingFiles, ...uploadingFiles];
    const filtered = filterDuplicateFiles(
      appendingFiles,
      combinedExisting,
      (normalizedName) => toast.error(t("upload.notify.duplicate-skipped", { name: normalizedName }))
    );
    if (filtered.length === 0) return;
    setUploadingFiles([...filtered, ...uploadingFiles]);
  };

  useEffect(() => {
    // Check if there are any files that failed to upload
    const fileErrorCount = uploadingFiles.filter(
      (file) => file.uploadingProgress == -1,
    ).length;

    if (fileErrorCount > 0) {
      if (!errorToastShown) {
        notifications.show({
          id: EDITABLE_ERROR_TOAST_ID,
          color: "red",
          title: t("common.error"),
          message: t("upload.notify.count-failed-honest", {
            count: fileErrorCount,
          }),
          withCloseButton: true,
          autoClose: false,
        });
        setErrorToastShown(true);
      }
    } else {
      notifications.hide(EDITABLE_ERROR_TOAST_ID);
      if (errorToastShown) setErrorToastShown(false);
    }
  }, [uploadingFiles, errorToastShown, t]);

  return (
    <>
      <Group justify="flex-end" mb={20}>
        <Button loading={isUploading} disabled={!dirty} onClick={() => save()}>
          <FormattedMessage id="common.button.save" />
        </Button>
      </Group>
      <Dropzone
        title={t("share.edit.append-upload")}
        maxShareSize={maxShareSize}
        currentFilesSize={currentFilesSize}
        onFilesChanged={appendFiles}
        isUploading={isUploading}
      />
      {existingAndUploadedFiles.length > 0 && (
        <FileList files={existingAndUploadedFiles} setFiles={setFiles} isLoading={isUploading} />
      )}
    </>
  );
};
export default EditableUpload;
