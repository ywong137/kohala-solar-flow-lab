import {
  DEFAULT_ARRAY_CONFIG,
  getArrayMetrics,
  type ArrayGeometryConfig,
} from "./array-config.ts";

export const ROW_COUNT = DEFAULT_ARRAY_CONFIG.rows.length;
export const MODULES_PER_ROW = 28;
export const PANELS_DEEP_PER_ROW = 2;
export const ROW_COLUMN_COUNTS = DEFAULT_ARRAY_CONFIG.rows.map((row) => row.columns);
export const ROW_PANEL_COUNTS = DEFAULT_ARRAY_CONFIG.rows.map((row) => row.columns * row.panelsDeep);
export const TOTAL_PANEL_COUNT = ROW_PANEL_COUNTS.reduce((total, panels) => total + panels, 0);
export const POST_STORM_PANEL_COUNT = ROW_PANEL_COUNTS.slice(2).reduce((total, panels) => total + panels, 0);
export const PANEL_WIDTH_M = DEFAULT_ARRAY_CONFIG.panelWidthM;
export const PANEL_LENGTH_M = DEFAULT_ARRAY_CONFIG.panelLengthM;
export const PANEL_THICKNESS_M = DEFAULT_ARRAY_CONFIG.panelThicknessM;
export const PANEL_GAP_M = DEFAULT_ARRAY_CONFIG.panelGapM;
export const PANEL_SPAN_M = PANEL_WIDTH_M;
export const PANEL_SLOPE_M = PANEL_LENGTH_M;
export const TABLE_CHORD_M = getArrayMetrics(DEFAULT_ARRAY_CONFIG).tableChordM;
export const ROW_SPACING_M = DEFAULT_ARRAY_CONFIG.rowSpacingM;
export const PANEL_TILT_DEG = DEFAULT_ARRAY_CONFIG.tiltDeg;
export const LOW_EDGE_CLEARANCE_M = DEFAULT_ARRAY_CONFIG.lowEdgeClearanceM;
export const HIGH_EDGE_CLEARANCE_M = getArrayMetrics(DEFAULT_ARRAY_CONFIG).highEdgeClearanceM;
export const RACK_SUPPORTS_PER_ROW = DEFAULT_ARRAY_CONFIG.rackSupportsFullRow;
export const ARRAY_AXIS_BEARING = DEFAULT_ARRAY_CONFIG.arrayAxisBearing;
export const MAUKA_BEARING = DEFAULT_ARRAY_CONFIG.maukaBearing;
export const MODULE_PITCH_M = PANEL_SPAN_M + PANEL_GAP_M;
export const SCREEN_ROW_OFFSET_M = DEFAULT_ARRAY_CONFIG.screenRowOffsetM;
export const ROW_STAGGER_M = 1.55;

export const getRowCenterZ = (row: number, geometry = DEFAULT_ARRAY_CONFIG) =>
  ((geometry.rows.length - 1) / 2 - (row - 1)) * geometry.rowSpacingM;

export const getRowOffsetX = (row: number, geometry = DEFAULT_ARRAY_CONFIG) =>
  geometry.rows[row - 1]?.offsetXM ?? 0;

export const getRowWidth = (row: number, geometry = DEFAULT_ARRAY_CONFIG) => {
  const rowConfig = geometry.rows[row - 1] ?? geometry.rows[0];
  return rowConfig.columns * (geometry.panelWidthM + geometry.panelGapM) - geometry.panelGapM;
};

export function getArrayBounds(geometry = DEFAULT_ARRAY_CONFIG) {
  const edges = geometry.rows.flatMap((_, index) => {
    const row = index + 1;
    const offset = getRowOffsetX(row, geometry);
    const width = getRowWidth(row, geometry);
    return [offset - width / 2, offset + width / 2];
  });
  const minX = Math.min(...edges);
  const maxX = Math.max(...edges);
  return { minX, maxX, centerX: (minX + maxX) / 2, width: maxX - minX };
}

export type SoutheastEdgeLine = {
  slopeXPerZM: number;
  interceptXM: number;
  bearingDeg: number;
};

