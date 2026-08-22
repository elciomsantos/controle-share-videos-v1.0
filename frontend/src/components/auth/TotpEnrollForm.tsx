import {
  Alert,
  Button,
  Center,
  Container,
  CopyButton,
  Group,
  Image,
  Paper,
  PasswordInput,
  PinInput,
  Stack,
  Text,

  Title,
  Tooltip,
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

/**
 * SEC-1.2/14.6 — Cadastro de TOTP pré-login para contas administrativas.
 * Fluxo em etapas: senha → QR/segredo → código → recovery codes (uma única vez).
 */
function TotpEnrollForm({
  loginToken,
  redirectPath,
}: {
  loginToken: string;
  redirectPath: string;
}) {
  const t = useTranslate();
  const router = useRouter();
  const { refreshUser } = useUser();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string>();
  const [totpSecret, setTotpSecret] = useState<string>();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>();

  const passwordForm = useForm({
    initialValues: { password: "" },
    validate: (values) => {
      try {
        yup
          .object({
            password: yup
              .string()
              .required(t("common.error.field-required")),
          })
          .validateSync(values, { abortEarly: false });
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

  const codeForm = useForm({
    initialValues: { code: "" },
    validate: (values) => {
      try {
        yup
          .object({
            code: yup
              .string()
              .min(6, t("common.error.too-short", { length: 6 }))
              .required(t("common.error.field-required")),
          })
          .validateSync(values, { abortEarly: false });
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

  const startEnroll = async (password: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await authService.totpEnroll(loginToken, password);
      setQrCode(result.qrCode);
      setTotpSecret(result.totpSecret);
      setStep(2);
    } catch (e) {
      toast.axiosError(e);
      passwordForm.setFieldError("password", "error");
    } finally {
      setLoading(false);
    }
  };

  const verifyEnroll = async (code: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await authService.totpEnrollVerify(loginToken, code);
      setRecoveryCodes(result.recoveryCodes);
      setStep(3);
    } catch (e) {
      toast.axiosError(e);
      codeForm.setFieldError("code", "error");
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    toast.success(t("totp.enroll.notify.success"));
    const user = await refreshUser();
    if (user?.passwordMustChange) {
      const next = safeRedirectPath(redirectPath);
      await router.replace(
        `/account/change-password?restricted=true&next=${encodeURIComponent(next)}`,
      );
    } else {
      await router.replace(safeRedirectPath(redirectPath));
    }
  };

  return (
    <Container size={460} my={40}>
      <Title order={2} ta="center" fw={900}>
        <FormattedMessage id="totp.enroll.title" />
      </Title>
      <Text color="dimmed" size="sm" ta="center" mt={5}>
        <FormattedMessage id="totp.enroll.description" />
      </Text>
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        {step === 1 && (
          <form
            onSubmit={passwordForm.onSubmit((values) =>
              startEnroll(values.password),
            )}
          >
            <Stack>
              <PasswordInput
                label={t("reauthenticate.input.password")}
                {...passwordForm.getInputProps("password")}
              />
              <Button type="submit" loading={loading}>
                <FormattedMessage id="totp.enroll.step1.button" />
              </Button>
            </Stack>
          </form>
        )}

        {step === 2 && (
          <Stack>
            <Text>
              <FormattedMessage id="totp.enroll.step2.title" />
            </Text>
            <Center>
              <Image src={qrCode} alt="QR Code" />
            </Center>
            {totpSecret && (
              <CopyButton value={totpSecret}>
                {({ copied, copy }) => (
                  <Tooltip
                    label={
                      copied
                        ? t("common.notify.copied")
                        : t("common.button.clickToCopy")
                    }
                  >
                    <Button
                      variant="light"
                      onClick={() => {
                        copy();
                        toast.success(t("common.notify.copied"));
                      }}
                    >
                      {totpSecret}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            )}
            <Text>
              <FormattedMessage id="totp.enroll.step3.title" />
            </Text>
            <form
              onSubmit={codeForm.onSubmit((values) =>
                verifyEnroll(values.code),
              )}
            >
              <Center>
                <PinInput
                  length={6}
                  oneTimeCode
                  autoFocus={true}
                  onComplete={(code: string) => verifyEnroll(code)}
                  {...codeForm.getInputProps("code")}
                />
              </Center>
              <Button fullWidth mt="md" type="submit" loading={loading}>
                <FormattedMessage id="totp.enroll.button.verify" />
              </Button>
            </form>
          </Stack>
        )}

        {step === 3 && recoveryCodes && (
          <Stack>
            <Alert color="yellow" title={t("totp.enroll.recovery.title")}>
              <Text size="sm">
                <FormattedMessage id="totp.enroll.recovery.description" />
              </Text>
            </Alert>
            <Group justify="center" gap="xs">
              {recoveryCodes.map((code) => (
                <CopyButton key={code} value={code}>
                  {({ copied, copy }) => (
                    <Tooltip
                      label={
                        copied
                          ? t("common.notify.copied")
                          : t("common.button.clickToCopy")
                      }
                    >
                      <Button
                        variant="light"
                        size="xs"
                        onClick={() => {
                          copy();
                          toast.success(t("common.notify.copied"));
                        }}
                      >
                        {code}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
              ))}
            </Group>
            <Button mt="md" onClick={finish}>
              <FormattedMessage id="totp.enroll.recovery.button" />
            </Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}

export default TotpEnrollForm;