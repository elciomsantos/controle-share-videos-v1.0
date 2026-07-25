import {
  Button,
  Group,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import userService from "../../../services/user.service";
import { getApiErrorField, getApiErrorMessage } from "../../../utils/error.util";
import toast from "../../../utils/toast.util";
import FileSizeInput from "../../core/FileSizeInput";

type ModalsContextProps = ReturnType<typeof useModals>;

const showCreateUserModal = (
  modals: ModalsContextProps,
  smtpEnabled: boolean,
  getUsers: () => void,
) => {
  const t = useTranslate();
  return modals.openModal({
    title: t("admin.users.modal.create.title"),
    children: (
      <Body modals={modals} smtpEnabled={smtpEnabled} getUsers={getUsers} />
    ),
  });
};

const Body = ({
  modals,
  smtpEnabled,
  getUsers,
}: {
  modals: ModalsContextProps;
  smtpEnabled: boolean;
  getUsers: () => void;
}) => {
  const t = useTranslate();
  const [checkingField, setCheckingField] = useState<"username" | "email" | null>(null);
  const form = useForm({
    initialValues: {
      username: "",
      email: "",
      password: undefined,
      role: "operador",
      setPasswordManually: false,
      generatePassword: true,
      hasCustomShareSizeLimit: false,
      shareSizeLimit: 104857600,
    },
    validate: (values) => {
      const schema = yup.object().shape({
        email: yup.string().email(t("common.error.invalid-email")),
        username: yup
          .string()
          .min(3, t("common.error.too-short", { length: 3 })),
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 }))
          .optional(),
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

  useEffect(() => {
    if (!form.values.username || form.values.username.length < 3) return;
    const timer = setTimeout(async () => {
      setCheckingField("username");
      try {
        const result = await userService.checkAvailability({ username: form.values.username });
        if (!result.available && result.field === "username") {
          form.setFieldError("username", t("admin.users.error.duplicated-username"));
        } else if (form.errors.username === t("admin.users.error.duplicated-username")) {
          form.clearFieldError("username");
        }
      } catch {
        // ignore network errors during debounce
      }
      setCheckingField(null);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.values.username]);

  useEffect(() => {
    if (!form.values.email || !form.values.email.includes("@")) return;
    const timer = setTimeout(async () => {
      setCheckingField("email");
      try {
        const result = await userService.checkAvailability({ email: form.values.email });
        if (!result.available && result.field === "email") {
          form.setFieldError("email", t("admin.users.error.duplicated-email"));
        } else if (form.errors.email === t("admin.users.error.duplicated-email")) {
          form.clearFieldError("email");
        }
      } catch {
        // ignore network errors during debounce
      }
      setCheckingField(null);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.values.email]);

  return (
    <Stack>
      <form
        onSubmit={form.onSubmit(async (values) => {
          userService
            .create({
              username: values.username,
              email: values.email,
              password: values.password,
              role: values.role,
              generatePassword: values.generatePassword,
              shareSizeLimit: values.hasCustomShareSizeLimit
                ? values.shareSizeLimit.toString()
                : null,
            })
            .then((result) => {
              getUsers();
              if (result.temporaryPassword) {
                modals.openConfirmModal({
                  title: t("admin.users.modal.create.temporaryPassword"),
                  children: (
                    <Stack gap="md">
                      <p>{t("admin.users.modal.create.temporaryPassword.warning")}</p>
                      <div
                        style={{
                          background: "var(--mantine-color-gray-1)",
                          padding: "md",
                          borderRadius: "md",
                          fontFamily: "monospace",
                          wordBreak: "break-all",
                        }}
                      >
                        {result.temporaryPassword}
                      </div>
                      <Button
                        onClick={() => {
                          navigator.clipboard.writeText(result.temporaryPassword);
                          toast.success(t("common.notify.copied"));
                        }}
                      >
                        {t("common.button.copy")}
                      </Button>
                    </Stack>
                  ),
                  labels: {
                    confirm: t("common.button.done"),
                    cancel: t("common.button.cancel"),
                  },
                  cancelProps: { style: { display: "none" } },
                  onClose: () => modals.closeAll(),
                });
              } else {
                modals.closeAll();
              }
            })
            .catch((e) => {
              const field = getApiErrorField(e);
              if (field === "username" || field === "email") {
                form.setFieldError(field, getApiErrorMessage(e) ?? t("admin.users.error.duplicated"));
              } else {
                toast.axiosError(e);
              }
            });
        })}
      >
        <Stack>
          <TextInput
            label={t("admin.users.modal.create.username")}
            rightSection={checkingField === "username" ? <Loader size="xs" /> : undefined}
            {...form.getInputProps("username")}
          />
          <TextInput
            label={t("admin.users.modal.create.email")}
            rightSection={checkingField === "email" ? <Loader size="xs" /> : undefined}
            {...form.getInputProps("email")}
          />
          <Select
            label={t("admin.users.modal.create.role")}
            description={t("admin.users.modal.create.role.description")}
            placeholder={t("admin.users.modal.create.role.placeholder")}
            data={[
              { value: "admin", label: t("roles.admin") },
              { value: "operador", label: t("roles.operador") },
              { value: "auditor", label: t("roles.auditor") },
            ]}
            {...form.getInputProps("role")}
          />
          {smtpEnabled && (
            <Switch
              mt="xs"
              labelPosition="left"
              label={t("admin.users.modal.create.manual-password")}
              description={t(
                "admin.users.modal.create.manual-password.description",
              )}
              {...form.getInputProps("setPasswordManually", {
                type: "checkbox",
              })}
            />
          )}
          <Switch
            mt="xs"
            labelPosition="left"
            label={t("admin.users.modal.create.generatePassword")}
            description={t("admin.users.modal.create.generatePassword.description")}
            {...form.getInputProps("generatePassword", { type: "checkbox" })}
          />
          {(form.values.setPasswordManually || !smtpEnabled || !form.values.generatePassword) && (
            <PasswordInput
              label={t("admin.users.modal.create.password")}
              {...form.getInputProps("password")}
            />
          )}
          <Switch
            styles={{
              body: {
                display: "flex",
                justifyContent: "space-between",
              },
            }}
            mt="xs"
            labelPosition="left"
            label={t("admin.users.modal.create.custom-share-size-limit")}
            description={t(
              "admin.users.modal.create.custom-share-size-limit.description",
            )}
            {...form.getInputProps("hasCustomShareSizeLimit", {
              type: "checkbox",
            })}
          />
          {form.values.hasCustomShareSizeLimit && (
            <FileSizeInput
              label={t("admin.users.modal.create.custom-share-size-limit")}
              value={form.values.shareSizeLimit}
              onChange={(val) => form.setFieldValue("shareSizeLimit", val)}
            />
          )}
          <Group justify="flex-end">
            <Button type="submit">
              <FormattedMessage id="common.button.create" />
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
};

export default showCreateUserModal;
