import {
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Group,
  Paper,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import Link from "next/link";
import { useRouter } from "next/router";
import { TbArrowLeft } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import authService from "../../../services/auth.service";
import toast from "../../../utils/toast.util";

const ResetPassword = () => {
  const router = useRouter();
  const t = useTranslate();

  const resetSchema = yup.object().shape({
    email: yup
      .string()
      .email(t("common.error.invalid-email"))
      .required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      email: "",
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

  return (
    <Container size={460} my={30}>
      <Title order={2} fw={900} ta="center">
        <FormattedMessage id="resetPassword.title" />
      </Title>
      <Text color="dimmed" size="sm" ta="center">
        <FormattedMessage id="resetPassword.description" />
      </Text>

      <Paper withBorder shadow="md" p={30} radius="md" mt="xl">
        <form
          onSubmit={form.onSubmit((values) =>
            authService
              .requestResetPassword(values.email)
              .then(() => {
                toast.success(t("resetPassword.notify.success"));
                router.push("/auth/signIn");
              })
              .catch(toast.axiosError),
          )}
        >
          <TextInput
            label={t("signup.input.email")}
            placeholder={t("signup.input.email.placeholder")}
            {...form.getInputProps("email")}
          />
          <Group justify="space-between" mt="lg">
            <Anchor
              component={Link}
              color="dimmed"
              size="sm"
              href={"/auth/signIn"}
            >
              <Center inline>
                <TbArrowLeft size={12} />
                <Box ml={5}>
                  <FormattedMessage id="resetPassword.button.back" />
                </Box>
              </Center>
            </Anchor>
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
