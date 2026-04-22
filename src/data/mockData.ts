import type {
  CargoItem,
  Driver,
  FuelMetrics,
  FuelReading,
  Job,
  MaintenanceItem,
  OpsAlert,
  Route,
  Truck,
  TruckingJobRow,
  VehicleTrailEvent,
} from "./types";
import { demoDate, demoDateOnly, demoTimeLabel } from "../lib/demoTime";

/* ─── Iberian coordinate anchors ────────────────────── */
const T = {
  lisbon:    [38.7223, -9.1393] as [number, number],
  setubal:   [38.5244, -8.8882] as [number, number],
  evora:     [38.5711, -7.9086] as [number, number],
  coimbra:   [40.2033, -8.4103] as [number, number],
  porto:     [41.1579, -8.6291] as [number, number],
  maia:      [41.2355, -8.6200] as [number, number],
  braga:     [41.5454, -8.4265] as [number, number],
  viana:     [41.6979, -8.8314] as [number, number],
  vigo:      [42.2406, -8.7207] as [number, number],
  madrid:    [40.4168, -3.7038] as [number, number],
  barcelona: [41.3874, 2.1686] as [number, number],
  salamanca: [40.9701, -5.6635] as [number, number],
  badajoz:   [38.8794, -6.9706] as [number, number],
  sevilla:   [37.3886, -5.9823] as [number, number],
  faro:      [37.0194, -7.9304] as [number, number],
};

