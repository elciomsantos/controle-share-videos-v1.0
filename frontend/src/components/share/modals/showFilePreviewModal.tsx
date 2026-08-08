import { useModals } from "@mantine/modals";
import mime from "mime-types";
import { FileMetaData, FileRecord } from "../../../types/File.type";
import FilePreview from "../FilePreview";

type ModalsContextProps = ReturnType<typeof useModals>;

const showFilePreviewModal = (
  shareId: string,
  file: FileMetaData | FileRecord,
  modals: ModalsContextProps,
) => {
  const baseName = file.name.split("/").pop() || file.name;
  const mimeType = (mime.contentType(baseName) || "").split(";")[0];
  return modals.openModal({
    size: "xl",
    title: file.name,
    children: (
      <FilePreview
        shareId={shareId}
        fileId={file.id}
        mimeType={mimeType}
        description={file.description ?? undefined}
      />
    ),
  });
};

export default showFilePreviewModal;
