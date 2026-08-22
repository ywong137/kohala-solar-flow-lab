export type ArrayRowConfig = {
  columns: number;
  panelsDeep: number;
  offsetXM: number;
};

export type ArrayGeometryConfig = {
  version: 1;
  rows: ArrayRowConfig[];
  rowSpacingM: number;
  panelWidthM: number;
  panelLengthM: number;
  panelThicknessM: number;
  panelGapM: number;
  tiltDeg: number;
  lowEdgeClearanceM: number;
  rackSupportsFullRow: number;
  screenRowOffsetM: number;
  arrayAxisBearing: number;
  maukaBearing: number;
  naturalFrequencyHz: number;
  structuralDampingPercent: number;
};

export const ARRAY_CONFIG_STORAGE_KEY = "kohala-array-configuration-v2";

const DEFAULT_ROW_OFFSETS_M = [4.019, -3.1, -1.55, 0, 1.55, 3.1, 10.219];
const DEFAULT_ROW_COLUMNS = [14, 28, 28, 28, 28, 28, 14];

export const DEFAULT_ARRAY_CONFIG: ArrayGeometryConfig = {
  version: 1,
  rows: DEFAULT_ROW_COLUMNS.map((columns, index) => ({
    columns,
    panelsDeep: 2,
    offsetXM: DEFAULT_ROW_OFFSETS_M[index],
  })),
  rowSpacingM: 6.45,
  panelWidthM: 0.992,
  panelLengthM: 1.956,
  panelThicknessM: 0.04,
  panelGapM: 0.025,
  tiltDeg: 20.1,
  lowEdgeClearanceM: 0.48,
  rackSupportsFullRow: 7,
  screenRowOffsetM: 3.225,
  arrayAxisBearing: 130,
  maukaBearing: 40,
  naturalFrequencyHz: 2.9,
  structuralDampingPercent: 1.1,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function cloneArrayConfig(config: ArrayGeometryConfig = DEFAULT_ARRAY_CONFIG) {
  return {
    ...config,
    rows: config.rows.map((row) => ({ ...row })),
  };
}

export function sanitizeArrayConfig(value: unknown): ArrayGeometryConfig {
  const candidate = value && typeof value === "object" ? value as Partial<ArrayGeometryConfig> : {};
  const sourceRows = Array.isArray(candidate.rows) && candidate.rows.length
    ? candidate.rows.slice(0, 12)
    : DEFAULT_ARRAY_CONFIG.rows;
  const rows = sourceRows.map((row, index) => {
    const fallback = DEFAULT_ARRAY_CONFIG.rows[index] ?? {
      columns: 28,
      panelsDeep: 2,
      offsetXM: index * 1.55,
    };
    return {
      columns: Math.round(clamp(Number(row?.columns), 1, 60)) || fallback.columns,
      panelsDeep: Math.round(clamp(Number(row?.panelsDeep), 1, 4)) || fallback.panelsDeep,
      offsetXM: Number.isFinite(Number(row?.offsetXM))
        ? clamp(Number(row?.offsetXM), -30, 30)
        : fallback.offsetXM,
    };
  });

  const numberOr = (key: keyof ArrayGeometryConfig, fallback: number, min: number, max: number) => {
    const raw = Number(candidate[key]);
    return Number.isFinite(raw) ? clamp(raw, min, max) : fallback;
  };

  return {
    version: 1,
    rows,
    rowSpacingM: numberOr("rowSpacingM", DEFAULT_ARRAY_CONFIG.rowSpacingM, 3, 15),
    panelWidthM: numberOr("panelWidthM", DEFAULT_ARRAY_CONFIG.panelWidthM, 0.5, 2.5),
    panelLengthM: numberOr("panelLengthM", DEFAULT_ARRAY_CONFIG.panelLengthM, 0.8, 3.5),
    panelThicknessM: numberOr("panelThicknessM", DEFAULT_ARRAY_CONFIG.panelThicknessM, 0.015, 0.12),
    panelGapM: numberOr("panelGapM", DEFAULT_ARRAY_CONFIG.panelGapM, 0, 0.2),
    tiltDeg: numberOr("tiltDeg", DEFAULT_ARRAY_CONFIG.tiltDeg, 0, 50),
    lowEdgeClearanceM: numberOr("lowEdgeClearanceM", DEFAULT_ARRAY_CONFIG.lowEdgeClearanceM, 0.1, 3),
    rackSupportsFullRow: Math.round(numberOr("rackSupportsFullRow", DEFAULT_ARRAY_CONFIG.rackSupportsFullRow, 2, 20)),
    screenRowOffsetM: numberOr("screenRowOffsetM", DEFAULT_ARRAY_CONFIG.screenRowOffsetM, 0.5, 10),
    arrayAxisBearing: numberOr("arrayAxisBearing", DEFAULT_ARRAY_CONFIG.arrayAxisBearing, 0, 359),
    maukaBearing: numberOr("maukaBearing", DEFAULT_ARRAY_CONFIG.maukaBearing, 0, 359),
    naturalFrequencyHz: numberOr("naturalFrequencyHz", DEFAULT_ARRAY_CONFIG.naturalFrequencyHz, 0.3, 15),
    structuralDampingPercent: numberOr("structuralDampingPercent", DEFAULT_ARRAY_CONFIG.structuralDampingPercent, 0.1, 20),
  };
}

export function loadArrayConfig() {
  if (typeof window === "undefined") return cloneArrayConfig();
  const stored = window.localStorage.getItem(ARRAY_CONFIG_STORAGE_KEY);
  if (!stored) {
    const defaults = cloneArrayConfig();
    window.localStorage.setItem(ARRAY_CONFIG_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
  try {
    return sanitizeArrayConfig(JSON.parse(stored));
  } catch {
    return cloneArrayConfig();
  }
}

export function saveArrayConfig(config: ArrayGeometryConfig) {
  const sanitized = sanitizeArrayConfig(config);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ARRAY_CONFIG_STORAGE_KEY, JSON.stringify(sanitized));
  }
  return sanitized;
}

export function resetArrayConfig() {
  return saveArrayConfig(cloneArrayConfig());
}

export function getArrayMetrics(config: ArrayGeometryConfig) {
  const modulePitchM = config.panelWidthM + config.panelGapM;
  const tableChordM = Math.max(...config.rows.map((row) => row.panelsDeep)) * config.panelLengthM
    + (Math.max(...config.rows.map((row) => row.panelsDeep)) - 1) * config.panelGapM;
  const highEdgeClearanceM = config.lowEdgeClearanceM
    + Math.sin((config.tiltDeg * Math.PI) / 180) * tableChordM;
  const panelCounts = config.rows.map((row) => row.columns * row.panelsDeep);
  return {
    rowCount: config.rows.length,
    modulePitchM,
    tableChordM,
    highEdgeClearanceM,
    panelCounts,
    totalPanelCount: panelCounts.reduce((sum, count) => sum + count, 0),
  };
}
