'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  TextField,
  Select,
  Alert,
  AlertTitle,
  CircularProgress,
  Box,
  Typography,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  FormHelperText,
  Chip,
  IconButton,
  Tooltip,
  Snackbar,
} from '@mantine/core';
import {
  CheckCircle,
  Warning,
  ErrorOutline,
  Visibility,
  Edit,
  Download,
  ShieldCheck,
  Lock,
  Person,
  Calendar,
} from '@mantine/core';
import { format, differenceInDays, isAfter } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { apiClient } from '@/services/api';

// Types
interface UserAccessRecord {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'operador';
  isAdmin: boolean;
  isActivated: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  sharesOwned: number;
  sharesAccessible: number;
  mfaEnabled: boolean;
  lastReviewedAt: string | null;
  reviewedBy: string | null;
  status: 'current' | 'overdue' | 'never_reviewed';
  riskLevel: 'low' | 'medium' | 'high';
}

interface ReviewSubmission {
  userId: string;
  certified: boolean;
  notes: string;
  reviewerId: string;
}

const ROLE_LABELS = {
  admin: 'Administrador',
  operador: 'Operador',
};

const RISK_COLORS = {
  low: 'green',
  medium: 'yellow',
  high: 'red',
};

const STATUS_LABELS = {
  current: 'Em dia',
  overdue: 'Atrasado',
  never_reviewed: 'Nunca revisado',
};

const STATUS_COLORS = {
  current: 'green',
  medium: 'yellow',
  overdue: 'red',
  never_reviewed: 'orange',
};

