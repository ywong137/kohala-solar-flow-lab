export const ROW_COUNT = 7;
export const MODULES_PER_ROW = 28;
export const PANELS_DEEP_PER_ROW = 2;
export const ROW_COLUMN_COUNTS = [14, 28, 28, 28, 28, 28, 14] as const;
export const ROW_COLUMN_OFFSETS = [7, 0, 0, 0, 0, 0, 7] as const;
// Photo calibration uses a 28.451 m full row: 32.7 px pitch and 7.8 px stagger.
export const ROW_STAGGER_M = 1.55;
export const ROW_STAGGER_OFFSETS_M = [-3, -2, -1, 0, 1, 2, 3].map(
  (step) => step * ROW_STAGGER_M,
);
export const ROW_PANEL_COUNTS = ROW_COLUMN_COUNTS.map((columns) => columns * PANELS_DEEP_PER_ROW);
export const TOTAL_PANEL_COUNT = ROW_PANEL_COUNTS.reduce((total, panels) => total + panels, 0);
export const POST_STORM_PANEL_COUNT = ROW_PANEL_COUNTS.slice(2).reduce((total, panels) => total + panels, 0);
export const PANEL_WIDTH_M = 0.992;
export const PANEL_LENGTH_M = 1.956;
export const PANEL_THICKNESS_M = 0.04;
export const PANEL_GAP_M = 0.025;
export const PANEL_SPAN_M = PANEL_WIDTH_M;
export const PANEL_SLOPE_M = PANEL_LENGTH_M;
export const TABLE_CHORD_M = PANEL_SLOPE_M * PANELS_DEEP_PER_ROW + PANEL_GAP_M;
export const ROW_SPACING_M = 6.45;
export const PANEL_TILT_DEG = 20.1;
export const LOW_EDGE_CLEARANCE_M = 0.48;
export const HIGH_EDGE_CLEARANCE_M =
  LOW_EDGE_CLEARANCE_M + Math.sin((PANEL_TILT_DEG * Math.PI) / 180) * TABLE_CHORD_M;
export const RACK_SUPPORTS_PER_ROW = 7;
export const ARRAY_AXIS_BEARING = 130;
export const MAUKA_BEARING = 40;
export const MODULE_PITCH_M = PANEL_SPAN_M + PANEL_GAP_M;
export const SCREEN_ROW_OFFSET_M = ROW_SPACING_M / 2;

export const getRowCenterZ = (row: number) =>
  ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M;

export const getRowOffsetX = (row: number) => {
  const index = row - 1;
  return ROW_COLUMN_OFFSETS[index] * MODULE_PITCH_M + ROW_STAGGER_OFFSETS_M[index];
};

export const getRowWidth = (row: number) =>
  ROW_COLUMN_COUNTS[row - 1] * MODULE_PITCH_M - PANEL_GAP_M;

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
  screenStartRow: number;
  screenEndRow: number;
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
  peakColumn: number;
  panels: PanelResult[];
};

