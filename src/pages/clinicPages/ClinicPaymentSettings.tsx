import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Snackbar,
  Alert,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { useAppSelector } from "../../core/store/hooks";
import {
  type ClinicPaymentLimitPreset,
  DEFAULT_CLINIC_PAYMENT_SETTINGS,
  loadClinicPaymentSettingsOrDefault,
  saveClinicPaymentSettings,
} from "../../util/clinicPaymentSettings";

export type { ClinicPaymentLimitPreset, ClinicPaymentSettingsStored as ClinicPaymentSettingsData } from "../../util/clinicPaymentSettings";

export default function ClinicPaymentSettings() {
  const user = useAppSelector((state) => state.auth.user);
  const clinicId = user?.id ?? 0;

  const [receiptLink, setReceiptLink] = useState("");
  const [paymentLimit, setPaymentLimit] = useState<ClinicPaymentLimitPreset>("unlimited");
  const [linkExpirationDays, setLinkExpirationDays] = useState<number>(7);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({
    open: false,
    message: "",
  });

  const hydrate = useCallback(() => {
    const s = loadClinicPaymentSettingsOrDefault(clinicId);
    setReceiptLink(s.receiptLink);
    setPaymentLimit(s.paymentLimit);
    setLinkExpirationDays(s.linkExpirationDays);
  }, [clinicId]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleSave = () => {
    const days = Math.min(3650, Math.max(1, Math.floor(Number(linkExpirationDays)) || 1));
    saveClinicPaymentSettings(clinicId, {
      receiptLink: receiptLink.trim(),
      paymentLimit,
      linkExpirationDays: days,
    });
    setLinkExpirationDays(days);
    setSnackbar({ open: true, message: "Dados de pagamento salvos com sucesso." });
  };

  return (
    <Box sx={{ mt: { xs: 7, sm: 8 } }}>
      <Typography variant="h4" fontWeight={700} mb={1}>
        Dados de pagamento
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
        Cadastre o link de recebimento do seu banco (PIX, boleto ou página de pagamento), defina quantos
        pagamentos esse link pode receber e por quantos dias ele permanece válido. A cada salvamento, a
        contagem de validade do link é reiniciada.
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 720 }}>
        <Stack spacing={3}>
          <TextField
            label="Link de recebimento do banco"
            value={receiptLink}
            onChange={(e) => setReceiptLink(e.target.value)}
            fullWidth
            placeholder="https://..."
            helperText="URL pública do banco ou gateway para seus pacientes efetuarem o pagamento."
          />

          <FormControl component="fieldset" variant="standard">
            <FormLabel component="legend">Limite de pagamentos pelo link</FormLabel>
            <RadioGroup
              value={paymentLimit}
              onChange={(e) => setPaymentLimit(e.target.value as ClinicPaymentLimitPreset)}
            >
              <FormControlLabel value="unlimited" control={<Radio />} label="Sem limite" />
              <FormControlLabel value="limit_10" control={<Radio />} label="Limitado a 10 pagamentos" />
              <FormControlLabel value="limit_100" control={<Radio />} label="Limitado a 100 pagamentos" />
            </RadioGroup>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Controle quantas transações podem ser associadas a este link antes de precisar gerar outro.
            </Typography>
          </FormControl>

          <TextField
            label="Validade do link (dias)"
            type="number"
            value={linkExpirationDays}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setLinkExpirationDays(1);
                return;
              }
              const n = parseInt(v, 10);
              if (!Number.isNaN(n)) setLinkExpirationDays(n);
            }}
            fullWidth
            slotProps={{ htmlInput: { min: 1, max: 3650 } }}
            helperText={`Número de dias em que o link permanece ativo (padrão ${DEFAULT_CLINIC_PAYMENT_SETTINGS.linkExpirationDays} dias), contados a partir do último salvamento.`}
          />

          <Box>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={!clinicId}>
              Salvar dados
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
