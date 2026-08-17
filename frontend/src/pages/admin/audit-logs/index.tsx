import {
  Button,
  Center,
  Grid,
  Pagination,
  Select,
  Space,
  Stack,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../../components/Meta";
import AuditLogsTable from "../../../components/admin/audit-logs/AuditLogsTable";
import useTranslate from "../../../hooks/useTranslate.hook";
import auditLogService from "../../../services/auditLog.service";
import {
  AUDIT_EVENTS,
  AuditLog,
} from "../../../types/auditLog.type";
import toast from "../../../utils/toast.util";

const PAGE_SIZE = 20;

const AuditLogs = () => {
  const t = useTranslate();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [eventType, setEventType] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [applied, setApplied] = useState<{
    eventType?: string;
    userId?: string;
    from?: string;
    to?: string;
  }>({});

  const fetchLogs = () => {
    setIsLoading(true);
    auditLogService
      .list({ ...applied, page, limit: PAGE_SIZE })
      .then((result) => {
        setLogs(result.data);
        setTotalPages(Math.max(1, result.totalPages));
        setIsLoading(false);
      })
      .catch((err) => {
        setIsLoading(false);
        toast.axiosError(err);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, [page, applied]);

  const applyFilters = () => {
    setPage(1);
    setApplied({
      eventType: eventType || undefined,
      userId: userId.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    });
  };

  const clearFilters = () => {
    setEventType("");
    setUserId("");
    setFrom("");
    setTo("");
    setApplied({});
    setPage(1);
  };

  return (
    <>
      <Meta title={t("admin.auditLogs.title")} />
      <Title mb={20} order={3}>
        <FormattedMessage id="admin.auditLogs.title" />
      </Title>

      <Stack gap="md" mb="lg">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.auditLogs.filters.userId")}
              value={userId}
              onChange={(e) => setUserId(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.auditLogs.filters.from")}
              placeholder="YYYY-MM-DD"
              value={from}
              onChange={(e) => setFrom(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.auditLogs.filters.to")}
              placeholder="YYYY-MM-DD"
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <Select
              label={t("admin.auditLogs.filters.event")}
              value={eventType}
              onChange={(value) => setEventType(value ?? "")}
              data={[
                { value: "", label: t("admin.auditLogs.filters.any") },
                ...AUDIT_EVENTS.map((event) => ({ value: event, label: event })),
              ]}
              searchable
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Button.Group>
              <Button onClick={applyFilters} variant="filled">
                <FormattedMessage id="common.button.submit" />
              </Button>
              <Button onClick={clearFilters} variant="light" color="gray">
                <FormattedMessage id="common.button.cancel" />
              </Button>
            </Button.Group>
          </Grid.Col>
        </Grid>
      </Stack>

      <AuditLogsTable logs={logs} isLoading={isLoading} />

      <Space h="lg" />
      <Center>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Center>
      <Space h="xl" />
    </>
  );
};

export default AuditLogs;