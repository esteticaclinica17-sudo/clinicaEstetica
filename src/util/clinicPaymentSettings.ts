const STORAGE_PREFIX = "clinic_payment_settings_";

export type ClinicPaymentLimitPreset = "unlimited" | "limit_10" | "limit_100";

export interface ClinicPaymentSettingsStored {
  receiptLink: string;
  paymentLimit: ClinicPaymentLimitPreset;
  linkExpirationDays: number;
  /** ISO — início da vigência do link (renovado a cada salvamento na clínica). */
  validFrom?: string;
}

export const DEFAULT_CLINIC_PAYMENT_SETTINGS: Omit<ClinicPaymentSettingsStored, "validFrom"> = {
  receiptLink: "",
  paymentLimit: "unlimited",
  linkExpirationDays: 7,
};

function normalizeParsed(parsed: Partial<ClinicPaymentSettingsStored>): ClinicPaymentSettingsStored {
  const linkExpirationDays =
    typeof parsed.linkExpirationDays === "number" &&
    Number.isFinite(parsed.linkExpirationDays) &&
    parsed.linkExpirationDays > 0
      ? Math.min(3650, Math.floor(parsed.linkExpirationDays))
      : DEFAULT_CLINIC_PAYMENT_SETTINGS.linkExpirationDays;

  return {
    receiptLink: typeof parsed.receiptLink === "string" ? parsed.receiptLink : "",
    paymentLimit:
      parsed.paymentLimit === "limit_10" || parsed.paymentLimit === "limit_100"
        ? parsed.paymentLimit
        : "unlimited",
    linkExpirationDays,
    validFrom: typeof parsed.validFrom === "string" ? parsed.validFrom : undefined,
  };
}

/** Retorna null se a clínica nunca salvou configurações (fluxo legado sem bloqueio por data). */
export function loadClinicPaymentSettings(clinicId: number): ClinicPaymentSettingsStored | null {
  if (!clinicId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + clinicId);
    if (!raw) return null;
    return normalizeParsed(JSON.parse(raw) as Partial<ClinicPaymentSettingsStored>);
  } catch {
    return null;
  }
}

export function loadClinicPaymentSettingsOrDefault(clinicId: number): ClinicPaymentSettingsStored {
  return loadClinicPaymentSettings(clinicId) ?? { ...DEFAULT_CLINIC_PAYMENT_SETTINGS };
}

export function saveClinicPaymentSettings(
  clinicId: number,
  data: Omit<ClinicPaymentSettingsStored, "validFrom">
): void {
  if (!clinicId) return;
  const payload: ClinicPaymentSettingsStored = {
    ...data,
    validFrom: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_PREFIX + clinicId, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Link considerado expirado só se houver registro salvo pela clínica com `validFrom`.
 * Dados antigos sem `validFrom` não expiram (compatibilidade).
 */
export function isClinicPaymentLinkExpired(settings: ClinicPaymentSettingsStored | null): boolean {
  if (!settings?.validFrom) return false;
  const start = Date.parse(settings.validFrom);
  if (Number.isNaN(start)) return false;
  const days = Math.max(1, settings.linkExpirationDays || 7);
  const endMs = start + days * 24 * 60 * 60 * 1000;
  return Date.now() > endMs;
}
