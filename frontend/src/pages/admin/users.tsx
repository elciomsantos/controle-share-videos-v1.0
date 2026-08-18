import { Button, Group, Space, Text, Title } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { TbPlus } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import ManageUserTable from "../../components/admin/users/ManageUserTable";
import showCreateUserModal from "../../components/admin/users/showCreateUserModal";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import userService from "../../services/user.service";
import User from "../../types/user.type";
import { withReauth } from "../../utils/reauth.util";
import toast from "../../utils/toast.util";

const Users = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const config = useConfig();
  const modals = useModals();
  const t = useTranslate();
  const { user: currentUser } = useUser();

  const getUsers = () => {
    setIsLoading(true);
    userService.list().then((users) => {
      setUsers(users);
      setIsLoading(false);
    });
  };

  const toggleUserActivation = (user: User) => {
    const activating = !user.isActivated;
    modals.openConfirmModal({
      title: t(
        activating
          ? "admin.users.activate.title"
          : "admin.users.deactivate.title",
        { username: user.username },
      ),
      children: (
        <Text size="sm">
          <FormattedMessage
            id={
              activating
                ? "admin.users.activate.description"
                : "admin.users.deactivate.description"
            }
          />
        </Text>
      ),
      labels: {
        confirm: t(activating ? "common.button.enable" : "common.button.disable"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: activating ? "green" : "red" },
      onConfirm: async () => {
        const run = () =>
          userService.update(user.id, { isActivated: activating });
        const done = () => {
          getUsers();
          toast.success(
            t(
              activating
                ? "admin.users.notify.activate.success"
                : "admin.users.notify.deactivate.success",
            ),
          );
        };
        run()
          .then(done)
          .catch(
            withReauth(modals, !!currentUser?.totpVerified)(() =>
              run().then(done),
            ),
          );
      },
    });
  };

  const deleteUser = (user: User) => {
    modals.openConfirmModal({
      title: t("admin.users.edit.delete.title", {
        username: user.username,
      }),
      children: (
        <Text size="sm">
          <FormattedMessage id="admin.users.edit.delete.description" />
        </Text>
      ),
      labels: {
        confirm: t("common.button.delete"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        const run = () => userService.remove(user.id);
        const done = () => setUsers(users.filter((v) => v.id != user.id));
        run()
          .then(done)
          .catch(withReauth(modals, !!currentUser?.totpVerified)(() => run().then(done)));
      },
    });
  };

  useEffect(() => {
    getUsers();
  }, []);

  return (
    <>
      <Meta title={t("admin.users.title")} />
      <Group justify="space-between" align="baseline" mb={20}>
        <Title mb={30} order={3}>
          <FormattedMessage id="admin.users.title" />
        </Title>
        <Button
          onClick={() =>
            showCreateUserModal(
              modals,
              config.get("smtp.enabled"),
              getUsers,
              currentUser,
            )
          }
          leftSection={<TbPlus size={20} />}
        >
          <FormattedMessage id="common.button.create" />
        </Button>
      </Group>

      <ManageUserTable
        users={users}
        getUsers={getUsers}
        deleteUser={deleteUser}
        toggleUserActivation={toggleUserActivation}
        isLoading={isLoading}
        currentUser={currentUser}
      />
      <Space h="xl" />
    </>
  );
};

export default Users;
