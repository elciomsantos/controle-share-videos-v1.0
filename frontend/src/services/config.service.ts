import Config, { AdminConfig, GetReturn, UpdateConfig } from "../types/config.type";
import api from "./api.service";
import { stringToTimespan } from "../utils/date.util";

/**
 * Categories recognized by the backend API — must match Prisma seed categories
 * (see backend/prisma/seed/config.seed.ts). All lowercase.
 */
const categories = [
  "general",
  "appearance",
  "email",
  "share",
  "smtp",
  "legal",
  "cache",
];

const list = async (): Promise<Config[]> => {
  return (await api.get("/configs")).data;
};

const getByCategory = async (categoryInput: string): Promise<AdminConfig[]> => {
  let category: string;
  if (categories.indexOf(categoryInput.trim()) === -1) {
    category = "general";
  } else {
    category = categoryInput.trim();
  }

  return (await api.get(`/configs/admin/${category}`)).data;
};

const updateMany = async (data: UpdateConfig[]): Promise<AdminConfig[]> => {
  return (await api.patch("/configs/admin", data)).data;
};

const get = <K extends string>(
  key: K,
  configVariables: Config[],
  returnDefault: boolean = false,
): GetReturn<K> => {
  if (!configVariables) return null as unknown as GetReturn<K>;

  const configVariable = configVariables.filter(
    (variable) => variable.key == key,
  )[0];

  if (!configVariable) throw new Error(`Config variable ${key} not found`);

  const value = returnDefault
    ? configVariable.defaultValue
    : (configVariable.value ?? configVariable.defaultValue);

  if (configVariable.type == "number" || configVariable.type == "filesize")
    return parseInt(value) as unknown as GetReturn<K>;
  if (configVariable.type == "boolean")
    return (value == "true") as unknown as GetReturn<K>;
  if (configVariable.type == "string" || configVariable.type == "text")
    return value as unknown as GetReturn<K>;
  if (configVariable.type == "timespan")
    return stringToTimespan(value) as unknown as GetReturn<K>;
  return undefined as unknown as GetReturn<K>;
};

const finishSetup = async (): Promise<AdminConfig[]> => {
  return (await api.post("/configs/admin/finishSetup")).data;
};

const sendTestEmail = async (email: string) => {
  await api.post("/configs/admin/testEmail", { email });
};

const testRedisConnection = async () => {
  return (await api.post("/configs/admin/testRedis")).data as {
    ok: boolean;
    enabled: boolean;
  };
};

const isNewReleaseAvailable = async () => {
  return false;
};

const changeLogo = async (file: File) => {
  const form = new FormData();
  form.append("file", file);

  await api.post("/configs/admin/logo", form);
};

const changeDarkLogo = async (file: File) => {
  const form = new FormData();
  form.append("file", file);

  await api.post("/configs/admin/logoDark", form);
};
export default {
  list,
  getByCategory,
  updateMany,
  get,
  finishSetup,
  sendTestEmail,
  testRedisConnection,
  isNewReleaseAvailable,
  changeLogo,
  changeDarkLogo,
};
