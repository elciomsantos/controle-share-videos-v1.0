import {
  Accordion,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { FormattedMessage, useIntl } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import userService from "../../../services/user.service";
import User from "../../../types/user.type";
import toast from "../../../utils/toast.util";
import FileSizeInput from "../../core/FileSizeInput";

type ModalsContextProps = ReturnType<typeof useModals>;

const showUpdateUserModal = (
  modals: ModalsContextProps,
  user: User,
  getUsers: () => void,
) => {
  return modals.openModal({
    title: (
      <FormattedMessage
        id="admin.users.edit.update.title"
        values={{ username: user.username }}
      />
    ),
    children: (
      <Body modals={modals} user={user} getUsers={getUsers} />
    ),
  });
};

const Body = ({
  modals,
  user,
  getUsers,
}: {
  modals: ModalsContextProps;
  user: User;
  getUsers: () => void;
}) => {
  const t = useTranslate();
  const intl = useIntl();
  const accountForm = useForm({
    initialValues: {
      username: user.username,
      email: user.email,
      isActivated: user.isActivated,
      role: user.isAdmin ? "admin" : (user.role || "operador"),
      hasCustomShareSizeLimit: !!user.shareSizeLimit,
      shareSizeLimit: user.shareSizeLimit
        ? parseInt(user.shareSizeLimit)
        : 104857600,
    },
    validate: (values) => {
      const schema = yup.object().shape({
        email: yup.string().email(t("common.error.invalid-email")),
        username: yup
          .string()
          .min(3, t("common.error.too-short", { length: 3 })),
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

  const passwordForm = useForm({
    initialValues: {
      password: "",
    },
    validate: (values) => {
      const schema = yup.object().shape({
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 })),
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

  const isLastAdmin = user.isAdmin || user.role === "admin";

  return (
    <Stack>
      <form
        id="accountForm"
        onSubmit={accountForm.onSubmit(async (values) => {
          userService
            .update(user.id, {
              username: values.username,
              email: values.email,
              isActivated: values.isActivated,
              role: values.role,
              shareSizeLimit: values.hasCustomShareSizeLimit
                ? values.shareSizeLimit.toString()
                : null,
            })
            .then(() => {
              getUsers();
              modals.closeAll();
            })
            .catch(toast.axiosError);
        })}
      >
        <Stack>
          <TextInput
            label={t("admin.users.table.username")}
            {...accountForm.getInputProps("username")}
          />
          <TextInput
            label={t("admin.users.table.email")}
            {...accountForm.getInputProps("email")}
          />
          <Select
            label={t("admin.users.modal.create.role")}
            description={t("admin.users.modal.create.role.description")}
            data={[
              { value: "admin", label: t("admin.users.modal.create.role.admin") },
              { value: "operador", label: t("admin.users.modal.create.role.operador") },
              { value: "auditor", label: t("admin.users.modal.create.role.auditor") },
            ]}
            disabled={isLastAdmin}
            {...accountForm.getInputProps("role")}
          />
          <Switch
            mt="xs"
            labelPosition="left"
            label={t("admin.users.edit.update.email-verified")}
            {...accountForm.getInputProps("isActivated", { type: "checkbox" })}
            disabled={user.isActivated}
          />
          <Switch
            styles={{
              body: {
                display: "flex",
                justifyContent: "space-between",
              },
            }}
            mt="xs"
            labelPosition="left"
            label={t("admin.users.edit.update.custom-share-size-limit")}
            description={t(
              "admin.users.edit.update.custom-share-size-limit.description",
            )}
            {...accountForm.getInputProps("hasCustomShareSizeLimit", {
              type: "checkbox",
            })}
          />
          {accountForm.values.hasCustomShareSizeLimit && (
            <FileSizeInput
              label={t("admin.users.edit.update.custom-share-size-limit")}
              value={accountForm.values.shareSizeLimit}
              onChange={(val) =>
                accountForm.setFieldValue("shareSizeLimit", val)
              }
            />
          )}
        </Stack>
      </form>
      <Accordion>
        <Accordion.Item style={{ borderBottom: "none" }} value="changePassword">
          <Accordion.Control px={0}>
            <FormattedMessage id="admin.users.edit.update.change-password.title" />
          </Accordion.Control>
          <Accordion.Panel>
            <form
              onSubmit={passwordForm.onSubmit(async (values) => {
                userService
                  .update(user.id, {
                    password: values.password,
                  })
                  .then(() =>
                    toast.success(
                      t("admin.users.edit.update.notify.password.success"),
                    ),
                  )
                  .catch(toast.axiosError);
              })}
            >
              <Stack>
                <PasswordInput
                  label={t("admin.users.edit.update.change-password.field")}
                  {...passwordForm.getInputProps("password")}
                />
                <Button variant="light" type="submit">
                  <FormattedMessage id="admin.users.edit.update.change-password.button" />
                </Button>
              </Stack>
            </form>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Group justify="flex-end">
        <Button type="submit" form="accountForm">
          <FormattedMessage id="common.button.save" />
        </Button>
      </Group>
    </Stack>
  );
};

export default showUpdateUserModal;
