import { Button, Group } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { AxiosError } from "axios";
import pLimit from "p-limit";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import Dropzone from "../../components/upload/Dropzone";
import FileList from "../../components/upload/FileList";
import showCompletedUploadModal from "../../components/upload/modals/showCompletedUploadModal";
import showCreateUploadModal from "../../components/upload/modals/showCreateUploadModal";
import { showBlockingErrorModal } from "../../components/core/showBlockingErrorModal";
import useConfig from "../../hooks/config.hook";
import useConfirmLeave from "../../hooks/confirm-leave.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import shareService from "../../services/share.service";
import { FileUpload } from "../../types/File.type";
import { CreateShare, Share } from "../../types/share.type";
import toast from "../../utils/toast.util";
import { useRouter } from "next/router";
import { getNormalizedFileName, filterDuplicateFiles } from "../../utils/file.util";

const promiseLimit = pLimit(3);
const UPLOAD_ERROR_TOAST_ID = "upload-error-toast";
let errorToastShown = false;
let createdShare: Share;
let pendingGeneratedPassword: string | undefined;

const Upload = ({
  maxShareSize,
  simplified,
}: {
  maxShareSize?: number;
  simplified: boolean;
}) => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();

  const { user } = useUser();
  const config = useConfig();
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [isUploading, setisUploading] = useState(false);

  useConfirmLeave({
    message: t("upload.notify.confirm-leave"),
    enabled: isUploading,
  });

  const chunkSize = useRef(parseInt(config.get("share.chunkSize")));

  maxShareSize ??= parseInt(config.get("share.maxSize"));

  const currentFilesSize = useMemo(() => {
    return files.reduce((acc, file) => acc + file.size, 0);
  }, [files]);

  const autoOpenCreateUploadModal = config.get("share.autoOpenShareModal");

  const uploadFiles = async (share: CreateShare, files: FileUpload[]) => {
    setisUploading(true);

    try {
      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      const result = await shareService.create({
        ...share,
        size: totalSize,
      });
      createdShare = result;
      pendingGeneratedPassword = (result as any).generatedPassword;
    } catch (e) {
      toast.axiosError(e);
      setisUploading(false);
      return;
    }

    const fileUploadPromises = files.map(async (file, fileIndex) =>
      // Limit the number of concurrent uploads to 3
      promiseLimit(async () => {
        let fileId;

        const setFileProgress = (progress: number) => {
          setFiles((files) =>
            files.map((file, callbackIndex) => {
              if (fileIndex == callbackIndex) {
                file.uploadingProgress = progress;
              }
              return file;
            }),
          );
        };

        setFileProgress(1);

        let chunks = Math.ceil(file.size / chunkSize.current);

        // If the file is 0 bytes, we still need to upload 1 chunk
        if (chunks == 0) chunks++;

        for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex++) {
          const from = chunkIndex * chunkSize.current;
          const to = from + chunkSize.current;
          const blob = file.slice(from, to);
          try {
            await shareService
              .uploadFile(
                createdShare.id,
                blob,
                {
                  id: fileId,
                  name: getNormalizedFileName(file),
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

    Promise.all(fileUploadPromises);
  };

  const showCreateUploadModalCallback = (files: FileUpload[]) => {
    showCreateUploadModal(
      modals,
      {
        isUserSignedIn: user ? true : false,
        appUrl: config.get("general.appUrl"),
        defaultAppUrl: config.get("general.appUrl", true),
        allowUnauthenticatedShares: config.get(
          "share.allowUnauthenticatedShares",
        ),
        enableEmailRecepients: config.get("email.enableShareEmailRecipients"),
        maxExpiration: user?.isAdmin
          ? { value: 0, unit: "days" }
          : config.get("share.maxExpiration"),
        defaultExpiration: config.get("share.defaultExpiration"),
        shareIdLength: config.get("share.shareIdLength"),
        simplified,
        autoGeneratePassword: config.get("share.autoGeneratePassword"),
        generatedPasswordLength: parseInt(config.get("share.generatedPasswordLength")),
      },
      files,
      uploadFiles,
    );
  };

  const handleDropzoneFilesChanged = (newFiles: FileUpload[]) => {
    const filtered = filterDuplicateFiles(
      newFiles,
      files,
      (normalizedName) => toast.error(t("upload.notify.duplicate-skipped", { name: normalizedName }))
    );
    if (filtered.length === 0) return;

    if (autoOpenCreateUploadModal) {
      setFiles(filtered);
      showCreateUploadModalCallback(filtered);
    } else {
      setFiles((oldArr) => [...oldArr, ...filtered]);
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (modals.modals.length > 0) {
        return;
      }

      const clipboardData = e.clipboardData;

      if (!clipboardData) {
        return;
      }

      if (clipboardData?.getData("text/plain")) {
        const pastedText = clipboardData.getData("text/plain");
        if (!pastedText) {
          return;
        }

        // Create a sanitised file name from the pasted text
        const safeName = pastedText
          .substring(0, 50)
          .replace(/[^a-zA-Z0-9 ]/g, "")
          .trim();
        const fileName = `${safeName || "clipboard_paste"}.txt`;

        const file = new File([pastedText], fileName, {
          type: "text/plain",
        });
        const fileUpload = file as FileUpload;
        fileUpload.uploadingProgress = 0;

        const filtered = filterDuplicateFiles(
          [fileUpload],
          files,
          (normalizedName) => toast.error(t("upload.notify.duplicate-skipped", { name: normalizedName }))
        );
        if (filtered.length === 0) return;

        if (autoOpenCreateUploadModal) {
          setFiles(filtered);
          showCreateUploadModalCallback(filtered);
        } else {
          setFiles((oldArr) => [...oldArr, ...filtered]);
        }
      }
    };

    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [autoOpenCreateUploadModal, modals.modals.length]);

  useEffect(() => {
    // Check if there are any files that failed to upload
    const fileErrorCount = files.filter(
      (file) => file.uploadingProgress == -1,
    ).length;

    if (fileErrorCount > 0) {
      if (!errorToastShown) {
        notifications.show({
          id: UPLOAD_ERROR_TOAST_ID,
          color: "red",
          icon: undefined,
          title: t("common.error"),
          message: t("upload.notify.count-failed-honest", {
            count: fileErrorCount,
          }),
          withCloseButton: true,
          autoClose: false,
        });
      }
      errorToastShown = true;
    } else {
      notifications.hide(UPLOAD_ERROR_TOAST_ID);
      errorToastShown = false;
    }

    // Complete share
    if (
      files.length > 0 &&
      files.every((file) => file.uploadingProgress >= 100) &&
      fileErrorCount == 0
    ) {
      const attemptComplete = () =>
        shareService
          .completeShare(createdShare.id)
          .then((share) => {
            setisUploading(false);
            modals.closeAll();
            showCompletedUploadModal(
              modals,
              share,
              config.get("general.appUrl"),
              config.get("general.appUrl", true),
              pendingGeneratedPassword,
            );
            pendingGeneratedPassword = undefined;
            setFiles([]);
          })
          .catch((e: any) => {
            const discard = () =>
              shareService
                .remove(createdShare.id)
                .then(() => {
                  setisUploading(false);
                  setFiles([]);
                })
                .catch(() => setisUploading(false));

            showBlockingErrorModal(modals, {
              title: t("upload.complete.error.title"),
              description: t("upload.complete.error.description"),
              actions: [
                {
                  label: t("common.button.retry"),
                  color: "blue",
                  variant: "filled",
                  onClick: attemptComplete,
                },
                {
                  label: t("upload.button.discard"),
                  onClick: discard,
                },
              ],
            });
          });

      attemptComplete();
    }
  }, [files]);

  return (
    <>
      <Meta title={t("upload.title")} />
      <Group justify="flex-end" mb={20}>
        <Button
          loading={isUploading}
          disabled={files.length <= 0}
          onClick={() => showCreateUploadModalCallback(files)}
        >
          <FormattedMessage id="common.button.share" />
        </Button>
      </Group>
      <Dropzone
        title={
          !autoOpenCreateUploadModal && files.length > 0
            ? t("share.edit.append-upload")
            : undefined
        }
        maxShareSize={maxShareSize}
        currentFilesSize={currentFilesSize}
        onFilesChanged={handleDropzoneFilesChanged}
        isUploading={isUploading}
      />
      {files.length > 0 && (
        <FileList<FileUpload> files={files} setFiles={setFiles} />
      )}
    </>
  );
};
export default Upload;
