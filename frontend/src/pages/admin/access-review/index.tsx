import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Grid,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FormattedMessage } from "react-intl";
import { dayjs } from "../../../utils/date.util";
import {
  TbAlertTriangle,
  TbCircleCheck,
  TbDownload,
  TbLock,
  TbSearch,
  TbShieldCheck,
} from "react-icons/tb";
import Meta from "../../../components/Meta";
import AdminBackButton from "../../../components/admin/AdminBackButton";
import useTranslate from "../../../hooks/useTranslate.hook";
import useUser from "../../../hooks/user.hook";
import accessReviewService, {
  AccessReviewRecord,
  ReviewCertifyDto,
} from "../../../services/accessReview.service";
import toast from "../../../utils/toast.util";

type SortKey = "role" | "status" | "lastLoginAt" | "sharesOwned" | "lastReviewedAt";

const RISK_COLOR = { low: "green", medium: "yellow", high: "red" } as const;
const STATUS_COLOR = {
  current: "green",
  overdue: "red",
  never_reviewed: "orange",
} as const;

const daysSince = (date: string | null) => {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
};

const csvEscape = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const SortHeader = ({
  children,
  active,
  reversed,
  onSort,
}: {
  children: ReactNode;
  active: boolean;
  reversed: boolean;
  onSort: () => void;
}) => (
  <Box
    component="span"
    onClick={onSort}
    style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
  >
    {children}
    {active && <span>{reversed ? "↓" : "↑"}</span>}
  </Box>
);

