import { useEffect, useState } from "react";
import { Box, Typography, Paper, List, ListItem, ListItemText } from "@mui/material";
import PaymentIcon from "@mui/icons-material/Payment";
import { useAppSelector } from "../../core/store/hooks";
import dayjs from "dayjs";

const CLINIC_PAYMENTS_STORAGE_PREFIX = "clinic_payments_";
const CLINIC_PATIENTS_STORAGE_PREFIX = "clinic_patients_";

/** Mantidos para compatibilidade caso outro módulo importe (ex.: lógica legada de calendário). */
export const CLINIC_UNAVAILABLE_DAYS_STORAGE_PREFIX = "clinic_unavailable_days_";

interface ClinicPayment {
  id: number;
  patientId: number;
  patientName: string;
  procedureId: number;
  procedureName: string;
  amount: string;
  method: "pix" | "cartao";
  installments?: number;
  date: string;
}

interface PacienteAssociado {
  userId: number;
  nome: string;
  email: string;
  dataAssociacao: string;
}

interface PagamentoExibicao extends ClinicPayment {
  patientEmail?: string;
}

function loadClinicPatients(clinicId: number): PacienteAssociado[] {
  try {
    const key = CLINIC_PATIENTS_STORAGE_PREFIX + clinicId;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as PacienteAssociado[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadClinicPayments(clinicId: number): PagamentoExibicao[] {
  if (!clinicId) return [];
  try {
    const key = CLINIC_PAYMENTS_STORAGE_PREFIX + clinicId;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const list = JSON.parse(stored) as ClinicPayment[];
    if (!Array.isArray(list)) return [];
    const patients = loadClinicPatients(clinicId);
    const emailById = new Map(patients.map((p) => [p.userId, p.email]));

    return list
      .map((p) => ({
        ...p,
        patientEmail: emailById.get(p.patientId),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
}

export function loadClinicUnavailableDays(_clinicId: number): string[] {
  return [];
}

export function loadClinicIncludeWeekends(_clinicId: number): boolean {
  return false;
}

export default function Appointments() {
  const user = useAppSelector((state) => state.auth.user);
  const clinicId = user?.id ?? 0;
  const [pagamentos, setPagamentos] = useState<PagamentoExibicao[]>([]);

  const refresh = () => {
    setPagamentos(loadClinicPayments(clinicId));
  };

  useEffect(() => {
    refresh();
  }, [clinicId]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [clinicId]);

  return (
    <Box sx={{ mt: { xs: 7, sm: 8 } }}>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Pagamentos
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <PaymentIcon color="action" />
          <Typography variant="h6" fontWeight={600}>
            Pagamentos recebidos dos pacientes
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Cada registro corresponde a um pagamento registrado pelo paciente nesta clínica, com valor
          pago e identificação do paciente.
        </Typography>

        {pagamentos.length === 0 ? (
          <Typography color="text.secondary">
            Nenhum pagamento registrado para esta clínica ainda.
          </Typography>
        ) : (
          <List
            dense
            disablePadding
            sx={{
              maxHeight: { xs: "55vh", sm: "min(65vh, 480px)" },
              overflowY: "auto",
              pr: 0.5,
            }}
          >
            {pagamentos.map((pg) => (
              <ListItem
                key={`${clinicId}-${pg.id}-${pg.date}`}
                divider
                sx={{
                  py: 1.5,
                  px: 0,
                  "&:last-of-type": { borderBottom: "none" },
                }}
              >
                <ListItemText
                  primary={
                    <Typography variant="subtitle1" fontWeight={600}>
                      {pg.patientName}
                      {pg.patientEmail ? (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                          · {pg.patientEmail}
                        </Typography>
                      ) : null}
                    </Typography>
                  }
                  secondary={
                    <Typography component="span" variant="body2" color="text.secondary">
                      {pg.procedureName || "Procedimento"} · Valor pago:{" "}
                      <Typography component="span" fontWeight={600} color="text.primary">
                        R$ {pg.amount}
                      </Typography>
                      {pg.method === "cartao" && pg.installments != null && pg.installments > 0
                        ? ` · ${pg.installments} parcela(s)`
                        : ""}
                      {` · ${pg.method === "pix" ? "PIX" : "Cartão"}`}
                      {" · "}
                      {dayjs(pg.date).isValid()
                        ? dayjs(pg.date).format("DD/MM/YYYY [às] HH:mm")
                        : pg.date}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