function lerp(a: [number, number], b: [number, number], steps: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/* ══════════════════════════════════════════════════════
   TRUCKS
   ══════════════════════════════════════════════════════ */
export const trucks: Truck[] = [
  {
    id: "t1", name: "Volvo FH 500",              plate: "23-AB-45",
    model: "Volvo FH 500 Globetrotter XL",        yearManuf: 2021, odometerKm: 412_800,
    bodyType: "curtainsider",
    status: "idle", lat: T.lisbon[0] + 0.03, lng: T.lisbon[1] - 0.04, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 88, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t2", name: "Scania R 450",               plate: "67-CD-89",
    model: "Scania R 450 Highline",                yearManuf: 2020, odometerKm: 198_600,
    bodyType: "reefer",
    status: "idle", lat: T.braga[0] - 0.01, lng: T.braga[1] + 0.02, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 76, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t3", name: "MAN TGX 26.510",             plate: "12-EF-34",
    model: "MAN TGX 26.510 XXL",                  yearManuf: 2019, odometerKm: 306_200,
    bodyType: "curtainsider",
    status: "idle", lat: T.coimbra[0] + 0.02, lng: T.coimbra[1] - 0.01, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 82, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t4", name: "Mercedes Actros 1845",        plate: "45-GH-67",
    model: "Mercedes-Benz Actros 1845 StreamSpace", yearManuf: 2022, odometerKm: 121_400,
    bodyType: "reefer",
    status: "idle", lat: T.setubal[0] + 0.01, lng: T.setubal[1] + 0.02, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 71, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t5", name: "Scania G 410",               plate: "89-IJ-12",
    model: "Scania G 410 Normal",                  yearManuf: 2020, odometerKm: 257_100,
    bodyType: "curtainsider",
    status: "idle", lat: T.maia[0] + 0.01, lng: T.maia[1] - 0.02, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 79, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t6", name: "Volvo FM 460",               plate: "34-KL-56",
    model: "Volvo FM 460 Globetrotter",            yearManuf: 2018, odometerKm: 489_300,
    bodyType: "curtainsider",
    status: "maintenance", lat: T.braga[0] + 0.015, lng: T.braga[1] + 0.02, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 48, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t7", name: "DAF XF 480",                 plate: "78-MN-90",
    model: "DAF XF 480 FT Super Space Cab",        yearManuf: 2021, odometerKm: 203_500,
    bodyType: "flatbed",
    status: "loading", lat: T.maia[0] - 0.01, lng: T.maia[1] + 0.02, headingDeg: 0,
    routeId: null, driverId: "d5",
    fuelPct: 54, maxWeightKg: 40_000, currentWeightKg: 18_600, cargoSlots: 3, maxSlots: 6,
  },
  {
    id: "t8", name: "Renault T 480",              plate: "56-OP-23",
    model: "Renault Trucks T 480 High",            yearManuf: 2023, odometerKm: 88_200,
    bodyType: "curtainsider",
    status: "idle", lat: T.coimbra[0] - 0.02, lng: T.coimbra[1] + 0.01, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 90, maxWeightKg: 40_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
  },
  {
    id: "t9", name: "Scania R 500",               plate: "90-QR-45",
    model: "Scania R 500 Highline",                yearManuf: 2022, odometerKm: 167_400,
    bodyType: "reefer",
    status: "in_transit", lat: 38.22, lng: -7.42, headingDeg: 130,
    routeId: "r1", driverId: "d6",
    fuelPct: 43, maxWeightKg: 40_000, currentWeightKg: 24_800, cargoSlots: 4, maxSlots: 6,
  },
  {
    id: "t10", name: "MAN TGS 26.400",            plate: "11-ST-78",
    model: "MAN TGS 26.400 BL",                   yearManuf: 2019, odometerKm: 355_600,
    bodyType: "box",
    status: "in_transit", lat: 40.12, lng: -3.85, headingDeg: 270,
    routeId: "r2", driverId: "d7",
    fuelPct: 29, maxWeightKg: 26_000, currentWeightKg: 19_200, cargoSlots: 4, maxSlots: 5,
  },
];

/* ══════════════════════════════════════════════════════
   DRIVERS
   ══════════════════════════════════════════════════════ */
export const drivers: Driver[] = [
  {
    id: "d1", name: "João Silva",
    phone: "+351 912 440 218", license: "C+E · ADR · Cisternas",
    status: "on_duty", availability: "available", truckId: null,
    hoursToday: 6.8, hoursWeek: 22.0, hoursLimit: 56,
    safetyScore: 94, onTimePct: 92, complianceAlerts: [],
    homeTerminal: "Lisboa",
    licenseExpiry:  demoDateOnly("2028-03-15"),
    cpcExpiry:      demoDateOnly("2027-09-20"),
    adrExpiry:      demoDateOnly("2027-03-10"),
    tachoCalExpiry: demoDateOnly("2026-11-08"),
  },
  {
    id: "d2", name: "Ana Ferreira",
    phone: "+351 935 881 903", license: "C+E · Reefer",
    status: "on_duty", availability: "available", truckId: null,
    hoursToday: 0, hoursWeek: 18.5, hoursLimit: 56,
    safetyScore: 97, onTimePct: 95, complianceAlerts: [],
    homeTerminal: "Braga",
    licenseExpiry:  demoDateOnly("2029-06-01"),
    cpcExpiry:      demoDateOnly("2028-04-15"),
    tachoCalExpiry: demoDateOnly("2027-02-20"),
  },
  {
    id: "d3", name: "Miguel Santos",
    phone: "+351 964 102 774", license: "C+E · ADR",
    status: "on_duty", availability: "available", truckId: null,
    hoursToday: 0, hoursWeek: 30.0, hoursLimit: 56,
    safetyScore: 87, onTimePct: 85, complianceAlerts: [],
    homeTerminal: "Porto",
    licenseExpiry:  demoDateOnly("2027-11-22"),
    cpcExpiry:      demoDateOnly("2026-08-30"),   // expira em ~4 meses
    adrExpiry:      demoDateOnly("2028-01-14"),
    tachoCalExpiry: demoDateOnly("2026-06-05"),   // expira em ~7 semanas
  },
  {
    id: "d4", name: "Inês Carvalho",
    phone: "+351 918 220 661", license: "C+E · ADR",
    status: "on_duty", availability: "available", truckId: null,
    hoursToday: 0, hoursWeek: 24.0, hoursLimit: 56,
    safetyScore: 96, onTimePct: 93, complianceAlerts: [],
    homeTerminal: "Lisboa",
    licenseExpiry:  demoDateOnly("2030-02-28"),
    cpcExpiry:      demoDateOnly("2028-11-10"),
    adrExpiry:      demoDateOnly("2027-07-22"),
    tachoCalExpiry: demoDateOnly("2027-09-18"),
  },
  {
    id: "d5", name: "Rui Costa",
    phone: "+351 927 550 104", license: "C+E",
    status: "on_duty", availability: "assigned", truckId: "t7",
    hoursToday: 2.2, hoursWeek: 31.0, hoursLimit: 56,
    safetyScore: 90, onTimePct: 88, complianceAlerts: [],
    homeTerminal: "Porto",
    licenseExpiry:  demoDateOnly("2026-09-10"),   // expira em ~5 meses
    cpcExpiry:      demoDateOnly("2027-03-01"),
    tachoCalExpiry: demoDateOnly("2026-12-15"),
  },
  {
    id: "d6", name: "Tomás Almeida",
    phone: "+351 939 441 009", license: "C+E · ADR",
    status: "driving", availability: "assigned", truckId: "t9",
    hoursToday: 6.9, hoursWeek: 48.5, hoursLimit: 56,
    safetyScore: 91, onTimePct: 89,
    complianceAlerts: ["CPC expira em breve — confirmar renovação"],
    homeTerminal: "Faro",
    licenseExpiry:  demoDateOnly("2027-05-14"),
    cpcExpiry:      demoDateOnly("2026-05-20"),   // expira ~30 dias — URGENTE
    adrExpiry:      demoDateOnly("2026-11-30"),
    tachoCalExpiry: demoDateOnly("2026-07-02"),
  },
  {
    id: "d7", name: "Carlos Mendes",
    phone: "+351 914 773 002", license: "C+E",
    status: "driving", availability: "assigned", truckId: "t10",
    hoursToday: 8.1, hoursWeek: 53.5, hoursLimit: 56,
    safetyScore: 83, onTimePct: 81,
    complianceAlerts: [
      "53.5h conduzidas esta semana — apenas 2.5h disponíveis",
      "Evento de travagem brusca registado — A-5 (recente)",
    ],
    homeTerminal: "Lisboa",
    licenseExpiry:  demoDateOnly("2026-04-30"),   // expira em DIAS — crítico
    cpcExpiry:      demoDateOnly("2027-01-08"),
    tachoCalExpiry: demoDateOnly("2026-05-10"),   // expira em <1 mês
  },
  {
    id: "d8", name: "Sofia Costa",
    phone: "+351 939 112 874", license: "C+E · ADR",
    status: "violation", availability: "pto", truckId: null,
    hoursToday: 0, hoursWeek: 56.0, hoursLimit: 56,
    safetyScore: 71, onTimePct: 74,
    complianceAlerts: [
      "Limite semanal atingido — IMTT infração se conduzir",
      "Lacuna no tacógrafo — inserção manual obrigatória antes de retomar serviço",
    ],
    homeTerminal: "Coimbra",
    licenseExpiry:  demoDateOnly("2027-08-25"),
    cpcExpiry:      demoDateOnly("2025-12-01"),   // VENCIDA — exige renovação
    adrExpiry:      demoDateOnly("2026-02-14"),   // VENCIDA
    tachoCalExpiry: demoDateOnly("2026-03-20"),   // VENCIDA
  },
  {
    id: "d9", name: "Pedro Nunes",
    phone: "+351 962 334 891", license: "C+E",
    status: "on_duty", availability: "available", truckId: null,
    hoursToday: 0, hoursWeek: 20.0, hoursLimit: 56,
    safetyScore: 95, onTimePct: 94, complianceAlerts: [],
    homeTerminal: "Porto",
    licenseExpiry:  demoDateOnly("2031-01-10"),
    cpcExpiry:      demoDateOnly("2029-03-22"),
    tachoCalExpiry: demoDateOnly("2027-10-30"),
  },
  {
    id: "d10", name: "Carla Mendes",
    phone: "+351 911 508 226", license: "C+E · ADR · Reefer",
    status: "on_duty", availability: "available", truckId: null,
    hoursToday: 4.5, hoursWeek: 16.0, hoursLimit: 56,
    safetyScore: 98, onTimePct: 97, complianceAlerts: [],
    homeTerminal: "Lisboa",
    licenseExpiry:  demoDateOnly("2030-09-05"),
    cpcExpiry:      demoDateOnly("2029-07-14"),
    adrExpiry:      demoDateOnly("2028-05-28"),
    tachoCalExpiry: demoDateOnly("2028-01-04"),
  },
];

/* ══════════════════════════════════════════════════════
   ROUTES
   ══════════════════════════════════════════════════════ */
export const routes: Route[] = [
  {
    id: "r1", name: "FAR → BAD · via Évora",
    origin: "Faro — Plataforma Algarve",
    destination: "Badajoz · Polígono El Nevero (ES)",
    truckId: "t9", driverId: "d6",
    distanceKm: 382, progressPct: 31,
    status: "active", etaDestination: "21:30", delayMin: 0,
    polyline: [...lerp(T.faro, T.evora, 12), ...lerp(T.evora, T.badajoz, 10)],
    stops: [
      { id: "s13", name: "Faro — Plataforma", lat: T.faro[0], lng: T.faro[1], eta: "12:00", plannedEta: "12:00", delayMin: 0, type: "pickup" },
      { id: "s14", name: "Évora — Transferência", lat: T.evora[0], lng: T.evora[1], eta: "15:30", plannedEta: "15:30", delayMin: 0, type: "delivery", windowStart: "15:00", windowEnd: "17:00" },
      { id: "s15", name: "Badajoz · El Nevero", lat: T.badajoz[0], lng: T.badajoz[1], eta: "21:30", plannedEta: "21:30", delayMin: 0, type: "delivery" },
    ],
  },
  {
    id: "r2", name: "LIS → MAD · A6/E90",
    origin: "Lisboa — Bobadela",
    destination: "Madrid · Corredor Henares (ES)",
    truckId: "t10", driverId: "d7",
    distanceKm: 624, progressPct: 67,
    status: "delayed", etaDestination: "23:45", delayMin: 35,
    polyline: [...lerp(T.lisbon, T.badajoz, 14), ...lerp(T.badajoz, T.madrid, 16)],
    stops: [
      { id: "s16", name: "Bobadela — Armazém B", lat: T.lisbon[0], lng: T.lisbon[1], eta: "05:30", plannedEta: "05:30", delayMin: 0, type: "pickup" },
      { id: "s17", name: "Badajoz · Gasolinera Repsol", lat: T.badajoz[0], lng: T.badajoz[1], eta: "12:00", plannedEta: "11:25", delayMin: 35, type: "fuel" },
      { id: "s18", name: "Madrid · Corredor Henares", lat: T.madrid[0], lng: T.madrid[1], eta: "23:45", plannedEta: "23:10", delayMin: 35, type: "delivery", windowStart: "22:00", windowEnd: "01:00" },
    ],
  },
];

/* ══════════════════════════════════════════════════════
   JOBS — all dates shifted to feel like today
   ══════════════════════════════════════════════════════ */
export const jobs: Job[] = [
  /* ── BACKLOG ── */
  {
    id: "J-4201",
    reference: "SON-260417-4201",
    client: "Sonae MC — Continente",
    status: "backlog",
    priority: "urgent",
    cargoType: "dry",
    totalWeightKg: 24_800,
    totalPallets: 34,
    stops: [
      { id: "j1s1", sequence: 1, type: "pickup", clientName: "Sonae Distribuição", address: "Rua João Mendonça 529", city: "Matosinhos", lat: 41.187, lng: -8.694, scheduledTime: "07:00", windowEnd: "09:00", cargoDescription: "Mercearia seca — mix SKU", weightKg: 24_800, pallets: 34, completed: false },
      { id: "j1s2", sequence: 2, type: "delivery", clientName: "Continente Guimarães", address: "Av. General Humberto Delgado 100", city: "Guimarães", lat: 41.445, lng: -8.292, scheduledTime: "10:30", windowEnd: "13:00", cargoDescription: "Mercearia seca", weightKg: 24_800, pallets: 34, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-17T09:00:00"),
    deliveryDeadline: demoDate("2026-04-17T13:00:00"),
    slaStatus: "at_risk",
    rateEur: 680,
    createdAt: demoDate("2026-04-16T18:22:00"),
    notes: "Entrega com janela de receção apertada — confirmar horário com responsável de loja",
  },
  {
    id: "J-4199",
    reference: "ALD-260417-4199",
    client: "ALDI Portugal",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 19_200,
    totalPallets: 26,
    stops: [
      { id: "j2s1", sequence: 1, type: "pickup", clientName: "ALDI DC Azeitão", address: "Zona Industrial de Azeitão", city: "Setúbal", lat: 38.527, lng: -8.787, scheduledTime: "08:00", windowEnd: "10:00", cargoDescription: "Produtos alimentares secos", weightKg: 19_200, pallets: 26, completed: false },
      { id: "j2s2", sequence: 2, type: "delivery", clientName: "ALDI Faro Centro", address: "R. Tenente Vítor Hugo 2", city: "Faro", lat: 37.017, lng: -7.935, scheduledTime: "14:00", windowEnd: "17:00", cargoDescription: "Produtos alimentares secos", weightKg: 19_200, pallets: 26, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-17T10:00:00"),
    deliveryDeadline: demoDate("2026-04-17T17:00:00"),
    slaStatus: "on_track",
    rateEur: 520,
    createdAt: demoDate("2026-04-16T14:10:00"),
  },
  {
    id: "J-4198",
    reference: "LER-260418-4198",
    client: "Leroy Merlin Portugal",
    status: "backlog",
    priority: "normal",
    cargoType: "bulk",
    totalWeightKg: 31_000,
    totalPallets: 18,
    stops: [
      { id: "j3s1", sequence: 1, type: "pickup", clientName: "LM Alfragide DC", address: "EN249-3, Alfragide", city: "Amadora", lat: 38.733, lng: -9.228, scheduledTime: "06:00", windowEnd: "08:00", cargoDescription: "Material de construção — cimento, gres, ferragens", weightKg: 31_000, pallets: 18, completed: false },
      { id: "j3s2", sequence: 2, type: "delivery", clientName: "Leroy Merlin Porto Ocidental", address: "R. Dr. Ferreira de Macedo 1255", city: "Porto", lat: 41.163, lng: -8.662, scheduledTime: "11:00", windowEnd: "14:00", cargoDescription: "Material de construção", weightKg: 31_000, pallets: 18, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-18T08:00:00"),
    deliveryDeadline: demoDate("2026-04-18T14:00:00"),
    slaStatus: "on_track",
    rateEur: 760,
    createdAt: demoDate("2026-04-16T09:45:00"),
    notes: "Frota plana obrigatória — confirmar t7 disponível",
  },
  {
    id: "J-4203",
    reference: "RPS-260419-4203",
    client: "Repsol Portugal",
    status: "backlog",
    priority: "critical",
    cargoType: "hazmat",
    totalWeightKg: 22_000,
    totalPallets: 10,
    stops: [
      { id: "j20s1", sequence: 1, type: "pickup", clientName: "Repsol Depósito Sines", address: "Terminal Petroquímico, Sines", city: "Sines", lat: 37.957, lng: -8.861, scheduledTime: "06:00", windowEnd: "08:00", cargoDescription: "Combustível diesel — a granel (ADR Cl.3)", weightKg: 22_000, pallets: 10, completed: false },
      { id: "j20s2", sequence: 2, type: "delivery", clientName: "Galp Depósito Lisboa Sul", address: "Av. Marechal Gomes Costa, Almada", city: "Almada", lat: 38.676, lng: -9.155, scheduledTime: "10:30", windowEnd: "12:30", cargoDescription: "Combustível diesel", weightKg: 22_000, pallets: 10, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-19T08:00:00"),
    deliveryDeadline: demoDate("2026-04-19T12:30:00"),
    slaStatus: "on_track",
    rateEur: 1_850,
    createdAt: demoDate("2026-04-18T20:00:00"),
    notes: "ADR obrigatório — apenas motoristas com certificado válido. Documentação ETA obrigatória.",
    adrClass: "Classe 3 — Líquidos inflamáveis",
    adrUnNumber: "UN1202",
  },

  /* ── LOADING ── */
  {
    id: "J-4188",
    reference: "FRU-260417-4188",
    client: "Frulact — Ingredientes de Fruta",
    status: "loading",
    priority: "normal",
    cargoType: "refrigerated",
    totalWeightKg: 18_600,
    totalPallets: 24,
    assignedTruckId: "t7",
    assignedDriverId: "d5",
    stops: [
      { id: "j6s1", sequence: 1, type: "pickup", clientName: "Frulact — Maia Plant", address: "Zona Industrial da Maia", city: "Maia", lat: T.maia[0], lng: T.maia[1], scheduledTime: "14:00", windowEnd: "16:00", cargoDescription: "Polpa de fruta refrigerada — exportação ES", weightKg: 18_600, pallets: 24, completed: false },
      { id: "j6s2", sequence: 2, type: "delivery", clientName: "Grupo Dole España", address: "Polígono Ctra. Fuencarral, Madrid", city: "Madrid", lat: 40.496, lng: -3.675, scheduledTime: "08:00", windowEnd: "11:00", cargoDescription: "Polpa de fruta refrigerada", weightKg: 18_600, pallets: 24, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-17T16:00:00"),
    deliveryDeadline: demoDate("2026-04-18T11:00:00"),
    slaStatus: "on_track",
    rateEur: 1_180,
    createdAt: demoDate("2026-04-15T16:44:00"),
    isInternational: true,
    destinationCountryCode: "ES",
    tempTargetC: { min: 2, max: 6 },
  },

  /* ── IN TRANSIT ── */
  {
    id: "J-4174",
    reference: "FRU-260417-4174",
    client: "Frulact — Ingredientes de Fruta",
    status: "in_transit",
    priority: "normal",
    cargoType: "refrigerated",
    totalWeightKg: 24_800,
    totalPallets: 32,
    assignedTruckId: "t9",
    assignedDriverId: "d6",
    stops: [
      { id: "j10s1", sequence: 1, type: "pickup", clientName: "Frulact — Faro Plant", address: "Zona Industrial de Faro", city: "Faro", lat: T.faro[0], lng: T.faro[1], scheduledTime: "12:00", windowEnd: "13:30", cargoDescription: "Sumos NFC refrigerados — export ES", weightKg: 24_800, pallets: 32, completed: true, actualTime: "12:11" },
      { id: "j10s2", sequence: 2, type: "delivery", clientName: "Mercadona Badajoz CD", address: "Polígono El Nevero, Badajoz", city: "Badajoz", lat: T.badajoz[0], lng: T.badajoz[1], scheduledTime: "21:30", windowEnd: "23:00", cargoDescription: "Sumos NFC refrigerados", weightKg: 24_800, pallets: 32, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-17T13:30:00"),
    deliveryDeadline: demoDate("2026-04-17T23:00:00"),
    slaStatus: "on_track",
    rateEur: 1_020,
    createdAt: demoDate("2026-04-16T09:00:00"),
    isInternational: true,
    destinationCountryCode: "ES",
    tempTargetC: { min: 2, max: 6 },
  },
  {
    id: "J-4171",
    reference: "MAK-260417-4171",
    client: "Makro Portugal",
    status: "in_transit",
    priority: "urgent",
    cargoType: "dry",
    totalWeightKg: 19_200,
    totalPallets: 24,
    assignedTruckId: "t10",
    assignedDriverId: "d7",
    stops: [
      { id: "j11s1", sequence: 1, type: "pickup", clientName: "Makro DC Azambuja", address: "Zona Industrial de Azambuja", city: "Azambuja", lat: T.lisbon[0] + 0.12, lng: T.lisbon[1] + 0.08, scheduledTime: "05:30", windowEnd: "07:00", cargoDescription: "HoReCa — alimentares + não alimentares", weightKg: 19_200, pallets: 24, completed: true, actualTime: "05:48" },
      { id: "j11s2", sequence: 2, type: "delivery", clientName: "Makro Madrid Vallecas", address: "Av. de Vallecas 55, Madrid", city: "Madrid", lat: T.madrid[0], lng: T.madrid[1], scheduledTime: "23:10", windowEnd: "01:00", cargoDescription: "HoReCa alimentares", weightKg: 19_200, pallets: 24, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-17T07:00:00"),
    deliveryDeadline: demoDate("2026-04-17T23:59:00"),
    slaStatus: "breached",
    rateEur: 1_480,
    createdAt: demoDate("2026-04-16T08:30:00"),
    notes: "Atraso +35min — motorista com horas de condução limitadas. Rota Madrid em curso.",
    isInternational: true,
    destinationCountryCode: "ES",
  },

  /* ── DELIVERED ── */
  {
    id: "J-4162",
    reference: "JM-260417-4162",
    client: "Jerónimo Martins — Pingo Doce",
    status: "delivered",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 28_400,
    totalPallets: 38,
    assignedTruckId: "t1",
    assignedDriverId: "d1",
    stops: [
      { id: "j12s1", sequence: 1, type: "pickup", clientName: "JM DC Azambuja", address: "Parque Logístico Azambuja", city: "Azambuja", lat: T.lisbon[0] + 0.12, lng: T.lisbon[1] + 0.08, scheduledTime: "05:00", windowEnd: "06:30", cargoDescription: "Mercearia seca — reposição lojas", weightKg: 28_400, pallets: 38, completed: true, actualTime: "05:02" },
      { id: "j12s2", sequence: 2, type: "delivery", clientName: "Pingo Doce Aveiro Norte", address: "Av. Dr. Lourenço Peixinho 1", city: "Aveiro", lat: 40.641, lng: -8.654, scheduledTime: "09:00", windowEnd: "11:00", cargoDescription: "Mercearia seca", weightKg: 28_400, pallets: 38, completed: true, actualTime: "08:58" },
    ],
    pickupDeadline:   demoDate("2026-04-17T06:30:00"),
    deliveryDeadline: demoDate("2026-04-17T11:00:00"),
    slaStatus: "on_track",
    rateEur: 820,
    createdAt: demoDate("2026-04-15T14:00:00"),
  },

  /* ── INVOICED ── */
  {
    id: "J-4140",
    reference: "SON-260416-4140",
    client: "Sonae MC — Continente",
    status: "invoiced",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 26_000,
    totalPallets: 36,
    assignedTruckId: "t8",
    assignedDriverId: "d10",
    stops: [
      { id: "j15s1", sequence: 1, type: "pickup", clientName: "Sonae DC Maia", address: "Lugar do Espido, Via Norte", city: "Maia", lat: T.maia[0], lng: T.maia[1], scheduledTime: "06:00", windowEnd: "07:30", cargoDescription: "Têxtil + bazar — reposição lojas", weightKg: 26_000, pallets: 36, completed: true, actualTime: "05:55" },
      { id: "j15s2", sequence: 2, type: "delivery", clientName: "Continente Coimbra Retail", address: "EN3, Taveiro", city: "Coimbra", lat: T.coimbra[0], lng: T.coimbra[1], scheduledTime: "09:30", windowEnd: "11:30", cargoDescription: "Têxtil + bazar", weightKg: 26_000, pallets: 36, completed: true, actualTime: "09:28" },
    ],
    pickupDeadline:   demoDate("2026-04-16T07:30:00"),
    deliveryDeadline: demoDate("2026-04-16T11:30:00"),
    slaStatus: "on_track",
    rateEur: 720,
    createdAt: demoDate("2026-04-14T15:00:00"),
  },
];

/* ══════════════════════════════════════════════════════
   MAINTENANCE RECORDS
   ══════════════════════════════════════════════════════ */
export const maintenanceItems: MaintenanceItem[] = [
  { id: "m1",  truckId: "t1",  type: "service_oil", label: "Revisão óleo + filtros",              dueDate: demoDateOnly("2026-05-20"), lastDoneDate: demoDateOnly("2025-11-18"), status: "ok",       estimatedCostEur: 380 },
  { id: "m2",  truckId: "t1",  type: "tacho_cal",   label: "Calibração tacógrafo",                dueDate: demoDateOnly("2026-08-14"), lastDoneDate: demoDateOnly("2024-08-14"), status: "ok",       estimatedCostEur: 220 },
  { id: "m3",  truckId: "t2",  type: "itp",         label: "ITP — Inspeção Técnica Periódica",    dueDate: demoDateOnly("2026-04-28"), status: "due_soon", estimatedCostEur: 180, notes: "Agendar oficina Braga com urgência" },
  { id: "m4",  truckId: "t2",  type: "tires",       label: "Pneus traseiros",                     dueDate: demoDateOnly("2026-06-01"), lastDoneDate: demoDateOnly("2024-12-10"), status: "ok",       estimatedCostEur: 1_200 },
  { id: "m5",  truckId: "t3",  type: "service_oil", label: "Revisão óleo + filtros",              dueDate: demoDateOnly("2026-04-25"), lastDoneDate: demoDateOnly("2025-10-22"), status: "due_soon", estimatedCostEur: 420, notes: "Acima dos 300k km — prioritário" },
  { id: "m6",  truckId: "t3",  type: "itp",         label: "ITP — Inspeção Técnica Periódica",    dueDate: demoDateOnly("2026-07-12"), status: "ok",       estimatedCostEur: 180 },
  { id: "m7",  truckId: "t4",  type: "service_oil", label: "Revisão 10.000 km",                   dueDate: demoDateOnly("2026-09-14"), lastDoneDate: demoDateOnly("2026-03-14"), status: "ok",       estimatedCostEur: 350 },
  { id: "m8",  truckId: "t5",  type: "itp",         label: "ITP — Inspeção Técnica Periódica",    dueDate: demoDateOnly("2026-10-08"), lastDoneDate: demoDateOnly("2024-10-08"), status: "ok",       estimatedCostEur: 180 },
  { id: "m9",  truckId: "t6",  type: "service_oil", label: "Revisão avançada (manutenção ativa)", dueDate: demoDateOnly("2026-04-17"), lastDoneDate: demoDateOnly("2025-04-12"), status: "overdue",  estimatedCostEur: 850, notes: "Veículo em manutenção — substituição bomba combustível" },
  { id: "m10", truckId: "t6",  type: "tires",       label: "Pneus completos — desgaste irregular",dueDate: demoDateOnly("2026-04-22"), lastDoneDate: demoDateOnly("2023-09-01"), status: "due_soon", estimatedCostEur: 2_400 },
  { id: "m11", truckId: "t7",  type: "tacho_cal",   label: "Calibração tacógrafo",                dueDate: demoDateOnly("2026-05-02"), lastDoneDate: demoDateOnly("2024-05-02"), status: "due_soon", estimatedCostEur: 220, notes: "Prazo legal — agendar antes de fim do mês" },
  { id: "m12", truckId: "t8",  type: "itp",         label: "ITP — Inspeção Técnica Periódica",    dueDate: demoDateOnly("2026-11-20"), lastDoneDate: demoDateOnly("2024-11-20"), status: "ok",       estimatedCostEur: 180 },
  { id: "m13", truckId: "t9",  type: "service_oil", label: "Revisão 30.000 km",                   dueDate: demoDateOnly("2026-06-18"), lastDoneDate: demoDateOnly("2025-12-18"), status: "ok",       estimatedCostEur: 360 },
  { id: "m14", truckId: "t10", type: "itp",         label: "ITP — Inspeção Técnica Periódica",    dueDate: demoDateOnly("2026-04-10"), lastDoneDate: demoDateOnly("2024-04-10"), status: "overdue",  estimatedCostEur: 180, notes: "VENCIDA — veículo não pode circular — AGENDAR URGENTE" },
  { id: "m15", truckId: "t10", type: "tires",       label: "Pneus dianteiros",                    dueDate: demoDateOnly("2026-05-15"), status: "due_soon", estimatedCostEur: 900 },
];

/* ══════════════════════════════════════════════════════
   CARGO (Load Planning)
   ══════════════════════════════════════════════════════ */
export const initialCargoByTruck: Record<string, CargoItem[]> = {
  t1: [], t2: [], t3: [], t4: [], t5: [],
  t6: [],
  t7: [
    { id: "c13", sku: "FRU-2201", label: "Polpa de fruta — exportação ES", weightKg: 18_600, type: "refrigerated", destination: "Madrid Dole", loadStatus: "pending" },
  ],
  t8: [],
  t9: [
    { id: "c14", sku: "FRU-2188", label: "Sumos NFC — Frulact Faro", weightKg: 24_800, type: "refrigerated", destination: "Badajoz Mercadona", loadStatus: "secured" },
  ],
  t10: [
    { id: "c15", sku: "MAK-7710", label: "HoReCa mix — alimentares", weightKg: 12_000, type: "dry", destination: "Madrid Makro", loadStatus: "secured" },
    { id: "c16", sku: "MAK-7711", label: "HoReCa — não alimentares", weightKg: 7_200, type: "dry", destination: "Madrid Makro", loadStatus: "secured" },
  ],
};

export const warehouseStock: CargoItem[] = [
  { id: "w1", sku: "WH-10001", label: "Equipamento informático — Sonae", weightKg: 1_800, type: "automotive", destination: "Matosinhos CD", loadStatus: "pending" },
  { id: "w2", sku: "WH-10002", label: "Paletes de fruta — citrinos", weightKg: 9_200, type: "dry", destination: "Vigo ES", loadStatus: "pending" },
  { id: "w3", sku: "WH-10003", label: "Material de construção — ADR classe 8", weightKg: 2_400, type: "hazmat", destination: "Coimbra CD", loadStatus: "secured" },
];

/* ══════════════════════════════════════════════════════
   FUEL
   ══════════════════════════════════════════════════════ */
export const fuelReadings: FuelReading[] = [
  { id: "f1",  truckId: "t1",  date: demoDateOnly("2026-04-15"), liters: 380, costEur: 558, odometerKm: 412_200, lPer100km: 33.2 },
  { id: "f2",  truckId: "t1",  date: demoDateOnly("2026-04-12"), liters: 410, costEur: 602, odometerKm: 411_780, lPer100km: 34.1 },
  { id: "f3",  truckId: "t2",  date: demoDateOnly("2026-04-14"), liters: 220, costEur: 323, odometerKm: 198_200, lPer100km: 30.8 },
  { id: "f4",  truckId: "t3",  date: demoDateOnly("2026-04-15"), liters: 520, costEur: 764, odometerKm: 305_900, lPer100km: 35.4 },
  { id: "f5",  truckId: "t3",  date: demoDateOnly("2026-04-11"), liters: 480, costEur: 705, odometerKm: 305_420, lPer100km: 34.8 },
  { id: "f6",  truckId: "t4",  date: demoDateOnly("2026-04-13"), liters: 290, costEur: 426, odometerKm: 120_800, lPer100km: 28.4 },
  { id: "f7",  truckId: "t5",  date: demoDateOnly("2026-04-15"), liters: 450, costEur: 662, odometerKm: 256_700, lPer100km: 33.1 },
  { id: "f8",  truckId: "t9",  date: demoDateOnly("2026-04-14"), liters: 410, costEur: 602, odometerKm: 167_200, lPer100km: 32.8 },
  { id: "f9",  truckId: "t10", date: demoDateOnly("2026-04-15"), liters: 540, costEur: 793, odometerKm: 355_100, lPer100km: 36.1 },
  { id: "f10", truckId: "t7",  date: demoDateOnly("2026-04-10"), liters: 310, costEur: 455, odometerKm: 203_100, lPer100km: 30.2 },
];

export const fuelMetricsByTruck: FuelMetrics[] = [
  { truckId: "t1",  avgLPer100km30d: 33.6, cost30dEur: 3_520, inefficiencyFlags: ["Tempo inativo 12% acima da média"] },
  { truckId: "t2",  avgLPer100km30d: 30.8, cost30dEur: 1_980, inefficiencyFlags: [] },
  { truckId: "t3",  avgLPer100km30d: 35.1, cost30dEur: 4_580, inefficiencyFlags: ["Travagem brusca +18% WoW", "Desnível na AP-6 (ES)"] },
  { truckId: "t4",  avgLPer100km30d: 28.6, cost30dEur: 1_540, inefficiencyFlags: [] },
  { truckId: "t5",  avgLPer100km30d: 33.1, cost30dEur: 2_960, inefficiencyFlags: ["Auxiliar reefer 35% do tempo"] },
  { truckId: "t6",  avgLPer100km30d: 32.0, cost30dEur: 820,   inefficiencyFlags: ["Em manutenção — amostra limitada"] },
  { truckId: "t7",  avgLPer100km30d: 30.2, cost30dEur: 1_820, inefficiencyFlags: [] },
  { truckId: "t8",  avgLPer100km30d: 27.4, cost30dEur: 1_240, inefficiencyFlags: [] },
  { truckId: "t9",  avgLPer100km30d: 32.8, cost30dEur: 3_110, inefficiencyFlags: ["Excesso velocidade A2 · 3 eventos"] },
  { truckId: "t10", avgLPer100km30d: 36.1, cost30dEur: 4_820, inefficiencyFlags: ["Consumo 21% acima da frota", "Pneus desgastados — atrito elevado"] },
];

/* ══════════════════════════════════════════════════════
   OPS ALERTS
   ══════════════════════════════════════════════════════ */
export const opsAlerts: OpsAlert[] = [
  { id: "a1", severity: "critical", title: "Prazo em risco — Makro Madrid (J-4171)",      detail: "Atraso de +35min · entrega até 23:59 · motorista Carlos Mendes com apenas 2.5h disponíveis", entityType: "job",         entityId: "J-4171", ts: demoDate("2026-04-17T14:22:00") },
  { id: "a2", severity: "critical", title: "ITP vencida — MAN TGS 26.400 (11-ST-78)",     detail: "Inspeção periódica vencida · veículo não pode circular legalmente · agendar urgente",          entityType: "maintenance", entityId: "m14",    ts: demoDate("2026-04-17T08:00:00") },
  { id: "a3", severity: "warning",  title: "Limite HOS — Carlos Mendes (d7)",              detail: "53.5h conduzidas esta semana · apenas 2.5h restantes · em rota Madrid (8h estimadas)",        entityType: "driver",      entityId: "d7",     ts: demoDate("2026-04-17T14:10:00") },
  { id: "a4", severity: "warning",  title: "Combustível baixo — MAN TGS 26.400 (t10)",    detail: "29% restante · rota Madrid · próxima paragem recomendada antes de Toledo",                     entityType: "truck",       entityId: "t10",    ts: demoDate("2026-04-17T13:30:00") },
  { id: "a5", severity: "warning",  title: "ITP próxima — Scania R 450 (67-CD-89)",        detail: "ITP vence em breve · agendar oficina Braga",                                                   entityType: "maintenance", entityId: "m3",     ts: demoDate("2026-04-17T09:00:00") },
  { id: "a6", severity: "info",     title: "Lacuna tacógrafo — Sofia Costa (d8)",          detail: "Gap no registo · inserção manual obrigatória antes de retomar serviço",                        entityType: "driver",      entityId: "d8",     ts: demoDate("2026-04-17T11:00:00") },
];

/* ══════════════════════════════════════════════════════
   VEHICLE TRAIL EVENTS
   ══════════════════════════════════════════════════════ */
export const vehicleTrailEvents: VehicleTrailEvent[] = [
  { id: "ve6", truckId: "t10", kind: "driving", timeLabel: demoTimeLabel("2026-04-17T14:30:00"), address: "A-5 · km 312 · Comunidade de Madrid (ES)", speedKmh: 91 },
  { id: "ve7", truckId: "t10", kind: "stop",    timeLabel: demoTimeLabel("2026-04-17T11:25:00"), address: "Badajoz · Gasolinera Repsol · Polígono El Nevero", speedKmh: 0 },
  { id: "ve8", truckId: "t9",  kind: "driving", timeLabel: demoTimeLabel("2026-04-17T14:05:00"), address: "A2 · km 192 · Beja Norte", speedKmh: 79 },
];

/* ══════════════════════════════════════════════════════
   LEGACY / COMPAT
   ══════════════════════════════════════════════════════ */
export const truckingJobs: TruckingJobRow[] = jobs.slice(0, 8).map((j) => ({
  id: j.id,
  shipmentId: j.reference,
  carrier: j.client,
  jobType: j.totalPallets > 28 ? "FTL" : "LTL",
  status: j.status === "in_transit" ? "In Transit" : j.status === "delivered" || j.status === "invoiced" ? "Delivered" : "Pending",
  estPickup: new Date(j.pickupDeadline).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  actualPickup: j.stops[0]?.actualTime ?? "—",
  routeId: j.assignedTruckId ? routes.find((r) => r.truckId === j.assignedTruckId)?.id : undefined,
}));

export function getTrailEventsForTruck(truckId: string) { return vehicleTrailEvents.filter((e) => e.truckId === truckId); }
export function getRouteById(id: string)  { return routes.find((r) => r.id === id); }
export function getTruckById(id: string)  { return trucks.find((t) => t.id === id); }
export function getDriverById(id: string) { return drivers.find((d) => d.id === id); }
export function getJobsByStatus(status: Job["status"]) { return jobs.filter((j) => j.status === status); }
export function getMaintenanceByTruck(truckId: string) { return maintenanceItems.filter((m) => m.truckId === truckId); }