export default function AccessReviewPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState<UserAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    role: 'all',
    status: 'all',
    search: '',
    riskLevel: 'all',
  });
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'lastReviewedAt',
    direction: 'asc',
  });
  const [selectedUser, setSelectedUser] = useState<UserAccessRecord | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState<ReviewSubmission>({
    userId: '',
    certified: false,
    notes: '',
    reviewerId: user?.id || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Fetch access review data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/admin/access-review', {
        params: filters,
      });
      setRecords(response.data);
    } catch (err) {
      setError('Falha ao carregar dados de revisão de acesso');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters]);

  // Handle sorting
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Open review dialog
  const handleReviewClick = (record: UserAccessRecord) => {
    setSelectedUser(record);
    setReviewForm({
      userId: record.id,
      certified: false,
      notes: '',
      reviewerId: user?.id || '',
    });
    setReviewDialogOpen(true);
  };

  // Submit review
  const handleSubmitReview = async () => {
    if (!reviewForm.notes.trim()) {
      showSnackbar('Adicione observações sobre a revisão', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/admin/access-review/certify', reviewForm);
      showSnackbar('Revisão registrada com sucesso', 'success');
      setReviewDialogOpen(false);
      fetchData(); // Refresh
    } catch (err) {
      showSnackbar('Falha ao registrar revisão', 'error');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
    setTimeout(() => setSnackbar(prev => ({ ...prev, open: false })), 5000);
  };

  // Export to CSV
  const handleExport = () => {
    const headers = [
      'ID', 'Email', 'Username', 'Role', 'Status', 'Último Login',
      'Criado em', 'Shares Próprios', 'Shares Acessíveis', 'MFA',
      'Última Revisão', 'Revisado Por', 'Nível de Risco',
    ];
    const rows = records.map(r => [
      r.id,
      r.email,
      r.username,
      ROLE_LABELS[r.role],
      STATUS_LABELS[r.status],
      r.lastLoginAt ? format(new Date(r.lastLoginAt), 'dd/MM/yyyy HH:mm') : 'Nunca',
      format(new Date(r.createdAt), 'dd/MM/yyyy'),
      r.sharesOwned.toString(),
      r.sharesAccessible.toString(),
      r.mfaEnabled ? 'Sim' : 'Não',
      r.lastReviewedAt ? format(new Date(r.lastReviewedAt), 'dd/MM/yyyy') : 'Nunca',
      r.reviewedBy || 'N/A',
      r.riskLevel,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `access-review-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  // Calculate stats
  const stats = {
    total: records.length,
    overdue: records.filter(r => r.status === 'overdue').length,
    neverReviewed: records.filter(r => r.status === 'never_reviewed').length,
    highRisk: records.filter(r => r.riskLevel === 'high').length,
    mfaDisabled: records.filter(r => !r.mfaEnabled && r.isAdmin).length,
  };

  if (loading) {
    return (
      <Box style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <CircularProgress size="xl" />
      </Box>
    );
  }

  return (
    <Box style={{ padding: '1.5rem' }}>
      {/* Header */}
      <Box style={{ marginBottom: '1.5rem' }}>
        <Typography order={2} weight={700}>Revisão de Acesso Trimestral</Typography>
        <Typography color="dimmed" style={{ marginTop: '0.5rem' }}>
          Certifique o acesso de cada usuário. Revisões vencidas a cada 90 dias.
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid style={{ marginBottom: '1.5rem' }}>
        <Grid.Col span={3}>
          <Box style={{ padding: '1rem', background: 'var(--mantine-color-gray-0)', borderRadius: '0.5rem', border: '1px solid var(--mantine-color-gray-3)' }}>
            <Typography weight={700} order={3}>{stats.total}</Typography>
            <Typography color="dimmed" size="sm">Total de Usuários</Typography>
          </Box>
        </Grid.Col>
        <Grid.Col span={3}>
          <Box style={{ padding: '1rem', background: 'var(--mantine-color-red-0)', borderRadius: '0.5rem', border: '1px solid var(--mantine-color-red-3)' }}>
            <Typography weight={700} order={3} color="red">{stats.overdue}</Typography>
            <Typography color="dimmed" size="sm">Revisões Atrasadas</Typography>
          </Box>
        </Grid.Col>
        <Grid.Col span={3}>
          <Box style={{ padding: '1rem', background: 'var(--mantine-color-orange-0)', borderRadius: '0.5rem', border: '1px solid var(--mantine-color-orange-3)' }}>
            <Typography weight={700} order={3} color="orange">{stats.neverReviewed}</Typography>
            <Typography color="dimmed" size="sm">Nunca Revisados</Typography>
          </Box>
        </Grid.Col>
        <Grid.Col span={3}>
          <Box style={{ padding: '1rem', background: 'var(--mantine-color-red-0)', borderRadius: '0.5rem', border: '1px solid var(--mantine-color-red-3)' }}>
            <Typography weight={700} order={3} color="red">{stats.mfaDisabled}</Typography>
            <Typography color="dimmed" size="sm">Admins sem MFA</Typography>
          </Box>
        </Grid.Col>
      </Grid>

      {/* Alerts */}
      {stats.overdue > 0 && (
        <Alert color="red" icon={<Warning />} style={{ marginBottom: '1rem' }}>
          <AlertTitle>Revisões Atrasadas</AlertTitle>
          {stats.overdue} usuário(s) com revisão vencida (> 90 dias). Ação imediata recomendada.
        </Alert>
      )}
      {stats.mfaDisabled > 0 && (
        <Alert color="red" icon={<Lock />} style={{ marginBottom: '1rem' }}>
          <AlertTitle>Admins sem MFA</AlertTitle>
          {stats.mfaDisabled} administrador(es) sem autenticação de dois fatores ativa. Risco crítico.
        </Alert>
      )}

      {/* Filters */}
      <Box style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'end' }}>
        <TextField
          placeholder="Buscar por email, username..."
          value={filters.search}
          onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          style={{ minWidth: '250px' }}
          leftSection={<Person size={16} />}
        />
        <Select
          placeholder="Filtrar por Role"
          value={filters.role}
          onChange={e => setFilters(prev => ({ ...prev, role: e.target.value }))}
          data={[
            { value: 'all', label: 'Todos' },
            { value: 'admin', label: 'Admin' },
            { value: 'operador', label: 'Operador' },
          ]}
          style={{ minWidth: '150px' }}
        />
        <Select
          placeholder="Filtrar por Status"
          value={filters.status}
          onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
          data={[
            { value: 'all', label: 'Todos' },
            { value: 'overdue', label: 'Atrasado' },
            { value: 'never_reviewed', label: 'Nunca Revisado' },
            { value: 'current', label: 'Em Dia' },
          ]}
          style={{ minWidth: '150px' }}
        />
        <Select
          placeholder="Nível de Risco"
          value={filters.riskLevel}
          onChange={e => setFilters(prev => ({ ...prev, riskLevel: e.target.value }))}
          data={[
            { value: 'all', label: 'Todos' },
            { value: 'high', label: 'Alto' },
            { value: 'medium', label: 'Médio' },
            { value: 'low', label: 'Baixo' },
          ]}
          style={{ minWidth: '150px' }}
        />
        <Button onClick={handleExport} leftSection={<Download size={16} />}>
          Exportar CSV
        </Button>
      </Box>

      {/* Table */}
      <Box style={{ overflowX: 'auto' }}>
        <Table highlightOnHover striped withTableBorder withColumnBorders>
          <TableHead>
            <TableRow>
              <TableCell>Usuário</TableCell>
              <TableCell>
                <Tooltip label="Role do usuário">
                  <Button variant="subtle" onClick={() => handleSort('role')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Role {sortConfig.key === 'role' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </Button>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip label="Status da revisão">
                  <Button variant="subtle" onClick={() => handleSort('status')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </Button>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip label="Último login">
                  <Button variant="subtle" onClick={() => handleSort('lastLoginAt')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Último Login {sortConfig.key === 'lastLoginAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </Button>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Tooltip label="Shares próprios / acessíveis">
                  <Button variant="subtle" onClick={() => handleSort('sharesOwned')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Shares {sortConfig.key === 'sharesOwned' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </Button>
                </Tooltip>
              </TableCell>
              <TableCell>MFA</TableCell>
              <TableCell>
                <Tooltip label="Última revisão">
                  <Button variant="subtle" onClick={() => handleSort('lastReviewedAt')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Última Revisão {sortConfig.key === 'lastReviewedAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </Button>
                </Tooltip>
              </TableCell>
              <TableCell>Risco</TableCell>
              <TableCell style={{ textAlign: 'center' }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records
              .sort((a, b) => {
                const aVal = a[sortConfig.key as keyof UserAccessRecord];
                const bVal = b[sortConfig.key as keyof UserAccessRecord];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
              })
              .map(record => (
                <TableRow key={record.id} style={{ backgroundColor: record.status === 'overdue' ? 'var(--mantine-color-red-0)' : record.status === 'never_reviewed' ? 'var(--mantine-color-orange-0)' : undefined }}>
                  <TableCell>
                    <Box style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                      <Typography weight={500}>{record.email}</Typography>
                      <Typography size="sm" color="dimmed">@{record.username}</Typography>
                      {record.isAdmin && <Chip size="xs" color="red" variant="light" style={{ width: 'fit-content' }}>Admin</Chip>}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant={record.role === 'admin' ? 'filled' : 'light'}
                      color={record.role === 'admin' ? 'red' : 'blue'}
                    >
                      {ROLE_LABELS[record.role]}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      variant="light"
                      color={STATUS_COLORS[record.status as keyof typeof STATUS_COLORS] || 'gray'}
                    >
                      {STATUS_LABELS[record.status]}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {record.lastLoginAt ? (
                      <>
                        {format(new Date(record.lastLoginAt), 'dd/MM/yyyy HH:mm')}
                        <Typography size="xs" color="dimmed" style={{ marginLeft: '0.5rem' }}>
                          ({differenceInDays(new Date(), new Date(record.lastLoginAt))} dias)
                        </Typography>
                      </>
                    ) : (
                      <Typography color="dimmed">Nunca</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Tooltip label={`${record.sharesOwned} próprios, ${record.sharesAccessible} acessíveis`}>
                        <Typography variant="mono">{record.sharesOwned} / {record.sharesAccessible}</Typography>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {record.mfaEnabled ? (
                      <Box style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <CheckCircle size={16} color="green" />
                        <Typography size="sm" color="green">Ativo</Typography>
                      </Box>
                    ) : (
                      <Box style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Lock size={16} color={record.isAdmin ? 'red' : 'yellow'} />
                        <Typography size="sm" color={record.isAdmin ? 'red' : 'yellow'}>
                          {record.isAdmin ? 'CRÍTICO' : 'Inativo'}
                        </Typography>
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.lastReviewedAt ? (
                      <>
                        {format(new Date(record.lastReviewedAt), 'dd/MM/yyyy')}
                        <Typography size="xs" color="dimmed" style={{ marginLeft: '0.5rem' }}>
                          por {record.reviewedBy}
                        </Typography>
                      </>
                    ) : (
                      <Typography color="red" weight={500}>Nunca</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="xs"
                      variant="filled"
                      color={RISK_COLORS[record.riskLevel]}
                    >
                      {record.riskLevel.toUpperCase()}
                    </Chip>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center' }}>
                    <Tooltip label="Ver detalhes">
                      <Button variant="subtle" size="sm" onClick={() => handleReviewClick(record)} leftSection={<Visibility size={14} />}>
                        Revisar
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </Box>

      {/* Review Dialog */}
      <Dialog
        opened={reviewDialogOpen}
        onClose={() => setReviewDialogOpen(false)}
        size="md"
        title="Registrar Revisão de Acesso"
      >
        {selectedUser && (
          <>
            <DialogContent>
              <Alert color="blue" icon={<ShieldCheck />} style={{ marginBottom: '1rem' }}>
                <AlertTitle>Revisando: {selectedUser.email}</AlertTitle>
                <Typography>Role: {ROLE_LABELS[selectedUser.role]} | Status: {STATUS_LABELS[selectedUser.status]} | Risco: {selectedUser.riskLevel.toUpperCase()}</Typography>
              </Alert>

              <Typography weight={500} style={{ marginBottom: '1rem' }}>
                Certifico que revisei o acesso deste usuário e confirmo que:
              </Typography>

              <Box style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reviewForm.certified}
                    onChange={e => setReviewForm(prev => ({ ...prev, certified: e.target.checked }))}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <Box style={{ flex: 1 }}>
                    <Typography weight={500}>O acesso é apropriado para sua função</Typography>
                    <Typography size="sm" color="dimmed">Usuário possui apenas os acessos necessários para suas responsabilidades</Typography>
                  </Box>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reviewForm.certified}
                    onChange={e => setReviewForm(prev => ({ ...prev, certified: e.target.checked }))}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <Box style={{ flex: 1 }}>
                    <Typography weight={500}>Não há acessos órfãos ou desnecessários</Typography>
                    <Typography size="sm" color="dimmed">Shares e permissões foram auditados e estão corretos</Typography>
                  </Box>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reviewForm.certified}
                    onChange={e => setReviewForm(prev => ({ ...prev, certified: e.target.checked }))}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <Box style={{ flex: 1 }}>
                    <Typography weight={500}>MFA está configurado corretamente (se admin)</Typography>
                    <Typography size="sm" color="dimmed">Autenticação de dois fatores ativa para contas administrativas</Typography>
                  </Box>
                </label>
              </Box>

              <FormControl required>
                <InputLabel>Observações da Revisão *</InputLabel>
                <TextField
                  multiline
                  rows={4}
                  placeholder="Descreva achados, ações tomadas, exceções aprovadas..."
                  value={reviewForm.notes}
                  onChange={e => setReviewForm(prev => ({ ...prev, notes: e.target.value }))}
                  required
                />
                <FormHelperText>Obrigatório. Registre achados, exceções ou justificativas.</FormHelperText>
              </FormControl>
            </DialogContent>

            <DialogActions>
              <Button variant="subtle" onClick={() => setReviewDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmitReview}
                loading={submitting}
                disabled={!reviewForm.certified || !reviewForm.notes.trim()}
              >
                Registrar Revisão
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        opened={snackbar.open}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        position="bottom-right"
        color={snackbar.severity}
        style={{ zIndex: 1500 }}
      >
        {snackbar.message}
      </Snackbar>
    </Box>
  );
}