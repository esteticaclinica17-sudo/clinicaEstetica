import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemButton,
  Snackbar,
  Alert,
  Select,
  MenuItem,
  InputLabel,
  LinearProgress,
  IconButton,
  TextField,
  Checkbox,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import QRCode from "react-qr-code";
import { useNavigate } from "react-router";
import { useAppSelector } from "../../core/store/hooks";
import { APP_ROUTES } from "../../util/constants";
import {
  isClinicPaymentLinkExpired,
  loadClinicPaymentSettings,
} from "../../util/clinicPaymentSettings";

// ========== MOCK STORAGE ==========
const PATIENT_HIRED_PROCEDURES_PREFIX = "patient_hired_procedures_";
const PATIENT_CARDS_STORAGE_PREFIX = "patient_cartoes_";
const PATIENT_PAYMENTS_STORAGE_PREFIX = "patient_pagamentos_";
const CLINIC_PAYMENTS_STORAGE_PREFIX = "clinic_payments_";
const MOCK_PROCEDURES_KEY = "mock_procedures";
const MOCK_CLINICS_KEY = "mock_clinics";
const PATIENT_LOCATION_STORAGE_PREFIX = "patient_location_";
const CLINIC_PATIENTS_STORAGE_PREFIX = "clinic_patients_";
const CLINIC_PAID_LEADS_PREFIX = "clinic_paid_leads_";

interface HiredProcedure {
  id: number;
  userId: number;
  clinicaId: number;
  clinicaNome: string;
  procedimentoId: number;
  procedimentoNome: string;
  valor: string;
  parcelasCartao: string; // max installments
  installmentsTotal?: number; // total parcels (for parcelado)
  installmentsPaid?: number;  // how many parcels already paid
  amountPaid?: number; // valor total já pago (para pagamento flexível)
  status: "pending" | "paid" | "scheduled";
  dataContratacao: string;
  dataAgendada?: string;
  /** Quando true, o paciente não vê mais este item na lista (oculto, não removido) */
  hiddenByPatient?: boolean;
  /** Lead já enviado à clínica após pagamento integral */
  leadSentToClinic?: boolean;
}

interface ProcedimentoItem {
  id: number;
  clinicaId: number;
  finalidade: string;
  invasividade: string;
  valorProcedimento: string;
  parcelasCartao: string;
}

interface ClinicaItem {
  id: number;
  nomeFantasia: string;
  nomeEmpresa: string;
  cidade: string;
  estado: string;
}

interface PacienteAssociadoClinica {
  userId: number;
  nome: string;
  email: string;
  dataAssociacao: string;
}

interface ClinicPaidLead {
  id: number;
  patientId: number;
  patientName: string;
  procedureId: number;
  procedureName: string;
  clinicaId: number;
  valorTotal: string;
  createdAt: string;
}

interface CartaoSalvo {
  id: number;
  userId: number;
  nomeTitular: string;
  ultimosQuatroDigitos: string;
  validade: string;
  bandeira?: "mastercard" | "visa";
}

interface PagamentoHistorico {
  id: number;
  userId: number;
  clinicaId: number;
  clinicaNome: string;
  procedimentoId?: number;
  procedimentoNome?: string;
  valor: string;
  formaPagamento: "pix" | "cartao";
  parcelas?: number; // added for installments
  data: string;
  status: string;
}

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

type FormaPagamento = "pix" | "cartao";
type ModoPagamento = "parcelado" | "flexivel";

function parseMoneyToNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyPtBr(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Valor de cada parcela no pagamento parcelado (total deste pagamento ÷ quantidade escolhida). */
/** Impede valor digitado acima do máximo (saldo faltante) no pagamento flexível. */
function clampMoneyInputToMaxRemaining(raw: string, maxRemaining: number): string {
  const max = Math.max(0, maxRemaining);
  const n = parseMoneyToNumber(raw);
  if (n <= max) return raw;
  return formatMoneyPtBr(max);
}

/** Valores agregados de pagamento para um procedimento contratado (lista + confirmação de ocultar). */
function hiredProcedurePaymentSummary(proc: HiredProcedure) {
  const totalInstallments =
    proc.installmentsTotal != null
      ? proc.installmentsTotal
      : parseInt(proc.parcelasCartao || "1", 10) || 1;
  const totalValue = parseMoneyToNumber(proc.valor);
  const perInstallmentValue =
    totalInstallments > 0 ? totalValue / totalInstallments : totalValue;
  const paidInstallments =
    proc.installmentsPaid != null
      ? proc.installmentsPaid
      : proc.status === "paid"
        ? totalInstallments
        : 0;
  const clampedPaid = Math.min(totalInstallments, Math.max(0, paidInstallments));
  const amountPaid = Math.max(
    0,
    proc.amountPaid ?? Math.min(totalValue, clampedPaid * perInstallmentValue)
  );
  const remainingAmount = Math.max(0, totalValue - amountPaid);
  const isPaid = amountPaid >= totalValue || clampedPaid >= totalInstallments;
  const progress =
    totalValue > 0 ? (amountPaid / totalValue) * 100 : isPaid ? 100 : 0;
  return {
    totalValue,
    amountPaid,
    remainingAmount,
    isPaid,
    progress,
  };
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

function saveHiredProcedures(userId: number, list: HiredProcedure[]) {
  try {
    localStorage.setItem(PATIENT_HIRED_PROCEDURES_PREFIX + userId, JSON.stringify(list));
  } catch {}
}

function loadPatientCards(userId: number): CartaoSalvo[] {
  try {
    const key = PATIENT_CARDS_STORAGE_PREFIX + userId;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as CartaoSalvo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadPatientPayments(userId: number): PagamentoHistorico[] {
  try {
    const key = PATIENT_PAYMENTS_STORAGE_PREFIX + userId;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as PagamentoHistorico[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePatientPayments(userId: number, list: PagamentoHistorico[]) {
  try {
    localStorage.setItem(PATIENT_PAYMENTS_STORAGE_PREFIX + userId, JSON.stringify(list));
  } catch {}
}

function addClinicPayment(clinicId: number, payment: ClinicPayment) {
  const key = CLINIC_PAYMENTS_STORAGE_PREFIX + clinicId;
  try {
    const stored = localStorage.getItem(key);
    const list = stored ? JSON.parse(stored) : [];
    list.push(payment);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    console.error("Error saving clinic payment");
  }
}

function loadAllProcedimentos(): ProcedimentoItem[] {
  try {
    const stored = localStorage.getItem(MOCK_PROCEDURES_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as ProcedimentoItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadClinicasFromStorage(): ClinicaItem[] {
  try {
    const stored = localStorage.getItem(MOCK_CLINICS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Array<{
      id?: number;
      nomeFantasia?: string;
      nomeEmpresa?: string;
      cidade?: string;
      estado?: string;
    }>;
    return (parsed || []).map((c, i) => ({
      id: c.id ?? i + 1,
      nomeFantasia: c.nomeFantasia || c.nomeEmpresa || "Clínica",
      nomeEmpresa: c.nomeEmpresa || "",
      cidade: (c.cidade || "").toLowerCase(),
      estado: (c.estado || "").toLowerCase(),
    }));
  } catch {
    return [];
  }
}

function loadPatientLocation(userId: number): { cidade: string; estado: string } | null {
  try {
    const key = PATIENT_LOCATION_STORAGE_PREFIX + userId;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { cidade?: string; estado?: string };
    if (!parsed.cidade || !parsed.estado) return null;
    return { cidade: parsed.cidade.toLowerCase(), estado: parsed.estado.toLowerCase() };
  } catch {
    return null;
  }
}

function loadClinicPatients(clinicId: number): PacienteAssociadoClinica[] {
  try {
    const key = CLINIC_PATIENTS_STORAGE_PREFIX + clinicId;
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as PacienteAssociadoClinica[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addPatientToClinic(clinicId: number, patient: PacienteAssociadoClinica) {
  const list = loadClinicPatients(clinicId);
  if (list.some((p) => p.userId === patient.userId)) return;
  list.push(patient);
  try {
    localStorage.setItem(CLINIC_PATIENTS_STORAGE_PREFIX + clinicId, JSON.stringify(list));
  } catch {
    console.error("Error adding patient to clinic");
  }
}

function addClinicPaidLead(clinicId: number, lead: ClinicPaidLead) {
  const key = CLINIC_PAID_LEADS_PREFIX + clinicId;
  try {
    const stored = localStorage.getItem(key);
    const list = stored ? JSON.parse(stored) : [];
    list.push(lead);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    console.error("Error saving clinic paid lead");
  }
}

// ========== COMPONENT ==========
export default function PaymentDashboard() {
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);
  const userId = user?.id ?? 0;

  const [pendingProcedures, setPendingProcedures] = useState<HiredProcedure[]>([]);
  const [cartoes, setCartoes] = useState<CartaoSalvo[]>([]);
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<HiredProcedure | null>(null);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("pix");
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [installments, setInstallments] = useState<number>(1);
  const [modoPagamento, setModoPagamento] = useState<ModoPagamento>("flexivel");
  const [amountToPayInput, setAmountToPayInput] = useState<string>("");
  const [pixQrModalAberto, setPixQrModalAberto] = useState(false);
  const [pixQrValue, setPixQrValue] = useState("");
  const [cardRequiredModalOpen, setCardRequiredModalOpen] = useState(false);
  const [procedureHideConfirm, setProcedureHideConfirm] = useState<HiredProcedure | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  const [procedimentos, setProcedimentos] = useState<ProcedimentoItem[]>([]);
  const [clinicas, setClinicas] = useState<ClinicaItem[]>([]);
  const [patientLocation, setPatientLocation] = useState<{ cidade: string; estado: string } | null>(null);
  const [modalHireAberto, setModalHireAberto] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterByRegion, setFilterByRegion] = useState(false);
  const [selectedProcId, setSelectedProcId] = useState<string>("");
  const [modalParceladoAberto, setModalParceladoAberto] = useState(false);
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState<number>(1);

  useEffect(() => {
    if (!userId) return;
    const hired = loadHiredProcedures(userId);
    setPendingProcedures(hired);
    setCartoes(loadPatientCards(userId));
  }, [userId]);

  useEffect(() => {
    setProcedimentos(loadAllProcedimentos());
    setClinicas(loadClinicasFromStorage());
    if (userId) setPatientLocation(loadPatientLocation(userId));
  }, [userId]);

  const procedimentosComClinica = useMemo(() => {
    return procedimentos.map((p) => {
      const clinica = clinicas.find((c) => c.id === p.clinicaId);
      return {
        ...p,
        clinicaNome: clinica?.nomeFantasia || `Clínica ${p.clinicaId}`,
        clinicaCidade: clinica?.cidade || "",
        clinicaEstado: clinica?.estado || "",
      };
    });
  }, [procedimentos, clinicas]);

  type ProcComClinica = (typeof procedimentosComClinica)[number];

  const procedimentosFiltrados = useMemo(() => {
    let filtered: ProcComClinica[] = procedimentosComClinica;
    if (filterByRegion && patientLocation) {
      filtered = filtered.filter(
        (p) =>
          p.clinicaCidade === patientLocation.cidade &&
          p.clinicaEstado === patientLocation.estado
      );
    }
    if (searchTerm) {
      filtered = filtered.filter((p) =>
        (p.finalidade || "").toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return filtered;
  }, [procedimentosComClinica, filterByRegion, patientLocation, searchTerm]);

  const handleHire = () => {
    if (!selectedProcId || !userId || !user) return;
    const proc = procedimentosComClinica.find((p) => String(p.id) === selectedProcId);
    if (!proc) return;

    const nomeCompleto =
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.email ||
      `Paciente ${user.id}`;
    addPatientToClinic(proc.clinicaId, {
      userId: user.id,
      nome: nomeCompleto,
      email: user.email ?? "",
      dataAssociacao: new Date().toISOString(),
    });

    const newHired: HiredProcedure = {
      id: Date.now(),
      userId,
      clinicaId: proc.clinicaId,
      clinicaNome: proc.clinicaNome,
      procedimentoId: proc.id,
      procedimentoNome: proc.finalidade,
      valor: proc.valorProcedimento,
      parcelasCartao: proc.parcelasCartao,
      status: "pending",
      dataContratacao: new Date().toISOString(),
    };
    const hiredNow = loadHiredProcedures(userId);
    const updated = [...hiredNow, newHired];
    setPendingProcedures(updated);
    saveHiredProcedures(userId, updated);
    setModalHireAberto(false);
    setSelectedProcId("");
    setSearchTerm("");
    setSnackbar({
      open: true,
      message: "Procedimento contratado! Conclua o pagamento abaixo.",
      severity: "success",
    });
  };

  const handleOpenParcelado = () => {
    if (!selectedProcId) {
      setSnackbar({
        open: true,
        message: "Selecione um procedimento para contratar com pagamento parcelado.",
        severity: "error",
      });
      return;
    }
    const proc = procedimentosComClinica.find((p) => String(p.id) === selectedProcId);
    const maxParcelasProcedimento = proc ? parseInt(proc.parcelasCartao || "1", 10) || 1 : 1;
    const maxParcelas = Math.min(10, maxParcelasProcedimento || 1);
    setParcelasSelecionadas(maxParcelas);
    setModalParceladoAberto(true);
  };

  const handleConfirmParcelado = () => {
    if (!selectedProcId || !userId || !user) return;
    const proc = procedimentosComClinica.find((p) => String(p.id) === selectedProcId);
    if (!proc) return;

    const maxParcelasProcedimento = parseInt(proc.parcelasCartao || "1", 10) || 1;
    const maxParcelas = Math.min(10, maxParcelasProcedimento || 1);
    const nParcelas = Math.min(maxParcelas, Math.max(1, parcelasSelecionadas));

    const nomeCompleto =
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.email ||
      `Paciente ${user.id}`;

    addPatientToClinic(proc.clinicaId, {
      userId: user.id,
      nome: nomeCompleto,
      email: user.email ?? "",
      dataAssociacao: new Date().toISOString(),
    });

    const newHired: HiredProcedure = {
      id: Date.now(),
      userId,
      clinicaId: proc.clinicaId,
      clinicaNome: proc.clinicaNome,
      procedimentoId: proc.id,
      procedimentoNome: proc.finalidade,
      valor: proc.valorProcedimento,
      parcelasCartao: String(nParcelas),
      installmentsTotal: nParcelas,
      installmentsPaid: 0,
      status: "pending",
      dataContratacao: new Date().toISOString(),
    };

    const hiredNow = loadHiredProcedures(userId);
    const updated = [...hiredNow, newHired];
    setPendingProcedures(updated);
    saveHiredProcedures(userId, updated);

    setModalParceladoAberto(false);
    setModalHireAberto(false);
    setSelectedProcId("");
    setSearchTerm("");
    setSnackbar({
      open: true,
      message: "Contratado com pagamento parcelado. Conclua o pagamento abaixo.",
      severity: "success",
    });
  };

  const hideProcedureFromPatient = (proc: HiredProcedure) => {
    const allHired = loadHiredProcedures(userId);
    const updated = allHired.map((h) =>
      h.id === proc.id ? { ...h, hiddenByPatient: true } : h
    );
    saveHiredProcedures(userId, updated);
    setPendingProcedures(updated);
    setProcedureHideConfirm(null);
  };

  const requestHideProcedureFromPatient = (proc: HiredProcedure) => {
    const { isPaid } = hiredProcedurePaymentSummary(proc);
    if (isPaid) {
      hideProcedureFromPatient(proc);
      return;
    }
    setProcedureHideConfirm(proc);
  };

  const confirmHideProcedureInProgress = () => {
    if (procedureHideConfirm) {
      hideProcedureFromPatient(procedureHideConfirm);
      setSnackbar({
        open: true,
        message: "Procedimento removido da sua lista.",
        severity: "success",
      });
    }
  };

  const openPaymentModal = (proc: HiredProcedure) => {
    setSelectedProcedure(proc);
    setModalPagamentoAberto(true);
    const clinicPay = loadClinicPaymentSettings(proc.clinicaId);
    setFormaPagamento(
      isClinicPaymentLinkExpired(clinicPay) ? "cartao" : "pix"
    );
    setModoPagamento("flexivel");
    setSelectedCardId("");
    setInstallments(1);
    const totalValue = parseMoneyToNumber(proc.valor);
    const alreadyPaid = Math.max(0, proc.amountPaid ?? 0);
    const remaining = Math.max(0, totalValue - alreadyPaid);
    setAmountToPayInput(formatMoneyPtBr(remaining));
  };

  const clinicPaymentLinkExpired = useMemo(() => {
    if (!selectedProcedure) return false;
    return isClinicPaymentLinkExpired(
      loadClinicPaymentSettings(selectedProcedure.clinicaId)
    );
  }, [selectedProcedure]);

  // Opções de parcelas respeitando o que já foi pago
  const maxInstallments = selectedProcedure
    ? (selectedProcedure.installmentsTotal != null
        ? selectedProcedure.installmentsTotal
        : (parseInt(selectedProcedure.parcelasCartao || "1", 10) || 1))
    : 1;

  const alreadyPaidForSelected = selectedProcedure
    ? (selectedProcedure.installmentsPaid != null
        ? selectedProcedure.installmentsPaid
        : (selectedProcedure.status === "paid" ? maxInstallments : 0))
    : 0;

  const clampedAlreadyPaidForSelected = Math.min(
    maxInstallments,
    Math.max(0, alreadyPaidForSelected)
  );

  const remainingInstallmentsForSelected = Math.max(
    0,
    maxInstallments - clampedAlreadyPaidForSelected
  );

  const installmentOptions =
    remainingInstallmentsForSelected > 0
      ? Array.from(
          { length: remainingInstallmentsForSelected },
          (_, i) => i + 1
        )
      : [];

  const selectedTotalInstallments = selectedProcedure
    ? selectedProcedure.installmentsTotal != null
      ? selectedProcedure.installmentsTotal
      : parseInt(selectedProcedure.parcelasCartao || "1", 10) || 1
    : 1;
  const selectedAlreadyPaidInstallments = selectedProcedure
    ? selectedProcedure.installmentsPaid != null
      ? selectedProcedure.installmentsPaid
      : selectedProcedure.status === "paid"
      ? selectedTotalInstallments
      : 0
    : 0;
  const selectedRemainingInstallments = Math.max(
    0,
    selectedTotalInstallments - selectedAlreadyPaidInstallments
  );
  const selectedTotalValue = selectedProcedure
    ? parseMoneyToNumber(selectedProcedure.valor)
    : 0;
  /** Valor nominal de cada parcela do contrato (valor total ÷ parcelas totais). */
  const selectedPerInstallmentValue =
    selectedTotalInstallments > 0
      ? selectedTotalValue / selectedTotalInstallments
      : selectedTotalValue;
  const selectedAmountPaidValue = Math.max(
    0,
    selectedProcedure?.amountPaid ??
      Math.min(selectedTotalValue, selectedAlreadyPaidInstallments * selectedPerInstallmentValue)
  );
  const selectedAmountRemaining = Math.max(0, selectedTotalValue - selectedAmountPaidValue);
  /** Valor de cada “faixa” sobre o saldo faltante, alinhado às parcelas ainda em aberto. */
  const remainingPerInstallmentSlot =
    selectedRemainingInstallments > 0
      ? Math.round((selectedAmountRemaining / selectedRemainingInstallments) * 100) / 100
      : selectedAmountRemaining;
  const fallbackAmountByInstallment = Math.max(
    0,
    Math.min(
      selectedAmountRemaining,
      selectedRemainingInstallments > 0
        ? remainingPerInstallmentSlot
        : selectedAmountRemaining
    )
  );
  const requestedAmount = parseMoneyToNumber(amountToPayInput);
  const sanitizedRequestedAmount = Math.max(0, Math.min(selectedAmountRemaining, requestedAmount));
  const parceladoAmount = Math.max(
    0,
    installments > 0
      ? Math.round((selectedAmountRemaining / installments) * 100) / 100
      : selectedAmountRemaining
  );
  const flexivelAmount =
    sanitizedRequestedAmount > 0
      ? sanitizedRequestedAmount
      : Math.min(selectedAmountRemaining, fallbackAmountByInstallment);
  const amountToPayNow = modoPagamento === "parcelado" ? parceladoAmount : flexivelAmount;
  const pixAmountPreview = amountToPayNow;

  useEffect(() => {
    const maxOpt = installmentOptions.length;
    if (maxOpt === 0) return;
    setInstallments((prev) => (prev > maxOpt ? maxOpt : prev));
  }, [selectedProcedure?.id, installmentOptions.length, modalPagamentoAberto]);

  const handlePay = (skipPixQr = false) => {
    if (!selectedProcedure || !userId || !user) return;

    if (formaPagamento === "cartao" && cartoes.length === 0) {
      setCardRequiredModalOpen(true);
      return;
    }

    if (formaPagamento === "pix") {
      const clinicPaySettings = loadClinicPaymentSettings(selectedProcedure.clinicaId);
      if (isClinicPaymentLinkExpired(clinicPaySettings)) {
        setSnackbar({
          open: true,
          message:
            "O link de pagamento desta clínica expirou. Entre em contato com a clínica ou utilize cartão de crédito, se disponível.",
          severity: "error",
        });
        return;
      }
      if (!skipPixQr) {
        const bankLink = clinicPaySettings?.receiptLink?.trim();
        const examplePixUrl =
          bankLink ||
          `https://example.com/pix-payment?procedureId=${selectedProcedure.procedimentoId}&patientId=${userId}&amount=${pixAmountPreview.toFixed(2)}`;
        setPixQrValue(examplePixUrl);
        setPixQrModalAberto(true);
        return;
      }
    }

    if (amountToPayNow <= 0) {
      setSnackbar({
        open: true,
        message: "Informe um valor válido para pagamento.",
        severity: "error",
      });
      return;
    }

    // Quantidade total de parcelas e já pagas antes deste pagamento
    const totalInstallments = selectedProcedure.installmentsTotal != null
      ? selectedProcedure.installmentsTotal
      : (parseInt(selectedProcedure.parcelasCartao || "1", 10) || 1);
    const alreadyPaidBefore = selectedProcedure.installmentsPaid != null
      ? selectedProcedure.installmentsPaid
      : (selectedProcedure.status === "paid" ? totalInstallments : 0);
    const clampedAlreadyPaidBefore = Math.min(totalInstallments, Math.max(0, alreadyPaidBefore));
    const remainingBefore = Math.max(0, totalInstallments - clampedAlreadyPaidBefore);

    const valorTotalProc = parseMoneyToNumber(selectedProcedure.valor);
    const valorJaPagoAntes = Math.max(
      0,
      selectedProcedure.amountPaid ??
        Math.min(
          valorTotalProc,
          clampedAlreadyPaidBefore * (valorTotalProc / Math.max(1, totalInstallments))
        )
    );
    if (valorTotalProc - valorJaPagoAntes <= 0.009) {
      setSnackbar({
        open: true,
        message: "Não há valor restante para pagar neste procedimento.",
        severity: "error",
      });
      return;
    }

    const saldoFaltante = Math.max(0, valorTotalProc - valorJaPagoAntes);
    if (modoPagamento === "flexivel" && amountToPayNow > saldoFaltante + 0.01) {
      setSnackbar({
        open: true,
        message: `No pagamento flexível o valor não pode ultrapassar o saldo faltante (máx. R$ ${formatMoneyPtBr(saldoFaltante)}).`,
        severity: "error",
      });
      return;
    }

    // Quantas parcelas o usuário está tentando pagar agora (flexível: só o valor informado; parcelas só no modo parcelado)
    const requestedInstallments =
      modoPagamento === "parcelado" ? installments : 1;
    const installmentsToPay = Math.min(remainingBefore, requestedInstallments);

    // Atualiza o procedimento contratado respeitando o limite de parcelas restantes
    const allHired = loadHiredProcedures(userId);
    const updatedHired = allHired.map((h) => {
      if (h.id !== selectedProcedure.id) return h;
      const hTotalInstallments = h.installmentsTotal != null
        ? h.installmentsTotal
        : (parseInt(h.parcelasCartao || "1", 10) || 1);
      const hAlreadyPaid = h.installmentsPaid != null
        ? h.installmentsPaid
        : (h.status === "paid" ? hTotalInstallments : 0);
      const hClampedAlreadyPaid = Math.min(hTotalInstallments, Math.max(0, hAlreadyPaid));
      const hRemaining = Math.max(0, hTotalInstallments - hClampedAlreadyPaid);
      const hToPay =
        modoPagamento === "flexivel"
          ? 0
          : Math.min(hRemaining, installmentsToPay);
      const nextPaid = hClampedAlreadyPaid + hToPay;
      const hTotalValue = parseMoneyToNumber(h.valor);
      const hPerInstallmentValue =
        hTotalInstallments > 0 ? hTotalValue / hTotalInstallments : hTotalValue;
      const hAmountPaidBefore =
        h.amountPaid ?? Math.min(hTotalValue, hClampedAlreadyPaid * hPerInstallmentValue);
      const hAmountPaidAfter = Math.min(hTotalValue, hAmountPaidBefore + amountToPayNow);
      const paidByAmount = hTotalValue > 0 && hAmountPaidAfter >= hTotalValue;
      const fullyPaid = nextPaid >= hTotalInstallments;
      const nextInstallmentsPaid =
        modoPagamento === "parcelado"
          ? Math.min(hTotalInstallments, nextPaid)
          : hClampedAlreadyPaid;
      return {
        ...h,
        installmentsTotal: hTotalInstallments,
        // Pagamento flexível não consome "quantidade de parcelas".
        installmentsPaid: nextInstallmentsPaid,
        amountPaid: hAmountPaidAfter,
        status: fullyPaid || paidByAmount ? ("paid" as const) : ("pending" as const),
      };
    });

    let finalHired = updatedHired;
    const selAfter = updatedHired.find((h) => h.id === selectedProcedure.id)!;
    if (selAfter.status === "paid" && !selAfter.leadSentToClinic) {
      const nomeCompletoLead =
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        `Paciente ${user.id}`;
      addPatientToClinic(selAfter.clinicaId, {
        userId,
        nome: nomeCompletoLead,
        email: user.email ?? "",
        dataAssociacao: new Date().toISOString(),
      });
      addClinicPaidLead(selAfter.clinicaId, {
        id: Date.now(),
        patientId: userId,
        patientName: nomeCompletoLead,
        procedureId: selAfter.procedimentoId,
        procedureName: selAfter.procedimentoNome,
        clinicaId: selAfter.clinicaId,
        valorTotal: selAfter.valor,
        createdAt: new Date().toISOString(),
      });
      finalHired = updatedHired.map((h) =>
        h.id === selAfter.id ? { ...h, leadSentToClinic: true } : h
      );
    }

    saveHiredProcedures(userId, finalHired);
    setPendingProcedures(finalHired);

    // Dados atualizados do procedimento após o pagamento
    const selectedAfterUpdate = finalHired.find((h) => h.id === selectedProcedure.id)!;
    const updatedTotalInstallments = selectedAfterUpdate.installmentsTotal != null
      ? selectedAfterUpdate.installmentsTotal
      : (parseInt(selectedAfterUpdate.parcelasCartao || "1", 10) || 1);
    const updatedAlreadyPaid = selectedAfterUpdate.installmentsPaid != null
      ? selectedAfterUpdate.installmentsPaid
      : (selectedAfterUpdate.status === "paid" ? updatedTotalInstallments : 0);

    // Quantas parcelas foram efetivamente pagas nesta operação
    const installmentsPaidNow = Math.max(
      0,
      updatedAlreadyPaid - clampedAlreadyPaidBefore
    );

    // Valor por parcela e valor total deste pagamento
    const totalValue =
      parseFloat(
        selectedAfterUpdate.valor.replace(".", "").replace(",", ".")
      ) || 0;
    const amountPaid = amountToPayNow;

    // Histórico de pagamento do paciente
    const payments = loadPatientPayments(userId);
    const newPayment: PagamentoHistorico = {
      id: Date.now(),
      userId,
      clinicaId: selectedAfterUpdate.clinicaId,
      clinicaNome: selectedAfterUpdate.clinicaNome,
      procedimentoId: selectedAfterUpdate.procedimentoId,
      procedimentoNome: selectedAfterUpdate.procedimentoNome,
      valor: amountPaid.toFixed(2).replace(".", ","),
      formaPagamento,
      parcelas: updatedTotalInstallments,
      data: new Date().toLocaleString("pt-BR"),
      status:
        (selectedAfterUpdate.amountPaid ?? 0) >= totalValue
          ? "Concluído"
          : `Pago R$ ${formatMoneyPtBr(selectedAfterUpdate.amountPaid ?? 0)} de R$ ${formatMoneyPtBr(totalValue)}`,
    };
    savePatientPayments(userId, [...payments, newPayment]);

    // Registro de pagamento para a clínica
    const nomeCompleto =
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.email ||
      `Paciente ${user.id}`;
    addClinicPayment(selectedProcedure.clinicaId, {
      id: Date.now(),
      patientId: userId,
      patientName: nomeCompleto,
      procedureId: selectedProcedure.procedimentoId,
      procedureName: selectedProcedure.procedimentoNome,
      amount: amountPaid.toFixed(2).replace(".", ","),
      method: formaPagamento,
      installments:
        formaPagamento === "cartao" ? installmentsPaidNow : undefined,
      date: new Date().toISOString(),
    });

    setSnackbar({
      open: true,
      message: "Pagamento realizado com sucesso!",
      severity: "success",
    });
    setPixQrModalAberto(false);
    setModalPagamentoAberto(false);
  };

  return (
    <Box sx={{ mt: { xs: 7, sm: 8 } }}>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Pagamentos
      </Typography>

      <Box display="flex" justifyContent="flex-end" mb={2}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setModalHireAberto(true)}
        >
          Contratar procedimento
        </Button>
      </Box>

      <Dialog
        open={modalHireAberto}
        onClose={() => setModalHireAberto(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Contratar procedimento</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Buscar procedimento"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          {patientLocation && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={filterByRegion}
                  onChange={(e) => setFilterByRegion(e.target.checked)}
                />
              }
              label={`Mostrar apenas clínicas na minha região (${patientLocation.cidade} - ${patientLocation.estado.toUpperCase()})`}
              sx={{ mb: 2 }}
            />
          )}
          {!patientLocation && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Cadastre seu endereço para filtrar por região.
            </Typography>
          )}
          {procedimentosFiltrados.length === 0 ? (
            <Typography color="text.secondary">Nenhum procedimento encontrado.</Typography>
          ) : (
            <List dense sx={{ maxHeight: 400, overflow: "auto" }}>
              {procedimentosFiltrados.map((p) => (
                <ListItemButton
                  key={p.id}
                  selected={String(p.id) === selectedProcId}
                  onClick={() => setSelectedProcId(String(p.id))}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Radio checked={String(p.id) === selectedProcId} value={String(p.id)} />
                  </ListItemIcon>
                  <ListItemText
                    primary={p.finalidade}
                    secondary={`${p.clinicaNome} · R$ ${p.valorProcedimento} · até ${p.parcelasCartao}x`}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalHireAberto(false)}>Cancelar</Button>
          <Button onClick={handleOpenParcelado} disabled={!selectedProcId}>
            Pagamento parcelado
          </Button>
          <Button variant="contained" onClick={handleHire} disabled={!selectedProcId}>
            Contratar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={modalParceladoAberto}
        onClose={() => setModalParceladoAberto(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Pagamento parcelado</DialogTitle>
        <DialogContent>
          {selectedProcId && (
            <Box sx={{ mb: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
              {(() => {
                const proc = procedimentosComClinica.find((p) => String(p.id) === selectedProcId);
                if (!proc) return null;
                const maxParcelasProcedimento = parseInt(proc.parcelasCartao || "1", 10) || 1;
                const maxParcelas = Math.min(10, maxParcelasProcedimento || 1);
                return (
                  <>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {proc.finalidade}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {proc.clinicaNome} · R$ {proc.valorProcedimento} · até {maxParcelas}x no cartão
                    </Typography>
                  </>
                );
              })()}
            </Box>
          )}
          <TextField
            fullWidth
            type="number"
            label="Número de parcelas"
            value={parcelasSelecionadas}
            onChange={(e) => setParcelasSelecionadas(Number(e.target.value) || 1)}
            inputProps={{ min: 1, max: 10 }}
            helperText="Escolha em quantas vezes deseja dividir (até 10x, limitado pelo máximo do procedimento)."
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalParceladoAberto(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleConfirmParcelado} disabled={!selectedProcId}>
            Confirmar pagamento parcelado
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(procedureHideConfirm)}
        onClose={() => setProcedureHideConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Pagamento em andamento</DialogTitle>
        <DialogContent>
          {procedureHideConfirm ? (
            <>
              {(() => {
                const s = hiredProcedurePaymentSummary(procedureHideConfirm);
                return (
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    Você está prestes a remover da lista o procedimento{" "}
                    <strong>{procedureHideConfirm.procedimentoNome}</strong>, contratado em{" "}
                    <strong>{procedureHideConfirm.clinicaNome}</strong>, com pagamento ainda em andamento.
                    Ainda falta <strong>R$ {formatMoneyPtBr(s.remainingAmount)}</strong> do total de{" "}
                    <strong>R$ {formatMoneyPtBr(s.totalValue)}</strong> (pago até agora: R${" "}
                    {formatMoneyPtBr(s.amountPaid)}).
                  </Typography>
                );
              })()}
              <Typography variant="body2" color="text.secondary">
                Ao confirmar, o item deixará de aparecer para você neste app. Isso não cancela obrigações
                junto à clínica nem apaga pagamentos já registrados.
              </Typography>
            </>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProcedureHideConfirm(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={confirmHideProcedureInProgress}>
            Confirmar exclusão da lista
          </Button>
        </DialogActions>
      </Dialog>

      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Meus procedimentos e pagamentos
          </Typography>
          {pendingProcedures.filter((p) => !p.hiddenByPatient && p.status !== "scheduled").length === 0 ? (
            <Typography color="text.secondary">
              Nenhum pagamento pendente.
            </Typography>
          ) : (
            <List
              sx={{
                maxHeight: { xs: "50vh", sm: "min(60vh, 420px)" },
                overflowY: "auto",
                pr: 0.5,
              }}
            >
              {pendingProcedures
                .filter(
                  (proc) =>
                    !proc.hiddenByPatient &&
                    (proc.status === "pending" || proc.status === "paid")
                )
                .map((proc) => {
                  const { totalValue, amountPaid, remainingAmount, isPaid, progress } =
                    hiredProcedurePaymentSummary(proc);
                  return (
                    <ListItem
                      key={proc.id}
                      secondaryAction={
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => requestHideProcedureFromPatient(proc)}
                            aria-label={
                              isPaid
                                ? "Ocultar da lista"
                                : "Excluir procedimento com pagamento em andamento"
                            }
                            title={
                              isPaid
                                ? "Excluir da lista (oculta para você)"
                                : "Remover da lista (há pagamento em andamento)"
                            }
                          >
                            <DeleteOutlineIcon />
                          </IconButton>
                          <Button
                            variant="contained"
                            onClick={() => openPaymentModal(proc)}
                            disabled={isPaid}
                          >
                            {isPaid ? "Pago" : "Pagar"}
                          </Button>
                        </Stack>
                      }
                    >
                      <ListItemText
                        primary={proc.procedimentoNome}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="text.secondary">
                              {proc.clinicaNome} · R$ {proc.valor}
                            </Typography>
                            <Box sx={{ mt: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={progress}
                                sx={{
                                  height: 8,
                                  borderRadius: 999,
                                  bgcolor: "action.hover",
                                  maxWidth: "70%",
                                }}
                              />
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ mt: 0.5, display: "block" }}
                              >
                                {isPaid
                                  ? "Pagamento concluído (100%)"
                                  : `Pago R$ ${formatMoneyPtBr(amountPaid)} de R$ ${formatMoneyPtBr(totalValue)} · Falta R$ ${formatMoneyPtBr(remainingAmount)}`}
                              </Typography>
                            </Box>
                          </>
                        }
                      />
                    </ListItem>
                  );
                })}
            </List>
          )}
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Meus cartões
          </Typography>
          {cartoes.length === 0 ? (
            <Typography color="text.secondary">
              Nenhum cartão cadastrado.{" "}
              <Button
                size="small"
                onClick={() => navigate(APP_ROUTES.PATIENT.CARDS)}
              >
                Cadastrar cartão
              </Button>
            </Typography>
          ) : (
            <List
              dense
              sx={{
                maxHeight: { xs: "40vh", sm: "min(50vh, 320px)" },
                overflowY: "auto",
                pr: 0.5,
              }}
            >
              {cartoes.map((c) => (
                <ListItem key={c.id}>
                  <ListItemIcon>
                    <CreditCardIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary={`**** **** **** ${c.ultimosQuatroDigitos}`}
                    secondary={`${c.nomeTitular} · Val. ${c.validade}${c.bandeira ? ` · ${c.bandeira === "mastercard" ? "Mastercard" : "Visa"}` : ""}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      </Stack>

      {/* Modal de pagamento */}
      <Dialog
        open={modalPagamentoAberto}
        onClose={() => setModalPagamentoAberto(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Realizar pagamento</DialogTitle>
        <DialogContent>
          {selectedProcedure && (
            <Box sx={{ mb: 2, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                {selectedProcedure.procedimentoNome}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedProcedure.clinicaNome} · R$ {selectedProcedure.valor}
              </Typography>
            </Box>
          )}

          {clinicPaymentLinkExpired && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              O link de pagamento desta clínica <strong>expirou</strong>. Não é possível pagar via PIX até que a
              clínica atualize os dados de pagamento. Utilize cartão de crédito, se disponível, ou entre em
              contato com a clínica.
            </Alert>
          )}

          <FormControl component="fieldset" sx={{ mt: 1, width: "100%" }}>
            <FormLabel component="legend">Forma de pagamento</FormLabel>
            <RadioGroup
              value={formaPagamento}
              onChange={(_, v) => {
                const next = v as FormaPagamento;
                setFormaPagamento(next);
                if (next === "pix") {
                  setModoPagamento("flexivel");
                  setInstallments(1);
                }
              }}
            >
              <FormControlLabel
                value="pix"
                control={<Radio />}
                label="PIX"
                disabled={clinicPaymentLinkExpired}
              />
              <FormControlLabel value="cartao" control={<Radio />} label="Cartão de crédito" />
            </RadioGroup>
          </FormControl>

          <FormControl component="fieldset" sx={{ mt: 2, width: "100%" }}>
            <FormLabel component="legend">Tipo de pagamento</FormLabel>
            <RadioGroup
              row
              value={modoPagamento}
              onChange={(_, v) => {
                const next = v as ModoPagamento;
                setModoPagamento(next);
                if (next === "flexivel") setInstallments(1);
              }}
            >
              {formaPagamento === "cartao" && (
                <FormControlLabel value="parcelado" control={<Radio />} label="Parcelado" />
              )}
              <FormControlLabel value="flexivel" control={<Radio />} label="Flexível" />
            </RadioGroup>
          </FormControl>

          {formaPagamento === "pix" && (
            <Box sx={{ mt: 2 }}>
              {modoPagamento === "parcelado" ? (
                <>
                  <FormControl fullWidth>
                    <InputLabel id="installments-pix-label">Parcelas</InputLabel>
                    <Select
                      labelId="installments-pix-label"
                      value={installments}
                      label="Parcelas"
                      onChange={(e) => setInstallments(Number(e.target.value))}
                    >
                      {installmentOptions.map((num) => {
                        const valorPorParcela =
                          num > 0
                            ? Math.round((selectedAmountRemaining / num) * 100) / 100
                            : selectedAmountRemaining;
                        return (
                          <MenuItem key={num} value={num}>
                            {`${num}x de R$ ${formatMoneyPtBr(valorPorParcela)}`}
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                  <TextField
                    sx={{ mt: 2 }}
                    label="Valor a pagar via PIX"
                    fullWidth
                    value={`R$ ${formatMoneyPtBr(parceladoAmount)}`}
                    slotProps={{ input: { readOnly: true } }}
                    helperText={`Faltante: R$ ${formatMoneyPtBr(selectedAmountRemaining)}`}
                  />
                </>
              ) : (
                <TextField
                  label="Valor a pagar via PIX"
                  fullWidth
                  value={amountToPayInput}
                  onChange={(e) =>
                    setAmountToPayInput(
                      clampMoneyInputToMaxRemaining(e.target.value, selectedAmountRemaining)
                    )
                  }
                  helperText={`Saldo faltante (máximo neste pagamento): R$ ${formatMoneyPtBr(selectedAmountRemaining)}`}
                />
              )}
            </Box>
          )}

          {formaPagamento === "cartao" && (
            <>
              {modoPagamento === "flexivel" && (
                <TextField
                  sx={{ mt: 2 }}
                  label="Valor a pagar no cartão"
                  fullWidth
                  value={amountToPayInput}
                  onChange={(e) =>
                    setAmountToPayInput(
                      clampMoneyInputToMaxRemaining(e.target.value, selectedAmountRemaining)
                    )
                  }
                  helperText={`Saldo faltante (máximo neste pagamento): R$ ${formatMoneyPtBr(selectedAmountRemaining)}`}
                />
              )}
              <FormControl component="fieldset" sx={{ mt: 2, width: "100%" }}>
                <FormLabel component="legend">Cartões cadastrados</FormLabel>
                {cartoes.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nenhum cartão.{" "}
                    <Button
                      size="small"
                      onClick={() => {
                        setModalPagamentoAberto(false);
                        navigate(APP_ROUTES.PATIENT.CARDS);
                      }}
                    >
                      Cadastrar
                    </Button>
                  </Typography>
                ) : (
                  <RadioGroup
                    value={selectedCardId}
                    onChange={(_, v) => setSelectedCardId(v)}
                  >
                    {cartoes.map((c) => (
                      <FormControlLabel
                        key={c.id}
                        value={String(c.id)}
                        control={<Radio />}
                        label={`**** **** **** ${c.ultimosQuatroDigitos} · ${c.nomeTitular}${c.bandeira ? ` · ${c.bandeira === "mastercard" ? "Mastercard" : "Visa"}` : ""}`}
                      />
                    ))}
                  </RadioGroup>
                )}
              </FormControl>

              {selectedProcedure && modoPagamento === "parcelado" && (
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel id="installments-label">Parcelas</InputLabel>
                  <Select
                    labelId="installments-label"
                    value={installments}
                    label="Parcelas"
                    onChange={(e) => setInstallments(Number(e.target.value))}
                  >
                    {installmentOptions.map((num) => {
                      const valorPorParcela =
                        num > 0
                          ? Math.round((selectedAmountRemaining / num) * 100) / 100
                          : selectedAmountRemaining;
                      return (
                        <MenuItem key={num} value={num}>
                          {`${num}x de R$ ${formatMoneyPtBr(valorPorParcela)}`}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
              {modoPagamento === "parcelado" && (
                <TextField
                  sx={{ mt: 2 }}
                  label="Valor a pagar no cartão"
                  fullWidth
                  value={`R$ ${formatMoneyPtBr(parceladoAmount)}`}
                  slotProps={{ input: { readOnly: true } }}
                  helperText={`Faltante: R$ ${formatMoneyPtBr(selectedAmountRemaining)}`}
                />
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalPagamentoAberto(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => handlePay()}
            disabled={
              !selectedProcedure ||
              amountToPayNow <= 0 ||
              (formaPagamento === "pix" && clinicPaymentLinkExpired) ||
              (formaPagamento === "cartao" && cartoes.length > 0 && !selectedCardId) ||
              (formaPagamento === "cartao" &&
                modoPagamento === "parcelado" &&
                installmentOptions.length === 0)
            }
          >
            Pagar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
      >
        <Alert severity={snackbar.severity}>{snackbar.message}</Alert>
      </Snackbar>

      <Dialog
        open={pixQrModalAberto}
        onClose={() => setPixQrModalAberto(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Pagamento via PIX</DialogTitle>
        <DialogContent>
          <Stack alignItems="center" spacing={2} sx={{ py: 1 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              Escaneie o QR Code para realizar o pagamento.
            </Typography>
            <Box sx={{ p: 2, bgcolor: "common.white", borderRadius: 1 }}>
              <QRCode value={pixQrValue || "https://example.com/pix-payment"} size={220} />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPixQrModalAberto(false)}>Fechar</Button>
          <Button variant="contained" onClick={() => handlePay(true)}>
            Confirmar pagamento
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={cardRequiredModalOpen}
        onClose={() => setCardRequiredModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cartão não cadastrado</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Para pagar com cartão de crédito, é necessário cadastrar ao menos um cartão.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardRequiredModalOpen(false)}>Fechar</Button>
          <Button
            variant="contained"
            onClick={() => {
              setCardRequiredModalOpen(false);
              setModalPagamentoAberto(false);
              navigate(APP_ROUTES.PATIENT.CARDS);
            }}
          >
            Cadastrar cartão
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
