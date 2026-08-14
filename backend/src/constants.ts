import { LogLevel } from "@nestjs/common";
import * as path from "path";

export const CONFIG_FILE = process.env.CONFIG_FILE || "../config.yaml";

export const DATA_DIRECTORY = process.env.DATA_DIRECTORY || "./data";
// Imagens usadas no cabeçalho padrão dos certificados (logo + brasão). Em
// produção o build copia backend/assets/images para o container; localmente
// aponta para ./assets/images relativo ao DATA_DIRECTORY.
export const CERTIFICATE_ASSETS_DIRECTORY =
  process.env.CERTIFICATE_ASSETS_DIRECTORY ||
  path.resolve(path.dirname(DATA_DIRECTORY), "assets/images");
export const SHARE_DIRECTORY = `${DATA_DIRECTORY}/uploads/shares`;
export const DATABASE_URL =
  process.env.DATABASE_URL ||
  "file:./data/controle-videos.db";

export const LOG_LEVEL_AVAILABLE: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
export const LOG_LEVEL_DEFAULT: LogLevel = process.env.NODE_ENV === 'development' ? "verbose" : "log";
export const LOG_LEVEL_ENV = `${process.env.PV_LOG_LEVEL || ""}`;

// Argon2id options: memory=128MB, timeCost=4, parallelism=2
// Stronger than library defaults (64MB/3/4) for internal-only use
export const ARGON2_OPTIONS = {
  type: 2, // argon2id
  memoryCost: 131072,
  timeCost: 4,
  parallelism: 2,
} as const;