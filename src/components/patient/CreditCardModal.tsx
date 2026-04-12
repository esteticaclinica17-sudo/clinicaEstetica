import { useEffect, useState } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from "@mui/material";

export interface CreditCardFormValues {
  nomeTitular: string;
  numeroCartao: string;
  validade: string;
  bandeira: "mastercard" | "visa";
}

interface CreditCardModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (values: CreditCardFormValues) => void;
}

/** 16 dígitos, ex.: 1234 5678 9012 3456 */
const CARD_NUMBER_DIGITS_REGEX = /^\d{16}$/;

/** Validade impressa no cartão: MM/AA com mês 01–12 */
const EXPIRY_MM_AA_REGEX = /^(0[1-9]|1[0-2])\/\d{2}$/;

const CARD_DIGITS_MAX = 16;

function maskCardNumberInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, CARD_DIGITS_MAX);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trimEnd();
}

function maskExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isExpiryMonthYearValid(mmAa: string): boolean {
  if (!EXPIRY_MM_AA_REGEX.test(mmAa)) return false;
  const [mm, aa] = mmAa.split("/");
  const month = parseInt(mm, 10);
  const year = 2000 + parseInt(aa, 10);
  const lastInstantOfExpiryMonth = new Date(year, month, 0, 23, 59, 59, 999);
  return lastInstantOfExpiryMonth.getTime() >= Date.now();
}

export function CreditCardModal({
  open,
  onClose,
  onSave,
}: CreditCardModalProps) {
  const [nomeTitular, setNomeTitular] = useState("");
  const [numeroCartao, setNumeroCartao] = useState("");
  const [validade, setValidade] = useState("");
  const [bandeira, setBandeira] = useState<"mastercard" | "visa">("mastercard");

  useEffect(() => {
    if (open) {
      setNomeTitular("");
      setNumeroCartao("");
      setValidade("");
      setBandeira("mastercard");
    }
  }, [open]);

  const numeroSomenteDigitos = numeroCartao.replace(/\D/g, "");
  const trimmedValidade = validade.trim();
  const cardNumberOk = CARD_NUMBER_DIGITS_REGEX.test(numeroSomenteDigitos);
  const expiryComplete = trimmedValidade.length === 5;
  const expiryFormatOk = EXPIRY_MM_AA_REGEX.test(trimmedValidade);
  const expiryNotPast =
    expiryFormatOk && isExpiryMonthYearValid(trimmedValidade);

  const isValid =
    nomeTitular.trim() !== "" && cardNumberOk && expiryNotPast;

  const cardFieldError =
    numeroSomenteDigitos.length === CARD_DIGITS_MAX && !cardNumberOk;

  const cardHelper =
    numeroSomenteDigitos.length === 0
      ? "Apenas os 4 últimos dígitos serão armazenados."
      : numeroSomenteDigitos.length < CARD_DIGITS_MAX
        ? `${numeroSomenteDigitos.length}/${CARD_DIGITS_MAX} dígitos — formato 0000 0000 0000 0000.`
        : "Apenas os 4 últimos dígitos serão armazenados.";

  const expiryFieldError =
    expiryComplete && (!expiryFormatOk || !expiryNotPast);

  const expiryHelper = !expiryComplete
    ? "Formato MM/AA, como no cartão (ex.: 03/28 para março de 2028)."
    : !expiryFormatOk
      ? "Use MM/AA com mês entre 01 e 12."
      : !expiryNotPast
        ? "A validade deste cartão já passou."
        : "";

  const handleSaveClick = () => {
    if (!isValid) return;

    onSave({
      nomeTitular: nomeTitular.trim(),
      numeroCartao,
      validade: trimmedValidade,
      bandeira,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Cadastrar cartão de crédito</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Nome do titular"
            fullWidth
            value={nomeTitular}
            onChange={(event) => setNomeTitular(event.target.value)}
          />
          <TextField
            label="Número do cartão"
            fullWidth
            value={numeroCartao}
            onChange={(event) =>
              setNumeroCartao(maskCardNumberInput(event.target.value))
            }
            placeholder="0000 0000 0000 0000"
            inputProps={{
              inputMode: "numeric",
              maxLength: 19,
              "aria-invalid": cardFieldError,
            }}
            error={cardFieldError}
            helperText={cardHelper}
          />
          <TextField
            label="Validade (MM/AA)"
            fullWidth
            value={validade}
            onChange={(event) =>
              setValidade(maskExpiryInput(event.target.value))
            }
            placeholder="MM/AA"
            inputProps={{
              inputMode: "numeric",
              maxLength: 5,
              "aria-invalid": expiryFieldError,
            }}
            error={expiryFieldError}
            helperText={expiryHelper}
          />
          <FormControl component="fieldset">
            <FormLabel component="legend">Bandeira do cartão</FormLabel>
            <RadioGroup
              row
              value={bandeira}
              onChange={(_, value) =>
                setBandeira(value as "mastercard" | "visa")
              }
            >
              <FormControlLabel
                value="mastercard"
                control={<Radio />}
                label="Mastercard"
              />
              <FormControlLabel value="visa" control={<Radio />} label="Visa" />
            </RadioGroup>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSaveClick} disabled={!isValid}>
          Salvar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

