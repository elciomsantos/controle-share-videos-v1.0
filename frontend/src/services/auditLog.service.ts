import api from "./api.service";
import { AuditLogPage, AuditLogQuery } from "../types/auditLog.type";

const list = async (params: AuditLogQuery): Promise<AuditLogPage> => {
  const query: Record<string, string | number> = {};
  if (params.eventType) query.eventType = params.eventType;
  if (params.userId) query.userId = params.userId;
  if (params.from) query.from = params.from;
  if (params.to) query.to = params.to;
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  return (await api.get("admin/audit-logs", { params: query })).data;
};

export default { list };