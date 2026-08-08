import { FileRecord, FileUpload } from "../types/File.type";

type FileLike = FileRecord & { webkitRelativePath?: string };

type ExistingFileLike = {
  name: string;
  webkitRelativePath?: string;
  deleted?: boolean;
};

export const getNormalizedFileName = (file: FileLike | ExistingFileLike): string => {
  const pathName = "webkitRelativePath" in file && file.webkitRelativePath
    ? file.webkitRelativePath
    : file.name;
  return pathName.replace(/\\/g, "/").replace(/^\//, "");
};

export const filterDuplicateFiles = <T extends FileLike>(
  newFiles: T[],
  existingFilesList: ExistingFileLike[],
  onDuplicateDetected: (name: string) => void
): T[] => {
  const existingNames = new Set(
    existingFilesList
      .filter((file) => !file.deleted)
      .map((file) => getNormalizedFileName(file))
  );

  const filtered: T[] = [];
  const seenInBatch = new Set<string>();

  for (const file of newFiles) {
    const normalizedName = getNormalizedFileName(file);
    if (existingNames.has(normalizedName) || seenInBatch.has(normalizedName)) {
      onDuplicateDetected(normalizedName);
    } else {
      seenInBatch.add(normalizedName);
      filtered.push(file);
    }
  }
  return filtered;
};
