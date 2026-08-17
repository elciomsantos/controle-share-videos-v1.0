import { Badge, Box, Skeleton, Table, Text } from "@mantine/core";
import { dayjs } from "../../../utils/date.util";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../hooks/useTranslate.hook";
import { AuditLog } from "../../../types/auditLog.type";

const eventColor = (event: string) => {
  if (event === "LOGIN_FAILURE" || event === "MFA_FAILED") return "red";
  if (event === "REFRESH_TOKEN_REUSE_DETECTED") return "orange";
  if (event === "SESSION_REVOKED" || event === "ADMIN_SESSION_REVOKED")
    return "grape";
  if (
    event === "PASSWORD_CHANGED" ||
    event === "PASSWORD_RESET_COMPLETED" ||
    event === "ROLE_CHANGED" ||
    event === "PERMISSION_CHANGED"
  )
    return "yellow";
  if (event === "SHARE_REVOKED") return "pink";
  return "blue";
};

const resultBadge = (result?: string | null) => {
  if (!result) return "-";
  if (result === "success") return <Badge color="green">{result}</Badge>;
  if (result === "failure") return <Badge color="red">{result}</Badge>;
  return (
    <Badge color="gray" variant="light">
      {result}
    </Badge>
  );
};

const AuditLogsTable = ({
  logs,
  isLoading,
}: {
  logs: AuditLog[];
  isLoading: boolean;
}) => {
  const t = useTranslate();

  return (
    <Box style={{ display: "block", overflowX: "auto" }}>
      <Table verticalSpacing="sm">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.createdAt" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.event" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.user" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.result" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.resource" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.ip" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.userAgent" />
            </th>
            <th>
              <FormattedMessage id="admin.auditLogs.columns.requestId" />
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? [...Array(10)].map((_, i) => (
                <tr key={i}>
                  {[...Array(8)].map((__, j) => (
                    <td key={j}>
                      <Skeleton height={20} />
                    </td>
                  ))}
                </tr>
              ))
            : logs.length === 0
              ? emptyRow
              : logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      {dayjs(log.createdAt).format("DD/MM/YYYY HH:mm:ss")}
                    </td>
                    <td>
                      <Badge color={eventColor(log.eventType)}>
                        {log.eventType}
                      </Badge>
                    </td>
                    <td>
                      {log.user
                        ? `${log.user.username || log.user.email}`
                        : log.userId
                          ? `${t("admin.auditLogs.user.id")} ${log.userId}`
                          : "-"}
                    </td>
                    <td>{resultBadge(log.result)}</td>
                    <td>
                      <Text size="xs" style={{ fontFamily: "monospace" }}>
                        {log.resource ?? "-"}
                      </Text>
                    </td>
                    <td>{log.ipAddress ?? "-"}</td>
                    <td>
                      {log.userAgent ? (
                        <Text size="xs" color="dimmed" lineClamp={1}>
                          {log.userAgent}
                        </Text>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {log.requestId ? (
                        <Text size="xs" color="dimmed" lineClamp={1}>
                          {log.requestId}
                        </Text>
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
    <td colSpan={8}>
      <Text color="dimmed" ta="center" py="lg">
        <FormattedMessage id="admin.auditLogs.empty" />
      </Text>
    </td>
  </tr>
);

export default AuditLogsTable;