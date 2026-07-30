import { Alert, Button, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useRouter } from "next/router";
import { useIntl } from "react-intl";
import * as yup from "yup";
import Head from "next/head";
import { TbAlertCircle } from "react-icons/tb";
import useTranslate from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import toast from "../../utils/toast.util";

const ChangePassword = () => {
  const t = useTranslate();
  const router = useRouter();
  const intl = useIntl();

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

  const handleSubmit = form.onSubmit(async (values) => {
    try {
      await authService.updatePassword(values.currentPassword, values.newPassword);
      toast.success(t("account.changePassword.success"));
      const next =
        typeof router.query.next === "string" &&
        router.query.next.startsWith("/") &&
        !router.query.next.startsWith("//")
          ? router.query.next
          : "/";
      router.push(next);
    } catch (err: any) {
      toast.axiosError(err);
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
            <Button type="submit" fullWidth>
              {t("account.changePassword.submit")}
            </Button>
          </Stack>
        </form>
      </Stack>
    </>
  );
};

export default ChangePassword;