export function getSoutheastEdgeLine(geometry = DEFAULT_ARRAY_CONFIG): SoutheastEdgeLine {
  const samples = geometry.rows.map((_, index) => {
    const row = index + 1;
    return {
      z: getRowCenterZ(row, geometry),
      x: getRowOffsetX(row, geometry) + getRowWidth(row, geometry) / 2,
    };
  });
  const meanZ = samples.reduce((sum, sample) => sum + sample.z, 0) / samples.length;
  const meanX = samples.reduce((sum, sample) => sum + sample.x, 0) / samples.length;
  const denominator = samples.reduce((sum, sample) => sum + (sample.z - meanZ) ** 2, 0);
  const slopeXPerZM = denominator > 0
    ? samples.reduce((sum, sample) => sum + (sample.z - meanZ) * (sample.x - meanX), 0) / denominator
    : 0;
  const interceptXM = meanX - slopeXPerZM * meanZ;

  const xBearingRad = geometry.arrayAxisBearing * RAD;
  const zBearingRad = ((geometry.maukaBearing + 180) % 360) * RAD;
  const east = slopeXPerZM * Math.sin(xBearingRad) + Math.sin(zBearingRad);
  const north = slopeXPerZM * Math.cos(xBearingRad) + Math.cos(zBearingRad);
  const directionalBearing = (Math.atan2(east, north) / RAD + 360) % 360;
  const bearingDeg = directionalBearing >= 180 ? directionalBearing - 180 : directionalBearing;

  return { slopeXPerZM, interceptXM, bearingDeg };
}

export function getRetainingWallX(
  z: number,
  geometry = DEFAULT_ARRAY_CONFIG,
  perpendicularClearanceM = 3,
) {
  const edge = getSoutheastEdgeLine(geometry);
  const normalScale = Math.hypot(1, edge.slopeXPerZM);
  return edge.interceptXM + edge.slopeXPerZM * z + perpendicularClearanceM * normalScale;
}

export function getRetainingWallClearance(
  x: number,
  z: number,
  geometry = DEFAULT_ARRAY_CONFIG,
) {
  const edge = getSoutheastEdgeLine(geometry);
  const wallIntercept = getRetainingWallX(0, geometry);
  return Math.abs(x - edge.slopeXPerZM * z - wallIntercept) / Math.hypot(1, edge.slopeXPerZM);
}

export type ViewMode = "flow" | "pressure" | "vibration";
export type MitigationId = "none" | "screen" | "vanes" | "spoilers" | "dampers";
export type SpoilerStyle = "perforated" | "continuous" | "tabs";

