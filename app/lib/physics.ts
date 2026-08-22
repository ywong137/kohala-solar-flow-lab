export const ROW_COUNT = 7;
export const MODULES_PER_ROW = 20;
export const PANELS_DEEP_PER_ROW = 2;
export const PANEL_WIDTH_M = 0.992;
export const PANEL_LENGTH_M = 1.956;
export const PANEL_THICKNESS_M = 0.04;
export const TABLE_CHORD_M = PANEL_LENGTH_M * PANELS_DEEP_PER_ROW + 0.055;
export const ROW_SPACING_M = 5.05;
export const ARRAY_AXIS_BEARING = 135;
export const MAUKA_BEARING = 45;

export type ViewMode = "flow" | "pressure" | "vibration";
export type MitigationId = "none" | "screen" | "vanes" | "spoilers" | "dampers";

export type SimulationConfig = {
  windSpeedMph: number;
  windBearing: number;
  ambientTurbulence: number;
  panelFrequencyHz: number;
  dampingPercent: number;
  mitigation: MitigationId;
};

export type RowResult = {
  row: number;
  position: "REAR" | "MID" | "FRONT";
  wakeRows: number;
  turbulencePercent: number;
  meanUpliftKpa: number;
  peakUpliftKpa: number;
  vibrationIndex: number;
  dynamicFactor: number;
};

export type SimulationResult = {
  dynamicPressureKpa: number;
  sheddingFrequencyHz: number;
  peakUpliftKpa: number;
  peakRow: number;
  vibrationIndex: number;
  frontRearRatio: number;
  alignmentPercent: number;
  rows: RowResult[];
};

export const MITIGATIONS: Record<
  MitigationId,
  { label: string; short: string; detail: string; turbulenceFactor: number; pressureFactor: number; dampingBoost: number }
> = {
  none: {
    label: "Baseline array",
    short: "No intervention",
    detail: "Current open-rack geometry with no added flow control.",
    turbulenceFactor: 1,
    pressureFactor: 1,
    dampingBoost: 0,
  },
  screen: {
    label: "40% porous screen",
    short: "Mauka perimeter",
    detail: "A porous screen reduces the incoming gust without creating a solid-wall wake.",
    turbulenceFactor: 0.86,
    pressureFactor: 0.9,
    dampingBoost: 0,
  },
  vanes: {
    label: "Under-panel vanes",
    short: "Rows 1–3",
    detail: "Short splitter vanes limit underside crossflow and wake interaction near the front rows.",
    turbulenceFactor: 0.72,
    pressureFactor: 0.91,
    dampingBoost: 0,
  },
  spoilers: {
    label: "Front-edge spoilers",
    short: "Rows 1–2",
    detail: "Small perforated deflectors change separation at the downstream front edge.",
    turbulenceFactor: 0.82,
    pressureFactor: 0.78,
    dampingBoost: 0,
  },
  dampers: {
    label: "Rail dampers",
    short: "Rows 1–2",
    detail: "Elastomer rail dampers add system damping without changing the airflow field.",
    turbulenceFactor: 1,
    pressureFactor: 1,
    dampingBoost: 5.5,
  },
};

