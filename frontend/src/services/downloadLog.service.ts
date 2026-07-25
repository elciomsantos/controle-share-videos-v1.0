import api from "./api.service";
import {
  DownloadLogPage,
  DownloadLogQuery,
} from "../types/downloadLog.type";

const list = async (params: DownloadLogQuery): Promise<DownloadLogPage> => {
  const query: Record<string, string | number | boolean> = {};
  if (params.shareId) query.shareId = params.shareId;
  if (params.userId) query.userId = params.userId;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.event) query.event = params.event;
  if (params.success !== undefined) query.success = String(params.success);
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  return (await api.get("admin/download-logs", { params: query })).data;
};

export default { list };
