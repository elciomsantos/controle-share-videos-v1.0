import api from "./api.service";
import { AdminSessionPage, AdminSessionQuery } from "../types/session.type";

const list = async (params: AdminSessionQuery): Promise<AdminSessionPage> => {
  const query: Record<string, string | number> = {};
  if (params.userId) query.userId = params.userId;
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  return (await api.get("admin/sessions", { params: query })).data;
};

const revoke = async (sessionId: string) => {
  return (await api.post(`admin/sessions/${sessionId}/revoke`)).data;
};

const revokeAllByUser = async (userId: string) => {
  return (await api.post("admin/sessions/revoke-all", { userId })).data;
};

export default { list, revoke, revokeAllByUser };