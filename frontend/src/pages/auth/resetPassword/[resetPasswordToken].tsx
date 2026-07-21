import {
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Text,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import authService from "../../../services/auth.service";
import toast from "../../../utils/toast.util";

const ResetPassword = () => {
  const router = useRouter();
  const t = useTranslate();

  const resetSchema = yup.object().shape({
    password: yup
      .string()
      .min(8, t("common.error.too-short", { length: 8 }))
      .required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      password: "",
    },
    validate: (values) => {
      try {
        resetSchema.validateSync(values, { abortEarly: false });
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

  const resetPasswordToken = router.query.resetPasswordToken as string;

  return (
    <Container size={460} my={30}>
      <Title order={2} fw={900} ta="center">
        <FormattedMessage id="resetPassword.text.resetPassword" />
      </Title>
      <Text color="dimmed" size="sm" ta="center">
        <FormattedMessage id="resetPassword.text.enterNewPassword" />
      </Text>

      <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
        <form
          onSubmit={form.onSubmit((values) => {
            authService
              .resetPassword(resetPasswordToken, values.password)
              .then(() => {
                toast.success(t("resetPassword.notify.passwordReset"));

                router.push("/auth/signIn");
              })
              .catch(toast.axiosError);
          })}
        >
          <PasswordInput
            label={t("resetPassword.input.password")}
            placeholder="••••••••••"
            {...form.getInputProps("password")}
          />
          <Group justify="flex-end" mt="lg">
            <Button type="submit">
              <FormattedMessage id="resetPassword.text.resetPassword" />
            </Button>
          </Group>
        </form>
      </Paper>
    </Container>
  );
};

export default ResetPassword;
