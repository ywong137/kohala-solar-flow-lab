export const ROW_COUNT = 7;
export const MODULES_PER_ROW = 14;
export const PANELS_DEEP_PER_ROW = 2;
export const ROW_COLUMN_COUNTS = [6, 14, 14, 14, 14, 14, 6] as const;
export const ROW_COLUMN_OFFSETS = [1.5, 0, 0, 0, 0, 0, 4] as const;
export const ROW_PANEL_COUNTS = ROW_COLUMN_COUNTS.map((columns) => columns * PANELS_DEEP_PER_ROW);
export const TOTAL_PANEL_COUNT = ROW_PANEL_COUNTS.reduce((total, panels) => total + panels, 0);
export const POST_STORM_PANEL_COUNT = ROW_PANEL_COUNTS.slice(2).reduce((total, panels) => total + panels, 0);
export const PANEL_WIDTH_M = 0.992;
export const PANEL_LENGTH_M = 1.956;
export const PANEL_THICKNESS_M = 0.04;
export const PANEL_GAP_M = 0.025;
export const TABLE_CHORD_M = PANEL_LENGTH_M * PANELS_DEEP_PER_ROW + PANEL_GAP_M;
export const ROW_SPACING_M = 5.05;
export const PANEL_TILT_DEG = 20.1;
export const LOW_EDGE_CLEARANCE_M = 0.48;
export const HIGH_EDGE_CLEARANCE_M =
  LOW_EDGE_CLEARANCE_M + Math.sin((PANEL_TILT_DEG * Math.PI) / 180) * TABLE_CHORD_M;
export const RACK_SUPPORTS_PER_ROW = 5;
export const ARRAY_AXIS_BEARING = 135;
export const MAUKA_BEARING = 45;

export type ViewMode = "flow" | "pressure" | "vibration";
export type MitigationId = "none" | "screen" | "vanes" | "spoilers" | "dampers";
export type SpoilerStyle = "perforated" | "continuous" | "tabs";

