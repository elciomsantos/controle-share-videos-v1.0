import { useModals } from "@mantine/modals";
import mime from "mime-types";
import { FileListItem, FileUpload } from "../../../types/File.type";
import TextEditor from "../TextEditor";
import { uuid } from "../../../utils/uuid.util";

type ModalsContextProps = ReturnType<typeof useModals>;

const showTextEditorModal = <T extends FileListItem>(
  index: number,
  files: T[],
  setFiles: (files: T[]) => void,
  text: string,
  modals: ModalsContextProps,
) => {
  const originalFile = files[index];
  const mimeType = (mime.contentType(originalFile.name) || "").split(";")[0];

  modals.openModal({
    title: `Editing ${originalFile.name}`,
    size: "xl",
    children: (
      <TextEditor
        initialText={text}
        onCancel={() => modals.closeAll()}
        onSave={(newText) => {
          const newBlob = new Blob([newText], { type: mimeType || "text/plain" });
          const newFile = new File([newBlob], originalFile.name, {
            type: mimeType || "text/plain",
          });

          const fileUpload: FileUpload = {
            id: uuid(),
            name: originalFile.name,
            size: newFile.size.toString(),
            description: originalFile.description ?? undefined,
            shareId: originalFile.shareId || "",
            createdAt: new Date(),
            mimeType: mimeType || false,
            uploadingProgress: 0,
            file: newFile,
          };

          const updatedFiles = [...files];
          updatedFiles[index] = fileUpload as unknown as T;
          setFiles(updatedFiles);
          modals.closeAll();
        }}
      />
    ),
  });
};

export default showTextEditorModal;
