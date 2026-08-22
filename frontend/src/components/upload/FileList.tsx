import { ActionIcon, Table, Group, Box } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { TbTrash, TbEdit } from "react-icons/tb";
import { GrUndo } from "react-icons/gr";
import { FileListItem, FileUpload } from "../../types/File.type";
import { byteToHumanSizeString } from "../../utils/fileSize.util";
import UploadProgressIndicator from "./UploadProgressIndicator";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../hooks/useTranslate.hook";
import { HoverTip } from "../core/HoverTip";
import showTextEditorModal from "./modals/showTextEditorModal";

const renderFileName = (name: string) => {
  const parts = name.split("/");
  if (parts.length === 1) return name;
  const fileName = parts.pop();
  const folderPath = parts.join("/");
  return (
    <span>
      <span style={{ opacity: 0.5 }}>{folderPath}/</span>
      <span style={{ fontWeight: 600 }}>{fileName}</span>
    </span>
  );
};

const getFileNameOrPath = (file: FileListItem): string => {
  const pathName = "webkitRelativePath" in file && file.webkitRelativePath
    ? (file as { webkitRelativePath: string }).webkitRelativePath
    : file.name;
  return pathName.replace(/\\/g, "/").replace(/^\//, "");
};

const FileListRow = ({
  file,
  onRemove,
  onRestore,
  onEdit,
}: {
  file: FileListItem;
  onRemove?: () => void;
  onRestore?: () => void;
  onEdit?: () => void;
}) => {
  const t = useTranslate();
  const uploadable = "uploadingProgress" in file;
  const uploading = uploadable && file.uploadingProgress !== 0;
  const removable = uploadable
    ? file.uploadingProgress === 0
    : onRemove && "deleted" in file && !file.deleted;
  const restorable = uploadable ? false : onRestore && "deleted" in file && file.deleted;
  const editable = uploadable
    ? file.uploadingProgress === 0 && "deleted" in file && !file.deleted
    : onEdit && "deleted" in file && !file.deleted;
  const fileName = getFileNameOrPath(file);
  const fileSize = "size" in file ? byteToHumanSizeString(Number(file.size)) : "";

  return (
    <tr style={{ opacity: "deleted" in file && file.deleted ? 0.4 : 1 }}>
      <td>{renderFileName(fileName)}</td>
      <td>{fileSize}</td>
      <td>{file.description || "-"}</td>
      <td>
        <Group justify="flex-end" wrap="nowrap">
          {uploadable && uploading && (
            <UploadProgressIndicator progress={file.uploadingProgress} />
          )}
          {editable && (
            <HoverTip label={t("share.file.edit")}>
              <ActionIcon color="blue" variant="light" size={25} onClick={onEdit}>
                <TbEdit />
              </ActionIcon>
            </HoverTip>
          )}
          {removable && (
            <HoverTip label={t("share.file.remove")}>
              <ActionIcon color="red" variant="light" size={25} onClick={onRemove}>
                <TbTrash />
              </ActionIcon>
            </HoverTip>
          )}
          {restorable && (
            <HoverTip label={t("share.file.restore")}>
              <ActionIcon color="green" variant="light" size={25} onClick={onRestore}>
                <GrUndo />
              </ActionIcon>
            </HoverTip>
          )}
        </Group>
      </td>
    </tr>
  );
};

const FileList = ({ files, setFiles, isLoading }: {
  files: (FileListItem | FileUpload)[];
  setFiles: (files: FileListItem[] | FileUpload[]) => void;
  isLoading?: boolean;
}) => {
  const modals = useModals();

  const handleRemove = (file: FileListItem) => {
    setFiles(files.map((f) => (f === file ? { ...f, deleted: true } : f)));
  };

  const handleRestore = (file: FileListItem) => {
    setFiles(files.map((f) => (f === file ? { ...f, deleted: false } : f)));
  };

  const handleEdit = (file: FileListItem) => {
    const idx = files.findIndex((f) => f === file);
    showTextEditorModal(idx, files, setFiles, "", modals);
  };

  // A lista fica visível durante o upload para exibir o progresso por arquivo
  // (UploadProgressIndicator); o placeholder só é usado enquanto os arquivos
  // existentes estão sendo carregados do servidor.
  if (isLoading) {
    return (
      <Box style={{ minHeight: 200 }}>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 50 }}>
          <FormattedMessage id="common.loading" />
        </div>
      </Box>
    );
  }

  return (
    <Table>
      <thead>
        <tr>
          <th>
            <FormattedMessage id="share.table.name" />
          </th>
          <th>
            <FormattedMessage id="share.table.size" />
          </th>
          <th>
            <FormattedMessage id="share.table.description" />
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <FileListRow
            key={file.id}
            file={file}
            onRemove={() => handleRemove(file)}
            onRestore={() => handleRestore(file)}
            onEdit={() => handleEdit(file)}
          />
        ))}
      </tbody>
    </Table>
  );
};

export default FileList;