export type PanelResult = {
  row: number;
  module: number;
  column: number;
  depth: number;
  xM: number;
  zM: number;
  contributingWakeRows: number;
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
  peakColumn: number;
  peakModule: number;
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
    short: "Behind Row 7",
    detail: "Place porous screens behind one row or an inclusive range. The local shelter follows wind direction and distance.",
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
    windBearing: 40,
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
    windBearing: 130,
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

const THREE_DEGREES_TO_RADIANS = Math.PI / 180;

export function circularDifference(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

export type FlowComponents = {
  x: number;
  z: number;
  crossRowAlignment: number;
};

export function getFlowComponents(windBearing: number): FlowComponents {
  const flowBearing = (windBearing + 180) % 360;
  const rawX = Math.cos(THREE_DEGREES_TO_RADIANS * circularDifference(flowBearing, ARRAY_AXIS_BEARING));
  const rawZ = Math.cos(
    THREE_DEGREES_TO_RADIANS * circularDifference(flowBearing, MAUKA_BEARING + 180),
  );
  const length = Math.hypot(rawX, rawZ) || 1;
  const x = rawX / length;
  const z = rawZ / length;
  return { x, z, crossRowAlignment: Math.abs(z) };
}

export function getInstalledScreenRows(config: SimulationConfig) {
  const start = Math.round(clamp(Math.min(config.screenStartRow, config.screenEndRow), 1, ROW_COUNT));
  const end = Math.round(clamp(Math.max(config.screenStartRow, config.screenEndRow), 1, ROW_COUNT));
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function getScreenGeometry(row: number) {
  return {
    row,
    x: getRowOffsetX(row),
    z: getRowCenterZ(row) - SCREEN_ROW_OFFSET_M,
    width: getRowWidth(row) + 1.4,
  };
}

export type ScreenFlowEffects = {
  pressureFactor: number;
  speedFactor: number;
  turbulenceFactor: number;
  screenCount: number;
};

export function getScreenFlowEffects(
  config: SimulationConfig,
  xM: number,
  zM: number,
  flow = getFlowComponents(config.windBearing),
): ScreenFlowEffects {
  if (config.mitigation !== "screen" || Math.abs(flow.z) < 0.08) {
    return { pressureFactor: 1, speedFactor: 1, turbulenceFactor: 1, screenCount: 0 };
  }

  const porosity = clamp(config.screenPorosity, 20, 80);
  const solidity = 1 - porosity / 100;
  const height = clamp(config.screenHeightM, 0.8, 3.2);
  const heightFactor = clamp(height / 2.2, 0.35, 1.45);
  const porosityEfficiency = clamp(1 - Math.abs(porosity - 40) / 55, 0.35, 1);
  let remainingGustEnergy = 1;
  let remainingTurbulence = 1;
  let screenCount = 0;

  for (const row of getInstalledScreenRows(config)) {
    const screen = getScreenGeometry(row);
    const downstreamDistance = (zM - screen.z) / flow.z;
    if (downstreamDistance <= 0) continue;

    const xAtScreen = xM - flow.x * downstreamDistance;
    const outsideEdge = Math.max(0, Math.abs(xAtScreen - screen.x) - screen.width / 2);
    const lateralFactor = Math.exp(-Math.pow(outsideEdge / Math.max(1, height * 1.35), 2));
    if (lateralFactor < 0.02) continue;

    const distanceFactor = Math.exp(-downstreamDistance / Math.max(4, height * 10));
    const normalFactor = Math.pow(Math.abs(flow.z), 0.72);
    const shield = clamp(
      solidity * heightFactor * porosityEfficiency * distanceFactor * lateralFactor * normalFactor,
      0,
      0.78,
    );
    if (shield < 0.01) continue;

    remainingGustEnergy *= 1 - 0.38 * shield;
    remainingTurbulence *= 1 - 0.3 * shield;
    screenCount += 1;
  }

  const pressureFactor = clamp(remainingGustEnergy, 0.58, 1);
  return {
    pressureFactor,
    speedFactor: Math.sqrt(pressureFactor),
    turbulenceFactor: clamp(remainingTurbulence, 0.62, 1),
    screenCount,
  };
}

export function cardinalDirection(bearing: number) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

type LocalMitigationEffects = {
  turbulenceFactor: number;
  pressureFactor: number;
  dampingBoost: number;
  wakeSourceFactor: number;
};

function getLocalMitigationEffects(config: SimulationConfig, row: number): LocalMitigationEffects {
  if (config.mitigation === "vanes" && row <= config.vaneRowCount) {
    const lengthRatio = clamp(config.vaneLengthM / TABLE_CHORD_M, 0.1, 1.5);
    const rackCoverage = Math.min(lengthRatio, 1);
    const extension = Math.max(lengthRatio - 1, 0);
    const turbulenceFactor = clamp(1 - 0.28 * rackCoverage - 0.05 * extension, 0.62, 0.97);
    const pressureFactor = clamp(1 - 0.09 * rackCoverage - 0.03 * extension, 0.84, 0.99);
    return {
      turbulenceFactor,
      pressureFactor,
      dampingBoost: 0,
      wakeSourceFactor: clamp(0.18 + 0.82 * turbulenceFactor, 0.68, 0.98),
    };
  }

  if (config.mitigation === "spoilers" && row <= config.spoilerRowCount) {
    const styleTarget = {
      perforated: { turbulence: 0.82, pressure: 0.78 },
      continuous: { turbulence: 0.78, pressure: 0.72 },
      tabs: { turbulence: 0.87, pressure: 0.84 },
    }[config.spoilerStyle];
    const heightFactor = clamp(config.spoilerHeightM / 0.3, 0.35, 1.7);
    const angleFactor = clamp(
      Math.cos(THREE_DEGREES_TO_RADIANS * (config.spoilerAngleDeg - 20)),
      0.35,
      1,
    );
    const effectiveness = clamp(heightFactor * angleFactor, 0.25, 1.45);
    const turbulenceFactor = clamp(
      1 - (1 - styleTarget.turbulence) * effectiveness,
      0.65,
      0.97,
    );
    const pressureFactor = clamp(
      1 - (1 - styleTarget.pressure) * effectiveness,
      0.62,
      0.97,
    );
    return {
      turbulenceFactor,
      pressureFactor,
      dampingBoost: 0,
      wakeSourceFactor: clamp(0.12 + 0.88 * turbulenceFactor, 0.66, 0.98),
    };
  }

  if (config.mitigation === "dampers" && row <= config.damperRowCount) {
    const spacingFactor = clamp(2 / config.damperSpacingM, 0.5, 2.5);
    return {
      turbulenceFactor: 1,
      pressureFactor: 1,
      dampingBoost: clamp(config.damperDampingPercent * spacingFactor, 0.5, 18),
      wakeSourceFactor: 1,
    };
  }

  return { turbulenceFactor: 1, pressureFactor: 1, dampingBoost: 0, wakeSourceFactor: 1 };
}

export function getPanelCoordinates(row: number, module: number) {
  const rowIndex = Math.round(clamp(row, 1, ROW_COUNT)) - 1;
  const columnCount = ROW_COLUMN_COUNTS[rowIndex];
  const safeModule = Math.round(clamp(module, 1, columnCount * PANELS_DEEP_PER_ROW));
  const depthIndex = Math.floor((safeModule - 1) / columnCount);
  const columnIndex = (safeModule - 1) % columnCount;
  const slopeOffset =
    (depthIndex - (PANELS_DEEP_PER_ROW - 1) / 2) * (PANEL_SLOPE_M + PANEL_GAP_M);
  return {
    row: rowIndex + 1,
    module: safeModule,
    column: columnIndex + 1,
    depth: depthIndex + 1,
    xM: getRowOffsetX(rowIndex + 1) + (columnIndex - (columnCount - 1) / 2) * MODULE_PITCH_M,
    zM: getRowCenterZ(rowIndex + 1) + Math.cos(THREE_DEGREES_TO_RADIANS * PANEL_TILT_DEG) * slopeOffset,
  };
}

export function getPanelResult(result: SimulationResult, row: number, module: number) {
  const rowResult = result.rows[Math.round(clamp(row, 1, ROW_COUNT)) - 1];
  const columnCount = ROW_COLUMN_COUNTS[rowResult.row - 1];
  const safeModule = Math.round(clamp(module, 1, columnCount * PANELS_DEEP_PER_ROW));
  return rowResult.panels[safeModule - 1];
}

export function simulate(config: SimulationConfig): SimulationResult {
  const speedMs = config.windSpeedMph * 0.44704;
  const airDensity = 1.17;
  const dynamicPressureKpa = (0.5 * airDensity * speedMs * speedMs) / 1000;
  const flow = getFlowComponents(config.windBearing);
  const alignmentPercent = flow.crossRowAlignment * 100;

  // This Strouhal estimate uses the panel chord and the wind component across each rack.
  const sheddingVelocity = speedMs * (0.38 + 0.62 * flow.crossRowAlignment);
  const sheddingFrequencyHz = (0.13 * sheddingVelocity) / PANEL_SLOPE_M;
  const frequencyRatio = sheddingFrequencyHz / Math.max(0.3, config.panelFrequencyHz);

  const wakeSources = ROW_COLUMN_COUNTS.flatMap((columnCount, rowIndex) => {
    const row = rowIndex + 1;
    const rowEffects = getLocalMitigationEffects(config, row);
    return Array.from({ length: columnCount }, (_, columnIndex) => {
      const xM = getRowOffsetX(row) + (columnIndex - (columnCount - 1) / 2) * MODULE_PITCH_M;
      const zM = getRowCenterZ(row);
      const screenEffects = getScreenFlowEffects(config, xM, zM, flow);
      return {
        row,
        column: columnIndex + 1,
        xM,
        zM,
        wakeFactor:
          rowEffects.wakeSourceFactor *
          screenEffects.turbulenceFactor *
          screenEffects.speedFactor,
      };
    });
  });

  const rows = Array.from({ length: ROW_COUNT }, (_, rowIndex): RowResult => {
    const row = rowIndex + 1;
    const columnCount = ROW_COLUMN_COUNTS[rowIndex];
    const rowEffects = getLocalMitigationEffects(config, row);
    const panels = Array.from(
      { length: columnCount * PANELS_DEEP_PER_ROW },
      (_, panelIndex): PanelResult => {
        const coordinates = getPanelCoordinates(row, panelIndex + 1);
        const columnIndex = coordinates.column - 1;
        const depthIndex = coordinates.depth - 1;
        let wakeEnergy = 0;
        const contributingRows = new Set<number>();

        for (const source of wakeSources) {
          if (source.row === row && source.column === coordinates.column) continue;
          const dx = coordinates.xM - source.xM;
          const dz = coordinates.zM - source.zM;
          const downstreamDistance = dx * flow.x + dz * flow.z;
          if (downstreamDistance <= 0.45) continue;

          const lateralDistance = Math.abs(-dx * flow.z + dz * flow.x);
          const wakeHalfWidth = MODULE_PITCH_M * 0.58 + downstreamDistance * 0.11;
          const lateralWeight = Math.exp(-0.5 * Math.pow(lateralDistance / wakeHalfWidth, 2));
          const distanceDecay = Math.exp(-downstreamDistance / (ROW_SPACING_M * 3.6));
          const nearFieldBuild = 1 - Math.exp(-downstreamDistance / 1.2);
          const orientationFactor = 0.34 + 0.66 * flow.crossRowAlignment;
          const wakeStrength =
            orientationFactor * lateralWeight * distanceDecay * nearFieldBuild * source.wakeFactor;
          wakeEnergy += wakeStrength * wakeStrength;
          if (wakeStrength > 0.12) contributingRows.add(source.row);
        }

        const wakeAmplitude = Math.sqrt(wakeEnergy);
        const wakeBuild = clamp(1 - Math.exp(-0.34 * wakeAmplitude), 0, 0.94);
        const upwindColumnDistance =
          (flow.x >= 0 ? columnIndex : columnCount - 1 - columnIndex) * MODULE_PITCH_M;
        const upwindDepthDistance =
          (flow.z >= 0 ? depthIndex : PANELS_DEEP_PER_ROW - 1 - depthIndex) *
          (PANEL_SLOPE_M + PANEL_GAP_M);
        const lateralEdgeExposure =
          Math.abs(flow.x) * Math.exp(-upwindColumnDistance / Math.max(1.2, MODULE_PITCH_M * 2.8));
        const crossRowEdgeExposure =
          Math.abs(flow.z) * Math.exp(-upwindDepthDistance / Math.max(1.2, PANEL_SLOPE_M));
        const edgeExposure = clamp(0.72 * lateralEdgeExposure + 0.42 * crossRowEdgeExposure, 0, 1);
        const screenEffects = getScreenFlowEffects(config, coordinates.xM, coordinates.zM, flow);
        const localTi = clamp(
          (config.ambientTurbulence / 100 + wakeBuild * 0.215 + edgeExposure * 0.045) *
            rowEffects.turbulenceFactor *
            screenEffects.turbulenceFactor,
          0.035,
          0.42,
        );

        const dampingRatio = (config.dampingPercent + rowEffects.dampingBoost) / 100;
        const rawDynamicFactor = 1 / Math.sqrt(
          Math.pow(1 - frequencyRatio * frequencyRatio, 2) +
            Math.pow(2 * dampingRatio * frequencyRatio, 2),
        );
        const dynamicFactor = clamp(rawDynamicFactor, 0.45, 8);
        const resonanceWeight = clamp((dynamicFactor - 0.45) / 4.6, 0.12, 1.45);
        const shelter = 1 - 0.11 * wakeBuild;
        const maukaUplift = Math.max(0, flow.z);
        const undersideCoefficient = 0.49 + 0.38 * maukaUplift;
        const pressureFactor = rowEffects.pressureFactor * screenEffects.pressureFactor;
        const meanUpliftKpa = dynamicPressureKpa * undersideCoefficient * shelter * pressureFactor;
        const peakUpliftKpa =
          dynamicPressureKpa *
          (undersideCoefficient * shelter + edgeExposure * 0.21 + 2.45 * localTi) *
          pressureFactor;
        const vibrationIndex = clamp(
          100 *
            (dynamicPressureKpa / 0.95) *
            (localTi / 0.3) *
            resonanceWeight *
            (0.74 + 0.26 * wakeBuild),
          0,
          100,
        );

        return {
          ...coordinates,
          contributingWakeRows: contributingRows.size,
          turbulencePercent: localTi * 100,
          meanUpliftKpa,
          peakUpliftKpa,
          vibrationIndex,
          dynamicFactor,
        };
      },
    );

    const peakPanel = panels.reduce((current, panel) =>
      panel.peakUpliftKpa > current.peakUpliftKpa ? panel : current,
    );
    return {
      row,
      position: row === 1 ? "FRONT" : row === ROW_COUNT ? "REAR" : "MID",
      wakeRows: Math.max(...panels.map((panel) => panel.contributingWakeRows)),
      turbulencePercent: Math.max(...panels.map((panel) => panel.turbulencePercent)),
      meanUpliftKpa:
        panels.reduce((total, panel) => total + panel.meanUpliftKpa, 0) / panels.length,
      peakUpliftKpa: peakPanel.peakUpliftKpa,
      vibrationIndex: Math.max(...panels.map((panel) => panel.vibrationIndex)),
      dynamicFactor: Math.max(...panels.map((panel) => panel.dynamicFactor)),
      peakColumn: peakPanel.column,
      panels,
    };
  });

  const peak = rows
    .flatMap((row) => row.panels)
    .reduce((current, panel) =>
      panel.peakUpliftKpa > current.peakUpliftKpa ? panel : current,
    );
  const vibration = rows.reduce((current, row) => Math.max(current, row.vibrationIndex), 0);
  const front = rows[0].peakUpliftKpa;
  const rear = rows[rows.length - 1].peakUpliftKpa;

  return {
    dynamicPressureKpa,
    sheddingFrequencyHz,
    peakUpliftKpa: peak.peakUpliftKpa,
    peakRow: peak.row,
    peakColumn: peak.column,
    peakModule: peak.module,
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