export const SCENARIOS = {
  storm: {
    label: "Mauka storm gust",
    note: "Rear → front",
    windSpeedMph: 90,
    windBearing: 45,
    ambientTurbulence: 16,
  },
  trade: {
    label: "ENE trade wind",
    note: "Typical strong day",
    windSpeedMph: 32,
    windBearing: 60,
    ambientTurbulence: 10,
  },
  cross: {
    label: "Southeast crosswind",
    note: "Along the rows",
    windSpeedMph: 55,
    windBearing: 135,
    ambientTurbulence: 14,
  },
  makai: {
    label: "Makai sea breeze",
    note: "Front → rear",
    windSpeedMph: 24,
    windBearing: 225,
    ambientTurbulence: 11,
  },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function circularDifference(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

export function cardinalDirection(bearing: number) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

export function simulate(config: SimulationConfig): SimulationResult {
  const speedMs = config.windSpeedMph * 0.44704;
  const airDensity = 1.17;
  const dynamicPressureKpa = (0.5 * airDensity * speedMs * speedMs) / 1000;
  const maukaAlignment = Math.cos((circularDifference(config.windBearing, MAUKA_BEARING) * Math.PI) / 180);
  const crossRowAlignment = Math.abs(maukaAlignment);
  const alignmentPercent = crossRowAlignment * 100;
  const flowFromMauka = maukaAlignment >= 0;
  const mitigation = MITIGATIONS[config.mitigation];

  // This Strouhal estimate uses one panel chord as the panel-scale wake length.
  const sheddingFrequencyHz = (0.13 * speedMs) / PANEL_LENGTH_M;
  const frequencyRatio = sheddingFrequencyHz / Math.max(0.3, config.panelFrequencyHz);
  const dampingRatio = (config.dampingPercent + mitigation.dampingBoost) / 100;
  const rawDynamicFactor = 1 / Math.sqrt(
    Math.pow(1 - frequencyRatio * frequencyRatio, 2) +
      Math.pow(2 * dampingRatio * frequencyRatio, 2),
  );
  const dynamicFactor = clamp(rawDynamicFactor, 0.45, 8);

  const rows = Array.from({ length: ROW_COUNT }, (_, index): RowResult => {
    // Site convention: Row 1 is the front/makai row. Row 7 is the rear/mauka row.
    const downstreamIndex = flowFromMauka ? ROW_COUNT - 1 - index : index;
    const wakeRows = Math.round(downstreamIndex * crossRowAlignment);
    const wakeBuild = crossRowAlignment * (1 - Math.exp(-wakeRows / 1.8));
    const downstreamFraction = downstreamIndex / (ROW_COUNT - 1);
    const ambientTi = config.ambientTurbulence / 100;
    const localTi = clamp(
      (ambientTi + wakeBuild * 0.205 + Math.pow(downstreamFraction, 2) * crossRowAlignment * 0.035) *
        mitigation.turbulenceFactor,
      0.035,
      0.42,
    );

    // The mean field receives mild shelter. The peak field includes wake fluctuations.
    const shelter = 1 - 0.11 * wakeBuild;
    const undersideCoefficient = 0.49 + 0.38 * Math.max(0, maukaAlignment);
    const exposedEdge = crossRowAlignment * Math.pow(downstreamFraction, 2) * 0.21;
    const meanUpliftKpa = dynamicPressureKpa * undersideCoefficient * shelter * mitigation.pressureFactor;
    const peakUpliftKpa =
      dynamicPressureKpa *
      (undersideCoefficient * shelter + exposedEdge + 2.45 * localTi) *
      mitigation.pressureFactor;
    const resonanceWeight = clamp((dynamicFactor - 0.45) / 4.6, 0.12, 1.45);
    const vibrationIndex = clamp(
      100 *
        (dynamicPressureKpa / 0.95) *
        (localTi / 0.3) *
        resonanceWeight *
        (0.72 + 0.28 * downstreamFraction),
      0,
      100,
    );

    return {
      row: index + 1,
      position: index === 0 ? "FRONT" : index === ROW_COUNT - 1 ? "REAR" : "MID",
      wakeRows,
      turbulencePercent: localTi * 100,
      meanUpliftKpa,
      peakUpliftKpa,
      vibrationIndex,
      dynamicFactor,
    };
  });

  const peak = rows.reduce((current, row) => (row.peakUpliftKpa > current.peakUpliftKpa ? row : current));
  const vibration = rows.reduce((current, row) => Math.max(current, row.vibrationIndex), 0);
  const front = rows[0].peakUpliftKpa;
  const rear = rows[rows.length - 1].peakUpliftKpa;

  return {
    dynamicPressureKpa,
    sheddingFrequencyHz,
    peakUpliftKpa: peak.peakUpliftKpa,
    peakRow: peak.row,
    vibrationIndex: vibration,
    frontRearRatio: rear > 0 ? front / rear : 1,
    alignmentPercent,
    rows,
  };
}

export function riskColor(value: number, max = 100) {
  const t = clamp(value / Math.max(max, 0.001), 0, 1);
  if (t < 0.45) return "#69d9ff";
  if (t < 0.7) return "#e9ef72";
  if (t < 0.88) return "#ffab5d";
  return "#ff5f62";
}
