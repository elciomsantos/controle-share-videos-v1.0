import { Badge, Box, Button, Skeleton, Table, Text } from "@mantine/core";
import { dayjs } from "../../../utils/date.util";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../hooks/useTranslate.hook";
import { AdminSession, SessionState } from "../../../types/session.type";

const stateBadge = (state: SessionState, t: (key: string) => string) => {
  if (state === "active")
    return <Badge color="green">{t("admin.sessions.state.active")}</Badge>;
  if (state === "idle")
    return <Badge color="yellow">{t("admin.sessions.state.idle")}</Badge>;
  if (state === "expired")
    return <Badge color="gray">{t("admin.sessions.state.expired")}</Badge>;
  return <Badge color="red">{t("admin.sessions.state.revoked")}</Badge>;
};

const SessionsTable = ({
  sessions,
  isLoading,
  onRevoke,
}: {
  sessions: AdminSession[];
  isLoading: boolean;
  onRevoke: (session: AdminSession) => void;
}) => {
  const t = useTranslate();

  return (
    <Box style={{ display: "block", overflowX: "auto" }}>
      <Table verticalSpacing="sm">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="admin.sessions.columns.user" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.role" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.state" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.createdAt" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.lastActivityAt" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.expiresAt" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.ip" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.userAgent" />
            </th>
            <th>
              <FormattedMessage id="admin.sessions.columns.actions" />
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? [...Array(10)].map((_, i) => (
                <tr key={i}>
                  {[...Array(9)].map((__, j) => (
                    <td key={j}>
                      <Skeleton height={20} />
                    </td>
                  ))}
                </tr>
              ))
            : sessions.length === 0
              ? emptyRow
              : sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      {session.username ||
                        session.email ||
                        `${t("admin.sessions.user.id")} ${session.userId}`}
                    </td>
                    <td>{session.role ?? "-"}</td>
                    <td>{stateBadge(session.state, t)}</td>
                    <td>
                      {dayjs(session.createdAt).format("DD/MM/YYYY HH:mm")}
                    </td>
                    <td>
                      {dayjs(session.lastActivityAt).format("DD/MM/YYYY HH:mm")}
                    </td>
                    <td>
                      {dayjs(session.expiresAt).format("DD/MM/YYYY HH:mm")}
                    </td>
                    <td>{session.ipAddress ?? "-"}</td>
                    <td>
                      {session.userAgent ? (
                        <Text size="xs" color="dimmed" lineClamp={1}>
                          {session.userAgent}
                        </Text>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {session.state === "active" ||
                      session.state === "idle" ? (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={() => onRevoke(session)}
                        >
                          <FormattedMessage id="admin.sessions.revoke" />
                        </Button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
        </tbody>
      </Table>
    </Box>
  );
};

const emptyRow = (
  <tr>
    <td colSpan={9}>
      <Text color="dimmed" ta="center" py="lg">
        <FormattedMessage id="admin.sessions.empty" />
      </Text>
    </td>
  </tr>
);

export default SessionsTable;