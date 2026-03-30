import { Box, Typography, Paper, Stack } from "@mui/material";
import { useEffect, useState } from "react";
import { useAppSelector } from "../../core/store/hooks";
import { useNavigate } from "react-router";
import { APP_ROUTES } from "../../util/constants";

const PATIENT_HIRED_PROCEDURES_PREFIX = "patient_hired_procedures_";

interface HiredProcedure {
  status: "pending" | "paid" | "scheduled";
}

function loadHiredProcedures(userId: number): HiredProcedure[] {
  try {
    const key = PATIENT_HIRED_PROCEDURES_PREFIX + userId;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as HiredProcedure[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function PatientDashboard() {
  const user = useAppSelector((state) => state.auth.user);
  const userId = user?.id ?? 0;
  const [stats, setStats] = useState({
    pendingPayments: 0,
    paidProcedures: 0,
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;
    const hired = loadHiredProcedures(userId);
    const pending = hired.filter((h) => h.status === "pending").length;
    const paid = hired.filter((h) => h.status === "paid").length;
    setStats({ pendingPayments: pending, paidProcedures: paid });
  }, [userId]);

  return (
    <Box sx={{ mt: { xs: 7, sm: 8 } }}>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Meu Painel
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        O agendamento de data e horário fica a cargo da clínica após a confirmação do pagamento.
        Em Pagamentos você contrata procedimentos e acompanha o valor pago e o saldo restante.
      </Typography>

      <Stack direction={{ xs: "column", md: "row" }} spacing={3} mb={4}>
        <Box flex={1} onClick={() => navigate(APP_ROUTES.PATIENT.PAYMENTS)} sx={{ cursor: "pointer" }}>
          <Paper sx={{ p: 3, textAlign: "center", "&:hover": { boxShadow: 6 } }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Pagamentos pendentes
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              {stats.pendingPayments}
            </Typography>
          </Paper>
        </Box>

        <Box flex={1} onClick={() => navigate(APP_ROUTES.PATIENT.PAYMENTS)} sx={{ cursor: "pointer" }}>
          <Paper sx={{ p: 3, textAlign: "center", "&:hover": { boxShadow: 6 } }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Procedimentos pagos
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              {stats.paidProcedures}
            </Typography>
          </Paper>
        </Box>

        <Box flex={1} onClick={() => navigate(APP_ROUTES.PATIENT.PAYMENTS)} sx={{ cursor: "pointer" }}>
          <Paper sx={{ p: 3, textAlign: "center", "&:hover": { boxShadow: 6 } }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Pagamentos
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Contratar procedimento e pagar
            </Typography>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
