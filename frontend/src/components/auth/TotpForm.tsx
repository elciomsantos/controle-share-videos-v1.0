import {
  Button,
  Container,
  Group,
  Paper,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useRouter } from "next/router";
import { useState } from "react";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import { safeRedirectPath } from "../../utils/router.util";
import toast from "../../utils/toast.util";

function TotpForm({ redirectPath }: { redirectPath: string }) {
  const t = useTranslate();
  const router = useRouter();
  const { refreshUser } = useUser();

  const [loading, setLoading] = useState(false);

  // SEC-1.2/15.3: aceita o código TOTP (6 dígitos) ou um recovery code de
  // uso único (10 caracteres hexadecimais).
  const validationSchema = yup.object().shape({
    code: yup
      .string()
      .matches(/^([0-9]{6}|[0-9a-f]{10})$/i, t("auth.wrongCredentials"))
      .required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      code: "",
    },
    validate: (values) => {
      try {
        validationSchema.validateSync(values, { abortEarly: false });
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

  const onSubmit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await authService.signInTotp(
        form.values.code,
        router.query.loginToken as string,
      );
      const user = await refreshUser();
      if (user?.passwordMustChange) {
        const next = safeRedirectPath(redirectPath);
        await router.replace(
          `/account/change-password?restricted=true&next=${encodeURIComponent(next)}`,
        );
      } else {
        await router.replace(safeRedirectPath(redirectPath));
      }
    } catch (e) {
      toast.axiosError(e);
      form.setFieldError("code", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container size={420} my={40}>
      <Title order={2} ta="center" fw={900}>
        <FormattedMessage id="totp.title" />
      </Title>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(onSubmit)}>
          <Group justify="center">
            <TextInput
              aria-label="One time code"
              autoFocus={true}
              autoCapitalize="characters"
              maxLength={10}
              style={{ flex: "1" }}
              {...form.getInputProps("code")}
            />
            <Button mt="md" type="submit" loading={loading}>
              {t("totp.button.signIn")}
            </Button>
          </Group>
        </form>
      </Paper>
    </Container>
  );
}

export default TotpForm;
