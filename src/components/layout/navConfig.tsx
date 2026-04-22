import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Columns3,
  Map,
  Radio,
  Settings,
  Truck,
  Users,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  end?: boolean;
  group: "monitor" | "network" | "resources";
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/app", label: "Hoje", shortLabel: "Hoje", icon: CalendarDays, end: true, group: "monitor" },
  { to: "/app/jobs", label: "Trabalhos", shortLabel: "Jobs", icon: Columns3, group: "monitor" },
  { to: "/app/dispatch", label: "Expedição", shortLabel: "Expedir", icon: Radio, group: "monitor" },
  { to: "/app/map", label: "Mapa ao vivo", shortLabel: "Mapa", icon: Map, group: "monitor" },
  { to: "/app/drivers", label: "Motoristas", icon: Users, group: "network" },
  { to: "/app/fleet", label: "Frota", icon: Truck, group: "network" },
  { to: "/app/reports", label: "Relatórios", icon: BarChart3, group: "resources" },
  { to: "/app/settings", label: "Definições", shortLabel: "Def.", icon: Settings, group: "resources" },
];
