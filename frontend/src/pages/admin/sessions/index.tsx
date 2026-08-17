import {
  Button,
  Center,
  Grid,
  Pagination,
  Space,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../../components/Meta";
import SessionsTable from "../../../components/admin/sessions/SessionsTable";
import useTranslate from "../../../hooks/useTranslate.hook";
import adminSessionService from "../../../services/adminSession.service";
import { AdminSession } from "../../../types/session.type";
import toast from "../../../utils/toast.util";

const PAGE_SIZE = 20;

const Sessions = () => {
  const t = useTranslate();

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [userId, setUserId] = useState("");
  const [applied, setApplied] = useState<{ userId?: string }>({});

  const modals = useModals();

  const fetchSessions = () => {
    setIsLoading(true);
    adminSessionService
      .list({ ...applied, page, limit: PAGE_SIZE })
      .then((result) => {
        setSessions(result.data);
        setTotalPages(Math.max(1, result.totalPages));
        setIsLoading(false);
      })
      .catch((err) => {
        setIsLoading(false);
        toast.axiosError(err);
      });
  };

  useEffect(() => {
    fetchSessions();
  }, [page, applied]);

  const applyFilters = () => {
    setPage(1);
    setApplied({ userId: userId.trim() || undefined });
  };

  const clearFilters = () => {
    setUserId("");
    setApplied({});
    setPage(1);
  };

  const revokeSession = (session: AdminSession) => {
    modals.openConfirmModal({
      title: t("admin.sessions.revokeConfirm.title", {
        user: session.username || session.email || session.userId,
      }),
      children: (
        <Text size="sm">
          <FormattedMessage id="admin.sessions.revokeConfirm.description" />
        </Text>
      ),
      labels: {
        confirm: t("common.button.delete"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await adminSessionService.revoke(session.id);
          toast.success(t("admin.sessions.revokeSuccess"));
          fetchSessions();
        } catch (err) {
          toast.axiosError(err);
        }
      },
    });
  };

  return (
    <>
      <Meta title={t("admin.sessions.title")} />
      <Title mb={20} order={3}>
        <FormattedMessage id="admin.sessions.title" />
      </Title>

      <Stack gap="md" mb="lg">
        <Grid gap="sm">
          <Grid.Col span={{ base: 12, md: 6, lg: 3 }}>
            <TextInput
              label={t("admin.sessions.filters.userId")}
              value={userId}
              onChange={(e) => setUserId(e.currentTarget.value)}
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

      <SessionsTable
        sessions={sessions}
        isLoading={isLoading}
        onRevoke={revokeSession}
      />

      <Space h="lg" />
      <Center>
        <Pagination value={page} onChange={setPage} total={totalPages} />
      </Center>
      <Space h="xl" />
    </>
  );
};

export default Sessions;