export type SimulationConfig = {
  windSpeedMph: number;
  windBearing: number;
  ambientTurbulence: number;
  panelFrequencyHz: number;
  dampingPercent: number;
  mitigation: MitigationId;
  screenPorosity: number;
  screenHeightM: number;
  screenProtectedRows: number;
  vaneLengthM: number;
  vaneRowCount: number;
  spoilerStyle: SpoilerStyle;
  spoilerHeightM: number;
  spoilerAngleDeg: number;
  spoilerRowCount: number;
  damperSpacingM: number;
  damperDampingPercent: number;
  damperRowCount: number;
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
  { label: string; short: string; detail: string; color: string; colorName: string }
> = {
  none: {
    label: "Baseline array",
    short: "No intervention",
    detail: "Current open-rack geometry with no added flow control.",
    color: "#8fa4aa",
    colorName: "gray",
  },
  screen: {
    label: "Porous wind screen",
    short: "Mauka perimeter",
    detail: "A porous mauka screen reduces the incoming gust. Adjust its open area and height.",
    color: "#7df0c5",
    colorName: "green",
  },
  vanes: {
    label: "Under-panel vanes",
    short: "Rows 1–3",
    detail: "Splitter vanes organize underside flow. They can cover the rack or extend toward the row behind it.",
    color: "#5ddcff",
    colorName: "cyan",
  },
  spoilers: {
    label: "Front-edge deflectors",
    short: "Rows 1–2",
    detail: "A bright edge device changes flow separation. Compare a perforated strip, solid strip, or spaced tabs.",
    color: "#ff9b57",
    colorName: "orange",
  },
  dampers: {
    label: "Rail vibration dampers",
    short: "Rows 1–2",
    detail: "Elastomer pads at rail-to-rack joints absorb motion. They do not change the airflow field.",
    color: "#ff66d8",
    colorName: "magenta",
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

export function getMitigationEffects(config: SimulationConfig) {
  if (config.mitigation === "screen") {
    const porosity = clamp(config.screenPorosity, 20, 80);
    const solidity = 1 - porosity / 100;
    const heightFactor = clamp(config.screenHeightM / 2.2, 0.35, 1.45);
    const coverageFactor = 0.55 + 0.45 * clamp(config.screenProtectedRows / ROW_COUNT, 1 / ROW_COUNT, 1);
    const pressureFactor = clamp(1 - 0.17 * solidity * heightFactor * coverageFactor, 0.78, 0.98);
    const offDesignPenalty = Math.abs(porosity - 40) * 0.003;
    const turbulenceFactor = clamp(1 - (0.1 + 0.04 * heightFactor - offDesignPenalty) * coverageFactor, 0.78, 1.05);
    return { turbulenceFactor, pressureFactor, dampingBoost: 0 };
  }

  if (config.mitigation === "vanes") {
    const lengthRatio = clamp(config.vaneLengthM / TABLE_CHORD_M, 0.1, 1.5);
    const rackCoverage = Math.min(lengthRatio, 1);
    const extension = Math.max(lengthRatio - 1, 0);
    const rowCoverage = clamp(0.5 + 0.5 * (config.vaneRowCount / 3), 0.55, 1.35);
    return {
      turbulenceFactor: clamp(1 - (0.28 * rackCoverage + 0.05 * extension) * rowCoverage, 0.62, 0.97),
      pressureFactor: clamp(1 - (0.09 * rackCoverage + 0.03 * extension) * rowCoverage, 0.84, 0.99),
      dampingBoost: 0,
    };
  }

  if (config.mitigation === "spoilers") {
    const styleTarget = {
      perforated: { turbulence: 0.82, pressure: 0.78 },
      continuous: { turbulence: 0.78, pressure: 0.72 },
      tabs: { turbulence: 0.87, pressure: 0.84 },
    }[config.spoilerStyle];
    const heightFactor = clamp(config.spoilerHeightM / 0.3, 0.35, 1.7);
    const angleFactor = clamp(Math.cos(THREE_DEGREES_TO_RADIANS * (config.spoilerAngleDeg - 20)), 0.35, 1);
    const rowCoverage = clamp(0.62 + 0.38 * (config.spoilerRowCount / 2), 0.62, 1.55);
    const effectiveness = clamp(heightFactor * angleFactor * rowCoverage, 0.25, 1.45);
    return {
      turbulenceFactor: clamp(1 - (1 - styleTarget.turbulence) * effectiveness, 0.65, 0.97),
      pressureFactor: clamp(1 - (1 - styleTarget.pressure) * effectiveness, 0.62, 0.97),
      dampingBoost: 0,
    };
  }

  if (config.mitigation === "dampers") {
    const spacingFactor = clamp(2 / config.damperSpacingM, 0.5, 2.5);
    const rowCoverage = clamp(0.72 + 0.28 * (config.damperRowCount / 2), 0.72, 1.7);
    return {
      turbulenceFactor: 1,
      pressureFactor: 1,
      dampingBoost: clamp(config.damperDampingPercent * spacingFactor * rowCoverage, 0.5, 18),
    };
  }

  return { turbulenceFactor: 1, pressureFactor: 1, dampingBoost: 0 };
}

const THREE_DEGREES_TO_RADIANS = Math.PI / 180;

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
  const mitigation = getMitigationEffects(config);

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
    const widthRatio = ROW_COLUMN_COUNTS[index] / MODULES_PER_ROW;
    const partialRowEdge =
      (1 - widthRatio) * crossRowAlignment * 0.08 * (0.35 + 0.65 * downstreamFraction);
    const meanUpliftKpa = dynamicPressureKpa * undersideCoefficient * shelter * mitigation.pressureFactor;
    const peakUpliftKpa =
      dynamicPressureKpa *
      (undersideCoefficient * shelter + exposedEdge + partialRowEdge + 2.45 * localTi) *
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
