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
  invoicePrefix:      string;   // e.g. "FT 2026/" — numbering itself lives in the operational store
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
  vatPct:             23,
  paymentTermsDays:   30,
};

const STORAGE_KEY = "fleet-settings-v1";

/* ─── Context ─────────────────────────────────────────────── */
type SettingsCtx = {
  settings:       CompanySettings;
  updateSettings: (patch: Partial<CompanySettings>) => void;
  resetSettings:  () => void;
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


  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}

/** Company identity frozen into a document at issue time. */
export function companySnapshot(s: CompanySettings): import("../domain/documents/documents").CompanySnapshot {
  return { name: s.name, nif: s.nif, address: s.address, postalCity: s.postalCity, country: s.country, phone: s.phone, email: s.email, licencaComunitaria: s.licencaComunitaria, iban: s.iban, invoicePrefix: s.invoicePrefix, vatPct: s.vatPct, paymentTermsDays: s.paymentTermsDays };
}
