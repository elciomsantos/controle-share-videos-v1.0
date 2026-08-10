import { useModals } from "@mantine/modals";
import { translateOutsideContext } from "../../../hooks/useTranslate.hook";
import { FileUpload } from "../../../types/File.type";
import { CreateShare } from "../../../types/share.type";
import CreateUploadModalBody, {
  CreateUploadModalOptions,
} from "./CreateUploadModalBody";
import SimplifiedCreateUploadModal from "./SimplifiedCreateUploadModal";

type ModalsContextProps = ReturnType<typeof useModals>;

const showCreateUploadModal = (
  modals: ModalsContextProps,
  options: CreateUploadModalOptions,
  files: FileUpload[],
  uploadCallback: (createShare: CreateShare, files: FileUpload[]) => void,
) => {
  const t = translateOutsideContext();

  if (options.simplified) {
    return modals.openModal({
      title: t("upload.modal.title"),
      centered: true,
      children: (
        <SimplifiedCreateUploadModal
          options={options}
          files={files}
          uploadCallback={uploadCallback}
        />
      ),
    });
  }

  return modals.openModal({
    title: t("upload.modal.title"),
    centered: true,
    children: (
      <CreateUploadModalBody
        options={options}
        files={files}
        uploadCallback={uploadCallback}
      />
    ),
  });
};

export default showCreateUploadModal;