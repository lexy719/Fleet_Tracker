import type { Customer, Driver, Job, LegacyDriver, LegacyJob, LegacyTruck, Site, Trailer, Truck } from "./types";
import { DEMO_NOW, demoDate, demoDateOnly } from "../lib/demoTime";
import { demoTrailers as buildDemoTrailers, legacyDriverToDriver, legacyJobToJob, legacyTruckToTruck } from "../domain/demo/legacy";

/*
 * DEMO SEED SOURCE ONLY (Phase 5). FleetOS reads jobs, trucks, trailers and drivers from the
 * operational store (IndexedDB "fleetos-operations"). These records are written there ONCE
 * by the deliberate demo seed (and again only on an explicit "repor dados demo"). No UI
 * component imports operational records from this file.
 */

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

/* ══════════════════════════════════════════════════════
   TRUCKS
   ══════════════════════════════════════════════════════ */
const legacyTrucks: LegacyTruck[] = [
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
  /*
   * DEMO VEHICLE — explicit test values for the VCI compliance slice (not a real vehicle).
   * Regulatory attributes are set by hand so the rule can be evaluated deterministically.
   */
  {
    id: "t-demo-vci", name: "DEMO · Trator VCI",     plate: "DEMO-VCI",
    model: "Viatura de demonstração (dados de teste)", yearManuf: 2024, odometerKm: 0,
    bodyType: "curtainsider",
    status: "idle", lat: 41.1850, lng: -8.6960, headingDeg: 0,
    routeId: null, driverId: null,
    fuelPct: 90, maxWeightKg: 26_000, currentWeightKg: 0, cargoSlots: 0, maxSlots: 6,
    isDemo: true,
    grossVehicleWeightKg: 40_000,
    axleCount: 5,
    firstAxleHeightM: 1.35,
    ownerCategory: "private",
  },
];

/* ══════════════════════════════════════════════════════
   DRIVERS
   ══════════════════════════════════════════════════════ */
