import {
  Anchor,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import { showBlockingErrorModal } from "../core/showBlockingErrorModal";
import useConfig from "../../hooks/config.hook";
import useUser from "../../hooks/user.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import { safeRedirectPath } from "../../utils/router.util";
import { TbInfoCircle } from "react-icons/tb";

const SignInForm = ({ redirectPath }: { redirectPath: string }) => {
  const config = useConfig();
  const router = useRouter();
  const modals = useModals();
  const t = useTranslate();
  const { refreshUser } = useUser();

  const [showForgotPasswordLink, setShowForgotPasswordLink] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const validationSchema = yup.object().shape({
    emailOrUsername: yup.string().required(t("common.error.field-required")),
    password: yup.string().required(t("common.error.field-required")),
  });

  const form = useForm({
    initialValues: {
      emailOrUsername: "",
      password: "",
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

  useEffect(() => {
    if (!showCountdown) return;
    if (countdown <= 0) {
      setShowCountdown(false);
      return;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [showCountdown, countdown]);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await authService.signIn(email.trim(), password.trim());

      if (response.data["loginToken"]) {
        // Prompt the user to enter their totp code
        showNotification({
          icon: <TbInfoCircle />,
          color: "blue",
          radius: "md",
          title: t("signIn.notify.totp-required.title"),
          message: t("signIn.notify.totp-required.description"),
        });
        router.push(
          `/auth/totp/${
            response.data["loginToken"]
          }?redirect=${encodeURIComponent(redirectPath)}`,
        );
      } else {
        await refreshUser();
        router.replace(safeRedirectPath(redirectPath));
      }
    } catch (e: any) {
      const status = e.response?.status;
      const dataMessage = e.response?.data?.message;
      const accountNotActivatedMessage = t("auth.accountNotActivated");
      const isAccountNotActivated =
        dataMessage === accountNotActivatedMessage ||
        (typeof dataMessage === "string" &&
          dataMessage.toLowerCase().includes("não ativada"));

      if (status === 401 && isAccountNotActivated) {
        showBlockingErrorModal(modals, {
          title: t("signin.activated.title"),
          description: t("signin.activated.description"),
          actions: [
            {
              label: t("signin.button.resend-verification"),
              color: "blue",
              variant: "filled",
              onClick: async () => {
                try {
                  await authService.resendVerification(email.trim());
                  showNotification({
                    color: "green",
                    message: t("signin.activated.resent.success"),
                    autoClose: 4000,
                  });
                } catch {
                  // empty
                }
              },
            },
          ],
        });
        return;
      }

      if (status === 401) {
        // wrongCredentials -> inline field error on PasswordInput + clear password
        form.setFieldError("password", t("auth.wrongCredentials"));
        form.setFieldValue("password", "");
        setShowForgotPasswordLink(true);
        return;
      }

      if (status === 429) {
        const retryAfter = parseInt(
          e.response?.headers?.["retry-after"] ??
            e.response?.headers?.["Retry-After"] ??
            "60",
          10,
        );
        setCountdown(retryAfter);
        setShowCountdown(true);
        showBlockingErrorModal(modals, {
          title: t("signin.rate-limited.title"),
          description: t("signin.rate-limited.description", {
            seconds: retryAfter,
          }),
          actions: [
            {
              label: t("common.button.go-back"),
              color: "blue",
              variant: "filled",
            },
          ],
        });
        return;
      }

      // 500 / network / timeout -> blocking modal with retry/back
      const retry = () => signIn(email, password);
      showBlockingErrorModal(modals, {
        title: t("signin.server-error.title"),
        description: t("signin.server-error.description"),
        actions: [
          {
            label: t("common.button.retry"),
            color: "blue",
            variant: "filled",
            onClick: retry,
          },
          {
            label: t("common.button.go-back"),
          },
        ],
      });
    }
  };

  return (
    <Container size={420} my={40}>
      <Title order={2} ta="center" fw={900}>
        <FormattedMessage id="signin.title" />
      </Title>
      {config.get("share.allowRegistration") && (
        <Text color="dimmed" size="sm" ta="center" mt={5}>
          <FormattedMessage id="signin.description" />{" "}
          <Anchor component={Link} href={"signUp"} size="sm">
            <FormattedMessage id="signin.button.signup" />
          </Anchor>
        </Text>
      )}
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form
          onSubmit={form.onSubmit((values) => {
            signIn(values.emailOrUsername, values.password);
          })}
        >
          <TextInput
            label={t("signin.input.email-or-username")}
            placeholder={t("signin.input.email-or-username.placeholder")}
            {...form.getInputProps("emailOrUsername")}
          />
          <PasswordInput
            label={t("signin.input.password")}
            placeholder={t("signin.input.password.placeholder")}
            mt="md"
            {...form.getInputProps("password")}
          />
          {showForgotPasswordLink ? (
            <Group justify="flex-end" mt="xs">
              <Anchor component={Link} href="/auth/resetPassword" size="xs">
                <FormattedMessage id="signin.forgot-password" />
              </Anchor>
            </Group>
          ) : (
            config.get("smtp.enabled") && (
              <Group justify="flex-end" mt="xs">
                <Anchor component={Link} href="/auth/resetPassword" size="xs">
                  <FormattedMessage id="resetPassword.title" />
                </Anchor>
              </Group>
            )
          )}
          <Button
            fullWidth
            mt="xl"
            type="submit"
            disabled={showCountdown}
          >
            {showCountdown
              ? t("signin.rate-limited.description", { seconds: countdown })
              : <FormattedMessage id="signin.button.submit" />}
          </Button>
        </form>
      </Paper>
    </Container>
  );
};

export default SignInForm;
