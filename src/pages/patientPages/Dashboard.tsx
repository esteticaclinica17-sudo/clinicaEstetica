import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import PaymentIcon from "@mui/icons-material/Payment";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useAppSelector } from "../../core/store/hooks";
import { useNavigate } from "react-router";
import { APP_ROUTES } from "../../util/constants";

const PATIENT_HIRED_PROCEDURES_PREFIX = "patient_hired_procedures_";

interface HiredProcedure {
  id: number;
  status: "pending" | "paid" | "scheduled";
  hiddenByPatient?: boolean;
  procedimentoNome: string;
  clinicaNome: string;
  valor: string;
  dataContratacao: string;
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

/** Mesma visibilidade da página Pagamentos: não ocultos e não só agendados. */
function isVisibleOnPayments(h: HiredProcedure): boolean {
  return !h.hiddenByPatient && h.status !== "scheduled";
}

export default function PatientDashboard() {
  const user = useAppSelector((state) => state.auth.user);
  const userId = user?.id ?? 0;
  const [hired, setHired] = useState<HiredProcedure[]>([]);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    if (!userId) {
      setHired([]);
      return;
    }
    setHired(loadHiredProcedures(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const visible = hired.filter(isVisibleOnPayments);
  const pendingPayments = visible.filter((h) => h.status === "pending").length;
  const paidProcedures = visible.filter((h) => h.status === "paid").length;

  const sortedVisible = [...visible].sort(
    (a, b) => new Date(b.dataContratacao).getTime() - new Date(a.dataContratacao).getTime()
  );

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
              {pendingPayments}
            </Typography>
          </Paper>
        </Box>

        <Box flex={1} onClick={() => navigate(APP_ROUTES.PATIENT.PAYMENTS)} sx={{ cursor: "pointer" }}>
          <Paper sx={{ p: 3, textAlign: "center", "&:hover": { boxShadow: 6 } }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Procedimentos pagos
            </Typography>
            <Typography variant="h3" fontWeight={700}>
              {paidProcedures}
            </Typography>
          </Paper>
        </Box>
      </Stack>

      <Paper sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 2 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <PaymentIcon color="primary" fontSize="large" />
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Pagamentos — procedimentos contratados
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Os itens abaixo são os mesmos da página Pagamentos. Contrate novos procedimentos ou quite
                valores por lá.
              </Typography>
            </Box>
          </Box>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={() => navigate(APP_ROUTES.PATIENT.PAYMENTS)}
            sx={{ flexShrink: 0 }}
          >
            Ir para pagamentos
          </Button>
        </Stack>

        {sortedVisible.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>
            Nenhum procedimento contratado ainda. Use{" "}
            <Button size="small" onClick={() => navigate(APP_ROUTES.PATIENT.PAYMENTS)}>
              Pagamentos
            </Button>{" "}
            para contratar e pagar.
          </Typography>
        ) : (
          <List
            disablePadding
            sx={{
              bgcolor: "action.hover",
              borderRadius: 1,
              maxHeight: { xs: "50vh", sm: "min(60vh, 420px)" },
              overflowY: "auto",
              overflowX: "hidden",
              pr: 0.5,
            }}
          >
            {sortedVisible.map((h, index) => (
              <Box key={h.id}>
                {index > 0 && <Divider component="li" />}
                <ListItem sx={{ py: 1.5, px: 2, alignItems: "flex-start" }}>
                  <ListItemText
                    primary={h.procedimentoNome}
                    secondary={
                      <>
                        <Typography component="span" variant="body2" color="text.secondary">
                          {h.clinicaNome} · R$ {h.valor}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" display="block">
                          Contratado em{" "}
                          {h.dataContratacao
                            ? new Date(h.dataContratacao).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "—"}{" "}
                          · {h.status === "paid" ? "Pagamento concluído" : "Pagamento em andamento / pendente"}
                        </Typography>
                      </>
                    }
                  />
                </ListItem>
              </Box>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