export type SimulationConfig = {
  geometry: ArrayGeometryConfig;
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
  vaneStartRow: number;
  vaneEndRow: number;
  spoilerStyle: SpoilerStyle;
  spoilerHeightM: number;
  spoilerAngleDeg: number;
  spoilerStartRow: number;
  spoilerEndRow: number;
  damperSpacingM: number;
  damperDampingPercent: number;
  damperStartRow: number;
  damperEndRow: number;
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

export type MitigationElementLoad = {
  row: number;
  element: number;
  xM: number;
  projectedAreaM2: number;
  pressureKpa: number;
  forceKn: number;
  attachmentLoadKn: number;
  overturningMomentKnM: number;
  excitationFrequencyHz: number;
  vibrationIndex: number;
};

export type MitigationRowLoad = {
  row: number;
  elementCount: number;
  totalForceKn: number;
  peakPressureKpa: number;
  peakAttachmentLoadKn: number;
  peakOverturningMomentKnM: number;
  peakVibrationIndex: number;
  peakElement: number;
  elements: MitigationElementLoad[];
};

export type MitigationLoadResult = {
  concept: Exclude<MitigationId, "none">;
  elementLabel: string;
  loadBasis: string;
  elementCount: number;
  peakPressureKpa: number;
  peakAttachmentLoadKn: number;
  peakOverturningMomentKnM: number;
  peakVibrationIndex: number;
  peakRow: number;
  peakElement: number;
  rows: MitigationRowLoad[];
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
  mitigationLoad: MitigationLoadResult | null;
};

export const MITIGATIONS: Record<MitigationId, { label: string; short: string; detail: string; color: string; colorName: string }> = {
  none: { label: "Baseline array", short: "No intervention", detail: "Current open-rack geometry with no added flow control.", color: "#8fa4aa", colorName: "gray" },
  screen: { label: "Porous wind screen", short: "Rows 7–7", detail: "Full-array-width porous screens sit behind each row in the selected range.", color: "#7df0c5", colorName: "green" },
  vanes: { label: "Under-panel vanes", short: "Rows 1–3", detail: "Splitter vanes organize underside flow. They can cover the rack or extend toward the row behind it.", color: "#5ddcff", colorName: "cyan" },
  spoilers: { label: "Front-edge deflectors", short: "Rows 1–2", detail: "A bright edge device changes flow separation. Compare a perforated strip, solid strip, or spaced tabs.", color: "#ff9b57", colorName: "orange" },
  dampers: { label: "Rail vibration dampers", short: "Rows 1–2", detail: "Elastomer pads at rail-to-rack joints absorb motion. They do not change the airflow field.", color: "#ff66d8", colorName: "magenta" },
};

export const SCENARIOS = {
  storm: { label: "Mauka storm gust", note: "Rear → front", windSpeedMph: 90, windBearing: 40, ambientTurbulence: 16 },
  trade: { label: "ENE trade wind", note: "Typical strong day", windSpeedMph: 32, windBearing: 60, ambientTurbulence: 10 },
  cross: { label: "Southeast crosswind", note: "Along the rows", windSpeedMph: 55, windBearing: 130, ambientTurbulence: 14 },
  makai: { label: "Makai sea breeze", note: "Front → rear", windSpeedMph: 24, windBearing: 225, ambientTurbulence: 11 },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const RAD = Math.PI / 180;

export function circularDifference(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

export type FlowComponents = { x: number; z: number; crossRowAlignment: number };

export function getFlowComponents(windBearing: number, geometry = DEFAULT_ARRAY_CONFIG): FlowComponents {
  const flowBearing = (windBearing + 180) % 360;
  const rawX = Math.cos(RAD * circularDifference(flowBearing, geometry.arrayAxisBearing));
  const rawZ = Math.cos(RAD * circularDifference(flowBearing, geometry.maukaBearing + 180));
  const length = Math.hypot(rawX, rawZ) || 1;
  const x = rawX / length;
  const z = rawZ / length;
  return { x, z, crossRowAlignment: Math.abs(z) };
}

export function normalizeRowRange(start: number, end: number, rowCount: number) {
  const first = Math.round(clamp(Math.min(start, end), 1, rowCount));
  const last = Math.round(clamp(Math.max(start, end), 1, rowCount));
  return { start: first, end: last };
}

export function rowIsInRange(row: number, start: number, end: number, rowCount: number) {
  const range = normalizeRowRange(start, end, rowCount);
  return row >= range.start && row <= range.end;
}

export function getInstalledScreenRows(config: SimulationConfig) {
  const range = normalizeRowRange(config.screenStartRow, config.screenEndRow, config.geometry.rows.length);
  return Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index);
}

export function getScreenGeometry(row: number, geometry = DEFAULT_ARRAY_CONFIG) {
  const bounds = getArrayBounds(geometry);
  return { row, x: bounds.centerX, z: getRowCenterZ(row, geometry) - geometry.screenRowOffsetM, width: bounds.width + 1.4 };
}

export type ScreenFlowEffects = { pressureFactor: number; speedFactor: number; turbulenceFactor: number; screenCount: number };

export function getScreenFlowEffects(config: SimulationConfig, xM: number, zM: number, flow = getFlowComponents(config.windBearing, config.geometry)): ScreenFlowEffects {
  if (config.mitigation !== "screen" || Math.abs(flow.z) < 0.08) return { pressureFactor: 1, speedFactor: 1, turbulenceFactor: 1, screenCount: 0 };
  const porosity = clamp(config.screenPorosity, 20, 80);
  const solidity = 1 - porosity / 100;
  const height = clamp(config.screenHeightM, 0.8, 3.2);
  const heightFactor = clamp(height / 2.2, 0.35, 1.45);
  const porosityEfficiency = clamp(1 - Math.abs(porosity - 40) / 55, 0.35, 1);
  let remainingGustEnergy = 1;
  let remainingTurbulence = 1;
  let screenCount = 0;
  for (const row of getInstalledScreenRows(config)) {
    const screen = getScreenGeometry(row, config.geometry);
    const downstreamDistance = (zM - screen.z) / flow.z;
    if (downstreamDistance <= 0) continue;
    const xAtScreen = xM - flow.x * downstreamDistance;
    const outsideEdge = Math.max(0, Math.abs(xAtScreen - screen.x) - screen.width / 2);
    const lateralFactor = Math.exp(-Math.pow(outsideEdge / Math.max(1, height * 1.35), 2));
    if (lateralFactor < 0.02) continue;
    const distanceFactor = Math.exp(-downstreamDistance / Math.max(4, height * 10));
    const normalFactor = Math.pow(Math.abs(flow.z), 0.72);
    const shield = clamp(solidity * heightFactor * porosityEfficiency * distanceFactor * lateralFactor * normalFactor, 0, 0.78);
    if (shield < 0.01) continue;
    remainingGustEnergy *= 1 - 0.38 * shield;
    remainingTurbulence *= 1 - 0.3 * shield;
    screenCount += 1;
  }
  const pressureFactor = clamp(remainingGustEnergy, 0.58, 1);
  return { pressureFactor, speedFactor: Math.sqrt(pressureFactor), turbulenceFactor: clamp(remainingTurbulence, 0.62, 1), screenCount };
}

export function cardinalDirection(bearing: number) {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

type LocalMitigationEffects = { turbulenceFactor: number; pressureFactor: number; dampingBoost: number; wakeSourceFactor: number };

function getLocalMitigationEffects(config: SimulationConfig, row: number): LocalMitigationEffects {
  const rowCount = config.geometry.rows.length;
  const tableChordM = getArrayMetrics(config.geometry).tableChordM;
  if (config.mitigation === "vanes" && rowIsInRange(row, config.vaneStartRow, config.vaneEndRow, rowCount)) {
    const lengthRatio = clamp(config.vaneLengthM / tableChordM, 0.1, 1.5);
    const rackCoverage = Math.min(lengthRatio, 1);
    const extension = Math.max(lengthRatio - 1, 0);
    const turbulenceFactor = clamp(1 - 0.28 * rackCoverage - 0.05 * extension, 0.62, 0.97);
    const pressureFactor = clamp(1 - 0.09 * rackCoverage - 0.03 * extension, 0.84, 0.99);
    return { turbulenceFactor, pressureFactor, dampingBoost: 0, wakeSourceFactor: clamp(0.18 + 0.82 * turbulenceFactor, 0.68, 0.98) };
  }
  if (config.mitigation === "spoilers" && rowIsInRange(row, config.spoilerStartRow, config.spoilerEndRow, rowCount)) {
    const styleTarget = { perforated: { turbulence: 0.82, pressure: 0.78 }, continuous: { turbulence: 0.78, pressure: 0.72 }, tabs: { turbulence: 0.87, pressure: 0.84 } }[config.spoilerStyle];
    const heightFactor = clamp(config.spoilerHeightM / 0.3, 0.35, 1.7);
    const angleFactor = clamp(Math.cos(RAD * (config.spoilerAngleDeg - 20)), 0.35, 1);
    const effectiveness = clamp(heightFactor * angleFactor, 0.25, 1.45);
    const turbulenceFactor = clamp(1 - (1 - styleTarget.turbulence) * effectiveness, 0.65, 0.97);
    const pressureFactor = clamp(1 - (1 - styleTarget.pressure) * effectiveness, 0.62, 0.97);
    return { turbulenceFactor, pressureFactor, dampingBoost: 0, wakeSourceFactor: clamp(0.12 + 0.88 * turbulenceFactor, 0.66, 0.98) };
  }
  if (config.mitigation === "dampers" && rowIsInRange(row, config.damperStartRow, config.damperEndRow, rowCount)) {
    const spacingFactor = clamp(2 / config.damperSpacingM, 0.5, 2.5);
    return { turbulenceFactor: 1, pressureFactor: 1, dampingBoost: clamp(config.damperDampingPercent * spacingFactor, 0.5, 18), wakeSourceFactor: 1 };
  }
  return { turbulenceFactor: 1, pressureFactor: 1, dampingBoost: 0, wakeSourceFactor: 1 };
}

export function getPanelCoordinates(row: number, module: number, geometry = DEFAULT_ARRAY_CONFIG) {
  const rowIndex = Math.round(clamp(row, 1, geometry.rows.length)) - 1;
  const rowConfig = geometry.rows[rowIndex];
  const safeModule = Math.round(clamp(module, 1, rowConfig.columns * rowConfig.panelsDeep));
  const depthIndex = Math.floor((safeModule - 1) / rowConfig.columns);
  const columnIndex = (safeModule - 1) % rowConfig.columns;
  const slopeOffset = (depthIndex - (rowConfig.panelsDeep - 1) / 2) * (geometry.panelLengthM + geometry.panelGapM);
  return {
    row: rowIndex + 1,
    module: safeModule,
    column: columnIndex + 1,
    depth: depthIndex + 1,
    xM: getRowOffsetX(rowIndex + 1, geometry) + (columnIndex - (rowConfig.columns - 1) / 2) * (geometry.panelWidthM + geometry.panelGapM),
    zM: getRowCenterZ(rowIndex + 1, geometry) + Math.cos(RAD * geometry.tiltDeg) * slopeOffset,
  };
}

export function getPanelResult(result: SimulationResult, row: number, module: number) {
  const rowResult = result.rows[Math.round(clamp(row, 1, result.rows.length)) - 1];
  const safeModule = Math.round(clamp(module, 1, rowResult.panels.length));
  return rowResult.panels[safeModule - 1];
}

function harmonicResponseGain(excitationFrequencyHz: number, naturalFrequencyHz: number, dampingPercent: number) {
  const ratio = excitationFrequencyHz / Math.max(0.2, naturalFrequencyHz);
  const dampingRatio = dampingPercent / 100;
  return clamp(
    1 / Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(2 * dampingRatio * ratio, 2)),
    0.35,
    8,
  );
}

function deviceVibrationIndex(
  pressureKpa: number,
  dynamicPressureKpa: number,
  turbulenceRatio: number,
  responseGain: number,
) {
  const pressureDemand = pressureKpa / Math.max(0.08, dynamicPressureKpa * 1.25);
  const turbulenceDemand = clamp(turbulenceRatio / 0.18, 0.25, 2.2);
  const resonanceDemand = clamp(responseGain / 2.5, 0.2, 2.4);
  return clamp(100 * 0.48 * pressureDemand * turbulenceDemand * resonanceDemand, 0, 100);
}

function summarizeMitigationRows(
  concept: Exclude<MitigationId, "none">,
  elementLabel: string,
  loadBasis: string,
  elements: MitigationElementLoad[],
): MitigationLoadResult {
  const rowNumbers = [...new Set(elements.map((element) => element.row))].sort((a, b) => a - b);
  const rows = rowNumbers.map((row): MitigationRowLoad => {
    const rowElements = elements.filter((element) => element.row === row);
    const peak = rowElements.reduce((current, element) =>
      element.attachmentLoadKn > current.attachmentLoadKn ? element : current,
    );
    return {
      row,
      elementCount: rowElements.length,
      totalForceKn: rowElements.reduce((sum, element) => sum + element.forceKn, 0),
      peakPressureKpa: Math.max(...rowElements.map((element) => element.pressureKpa)),
      peakAttachmentLoadKn: peak.attachmentLoadKn,
      peakOverturningMomentKnM: Math.max(...rowElements.map((element) => element.overturningMomentKnM)),
      peakVibrationIndex: Math.max(...rowElements.map((element) => element.vibrationIndex)),
      peakElement: peak.element,
      elements: rowElements,
    };
  });
  const peakRow = rows.reduce((current, row) =>
    row.peakAttachmentLoadKn > current.peakAttachmentLoadKn ? row : current,
  );
  return {
    concept,
    elementLabel,
    loadBasis,
    elementCount: elements.length,
    peakPressureKpa: Math.max(...rows.map((row) => row.peakPressureKpa)),
    peakAttachmentLoadKn: peakRow.peakAttachmentLoadKn,
    peakOverturningMomentKnM: Math.max(...rows.map((row) => row.peakOverturningMomentKnM)),
    peakVibrationIndex: Math.max(...rows.map((row) => row.peakVibrationIndex)),
    peakRow: peakRow.row,
    peakElement: peakRow.peakElement,
    rows,
  };
}

function simulateMitigationLoads(
  config: SimulationConfig,
  rows: RowResult[],
  dynamicPressureKpa: number,
  speedMs: number,
  flow: FlowComponents,
  panelSheddingFrequencyHz: number,
): MitigationLoadResult | null {
  if (config.mitigation === "none") return null;
  const geometry = config.geometry;
  const metrics = getArrayMetrics(geometry);
  const arrayBounds = getArrayBounds(geometry);
  const fullRowWidth = Math.max(...geometry.rows.map((_, index) => getRowWidth(index + 1, geometry)));
  const elements: MitigationElementLoad[] = [];
  const localPanelAt = (row: number, xM: number) =>
    rows[row - 1].panels.reduce((current, panel) =>
      Math.abs(panel.xM - xM) < Math.abs(current.xM - xM) ? panel : current,
    );
  const edgeFactorAt = (xM: number, scaleM: number) => {
    const upwindDistance = flow.x >= 0 ? xM - arrayBounds.minX : arrayBounds.maxX - xM;
    return 1 + 0.18 * Math.abs(flow.x) * Math.exp(-Math.max(0, upwindDistance) / Math.max(0.4, scaleM));
  };
  const gustFactorAt = (turbulenceRatio: number) => clamp(1 + 2.7 * turbulenceRatio, 1.08, 2.05);

  if (config.mitigation === "screen") {
    const porosityRatio = clamp(config.screenPorosity / 100, 0.2, 0.8);
    const solidity = 1 - porosityRatio;
    const dragCoefficient = 0.2 + 1.1 * Math.pow(solidity, 1.35);
    const normalSpeed = speedMs * Math.abs(flow.z);
    const normalPressureFactor = 0.05 + 0.95 * flow.z * flow.z;
    for (const row of getInstalledScreenRows(config)) {
      const screen = getScreenGeometry(row, geometry);
      const segmentCount = Math.max(1, Math.ceil(screen.width / 4));
      const segmentWidth = screen.width / segmentCount;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const xM = screen.x - screen.width / 2 + (segment + 0.5) * segmentWidth;
        const localPanel = localPanelAt(row, xM);
        const turbulenceRatio = Math.max(config.ambientTurbulence / 100, localPanel.turbulencePercent / 100);
        const pressureKpa = dynamicPressureKpa * normalPressureFactor * dragCoefficient
          * gustFactorAt(turbulenceRatio) * edgeFactorAt(xM, config.screenHeightM * 2);
        const projectedAreaM2 = segmentWidth * config.screenHeightM;
        const forceKn = pressureKpa * projectedAreaM2;
        const excitationFrequencyHz = 0.16 * normalSpeed / Math.max(0.3, config.screenHeightM * (0.6 + 0.4 * porosityRatio));
        const responseGain = harmonicResponseGain(excitationFrequencyHz, 1.5, 2);
        elements.push({
          row,
          element: segment + 1,
          xM,
          projectedAreaM2,
          pressureKpa,
          forceKn,
          attachmentLoadKn: forceKn / 2,
          overturningMomentKnM: forceKn * config.screenHeightM / 4,
          excitationFrequencyHz,
          vibrationIndex: deviceVibrationIndex(pressureKpa, dynamicPressureKpa, turbulenceRatio, responseGain),
        });
      }
    }
    return summarizeMitigationRows(
      "screen",
      "screen bay",
      "Porous-screen drag on gross bay area; two posts share each bay load. Vibration assumes a 1.5 Hz mode and 2% damping.",
      elements,
    );
  }

  if (config.mitigation === "vanes") {
    const normalSpeed = speedMs * Math.abs(flow.x);
    const normalPressureFactor = 0.08 + 0.92 * flow.x * flow.x;
    for (let row = 1; row <= geometry.rows.length; row += 1) {
      if (!rowIsInRange(row, config.vaneStartRow, config.vaneEndRow, geometry.rows.length)) continue;
      const rowWidth = getRowWidth(row, geometry);
      const rowOffsetX = getRowOffsetX(row, geometry);
      const vaneCount = Math.max(3, Math.round(7 * rowWidth / fullRowWidth));
      for (let vane = 0; vane < vaneCount; vane += 1) {
        const xM = rowOffsetX - rowWidth / 2 + 0.45 + vane * ((rowWidth - 0.9) / Math.max(1, vaneCount - 1));
        const localPanel = localPanelAt(row, xM);
        const turbulenceRatio = localPanel.turbulencePercent / 100;
        const pressureKpa = dynamicPressureKpa * normalPressureFactor * 1.15
          * gustFactorAt(turbulenceRatio) * edgeFactorAt(xM, config.vaneLengthM);
        const projectedAreaM2 = 0.72 * config.vaneLengthM;
        const forceKn = pressureKpa * projectedAreaM2;
        const excitationFrequencyHz = 0.16 * normalSpeed / 0.72;
        const responseGain = harmonicResponseGain(excitationFrequencyHz, 5.5, 1.5);
        elements.push({
          row,
          element: vane + 1,
          xM,
          projectedAreaM2,
          pressureKpa,
          forceKn,
          attachmentLoadKn: forceKn,
          overturningMomentKnM: forceKn * 0.36,
          excitationFrequencyHz,
          vibrationIndex: deviceVibrationIndex(pressureKpa, dynamicPressureKpa, turbulenceRatio, responseGain),
        });
      }
    }
    return summarizeMitigationRows(
      "vanes",
      "vane",
      "Crosswind drag on each under-panel vane; the value is its total attachment-line demand. Vibration assumes 5.5 Hz and 1.5% damping.",
      elements,
    );
  }

  if (config.mitigation === "spoilers") {
    const styleSolidity = { perforated: 0.62, continuous: 1, tabs: 0.42 }[config.spoilerStyle];
    const dragCoefficient = 0.25 + 1.05 * Math.pow(styleSolidity, 0.8);
    const angleRad = config.spoilerAngleDeg * RAD;
    const normalRatio = clamp(Math.abs(flow.z * Math.cos(angleRad)) + Math.abs(Math.sin(angleRad)) * 0.25, 0, 1);
    const normalSpeed = speedMs * normalRatio;
    const normalPressureFactor = 0.06 + 0.94 * normalRatio * normalRatio;
    for (let row = 1; row <= geometry.rows.length; row += 1) {
      if (!rowIsInRange(row, config.spoilerStartRow, config.spoilerEndRow, geometry.rows.length)) continue;
      const rowConfig = geometry.rows[row - 1];
      const rowOffsetX = getRowOffsetX(row, geometry);
      for (let column = 0; column < rowConfig.columns; column += 1) {
        const xM = rowOffsetX + (column - (rowConfig.columns - 1) / 2) * metrics.modulePitchM;
        const localPanel = localPanelAt(row, xM);
        const turbulenceRatio = localPanel.turbulencePercent / 100;
        const pressureKpa = dynamicPressureKpa * normalPressureFactor * dragCoefficient
          * gustFactorAt(turbulenceRatio) * edgeFactorAt(xM, config.spoilerHeightM * 5);
        const projectedAreaM2 = metrics.modulePitchM * config.spoilerHeightM * styleSolidity;
        const forceKn = pressureKpa * projectedAreaM2;
        const excitationFrequencyHz = 0.16 * normalSpeed / Math.max(0.08, config.spoilerHeightM);
        const responseGain = harmonicResponseGain(excitationFrequencyHz, 7, 1.5);
        elements.push({
          row,
          element: column + 1,
          xM,
          projectedAreaM2,
          pressureKpa,
          forceKn,
          attachmentLoadKn: forceKn / 2,
          overturningMomentKnM: forceKn * config.spoilerHeightM / 4,
          excitationFrequencyHz,
          vibrationIndex: deviceVibrationIndex(pressureKpa, dynamicPressureKpa, turbulenceRatio, responseGain),
        });
      }
    }
    return summarizeMitigationRows(
      "spoilers",
      "deflector bay",
      "Drag on each module-width deflector bay; two edge attachments share each bay load. Vibration assumes 7 Hz and 1.5% damping.",
      elements,
    );
  }

  for (let row = 1; row <= geometry.rows.length; row += 1) {
    if (!rowIsInRange(row, config.damperStartRow, config.damperEndRow, geometry.rows.length)) continue;
    const rowWidth = getRowWidth(row, geometry);
    const rowOffsetX = getRowOffsetX(row, geometry);
    const dampersPerRail = Math.max(2, Math.ceil(rowWidth / config.damperSpacingM) + 1);
    const tributaryWidthM = rowWidth / Math.max(1, dampersPerRail - 1);
    for (let rail = 0; rail < 4; rail += 1) {
      for (let damper = 0; damper < dampersPerRail; damper += 1) {
        const xM = rowOffsetX - rowWidth / 2 + damper * (rowWidth / Math.max(1, dampersPerRail - 1));
        const localPanel = localPanelAt(row, xM);
        const projectedAreaM2 = tributaryWidthM * metrics.tableChordM / 4;
        const forceKn = localPanel.peakUpliftKpa * projectedAreaM2;
        elements.push({
          row,
          element: rail * dampersPerRail + damper + 1,
          xM,
          projectedAreaM2,
          pressureKpa: localPanel.peakUpliftKpa,
          forceKn,
          attachmentLoadKn: forceKn,
          overturningMomentKnM: 0,
          excitationFrequencyHz: panelSheddingFrequencyHz,
          vibrationIndex: localPanel.vibrationIndex,
        });
      }
    }
  }
  return summarizeMitigationRows(
    "dampers",
    "damper joint",
    "Panel uplift transfers through each damper tributary area. The vibration value uses the fitted panel response and excludes direct pad drag.",
    elements,
  );
}

export function simulate(config: SimulationConfig): SimulationResult {
  const geometry = config.geometry;
  const metrics = getArrayMetrics(geometry);
  const modulePitchM = metrics.modulePitchM;
  const speedMs = config.windSpeedMph * 0.44704;
  const dynamicPressureKpa = (0.5 * 1.17 * speedMs * speedMs) / 1000;
  const flow = getFlowComponents(config.windBearing, geometry);
  const alignmentPercent = flow.crossRowAlignment * 100;
  const sheddingVelocity = speedMs * (0.38 + 0.62 * flow.crossRowAlignment);
  const sheddingFrequencyHz = (0.13 * sheddingVelocity) / geometry.panelLengthM;
  const frequencyRatio = sheddingFrequencyHz / Math.max(0.3, config.panelFrequencyHz);

  const wakeSources = geometry.rows.flatMap((rowConfig, rowIndex) => {
    const row = rowIndex + 1;
    const rowEffects = getLocalMitigationEffects(config, row);
    return Array.from({ length: rowConfig.columns }, (_, columnIndex) => {
      const xM = getRowOffsetX(row, geometry) + (columnIndex - (rowConfig.columns - 1) / 2) * modulePitchM;
      const zM = getRowCenterZ(row, geometry);
      const screenEffects = getScreenFlowEffects(config, xM, zM, flow);
      return { row, column: columnIndex + 1, xM, zM, wakeFactor: rowEffects.wakeSourceFactor * screenEffects.turbulenceFactor * screenEffects.speedFactor };
    });
  });

  const rows = geometry.rows.map((rowConfig, rowIndex): RowResult => {
    const row = rowIndex + 1;
    const rowEffects = getLocalMitigationEffects(config, row);
    const panels = Array.from({ length: rowConfig.columns * rowConfig.panelsDeep }, (_, panelIndex): PanelResult => {
      const coordinates = getPanelCoordinates(row, panelIndex + 1, geometry);
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
        const wakeHalfWidth = modulePitchM * 0.58 + downstreamDistance * 0.11;
        const lateralWeight = Math.exp(-0.5 * Math.pow(lateralDistance / wakeHalfWidth, 2));
        const distanceDecay = Math.exp(-downstreamDistance / (geometry.rowSpacingM * 3.6));
        const nearFieldBuild = 1 - Math.exp(-downstreamDistance / 1.2);
        const orientationFactor = 0.34 + 0.66 * flow.crossRowAlignment;
        const wakeStrength = orientationFactor * lateralWeight * distanceDecay * nearFieldBuild * source.wakeFactor;
        wakeEnergy += wakeStrength * wakeStrength;
        if (wakeStrength > 0.12) contributingRows.add(source.row);
      }
      const wakeAmplitude = Math.sqrt(wakeEnergy);
      const wakeBuild = clamp(1 - Math.exp(-0.34 * wakeAmplitude), 0, 0.94);
      const upwindColumnDistance = (flow.x >= 0 ? columnIndex : rowConfig.columns - 1 - columnIndex) * modulePitchM;
      const upwindDepthDistance = (flow.z >= 0 ? depthIndex : rowConfig.panelsDeep - 1 - depthIndex) * (geometry.panelLengthM + geometry.panelGapM);
      const lateralEdgeExposure = Math.abs(flow.x) * Math.exp(-upwindColumnDistance / Math.max(1.2, modulePitchM * 2.8));
      const crossRowEdgeExposure = Math.abs(flow.z) * Math.exp(-upwindDepthDistance / Math.max(1.2, geometry.panelLengthM));
      const edgeExposure = clamp(0.72 * lateralEdgeExposure + 0.42 * crossRowEdgeExposure, 0, 1);
      const screenEffects = getScreenFlowEffects(config, coordinates.xM, coordinates.zM, flow);
      const localTi = clamp((config.ambientTurbulence / 100 + wakeBuild * 0.215 + edgeExposure * 0.045) * rowEffects.turbulenceFactor * screenEffects.turbulenceFactor, 0.035, 0.42);
      const dampingRatio = (config.dampingPercent + rowEffects.dampingBoost) / 100;
      const rawDynamicFactor = 1 / Math.sqrt(Math.pow(1 - frequencyRatio * frequencyRatio, 2) + Math.pow(2 * dampingRatio * frequencyRatio, 2));
      const dynamicFactor = clamp(rawDynamicFactor, 0.45, 8);
      const resonanceWeight = clamp((dynamicFactor - 0.45) / 4.6, 0.12, 1.45);
      const shelter = 1 - 0.11 * wakeBuild;
      const undersideCoefficient = 0.49 + 0.38 * Math.max(0, flow.z);
      const pressureFactor = rowEffects.pressureFactor * screenEffects.pressureFactor;
      const meanUpliftKpa = dynamicPressureKpa * undersideCoefficient * shelter * pressureFactor;
      const peakUpliftKpa = dynamicPressureKpa * (undersideCoefficient * shelter + edgeExposure * 0.21 + 2.45 * localTi) * pressureFactor;
      const vibrationIndex = clamp(100 * (dynamicPressureKpa / 0.95) * (localTi / 0.3) * resonanceWeight * (0.74 + 0.26 * wakeBuild), 0, 100);
      return { ...coordinates, contributingWakeRows: contributingRows.size, turbulencePercent: localTi * 100, meanUpliftKpa, peakUpliftKpa, vibrationIndex, dynamicFactor };
    });
    const peakPanel = panels.reduce((current, panel) => panel.peakUpliftKpa > current.peakUpliftKpa ? panel : current);
    return {
      row,
      position: row === 1 ? "FRONT" : row === geometry.rows.length ? "REAR" : "MID",
      wakeRows: Math.max(...panels.map((panel) => panel.contributingWakeRows)),
      turbulencePercent: Math.max(...panels.map((panel) => panel.turbulencePercent)),
      meanUpliftKpa: panels.reduce((total, panel) => total + panel.meanUpliftKpa, 0) / panels.length,
      peakUpliftKpa: peakPanel.peakUpliftKpa,
      vibrationIndex: Math.max(...panels.map((panel) => panel.vibrationIndex)),
      dynamicFactor: Math.max(...panels.map((panel) => panel.dynamicFactor)),
      peakColumn: peakPanel.column,
      panels,
    };
  });
  const peak = rows.flatMap((row) => row.panels).reduce((current, panel) => panel.peakUpliftKpa > current.peakUpliftKpa ? panel : current);
  const vibration = rows.reduce((current, row) => Math.max(current, row.vibrationIndex), 0);
  const front = rows[0].peakUpliftKpa;
  const rear = rows[rows.length - 1].peakUpliftKpa;
  const mitigationLoad = simulateMitigationLoads(config, rows, dynamicPressureKpa, speedMs, flow, sheddingFrequencyHz);
  return { dynamicPressureKpa, sheddingFrequencyHz, peakUpliftKpa: peak.peakUpliftKpa, peakRow: peak.row, peakColumn: peak.column, peakModule: peak.module, vibrationIndex: vibration, frontRearRatio: rear > 0 ? front / rear : 1, alignmentPercent, rows, mitigationLoad };
}

export function riskColor(value: number, max = 100) {
  const t = clamp(value / Math.max(max, 0.001), 0, 1);
  if (t < 0.45) return "#69d9ff";
  if (t < 0.7) return "#e9ef72";
  if (t < 0.88) return "#ffab5d";
  return "#ff5f62";
}
