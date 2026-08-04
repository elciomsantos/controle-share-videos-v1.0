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
import DownloadLogsTable from "../../../components/admin/download-logs/DownloadLogsTable";
import useTranslate from "../../../hooks/useTranslate.hook";
import downloadLogService from "../../../services/downloadLog.service";
import {
  DownloadLog,
  DownloadLogEvent,
} from "../../../types/downloadLog.type";
import toast from "../../../utils/toast.util";

const PAGE_SIZE = 20;

const DownloadLogs = () => {
  const t = useTranslate();

  const [logs, setLogs] = useState<DownloadLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [shareId, setShareId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [event, setEvent] = useState<DownloadLogEvent | "">("");
  const [success, setSuccess] = useState<"" | "true" | "false">("");

  // Applied filters — only updated on "Apply"
  const [applied, setApplied] = useState<{
    shareId?: string;
    userId?: string;
    from?: string;
    to?: string;
    event?: DownloadLogEvent;
    success?: boolean;
  }>({});

  const fetchLogs = () => {
    setIsLoading(true);
    downloadLogService
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
      shareId: shareId.trim() || undefined,
      userId: userId.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
      event: event || undefined,
      success:
        success === "" ? undefined : success === "true" ? true : false,
    });
  };

  const clearFilters = () => {
    setShareId("");
    setUserId("");
    setFrom("");
    setTo("");
    setEvent("");
    setSuccess("");
    setApplied({});
    setPage(1);
  };

  return (
    <>
      <Meta title={t("admin.downloadLogs.title")} />
      <Title mb={20} order={3}>
        <FormattedMessage id="admin.downloadLogs.title" />
      </Title>

      <Stack gap="md" mb="lg">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.downloadLogs.filters.shareId")}
              value={shareId}
              onChange={(e) => setShareId(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.downloadLogs.filters.userId")}
              value={userId}
              onChange={(e) => setUserId(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.downloadLogs.filters.from")}
              placeholder="YYYY-MM-DD"
              value={from}
              onChange={(e) => setFrom(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.downloadLogs.filters.to")}
              placeholder="YYYY-MM-DD"
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <Select
              label={t("admin.downloadLogs.filters.event")}
              value={event}
              onChange={(value) => setEvent((value as DownloadLogEvent | "") ?? "")}
              data={[
                {
                  value: "",
                  label: t("admin.downloadLogs.filters.any"),
                },
                {
                  value: "download",
                  label: t("admin.downloadLogs.events.download"),
                },
                {
                  value: "view",
                  label: t("admin.downloadLogs.events.view"),
                },
                {
                  value: "upload",
                  label: t("admin.downloadLogs.events.upload"),
                },
                {
                  value: "delete",
                  label: t("admin.downloadLogs.events.delete"),
                },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <Select
              label={t("admin.downloadLogs.filters.success")}
              value={success}
              onChange={(value) =>
                setSuccess((value as "" | "true" | "false") ?? "")
              }
              data={[
                { value: "", label: t("admin.downloadLogs.filters.any") },
                {
                  value: "true",
                  label: t("admin.downloadLogs.status.success"),
                },
                {
                  value: "false",
                  label: t("admin.downloadLogs.status.failure"),
                },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 6 }}>
            <Button.Group>
              <Button onClick={applyFilters} variant="filled">
                <FormattedMessage id="common.button.submit" />
              </Button>
              <Button
                onClick={clearFilters}
                variant="light"
                color="gray"
              >
                <FormattedMessage id="common.button.cancel" />
              </Button>
            </Button.Group>
          </Grid.Col>
        </Grid>
      </Stack>

      <DownloadLogsTable logs={logs} isLoading={isLoading} />

      <Space h="lg" />
      <Center>
        <Pagination
          value={page}
          onChange={setPage}
          total={totalPages}
        />
      </Center>
      <Space h="xl" />
    </>
  );
};

export default DownloadLogs;