const AccessReview = () => {
  const t = useTranslate();
  const { user } = useUser();

  const [records, setRecords] = useState<AccessReviewRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: "asc" | "desc";
  }>({ key: "lastReviewedAt", direction: "asc" });

  const [reviewTarget, setReviewTarget] = useState<AccessReviewRecord | null>(null);
  const [reviewOpened, setReviewOpened] = useState(false);
  const [certified, setCertified] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRecords = () => {
    setIsLoading(true);
    accessReviewService
      .list()
      .then(setRecords)
      .catch((err) => toast.axiosError(err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((r) => {
      if (roleFilter !== "all" && r.role !== roleFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (riskFilter !== "all" && r.riskLevel !== riskFilter) return false;
      if (
        query &&
        !r.email.toLowerCase().includes(query) &&
        !r.username.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [records, search, roleFilter, statusFilter, riskFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortConfig.key];
      const bv = b[sortConfig.key];
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const result = av < bv ? -1 : 1;
      return sortConfig.direction === "asc" ? result : -result;
    });
  }, [filtered, sortConfig]);

  const handleSort = (key: SortKey) =>
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));

  const stats = useMemo(
    () => ({
      total: records.length,
      overdue: records.filter((r) => r.status === "overdue").length,
      neverReviewed: records.filter((r) => r.status === "never_reviewed").length,
      mfaDisabled: records.filter((r) => !r.mfaEnabled && r.isAdmin).length,
    }),
    [records],
  );

  const openReview = (record: AccessReviewRecord) => {
    setReviewTarget(record);
    setCertified(false);
    setNotes("");
    setReviewOpened(true);
  };

  const handleSubmitReview = async () => {
    if (!reviewTarget || !notes.trim() || !certified) return;
    setSubmitting(true);
    try {
      const dto: ReviewCertifyDto = {
        userId: reviewTarget.id,
        certified,
        notes: notes.trim(),
        reviewerId: user?.id ?? "",
      };
      await accessReviewService.certify(dto);
      toast.success(t("admin.accessReview.toast.success"));
      setReviewOpened(false);
      fetchRecords();
    } catch (err) {
      toast.axiosError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    const headers = [
      "ID",
      t("admin.accessReview.table.user"),
      t("admin.accessReview.table.role"),
      t("admin.accessReview.table.status"),
      t("admin.accessReview.table.lastLogin"),
      t("admin.accessReview.table.shares"),
      t("admin.accessReview.table.mfa"),
      t("admin.accessReview.table.lastReviewed"),
      t("admin.accessReview.table.risk"),
    ];
    const rows = sorted.map((r) =>
      [
        r.id,
        r.email,
        r.role === "admin" ? t("roles.admin") : t("roles.operador"),
        t(`admin.accessReview.status.${r.status}`),
        r.lastLoginAt
          ? dayjs(r.lastLoginAt).format("DD/MM/YYYY HH:mm")
          : t("admin.accessReview.login.never"),
        `${r.sharesOwned}/${r.sharesAccessible}`,
        r.mfaEnabled ? "Sim" : "Não",
        r.lastReviewedAt
          ? dayjs(r.lastReviewedAt).format("DD/MM/YYYY")
          : t("admin.accessReview.review.never"),
        t(`admin.accessReview.risk.${r.riskLevel}`),
      ]
        .map(csvEscape)
        .join(","),
    );
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `access-review-${dayjs().format("YYYY-MM-DD")}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const statsCards = [
    { label: t("admin.accessReview.stats.total"), value: stats.total, color: "gray" },
    { label: t("admin.accessReview.stats.overdue"), value: stats.overdue, color: "red" },
    {
      label: t("admin.accessReview.stats.neverReviewed"),
      value: stats.neverReviewed,
      color: "orange",
    },
    {
      label: t("admin.accessReview.stats.mfaDisabled"),
      value: stats.mfaDisabled,
      color: "red",
    },
  ];

  return (
    <>
      <Meta title={t("admin.accessReview.title")} />
      <Group gap="md" align="center" mb={20}>
        <AdminBackButton />
        <Stack gap={2}>
          <Title mb={0} order={3}>
            <FormattedMessage id="admin.accessReview.title" />
          </Title>
          <Text size="sm" c="dimmed">
            <FormattedMessage id="admin.accessReview.description" />
          </Text>
        </Stack>
      </Group>

      <Grid mb="lg">
        {statsCards.map((card) => (
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }} key={card.label}>
            <Paper p="md" radius="md" withBorder>
              <Text fw={700} fz="xl" c={card.color}>
                {card.value}
              </Text>
              <Text size="sm" c="dimmed">
                {card.label}
              </Text>
            </Paper>
          </Grid.Col>
        ))}
      </Grid>

      {stats.overdue > 0 && (
        <Alert
          color="red"
          icon={<TbAlertTriangle size={18} />}
          title={t("admin.accessReview.alert.overdue.title")}
          mb="sm"
        >
          <FormattedMessage
            id="admin.accessReview.alert.overdue.body"
            values={{ count: stats.overdue }}
          />
        </Alert>
      )}
      {stats.mfaDisabled > 0 && (
        <Alert
          color="red"
          icon={<TbLock size={18} />}
          title={t("admin.accessReview.alert.mfaDisabled.title")}
          mb="sm"
        >
          <FormattedMessage
            id="admin.accessReview.alert.mfaDisabled.body"
            values={{ count: stats.mfaDisabled }}
          />
        </Alert>
      )}

      <Group align="flex-end" gap="sm" mb="md" wrap="wrap">
        <TextInput
          w={260}
          leftSection={<TbSearch size={16} />}
          placeholder={t("admin.accessReview.filters.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          w={150}
          data={[
            { value: "all", label: t("common.all") },
            { value: "admin", label: t("roles.admin") },
            { value: "operador", label: t("roles.operador") },
          ]}
          value={roleFilter}
          onChange={(v) => setRoleFilter(v ?? "all")}
          aria-label={t("admin.accessReview.filters.role")}
        />
        <Select
          w={170}
          data={[
            { value: "all", label: t("common.all") },
            { value: "overdue", label: t("admin.accessReview.status.overdue") },
            {
              value: "never_reviewed",
              label: t("admin.accessReview.status.never_reviewed"),
            },
            { value: "current", label: t("admin.accessReview.status.current") },
          ]}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v ?? "all")}
          aria-label={t("admin.accessReview.filters.status")}
        />
        <Select
          w={150}
          data={[
            { value: "all", label: t("common.all") },
            { value: "high", label: t("admin.accessReview.risk.high") },
            { value: "medium", label: t("admin.accessReview.risk.medium") },
            { value: "low", label: t("admin.accessReview.risk.low") },
          ]}
          value={riskFilter}
          onChange={(v) => setRiskFilter(v ?? "all")}
          aria-label={t("admin.accessReview.filters.riskLevel")}
        />
        <Button ml="auto" variant="default" onClick={handleExport} leftSection={<TbDownload size={16} />}>
          <FormattedMessage id="admin.accessReview.export" />
        </Button>
      </Group>

      <Box style={{ overflowX: "auto" }}>
        <Table verticalSpacing="sm" highlightOnHover striped withTableBorder>
          <thead>
            <tr>
              <th>
                <FormattedMessage id="admin.accessReview.table.user" />
              </th>
              <th>
                <SortHeader
                  active={sortConfig.key === "role"}
                  reversed={sortConfig.direction === "desc"}
                  onSort={() => handleSort("role")}
                >
                  <FormattedMessage id="admin.accessReview.table.role" />
                </SortHeader>
              </th>
              <th>
                <SortHeader
                  active={sortConfig.key === "status"}
                  reversed={sortConfig.direction === "desc"}
                  onSort={() => handleSort("status")}
                >
                  <FormattedMessage id="admin.accessReview.table.status" />
                </SortHeader>
              </th>
              <th>
                <SortHeader
                  active={sortConfig.key === "lastLoginAt"}
                  reversed={sortConfig.direction === "desc"}
                  onSort={() => handleSort("lastLoginAt")}
                >
                  <FormattedMessage id="admin.accessReview.table.lastLogin" />
                </SortHeader>
              </th>
              <th>
                <SortHeader
                  active={sortConfig.key === "sharesOwned"}
                  reversed={sortConfig.direction === "desc"}
                  onSort={() => handleSort("sharesOwned")}
                >
                  <FormattedMessage id="admin.accessReview.table.shares" />
                </SortHeader>
              </th>
              <th>MFA</th>
              <th>
                <SortHeader
                  active={sortConfig.key === "lastReviewedAt"}
                  reversed={sortConfig.direction === "desc"}
                  onSort={() => handleSort("lastReviewedAt")}
                >
                  <FormattedMessage id="admin.accessReview.table.lastReviewed" />
                </SortHeader>
              </th>
              <th>
                <FormattedMessage id="admin.accessReview.table.risk" />
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9}>
                  <Center py="xl">
                    <Loader />
                  </Center>
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <Center py="xl">
                    <Text c="dimmed">
                      <FormattedMessage id="admin.accessReview.empty" />
                    </Text>
                  </Center>
                </td>
              </tr>
            ) : (
              sorted.map((record) => {
                const loginDays = daysSince(record.lastLoginAt);
                return (
                  <tr key={record.id}>
                    <td>
                      <Text fw={500}>{record.email}</Text>
                      <Group gap={6}>
                        <Text size="xs" c="dimmed">
                          @{record.username}
                        </Text>
                        {record.isAdmin && (
                          <Badge size="xs" color="red" variant="light">
                            Admin
                          </Badge>
                        )}
                      </Group>
                    </td>
                    <td>
                      <Badge
                        variant={record.role === "admin" ? "filled" : "light"}
                        color={record.role === "admin" ? "red" : "blue"}
                      >
                        {t(`roles.${record.role}`)}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant="light" color={STATUS_COLOR[record.status]}>
                        {t(`admin.accessReview.status.${record.status}`)}
                      </Badge>
                    </td>
                    <td>
                      {record.lastLoginAt ? (
                        <>
                          {dayjs(record.lastLoginAt).format("DD/MM/YYYY HH:mm")}
                          {loginDays !== null && (
                            <Text size="xs" c="dimmed" component="span" ml={4}>
                              ({loginDays}d)
                            </Text>
                          )}
                        </>
                      ) : (
                        <Text c="dimmed">{t("admin.accessReview.login.never")}</Text>
                      )}
                    </td>
                    <td>
                      <Tooltip
                        label={`${record.sharesOwned} / ${record.sharesAccessible}`}
                      >
                        <Text ff="monospace">
                          {record.sharesOwned} / {record.sharesAccessible}
                        </Text>
                      </Tooltip>
                    </td>
                    <td>
                      <Group gap={4} wrap="nowrap">
                        {record.mfaEnabled ? (
                          <TbCircleCheck size={16} color="var(--mantine-color-green-6)" />
                        ) : (
                          <TbLock
                            size={16}
                            color={
                              record.isAdmin
                                ? "var(--mantine-color-red-6)"
                                : "var(--mantine-color-yellow-6)"
                            }
                          />
                        )}
                        <Text size="sm" c={record.mfaEnabled ? "green" : record.isAdmin ? "red" : "yellow"}>
                          {record.mfaEnabled
                            ? t("admin.accessReview.mfa.active")
                            : record.isAdmin
                              ? t("admin.accessReview.mfa.critical")
                              : t("admin.accessReview.mfa.inactive")}
                        </Text>
                      </Group>
                    </td>
                    <td>
                      {record.lastReviewedAt ? (
                        <>
                          {dayjs(record.lastReviewedAt).format("DD/MM/YYYY")}
                          <Text size="xs" c="dimmed">
                            {t("admin.accessReview.review.by", {
                              name: record.reviewedBy ?? "",
                            })}
                          </Text>
                        </>
                      ) : (
                        <Text c="red" fw={500}>
                          {t("admin.accessReview.review.never")}
                        </Text>
                      )}
                    </td>
                    <td>
                      <Badge variant="filled" color={RISK_COLOR[record.riskLevel]}>
                        {t(`admin.accessReview.risk.${record.riskLevel}`)}
                      </Badge>
                    </td>
                    <td>
                      <Button variant="light" size="xs" onClick={() => openReview(record)}>
                        <FormattedMessage id="admin.accessReview.review.action" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Box>

      <Modal
        opened={reviewOpened}
        onClose={() => setReviewOpened(false)}
        title={
          reviewTarget
            ? t("admin.accessReview.modal.title", { email: reviewTarget.email })
            : undefined
        }
        size="lg"
      >
        {reviewTarget && (
          <Stack gap="md">
            <Alert color="blue" icon={<TbShieldCheck size={18} />}>
              <Text size="sm">
                {t("roles." + reviewTarget.role)} ·{" "}
                {t(`admin.accessReview.status.${reviewTarget.status}`)} ·{" "}
                {t(`admin.accessReview.risk.${reviewTarget.riskLevel}`)}
              </Text>
            </Alert>

            <Checkbox
              checked={certified}
              onChange={(e) => setCertified(e.currentTarget.checked)}
              label={t("admin.accessReview.modal.certify")}
              description={t("admin.accessReview.modal.certify.help")}
            />

            <Textarea
              required
              minRows={4}
              autosize
              label={t("admin.accessReview.modal.notes")}
              description={t("admin.accessReview.modal.notes.help")}
              placeholder={t("admin.accessReview.modal.notes.placeholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setReviewOpened(false)}>
                <FormattedMessage id="common.button.cancel" />
              </Button>
              <Button
                loading={submitting}
                disabled={!certified || !notes.trim()}
                onClick={handleSubmitReview}
              >
                <FormattedMessage id="admin.accessReview.modal.submit" />
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
};

export default AccessReview;
