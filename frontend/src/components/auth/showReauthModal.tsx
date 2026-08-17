import {
  Button,
  Center,
  Group,
  PasswordInput,
  PinInput,
  Stack,
  Text,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate, {
  translateOutsideContext,
} from "../../hooks/useTranslate.hook";
import authService from "../../services/auth.service";
import toast from "../../utils/toast.util";

type ModalsContextProps = ReturnType<typeof useModals>;

/**
 * SEC-1.2/15.4 — Modal de reautenticação recente. Ao confirmar senha (+ TOTP),
 * renova o marco da sessão e executa `onSuccess` (ex.: re-submete a operação).
 */
const showReauthModal = (
  modals: ModalsContextProps,
  options: {
    hasTotp: boolean;
    onSuccess: () => void;
  },
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    title: t("reauthenticate.modal.title"),
    children: <ReauthBody {...options} />,
  });
};

const ReauthBody = ({
  hasTotp,
  onSuccess,
}: {
  hasTotp: boolean;
  onSuccess: () => void;
}) => {
  const modals = useModals();
  const t = useTranslate();

  const form = useForm({
    initialValues: {
      password: "",
      code: "",
    },
    validate: (values) => {
      try {
        yup
          .object({
            password: yup
              .string()
              .required(t("common.error.field-required")),
            code: yup.string().optional(),
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

  const onSubmit = form.onSubmit(async (values) => {
    try {
      await authService.reauthenticate(values.password, values.code || undefined);
      toast.success(t("reauthenticate.notify.success"));
      modals.closeAll();
      onSuccess();
    } catch (e) {
      toast.axiosError(e);
    }
  });

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <Text size="sm">
          <FormattedMessage id="reauthenticate.modal.description" />
        </Text>
        <PasswordInput
          label={t("reauthenticate.input.password")}
          {...form.getInputProps("password")}
        />
        {hasTotp && (
          <Group justify="center">
            <PinInput
              length={6}
              oneTimeCode
              aria-label="TOTP"
              onComplete={(code: string) => {
                form.setFieldValue("code", code);
              }}
              {...form.getInputProps("code")}
            />
          </Group>
        )}
        <Center>
          <Button type="submit">
            <FormattedMessage id="reauthenticate.button.confirm" />
          </Button>
        </Center>
      </Stack>
    </form>
  );
};

export default showReauthModal;