import {
  CreateUser,
  CurrentUser,
  UpdateCurrentUser,
  UpdateUser,
} from "../types/user.type";
import api from "./api.service";

const list = async () => {
  return (await api.get("/users")).data;
};

const create = async (user: CreateUser) => {
  return (await api.post("/users", user)).data;
};

const update = async (id: string, user: UpdateUser) => {
  return (await api.patch(`/users/${id}`, user)).data;
};

const remove = async (id: string) => {
  await api.delete(`/users/${id}`);
};

const updateCurrentUser = async (user: UpdateCurrentUser) => {
  return (await api.patch("/users/me", user)).data;
};

const removeCurrentUser = async () => {
  await api.delete("/users/me");
};

const getCurrentUser = async (): Promise<CurrentUser | null> => {
  try {
    // Sem refresh explícito aqui: o interceptor do api.service já faz o
    // refresh deduplicado no 401 de `users/me` e reenvia a requisição. O
    // refresh explícito anterior causava um segundo `/auth/token` por chamada
    // (visível como 401 duplicado no console) e disputava o mesmo refresh
    // token de uso único.
    return (await api.get("users/me")).data;
  } catch {
    return null;
  }
};

const checkAvailability = async (params: { username?: string; email?: string }) => {
  return (await api.get("/users/check-availability", { params })).data;
};

export default {
  list,
  create,
  update,
  remove,
  getCurrentUser,
  updateCurrentUser,
  removeCurrentUser,
  checkAvailability,
};
