import { getCookie } from "cookies-next";
import * as jose from "jose";
import api from "./api.service";

const signIn = async (emailOrUsername: string, password: string) => {
  const emailOrUsernameBody = emailOrUsername.includes("@")
    ? { email: emailOrUsername }
    : { username: emailOrUsername };

  const response = await api.post("auth/signIn", {
    ...emailOrUsernameBody,
    password,
  });

  return response;
};

const signInTotp = (totp: string, loginToken: string) => {
  return api.post("auth/signIn/totp", {
    totp,
    loginToken,
  });
};

// SEC-1.2/14.6: cadastro pré-login de TOTP (admins sem 2FA).
const totpEnroll = async (loginToken: string, password: string) => {
  const { data } = await api.post("/auth/totp/enroll", {
    loginToken,
    password,
  });
  return {
    totpAuthUrl: data.totpAuthUrl,
    totpSecret: data.totpSecret,
    qrCode: data.qrCode,
  };
};

const totpEnrollVerify = async (loginToken: string, code: string) => {
  const { data } = await api.post("/auth/totp/enroll/verify", {
    loginToken,
    code,
  });
  return { recoveryCodes: data.recoveryCodes as string[] };
};

// SEC-1.2/15.4: reautenticação forte para operações críticas.
const reauthenticate = async (password: string, totpCode?: string) => {
  await api.post("/auth/reauthenticate", {
    password,
    code: totpCode,
  });
};

// SEC-1.2/15.3: regeneração de recovery codes (uso único).
const regenerateRecoveryCodes = async (totpCode: string, password: string) => {
  const { data } = await api.post("/auth/totp/recovery", {
    code: totpCode,
    password,
  });
  return { recoveryCodes: data.recoveryCodes as string[] };
};

const signUp = async (email: string, username: string, password: string) => {
  const response = await api.post("auth/signUp", { email, username, password });

  return response;
};

const signOut = async () => {
  const response = await api.post("/auth/signOut");

  if (URL.canParse(response.data?.redirectURI))
    window.location.href = response.data.redirectURI;
  else window.location.href = "/";
};

const refreshAccessToken = async () => {
  try {
    const accessToken =
      (getCookie("__Host-SID") as string) ||
      (getCookie("access_token") as string);

    // If the access token expires in less than 2 minutes refresh it
    if (
      accessToken &&
      (jose.decodeJwt(accessToken).exp ?? 0) * 1000 < Date.now() + 2 * 60 * 1000
    ) {
      await api.post("/auth/token");
    }
  } catch (e) {
    console.info("Refresh token invalid or expired");
  }
};

const requestResetPassword = async (email: string) => {
  // SEC-NEW-1: e-mail no body (não no path) para não vazar em access logs.
  await api.post("/auth/resetPassword/request", { email });
};

const resetPassword = async (token: string, password: string) => {
  await api.post("/auth/resetPassword", { token, password });
};

const verifyAccount = async (token: string) => {
  await api.post(`/auth/verify`, { token });
};

const resendVerification = async (email: string) => {
  await api.post("/auth/verify/resend", { email });
};

const updatePassword = async (oldPassword: string, password: string) => {
  await api.patch("/auth/password", { oldPassword, password });
};

const enableTOTP = async (password: string) => {
  const { data } = await api.post("/auth/totp/enable", { password });

  return {
    totpAuthUrl: data.totpAuthUrl,
    totpSecret: data.totpSecret,
    qrCode: data.qrCode,
  };
};

const verifyTOTP = async (totpCode: string, password: string) => {
  const { data } = await api.post("/auth/totp/verify", {
    code: totpCode,
    password,
  });
  return { recoveryCodes: (data?.recoveryCodes as string[]) ?? [] };
};

const disableTOTP = async (totpCode: string, password: string) => {
  await api.post("/auth/totp/disable", {
    code: totpCode,
    password,
  });
};

export default {
  signIn,
  signInTotp,
  totpEnroll,
  totpEnrollVerify,
  reauthenticate,
  regenerateRecoveryCodes,
  signUp,
  signOut,
  refreshAccessToken,
  updatePassword,
  requestResetPassword,
  resetPassword,
  verifyAccount,
  resendVerification,
  enableTOTP,
  verifyTOTP,
  disableTOTP,
};
