import { useModals } from "@mantine/modals";
import showReauthModal from "../components/auth/showReauthModal";
import toast from "./toast.util";

type ModalsContextProps = ReturnType<typeof useModals>;

export const isReauthRequiredError = (err: any) =>
  err?.response?.status === 403 &&
  (err?.response?.data?.error === "reauthentication_required" ||
    err?.response?.data?.message === "reauthentication_required");

/**
 * SEC-1.2/15.4 — Encapsula o tratamento de 403 reauthentication_required:
 * abre o modal de reautenticação (senha + TOTP) e re-executa a operação após
 * sucesso. Qualquer outro erro cai no toast padrão.
 */
export const withReauth =
  (modals: ModalsContextProps, hasTotp: boolean) =>
  (run: () => Promise<unknown>) =>
  (err: any) => {
    if (isReauthRequiredError(err)) {
      showReauthModal(modals, {
        hasTotp,
        onSuccess: () => {
          run().catch((e) => toast.axiosError(e));
        },
      });
      return;
    }
    toast.axiosError(err);
  };