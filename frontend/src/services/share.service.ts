import mime from "mime-types";
import { FileUploadResponse } from "../types/File.type";

import {
  CreateShare,
  MyShare,
  Share,
  ShareMetaData,
  UpdateShare,
} from "../types/share.type";
import api from "./api.service";

const isValidId = (id: string) => {
  return /^[a-zA-Z0-9-]+$/.test(id);
};

const list = async (): Promise<MyShare[]> => {
  return (await api.get(`shares/all`)).data;
};

const create = async (share: CreateShare) => {
  return (await api.post("shares", share)).data;
};

const completeShare = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  const response = (await api.post(`shares/${id}/complete`)).data;
  return response;
};

const revertComplete = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.delete(`shares/${id}/complete`)).data;
};

const get = async (id: string): Promise<Share> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}`)).data;
};

const getFromOwner = async (id: string): Promise<Share> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}/from-owner`)).data;
};

const getMetaData = async (id: string): Promise<ShareMetaData> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.get(`shares/${id}/metaData`)).data;
};

const remove = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.delete(`shares/${id}`);
};

const update = async (id: string, share: UpdateShare): Promise<MyShare> => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  return (await api.patch(`shares/${id}`, share)).data;
};

const expire = async (id: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.post(`shares/${id}/expire`);
};

const getMyShares = async (): Promise<MyShare[]> => {
  return (await api.get("shares")).data;
};

const getShareToken = async (id: string, password?: string) => {
  if (!isValidId(id)) throw new Error("Invalid ID");
  await api.post(`/shares/${id}/token`, { password });
};

const isShareIdAvailable = async (id: string): Promise<boolean> => {
  if (!isValidId(id)) throw new Error("Invalid Share ID");
  return (await api.get(`/shares/isShareIdAvailable/${id}`)).data.isAvailable;
};

const doesFileSupportPreview = (fileName: string) => {
  const mimeType = (mime.contentType(fileName) || "").split(";")[0];

  if (!mimeType) return false;

  const supportedMimeTypes = [
    mimeType.startsWith("video/"),
    mimeType.startsWith("image/"),
    mimeType.startsWith("audio/"),
    mimeType.startsWith("text/"),
    mimeType == "application/pdf",
  ];

  return supportedMimeTypes.some((isSupported) => isSupported);
};

const isShareTextFile = (fileName: string) => {
  const mimeType = (mime.contentType(fileName) || "").split(";")[0];

  if (!mimeType) return false;

  return mimeType.startsWith("text/");
};

const downloadFile = async (
  shareId: string,
  fileId: string,
  recipientId?: string,
) => {
  const recipientQuery = recipientId
    ? `?recipient=${encodeURIComponent(recipientId)}`
    : "";
  const url = `${window.location.origin}/api/shares/${shareId}/files/${fileId}${recipientQuery}`;

  const response = await fetch(url, { credentials: "same-origin" });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.message || "Download failed") as Error & {
      response?: { data: { error?: string; message?: string } };
    };
    error.response = { data };
    throw error;
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const fileName = disposition
    ? disposition.split("filename=")[1]?.replace(/"/g, "")
    : fileId;
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
};

const removeFile = async (shareId: string, fileId: string) => {
  if (!isValidId(shareId)) throw new Error("Invalid Share ID");
  await api.delete(`shares/${shareId}/files/${fileId}`);
};

const uploadFile = async (
  shareId: string,
  chunk: Blob,
  file: {
    id?: string;
    name: string;
  },
  chunkIndex: number,
  totalChunks: number,
): Promise<FileUploadResponse> => {
  if (!isValidId(shareId)) throw new Error("Invalid Share ID");
  return (
    await api.post(`shares/${shareId}/files`, chunk, {
      headers: { "Content-Type": "application/octet-stream" },
      params: {
        id: file.id,
        name: file.name,
        chunkIndex,
        totalChunks,
      },
    })
  ).data;
};

export default {
  list,
  create,
  completeShare,
  revertComplete,
  getShareToken,
  get,
  getFromOwner,
  update,
  remove,
  expire,
  getMetaData,
  doesFileSupportPreview,
  isShareTextFile,
  getMyShares,
  isShareIdAvailable,
  downloadFile,
  removeFile,
  uploadFile,
};