const legacyDrivers: LegacyDriver[] = [
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
   JOBS — all dates shifted to feel like today
   ══════════════════════════════════════════════════════ */
const legacyJobs: LegacyJob[] = [
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
  /*
   * DEMO JOB — through-trip Matosinhos → Espinho for the VCI compliance slice.
   * Municipalities and authorization state are EXPLICIT demo values (not inferred).
   */
  {
    id: "J-DEMO-VCI",
    reference: "DEMO-VCI-0001",
    client: "DEMO — teste VCI (dados fictícios)",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 18_000,
    totalPallets: 24,
    stops: [
      { id: "jdemo-s1", sequence: 1, type: "pickup", clientName: "DEMO — Porto de Leixões", address: "Porto de Leixões (demo)", city: "Matosinhos", municipality: "Matosinhos", lat: 41.1850, lng: -8.6960, scheduledTime: "08:00", windowEnd: "18:00", cargoDescription: "Carga geral (demo)", weightKg: 18_000, pallets: 24, completed: false },
      { id: "jdemo-s2", sequence: 2, type: "delivery", clientName: "DEMO — Espinho", address: "Espinho (demo)", city: "Espinho", municipality: "Espinho", lat: 41.0070, lng: -8.6410, scheduledTime: "09:00", windowEnd: "20:00", cargoDescription: "Carga geral (demo)", weightKg: 18_000, pallets: 24, completed: false },
    ],
    pickupDeadline:   demoDate("2026-04-17T18:00:00"),
    deliveryDeadline: demoDate("2026-04-17T20:00:00"),
    slaStatus: "on_track",
    rateEur: 0,
    createdAt: demoDate("2026-04-16T12:00:00"),
    notes: "Trabalho de demonstração para o teste de conformidade VCI — não é um transporte real.",
    isDemo: true,
    recordedFacts: {
      "authorization.pt-vci-habilitacao": { value: false, source: "registo do trabalho: sem habilitação VCI" },
      "authorization.pt-imt-aet": { value: false, source: "registo do trabalho: sem autorização especial IMT" },
    },
  },
  /*
   * DEMO JOB — planned night run Coimbra → Viseu for the road-event slice (IP3 night closures).
   * The planned departure is a REAL date (not demo-shifted) so it can meet the real event.
   */
  {
    id: "J-DEMO-IP3",
    reference: "DEMO-IP3-0001",
    client: "DEMO — teste corte IP3 (dados fictícios)",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 14_000,
    totalPallets: 20,
    stops: [
      { id: "jip3-s1", sequence: 1, type: "pickup", clientName: "DEMO — Coimbra", address: "Coimbra (demo)", city: "Coimbra", municipality: "Coimbra", lat: 40.2115, lng: -8.4292, scheduledTime: "21:00", windowEnd: "21:30", windowStartAt: "2026-10-01T21:00:00+01:00", windowEndAt: "2026-10-01T21:30:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 14_000, pallets: 20, completed: false },
      { id: "jip3-s2", sequence: 2, type: "delivery", clientName: "DEMO — Viseu", address: "Viseu (demo)", city: "Viseu", municipality: "Viseu", lat: 40.6566, lng: -7.9125, scheduledTime: "21:30", windowEnd: "23:30", windowStartAt: "2026-10-01T21:30:00+01:00", windowEndAt: "2026-10-01T23:30:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 14_000, pallets: 20, completed: false },
    ],
    pickupDeadline:   "2026-10-01T20:30:00",
    deliveryDeadline: "2026-10-01T22:30:00",
    slaStatus: "on_track",
    rateEur: 0,
    createdAt: demoDate("2026-04-16T12:00:00"),
    notes: "Trabalho de demonstração para o teste de eventos rodoviários (IP3) — não é um transporte real.",
    isDemo: true,
    plannedDepartureAt: "2026-10-01T20:15:00.000Z",
  },
  {
    id: "J-DEMO-3C",
    reference: "DEMO-3C-0001",
    client: "DEMO — rota limpa Road Intelligence (dados fictícios)",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 24_000,
    totalPallets: 33,
    stops: [
      { id: "j3c-s1", sequence: 1, type: "pickup", clientName: "DEMO — Vieira do Minho", address: "Vieira do Minho (demo)", city: "Vieira do Minho", municipality: "Vieira do Minho", lat: 41.6352, lng: -8.1431, scheduledTime: "06:00", windowEnd: "06:30", windowStartAt: "2026-10-06T06:00:00+01:00", windowEndAt: "2026-10-06T06:30:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
      { id: "j3c-s2", sequence: 2, type: "delivery", clientName: "DEMO — Faro", address: "Faro (demo)", city: "Faro", municipality: "Faro", lat: 37.0355, lng: -7.918, scheduledTime: "14:00", windowEnd: "18:00", windowStartAt: "2026-10-06T14:00:00+01:00", windowEndAt: "2026-10-06T18:00:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
    ],
    pickupDeadline:   "2026-10-06T06:30:00",
    deliveryDeadline: "2026-10-06T18:00:00",
    slaStatus: "on_track",
    rateEur: 0,
    createdAt: demoDate("2026-04-16T12:00:00"),
    notes: "Trabalho de demonstração da Fase 3C (descoberta + rota limpa) — não é um transporte real.",
    isDemo: true,
    plannedDepartureAt: "2026-10-06T05:00:00.000Z",
  },
  {
    id: "J-DEMO-PL",
    reference: "DEMO-PL-0001",
    client: "DEMO — aceitação Road Intelligence 3C.5 (dados fictícios)",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 24_000,
    totalPallets: 33,
    stops: [
      { id: "jpl-s1", sequence: 1, type: "pickup", clientName: "DEMO — Porto", address: "Porto (demo)", city: "Porto", municipality: "Porto", lat: 41.1496, lng: -8.6109, scheduledTime: "06:00", windowEnd: "06:30", windowStartAt: "2026-10-06T06:00:00+01:00", windowEndAt: "2026-10-06T06:30:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
      { id: "jpl-s2", sequence: 2, type: "delivery", clientName: "DEMO — Lisboa", address: "Lisboa (demo)", city: "Lisboa", municipality: "Lisboa", lat: 38.7223, lng: -9.1393, scheduledTime: "10:00", windowEnd: "14:00", windowStartAt: "2026-10-06T10:00:00+01:00", windowEndAt: "2026-10-06T14:00:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
    ],
    pickupDeadline:   "2026-10-06T06:30:00",
    deliveryDeadline: "2026-10-06T14:00:00",
    slaStatus: "on_track",
    rateEur: 0,
    createdAt: demoDate("2026-04-16T12:00:00"),
    notes: "Trabalho de demonstração da Fase 3C.5 (tortura com rotas reais) — não é um transporte real.",
    isDemo: true,
    plannedDepartureAt: "2026-10-06T05:00:00.000Z",
  },
  {
    id: "J-DEMO-BF",
    reference: "DEMO-BF-0001",
    client: "DEMO — aceitação Road Intelligence 3C.5 (dados fictícios)",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 24_000,
    totalPallets: 33,
    stops: [
      { id: "jbf-s1", sequence: 1, type: "pickup", clientName: "DEMO — Bragança", address: "Bragança (demo)", city: "Bragança", municipality: "Bragança", lat: 41.8061, lng: -6.7567, scheduledTime: "06:00", windowEnd: "06:30", windowStartAt: "2026-10-06T06:00:00+01:00", windowEndAt: "2026-10-06T06:30:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
      { id: "jbf-s2", sequence: 2, type: "delivery", clientName: "DEMO — Faro", address: "Faro (demo)", city: "Faro", municipality: "Faro", lat: 37.0355, lng: -7.918, scheduledTime: "14:00", windowEnd: "20:00", windowStartAt: "2026-10-06T14:00:00+01:00", windowEndAt: "2026-10-06T20:00:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
    ],
    pickupDeadline:   "2026-10-06T06:30:00",
    deliveryDeadline: "2026-10-06T20:00:00",
    slaStatus: "on_track",
    rateEur: 0,
    createdAt: demoDate("2026-04-16T12:00:00"),
    notes: "Trabalho de demonstração da Fase 3C.5 (tortura com rotas reais) — não é um transporte real.",
    isDemo: true,
    plannedDepartureAt: "2026-10-06T05:00:00.000Z",
  },
  {
    id: "J-DEMO-SB",
    reference: "DEMO-SB-0001",
    client: "DEMO — aceitação Road Intelligence 3C.5 (dados fictícios)",
    status: "backlog",
    priority: "normal",
    cargoType: "dry",
    totalWeightKg: 24_000,
    totalPallets: 33,
    stops: [
      { id: "jsb-s1", sequence: 1, type: "pickup", clientName: "DEMO — Sines", address: "Sines (demo)", city: "Sines", municipality: "Sines", lat: 37.9561, lng: -8.8698, scheduledTime: "06:00", windowEnd: "06:30", windowStartAt: "2026-10-06T06:00:00+01:00", windowEndAt: "2026-10-06T06:30:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
      { id: "jsb-s2", sequence: 2, type: "delivery", clientName: "DEMO — Braga", address: "Braga (demo)", city: "Braga", municipality: "Braga", lat: 41.5454, lng: -8.4265, scheduledTime: "12:00", windowEnd: "18:00", windowStartAt: "2026-10-06T12:00:00+01:00", windowEndAt: "2026-10-06T18:00:00+01:00", cargoDescription: "Carga geral (demo)", weightKg: 24_000, pallets: 33, completed: false },
    ],
    pickupDeadline:   "2026-10-06T06:30:00",
    deliveryDeadline: "2026-10-06T18:00:00",
    slaStatus: "on_track",
    rateEur: 0,
    createdAt: demoDate("2026-04-16T12:00:00"),
    notes: "Trabalho de demonstração da Fase 3C.5 (tortura com rotas reais) — não é um transporte real.",
    isDemo: true,
    plannedDepartureAt: "2026-10-06T05:00:00.000Z",
  },
];

/* ══════════════════════════════════════════════════════
   DEMO SEED — converted to the persistent record shapes
   ══════════════════════════════════════════════════════ */

/** Seed timestamp: demo manual measurements (fuel, odometer, driver hours) are "recorded" at seed time. */
export const DEMO_SEED_AT = DEMO_NOW.toISOString();

const slug = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

/** Demo customers and sites derived deterministically from the demo jobs (stable ids). */
function demoRecords(jobs: Job[], at: string): { customers: Customer[]; sites: Site[]; jobs: Job[] } {
  const customers = new Map<string, Customer>();
  const sites = new Map<string, Site>();
  const linked = jobs.map((j) => {
    const cid = `cust-demo-${slug(j.client)}`;
    if (!customers.has(cid)) customers.set(cid, { id: cid, name: j.client, ...(j.buyerNif ? { nif: j.buyerNif } : {}), isDemo: true, createdAt: at, updatedAt: at });
    const stops = j.stops.map((st) => {
      const sid = `site-demo-${slug(`${st.clientName}-${st.city}`)}`;
      if (!sites.has(sid)) {
        sites.set(sid, { id: sid, customerId: cid, name: st.clientName, address: st.address, locality: st.city, country: "PT", lat: st.lat, lng: st.lng, geocodedAddress: st.address, isDemo: true, createdAt: at, updatedAt: at });
      }
      return { ...st, siteId: sid };
    });
    return { ...j, customerId: cid, stops };
  });
  return { customers: [...customers.values()], sites: [...sites.values()], jobs: linked };
}

export function buildDemoSeed(at = DEMO_SEED_AT): { trucks: Truck[]; drivers: Driver[]; trailers: Trailer[]; jobs: Job[]; customers: Customer[]; sites: Site[] } {
  const rec = demoRecords(legacyJobs.map((j) => ({ ...legacyJobToJob(j, at), isDemo: true })), at);
  return {
    trucks: legacyTrucks.map((t) => legacyTruckToTruck(t, at)),
    drivers: legacyDrivers.map((d) => legacyDriverToDriver(d, at)),
    trailers: buildDemoTrailers(at),
    jobs: rec.jobs,
    customers: rec.customers,
    sites: rec.sites,
  };
}

/** Converted demo records (seed + test fixtures). Not an operational source for the UI. */
const SEED = buildDemoSeed();
export const demoTrucks: Truck[] = SEED.trucks;
export const demoDrivers: Driver[] = SEED.drivers;
export const demoTrailers: Trailer[] = SEED.trailers;
export const demoJobs: Job[] = SEED.jobs;
/** Pre-Phase-5 demo jobs (legacy shape) — migration fixtures. */
export const legacyDemoJobs: readonly LegacyJob[] = legacyJobs;
