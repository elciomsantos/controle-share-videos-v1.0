import pLimit from "p-limit";

export const UPLOAD_CONCURRENCY = 3;

export const createUploadLimiter = () => pLimit(UPLOAD_CONCURRENCY);
