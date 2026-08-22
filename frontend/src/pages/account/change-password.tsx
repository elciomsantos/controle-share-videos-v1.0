import { Alert, Button, PasswordInput, Stack, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import * as yup from "yup";
import Head from "next/head";
import { safeRedirectPath } from "../../utils/router.util";
import { TbAlertCircle, TbCheck } from "react-icons/tb";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import showReauthModal from "../../components/auth/showReauthModal";
import toast from "../../utils/toast.util";

const ChangePassword = () => {
  const t = useTranslate();
  const router = useRouter();

  const modals = useModals();
  const { user } = useUser();

  const form = useForm({
    initialValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validate: (values) => {
      const schema = yup.object().shape({
        currentPassword: yup.string().required(t("common.error.field-required")),
        newPassword: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 }))
          .required(t("common.error.field-required")),
        confirmPassword: yup
          .string()
          .oneOf([yup.ref("newPassword")], t("common.error.passwords-not-match"))
          .required(t("common.error.field-required")),
      });
      try {
        schema.validateSync(values, { abortEarly: false });
        return {};
      } catch (err: any) {
        const errors: Record<string, string> = {};
        err.inner?.forEach((e: any) => {
          if (e.path) errors[e.path] = e.message;
        });
        return errors;
      }
    },
  });

  const isRestricted = router.query.restricted === "true";

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const nextPath = safeRedirectPath(
    typeof router.query.next === "string" ? router.query.next : undefined,
  );

  // Mantém a mensagem de sucesso visível antes de redirecionar.
  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => router.push(nextPath), 2500);
    return () => window.clearTimeout(id);
  }, [success, nextPath, router]);

  const handleSubmit = form.onSubmit(async (values) => {
    setLoading(true);
    try {
      await authService.updatePassword(values.currentPassword, values.newPassword);
      toast.success(t("account.changePassword.success"));
      setSuccess(true);
    } catch (err: any) {
      // SEC-1.2/15.4: reautenticação recente exigida — pede confirmação e
      // re-submete ao concluir.
      const data = err?.response?.data;
      if (
        err?.response?.status === 403 &&
        (data?.error === "reauthentication_required" ||
          data?.message === "reauthentication_required")
      ) {
        showReauthModal(modals, {
          hasTotp: !!user?.totpVerified,
          onSuccess: () => {
            void authService
              .updatePassword(values.currentPassword, values.newPassword)
              .then(() => {
                toast.success(t("account.changePassword.success"));
                setSuccess(true);
              })
              .catch(toast.axiosError);
          },
        });
        return;
      }
      toast.axiosError(err);
    } finally {
      setLoading(false);
    }
  });

  return (
    <>
      <Head>
        <title>{t("account.changePassword.title")}</title>
      </Head>
      <Stack style={{ maxWidth: 400, margin: "auto", marginTop: "xl" }}>
        <Title order={2} ta="center">
          {t("account.changePassword.title")}
        </Title>
        {isRestricted && (
          <Alert
            icon={<TbAlertCircle size={18} />}
            color="orange"
            variant="filled"
            title={t("account.changePassword.restricted")}
          >
            {t("account.changePassword.restricted")}
          </Alert>
        )}
        {success && (
          <Alert
            icon={<TbCheck size={18} />}
            color="green"
            variant="light"
            title={t("account.changePassword.success")}
          >
            {t("account.changePassword.next")}
          </Alert>
        )}
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <PasswordInput
              label={t("account.changePassword.current")}
              {...form.getInputProps("currentPassword")}
            />
            <PasswordInput
              label={t("account.changePassword.new")}
              {...form.getInputProps("newPassword")}
            />
            <PasswordInput
              label={t("account.changePassword.confirm")}
              {...form.getInputProps("confirmPassword")}
            />
            <Button type="submit" fullWidth loading={loading}>
              {t("account.changePassword.submit")}
            </Button>
          </Stack>
        </form>
      </Stack>
    </>
  );
};

export default ChangePassword;