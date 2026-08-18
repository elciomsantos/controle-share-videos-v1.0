import { ActionIcon, Badge, Box, Group, Skeleton, Table } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { TbEdit, TbTrash, TbUserCheck, TbUserOff } from "react-icons/tb";
import User from "../../../types/user.type";
import showUpdateUserModal from "./showUpdateUserModal";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../hooks/useTranslate.hook";
import { HoverTip } from "../../core/HoverTip";

const ManageUserTable = ({
  users,
  getUsers,
  deleteUser,
  toggleUserActivation,
  isLoading,
  currentUser,
}: {
  users: User[];
  getUsers: () => void;
  deleteUser: (user: User) => void;
  toggleUserActivation: (user: User) => void;
  isLoading: boolean;
  currentUser?: User | null;
}) => {
  const modals = useModals();
  const t = useTranslate();

  const isAdminUser = (user: User) =>
    user.isAdmin || user.role === "admin";

  const activeAdminCount = users.filter(
    (u) => isAdminUser(u) && u.isActivated,
  ).length;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge color="red">{t("roles.admin")}</Badge>;
      case "auditor":
        return <Badge color="blue">{t("roles.auditor")}</Badge>;
      default:
        return <Badge color="green">{t("roles.operador")}</Badge>;
    }
  };

  const getStatusBadge = (activated: boolean) =>
    activated ? (
      <Badge color="green">{t("admin.users.table.status.active")}</Badge>
    ) : (
      <Badge color="gray">{t("admin.users.table.status.inactive")}</Badge>
    );

  return (
    <Box style={{ display: "block", overflowX: "auto" }}>
      <Table verticalSpacing="sm">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="admin.users.table.username" />
            </th>
            <th>
              <FormattedMessage id="admin.users.table.email" />
            </th>
            <th>
              <FormattedMessage id="admin.users.table.role" />
            </th>
            <th>
              <FormattedMessage id="admin.users.table.status" />
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? skeletonRows
            : users.map((user) => (
                <tr
                  key={user.id}
                  style={{ opacity: user.isActivated ? 1 : 0.55 }}
                >
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>{getRoleBadge(user.isAdmin ? "admin" : (user.role || "operador"))}</td>
                  <td>{getStatusBadge(user.isActivated)}</td>
                  <td>
                    <Group justify="flex-end">
                      <HoverTip label={t("common.button.edit")}>
                        <ActionIcon
                          variant="light"
                          color="blue"
                          size={25}
                          onClick={() =>
                            showUpdateUserModal(modals, user, getUsers, currentUser)
                          }
                        >
                          <TbEdit />
                        </ActionIcon>
                      </HoverTip>
                      {user.id !== currentUser?.id &&
                        (user.isActivated
                          ? !(isAdminUser(user) && activeAdminCount === 1) && (
                              <HoverTip label={t("admin.users.toggle.deactivate")}>
                                <ActionIcon
                                  variant="light"
                                  color="gray"
                                  size={25}
                                  onClick={() => toggleUserActivation(user)}
                                >
                                  <TbUserOff />
                                </ActionIcon>
                              </HoverTip>
                            )
                          : (
                              <HoverTip label={t("admin.users.toggle.activate")}>
                                <ActionIcon
                                  variant="light"
                                  color="green"
                                  size={25}
                                  onClick={() => toggleUserActivation(user)}
                                >
                                  <TbUserCheck />
                                </ActionIcon>
                              </HoverTip>
                            ))}
                      <HoverTip label={t("common.button.delete")}>
                        <ActionIcon
                          variant="light"
                          color="red"
                          size={25}
                          onClick={() => deleteUser(user)}
                        >
                          <TbTrash />
                        </ActionIcon>
                      </HoverTip>
                    </Group>
                  </td>
                </tr>
              ))}
        </tbody>
      </Table>
    </Box>
  );
};

const skeletonRows = [...Array(10)].map((v, i) => (
  <tr key={i}>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
    <td>
      <Skeleton key={i} height={20} />
    </td>
  </tr>
));

export default ManageUserTable;
