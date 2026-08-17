import {
  Alert,
  Button,
  Center,
  CopyButton,
  Group,
  Image,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import { useState } from "react";
import useTranslate, {
  translateOutsideContext,
} from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import toast from "../../utils/toast.util";
import { copyToClipboard } from "../../utils/clipboard.util";

type ModalsContextProps = ReturnType<typeof useModals>;

const showEnableTotpModal = (
  modals: ModalsContextProps,
  refreshUser: () => {},
  options: {
    qrCode: string;
    secret: string;
    password: string;
  },
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    title: t("account.modal.totp.title"),
    children: (
      <CreateEnableTotpModal options={options} refreshUser={refreshUser} />
    ),
  });
};

const CreateEnableTotpModal = ({
  options,
  refreshUser,
}: {
  options: {
    qrCode: string;
    secret: string;
    password: string;
  };
  refreshUser: () => {};
}) => {
  const modals = useModals();
  const t = useTranslate();
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const validationSchema = yup.object().shape({
    code: yup
      .string()
      .min(6)
      .max(6)
      .required()
      .matches(/^[0-9]+$/, { message: "Code must be a number" }),
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

  return (
    <div>
      <Center>
        <Stack>
          <Text>
            <FormattedMessage id="account.modal.totp.step1" />
          </Text>
          <Image src={options.qrCode} alt="QR Code" />

          <Center>
            <span>
              {" "}
              <FormattedMessage id="common.text.or" />
            </span>
          </Center>

          <Tooltip label={t("common.button.clickToCopy")}>
            <Button
              onClick={() => {
                copyToClipboard(options.secret);
                toast.success(t("common.notify.copied"));
              }}
            >
              {options.secret}
            </Button>
          </Tooltip>
          <Center>
            <Text fz="xs"></Text>
          </Center>

          <Text>
            <FormattedMessage id="account.modal.totp.step2" />
          </Text>

          <form
            onSubmit={form.onSubmit((values) => {
              authService
                .verifyTOTP(values.code, options.password)
                .then(({ recoveryCodes }) => {
                  setRecoveryCodes(recoveryCodes ?? []);
                })
                .catch(toast.axiosError);
            })}
          >
            <Group align="end">
              <TextInput
                style={{ flex: "1" }}
                variant="filled"
                label={t("account.modal.totp.code")}
                placeholder="******"
                {...form.getInputProps("code")}
              />

              <Button
                style={{ flex: "0 0 auto" }}
                variant="outline"
                type="submit"
              >
                <FormattedMessage id="account.modal.totp.verify" />
              </Button>
            </Group>
          </form>
        </Stack>
      </Center>

      {recoveryCodes.length > 0 && (
        <Center mt="md">
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
            <Button
              mt="xs"
              onClick={() => {
                toast.success(t("account.notify.totp.enable"));
                modals.closeAll();
                refreshUser();
              }}
            >
              <FormattedMessage id="totp.enroll.recovery.button" />
            </Button>
          </Stack>
        </Center>
      )}
    </div>
  );
};

export default showEnableTotpModal;
