import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/* ─── Types ──────────────────────────────────────────────── */
export type CompanySettings = {
  name:               string;
  nif:                string;
  address:            string;
  postalCity:         string;
  country:            string;
  phone:              string;
  email:              string;
  iban:               string;
  licencaComunitaria: string;
  invoicePrefix:      string;   // e.g. "FT 2026/"
  invoiceNextSeq:     number;   // next invoice sequence number
  vatPct:             number;   // default 23 for PT transport services
  paymentTermsDays:   number;   // default 30
};

export const DEFAULT_SETTINGS: CompanySettings = {
  name:               "Peninsula Fleet Transportes, Lda.",
  nif:                "500 000 000",
  address:            "Zona Industrial Norte, Lote 12",
  postalCity:         "4470-123 Maia",
  country:            "Portugal",
  phone:              "+351 220 000 000",
  email:              "geral@peninsulafleet.pt",
  iban:               "PT50 0010 0000 0000 0000 0000 5",
  licencaComunitaria: "CM 123456789",
  invoicePrefix:      "FT 2026/",
  invoiceNextSeq:     1,
  vatPct:             23,
  paymentTermsDays:   30,
};

const STORAGE_KEY = "fleet-settings-v1";

/* ─── Context ─────────────────────────────────────────────── */
type SettingsCtx = {
  settings:       CompanySettings;
  updateSettings: (patch: Partial<CompanySettings>) => void;
  resetSettings:  () => void;
  nextInvoiceNumber: () => string;
};

const SettingsContext = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<CompanySettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } as CompanySettings;
    } catch { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* quota */ }
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<CompanySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  /** Generates the next invoice number string and increments the sequence. */
  const nextInvoiceNumber = useCallback((): string => {
    const num = `${settings.invoicePrefix}${String(settings.invoiceNextSeq).padStart(4, "0")}`;
    setSettings((prev) => ({ ...prev, invoiceNextSeq: prev.invoiceNextSeq + 1 }));
    return num;
  }, [settings.invoicePrefix, settings.invoiceNextSeq]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings, nextInvoiceNumber }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
