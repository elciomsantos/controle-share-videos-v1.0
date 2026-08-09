import { Badge, Box, Skeleton, Table, Text } from "@mantine/core";
import { dayjs } from "../../../utils/date.util";
import { FormattedMessage } from "react-intl";
import { byteToHumanSizeString } from "../../../utils/fileSize.util";
import useTranslate from "../../../hooks/useTranslate.hook";
import { DownloadLog } from "../../../types/downloadLog.type";

const formatFileSize = (value?: string | null) => {
  if (!value) return "-";
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return "-";
  return byteToHumanSizeString(n);
};

const DownloadLogsTable = ({
  logs,
  isLoading,
}: {
  logs: DownloadLog[];
  isLoading: boolean;
}) => {
  const t = useTranslate();

  const eventBadge = (event: string) => {
    if (event === "view") {
      return <Badge color="victoria">{t("admin.downloadLogs.events.view")}</Badge>;
    }
    if (event === "upload") {
      return <Badge color="green">{t("admin.downloadLogs.events.upload")}</Badge>;
    }
    if (event === "delete") {
      return <Badge color="red">{t("admin.downloadLogs.events.delete")}</Badge>;
    }
    return <Badge color="blue">{t("admin.downloadLogs.events.download")}</Badge>;
  };

  const statusBadge = (success: boolean) =>
    success ? (
      <Badge color="green">{t("admin.downloadLogs.status.success")}</Badge>
    ) : (
      <Badge color="red">{t("admin.downloadLogs.status.failure")}</Badge>
    );

  return (
    <Box style={{ display: "block", overflowX: "auto" }}>
      <Table verticalSpacing="sm">
        <thead>
          <tr>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.createdAt" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.shareId" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.fileName" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.fileSize" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.event" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.username" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.ip" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.userAgent" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.success" />
            </th>
            <th>
              <FormattedMessage id="admin.downloadLogs.columns.reason" />
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? skeletonRows
            : logs.length === 0
              ? emptyRow
              : logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      {dayjs(log.createdAt)
                        .format("LLL")}
                    </td>
                    <td>{log.shareId}</td>
                    <td>{log.fileName || "-"}</td>
                    <td>{formatFileSize(log.fileSize)}</td>
                    <td>{eventBadge(log.event)}</td>
                    <td>{log.username ?? (log.userId ? log.userId : "-")}</td>
                    <td>{log.ip}</td>
                    <td>
                      {log.userAgent ? (
                        <Text size="xs" color="dimmed" lineClamp={1}>
                          {log.userAgent}
                        </Text>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{statusBadge(log.success)}</td>
                    <td>
                      <Text size="xs" color="dimmed">
                        {log.reason ?? "-"}
                      </Text>
                    </td>
                  </tr>
                ))}
        </tbody>
      </Table>
    </Box>
  );
};

const skeletonRows = [...Array(10)].map((_, i) => (
  <tr key={i}>
    {[...Array(10)].map((__, j) => (
      <td key={j}>
        <Skeleton height={20} />
      </td>
    ))}
  </tr>
));

const emptyRow = (
  <tr>
    <td colSpan={10}>
      <Text color="dimmed" ta="center" py="lg">
        <FormattedMessage id="admin.downloadLogs.empty" />
      </Text>
    </td>
  </tr>
);

export default DownloadLogsTable;
