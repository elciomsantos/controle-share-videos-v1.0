import { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";

export interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
  field?: string;
  [key: string]: unknown;
}

export type AxiosErrorWithResponse<T = ApiErrorResponse> = AxiosError<T> & {
  response?: AxiosResponse<T>;
};

export function getApiErrorMessage(error: AxiosErrorWithResponse | Error | unknown): string | undefined {
  const axiosError = error as AxiosErrorWithResponse;
  const data = axiosError.response?.data as ApiErrorResponse | undefined;

  const message = data?.message;
  if (typeof message === "string" && message.trim().length > 0) return message;
  if (Array.isArray(message)) {
    const joined = message.filter(Boolean).join("\n");
    if (joined.trim().length > 0) return joined;
  }

  const errorField = data?.error;
  if (typeof errorField === "string" && errorField.trim().length > 0)
    return errorField;

  if (error instanceof Error && typeof error.message === "string" && error.message.trim().length > 0)
    return error.message;

  try {
    if (data) return JSON.stringify(data, null, 2);
  } catch {
    // ignore
  }
  return undefined;
}

export function getApiErrorField(error: AxiosErrorWithResponse | unknown): string | undefined {
  const axiosError = error as AxiosErrorWithResponse;
  const data = axiosError.response?.data as ApiErrorResponse | undefined;
  const field = data?.field;
  if (typeof field === "string" && field.trim().length > 0) return field;
  return undefined;
}
