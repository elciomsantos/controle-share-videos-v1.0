import {
  Accordion,
  Alert,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useModals } from "@mantine/modals";
import { FormattedMessage, useIntl } from "react-intl";
import { useState } from "react";
import { TbCheck } from "react-icons/tb";
import * as yup from "yup";
import useTranslate from "../../../hooks/useTranslate.hook";
import userService from "../../../services/user.service";
import showReauthModal from "../../auth/showReauthModal";
import User from "../../../types/user.type";
import toast from "../../../utils/toast.util";

type ModalsContextProps = ReturnType<typeof useModals>;

const showUpdateUserModal = (
  modals: ModalsContextProps,
  user: User,
  getUsers: () => void,
  currentUser?: User | null,
) => {
  return modals.openModal({
    title: (
      <FormattedMessage
        id="admin.users.edit.update.title"
        values={{ username: user.username }}
      />
    ),
    children: (
      <Body
        modals={modals}
        user={user}
        getUsers={getUsers}
        currentUser={currentUser}
      />
    ),
  });
};

const Body = ({
  modals,
  user,
  getUsers,
  currentUser,
}: {
  modals: ModalsContextProps;
  user: User;
  getUsers: () => void;
  currentUser?: User | null;
}) => {
  const t = useTranslate();
  const intl = useIntl();

  const VALID_ROLES = ["admin", "operador", "auditor"];

  const [passwordChanged, setPasswordChanged] = useState(false);

  // SEC-1.2/15.4: o admin não troca a própria senha por este canal — deve usar
  // a página "Trocar senha" da própria conta. A troca de senha de outros
  // usuários (ex.: reset de senha esquecida) permanece habilitada.
  const isSelf = currentUser?.id === user.id;

  // SEC-1.2/15.4: operações críticas exigem reautenticação recente. Ao receber
  // 403, abre o modal de confirmação e re-submete após sucesso.
  const withReauth = (run: () => Promise<unknown>) => (err: any) => {
    const data = err?.response?.data;
    if (
      err?.response?.status === 403 &&
      (data?.error === "reauthentication_required" ||
        data?.message === "reauthentication_required")
    ) {
      showReauthModal(modals, {
        hasTotp: !!currentUser?.totpVerified,
        onSuccess: () => {
          run().catch((e) => toast.axiosError(e));
        },
      });
      return;
    }
    toast.axiosError(err);
  };
  const accountForm = useForm({
    initialValues: {
      username: user.username,
      email: user.email,
      isActivated: user.isActivated,
      role: user.isAdmin
        ? "admin"
        : (VALID_ROLES.includes(user.role) ? user.role : "operador"),
    },
    validate: (values) => {
      const schema = yup.object().shape({
        email: yup.string().email(t("common.error.invalid-email")),
        username: yup
          .string()
          .min(3, t("common.error.too-short", { length: 3 }))
          .matches(
            /^[a-zA-Z0-9_.]*$/,
            t("common.error.username-pattern"),
          ),
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
        onSubmit={accountForm.onSubmit((values) => {
          const run = () =>
            userService.update(user.id, {
              username: values.username,
              email: values.email,
              isActivated: values.isActivated,
              role: values.role,
            });
          run()
            .then(() => {
              getUsers();
              modals.closeAll();
            })
            .catch(withReauth(() => run().then(() => {
              getUsers();
              modals.closeAll();
            })));
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
        </Stack>
      </form>
      {isSelf ? (
        <Text size="sm" c="dimmed">
          <FormattedMessage id="admin.users.edit.update.change-password.self" />
        </Text>
      ) : (
        <Accordion>
          <Accordion.Item style={{ borderBottom: "none" }} value="changePassword">
            <Accordion.Control px={0}>
              <FormattedMessage id="admin.users.edit.update.change-password.title" />
            </Accordion.Control>
            <Accordion.Panel>
              {passwordChanged && (
                <Alert
                  icon={<TbCheck size={18} />}
                  color="green"
                  variant="light"
                  mb="sm"
                >
                  <FormattedMessage id="admin.users.edit.update.notify.password.success" />
                </Alert>
              )}
              <form
                onSubmit={passwordForm.onSubmit((values) => {
                  const run = () =>
                    userService.update(user.id, {
                      password: values.password,
                    });
                  const done = () => {
                    setPasswordChanged(true);
                    toast.success(
                      t("admin.users.edit.update.notify.password.success"),
                    );
                  };
                  run()
                    .then(done)
                    .catch(withReauth(() => run().then(done)));
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
      )}
      <Group justify="flex-end">
        <Button
          variant="subtle"
          type="button"
          onClick={() => modals.closeAll()}
        >
          <FormattedMessage id="common.button.close" />
        </Button>
        <Button type="submit" form="accountForm">
          <FormattedMessage id="common.button.save" />
        </Button>
      </Group>
    </Stack>
  );
};

export default showUpdateUserModal;
