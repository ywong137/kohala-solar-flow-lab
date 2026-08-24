"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  BarChart3,
  Camera,
  ChevronDown,
  CircleGauge,
  Eye,
  Gauge,
  Grid3X3,
  Info,
  Layers3,
  MapPin,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  X,
} from "lucide-react";
import { WindScene, type ArrayState } from "./WindScene";
import {
  DEFAULT_ARRAY_CONFIG,
  getArrayMetrics,
  loadArrayConfig,
  type ArrayGeometryConfig,
} from "../lib/array-config";
import {
  MITIGATION_BASE_COLOR,
  MITIGATIONS,
  SCENARIOS,
  cardinalDirection,
  getPanelResult,
  getPanelVisualMotion,
  getSoutheastEdgeLine,
  pressureColor,
  pressureDemandLabel,
  riskColor,
  simulate,
  type MitigationId,
  type MitigationConceptId,
  type MitigationLoadResult,
  type ScenarioId,
  type SimulationConfig,
  type SimulationResult,
  type SpoilerStyle,
  type ViewMode,
} from "../lib/physics";

const mitigationOrder: MitigationId[] = ["none", "screen", "vanes", "spoilers", "dampers"];
const mitigationConceptOrder: MitigationConceptId[] = ["screen", "vanes", "spoilers", "dampers"];

const mitigationIcons: Record<MitigationId, typeof Shield> = {
  none: Grid3X3,
  screen: Shield,
  vanes: Layers3,
  spoilers: Sparkles,
  dampers: Activity,
};

export function WindLab() {
  const [geometry, setGeometry] = useState<ArrayGeometryConfig>(DEFAULT_ARRAY_CONFIG);
  const [scenario, setScenario] = useState<ScenarioId>("storm");
  const [windSpeedMph, setWindSpeedMph] = useState<number>(SCENARIOS.storm.windSpeedMph);
  const [windBearing, setWindBearing] = useState<number>(SCENARIOS.storm.windBearing);
  const [ambientTurbulence, setAmbientTurbulence] = useState<number>(SCENARIOS.storm.ambientTurbulence);
  const [panelFrequencyHz, setPanelFrequencyHz] = useState(DEFAULT_ARRAY_CONFIG.naturalFrequencyHz);
  const [dampingPercent, setDampingPercent] = useState(DEFAULT_ARRAY_CONFIG.structuralDampingPercent);
  const [activeMitigations, setActiveMitigations] = useState<MitigationConceptId[]>([]);
  const [screenPorosity, setScreenPorosity] = useState(40);
  const [screenHeightM, setScreenHeightM] = useState(2.2);
  const [screenStartRow, setScreenStartRow] = useState(7);
  const [screenEndRow, setScreenEndRow] = useState(7);
  const [vaneLengthM, setVaneLengthM] = useState(Number(getArrayMetrics(DEFAULT_ARRAY_CONFIG).tableChordM.toFixed(2)));
  const [vaneStartRow, setVaneStartRow] = useState(1);
  const [vaneEndRow, setVaneEndRow] = useState(3);
  const [spoilerStyle, setSpoilerStyle] = useState<SpoilerStyle>("perforated");
  const [spoilerHeightM, setSpoilerHeightM] = useState(0.3);
  const [spoilerAngleDeg, setSpoilerAngleDeg] = useState(20);
  const [spoilerStartRow, setSpoilerStartRow] = useState(1);
  const [spoilerEndRow, setSpoilerEndRow] = useState(2);
  const [damperSpacingM, setDamperSpacingM] = useState(2);
  const [damperDampingPercent, setDamperDampingPercent] = useState(5.5);
  const [damperStartRow, setDamperStartRow] = useState(1);
  const [damperEndRow, setDamperEndRow] = useState(2);
  const [colorCodeMitigations, setColorCodeMitigations] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("flow");
  const [playing, setPlaying] = useState(true);
  const [showSceneLabels, setShowSceneLabels] = useState(true);
  const [arrayState, setArrayState] = useState<ArrayState>("restored");
  const [cameraView, setCameraView] = useState<"perspective" | "mauka" | "makai" | "plan">("perspective");
  const [cameraRequest, setCameraRequest] = useState(0);
  const [selectedPanel, setSelectedPanel] = useState({ row: 2, module: 1 });
  const [showComparison, setShowComparison] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const windAudio = useWindAudio(windSpeedMph, ambientTurbulence, playing);
  const geometryMetrics = useMemo(() => getArrayMetrics(geometry), [geometry]);
  const southeastEdge = useMemo(() => getSoutheastEdgeLine(geometry), [geometry]);
  const rowCount = geometryMetrics.rowCount;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadArrayConfig();
      const savedMetrics = getArrayMetrics(saved);
      setGeometry(saved);
      setPanelFrequencyHz(saved.naturalFrequencyHz);
      setDampingPercent(saved.structuralDampingPercent);
      setVaneLengthM(Number(savedMetrics.tableChordM.toFixed(2)));
      setScreenStartRow(savedMetrics.rowCount);
      setScreenEndRow(savedMetrics.rowCount);
      setVaneEndRow((value) => Math.min(value, savedMetrics.rowCount));
      setSpoilerEndRow((value) => Math.min(value, savedMetrics.rowCount));
      setDamperEndRow((value) => Math.min(value, savedMetrics.rowCount));
      setSelectedPanel((value) => ({ row: Math.min(value.row, savedMetrics.rowCount), module: value.module }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const config: SimulationConfig = useMemo(
    () => ({
      geometry,
      windSpeedMph,
      windBearing,
      ambientTurbulence,
      panelFrequencyHz,
      dampingPercent,
      activeMitigations,
      screenPorosity,
      screenHeightM,
      screenStartRow,
      screenEndRow,
      vaneLengthM,
      vaneStartRow,
      vaneEndRow,
      spoilerStyle,
      spoilerHeightM,
      spoilerAngleDeg,
      spoilerStartRow,
      spoilerEndRow,
      damperSpacingM,
      damperDampingPercent,
      damperStartRow,
      damperEndRow,
    }),
    [
      geometry,
      windSpeedMph,
      windBearing,
      ambientTurbulence,
      panelFrequencyHz,
      dampingPercent,
      activeMitigations,
      screenPorosity,
      screenHeightM,
      screenStartRow,
      screenEndRow,
      vaneLengthM,
      vaneStartRow,
      vaneEndRow,
      spoilerStyle,
      spoilerHeightM,
      spoilerAngleDeg,
      spoilerStartRow,
      spoilerEndRow,
      damperSpacingM,
      damperDampingPercent,
      damperStartRow,
      damperEndRow,
    ],
  );
  const result = useMemo(() => simulate(config), [config]);
  const selectedResult = getPanelResult(result, selectedPanel.row, selectedPanel.module);
  const selectedVisualMotion = getPanelVisualMotion(selectedResult.vibrationIndex, geometry);
  const peakMitigationPressureKpa = result.mitigationLoads.length > 0
    ? Math.max(...result.mitigationLoads.map((load) => load.peakPressureKpa))
    : 0;
  const peakMitigationVibration = result.mitigationLoads.length > 0
    ? Math.max(...result.mitigationLoads.map((load) => load.peakVibrationIndex))
    : 0;
  const baselineResult = useMemo(() => simulate({ ...config, activeMitigations: [] }), [config]);
  const comparisons = useMemo(
    () => mitigationOrder.map((id) => ({
      id,
      result: simulate({ ...config, activeMitigations: id === "none" ? [] : [id] }),
    })),
    [config],
  );

  const toggleMitigation = (concept: MitigationConceptId) => {
    setActiveMitigations((current) => current.includes(concept)
      ? current.filter((item) => item !== concept)
      : mitigationConceptOrder.filter((item) => current.includes(item) || item === concept));
  };

  const applyScenario = (id: ScenarioId) => {
    const next = SCENARIOS[id];
    setScenario(id);
    setWindSpeedMph(next.windSpeedMph);
    setWindBearing(next.windBearing);
    setAmbientTurbulence(next.ambientTurbulence);
  };

  const setCamera = (view: typeof cameraView) => {
    setCameraView(view);
    setCameraRequest((request) => request + 1);
  };

  const resetModel = () => {
    applyScenario("storm");
    setPanelFrequencyHz(geometry.naturalFrequencyHz);
    setDampingPercent(geometry.structuralDampingPercent);
    setActiveMitigations([]);
    setScreenPorosity(40);
    setScreenHeightM(2.2);
    setScreenStartRow(rowCount);
    setScreenEndRow(rowCount);
    setVaneLengthM(Number(geometryMetrics.tableChordM.toFixed(2)));
    setVaneStartRow(1);
    setVaneEndRow(Math.min(3, rowCount));
    setSpoilerStyle("perforated");
    setSpoilerHeightM(0.3);
    setSpoilerAngleDeg(20);
    setSpoilerStartRow(1);
    setSpoilerEndRow(Math.min(2, rowCount));
    setDamperSpacingM(2);
    setDamperDampingPercent(5.5);
    setDamperStartRow(1);
    setDamperEndRow(Math.min(2, rowCount));
    setColorCodeMitigations(true);
    setArrayState("restored");
    setViewMode("flow");
    setCamera("perspective");
  };

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="brand-title">KOHALA FLOW LAB</div>
            <div className="brand-subtitle">SOLAR ARRAY WIND ANALYSIS · SITE 01</div>
          </div>
        </div>

        <div className="site-chip">
          <MapPin size={14} />
          <span>North Kohala, Hawaiʻi</span>
          <span className="site-chip-divider" />
          <strong>ARRAY A</strong>
        </div>

        <div className="header-actions">
          <Link className="quiet-button" href="/configuration">
            <Wrench size={15} />
            Array configuration
          </Link>
          <button className="quiet-button" onClick={() => setShowEvidence(true)}>
            <Camera size={15} />
            Site evidence
          </button>
          <div className="model-status">
            <span className="status-dot" />
            <span>MODEL READY</span>
          </div>
        </div>
      </header>

      <section className="workspace">
        <section className="viewer-card">
          <div className="viewer-toolbar">
            <div className="mode-switch" role="group" aria-label="Visualization mode">
              {([
                ["flow", Wind, "Flow field"],
                ["pressure", Gauge, "Pressure"],
                ["vibration", Activity, "Vibration"],
              ] as const).map(([id, Icon, label]) => (
                <button
                  className={viewMode === id ? "active" : ""}
                  key={id}
                  onClick={() => setViewMode(id)}
                  aria-pressed={viewMode === id}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>

            <div className="camera-switch" role="group" aria-label="Camera view">
              {([
                ["perspective", "3D"],
                ["mauka", "Mauka"],
                ["makai", "Makai"],
                ["plan", "Plan"],
              ] as const).map(([id, label]) => (
                <button
                  className={cameraView === id ? "active" : ""}
                  key={id}
                  onClick={() => setCamera(id)}
                >
                  {id === "perspective" ? <Maximize2 size={14} /> : null}
                  {label}
                </button>
              ))}
              <button
                className={`icon-button ${showSceneLabels ? "active" : ""}`}
                type="button"
                onClick={() => setShowSceneLabels((value) => !value)}
                aria-label={showSceneLabels ? "Hide floating labels" : "Show floating labels"}
                aria-pressed={showSceneLabels}
                title={showSceneLabels ? "Hide floating labels" : "Show floating labels"}
              >
                <Tag size={14} />
              </button>
              <button className="icon-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause airflow" : "Play airflow"}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                className={`icon-button wind-sound-button ${windAudio.muted ? "" : "active"}`}
                onClick={windAudio.toggle}
                aria-label={windAudio.muted ? "Enable wind sound" : "Mute wind sound"}
                title={windAudio.muted ? "Enable wind sound" : "Mute wind sound"}
              >
                {windAudio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </div>

          <WindScene
            config={config}
            result={result}
            viewMode={viewMode}
            playing={playing}
            arrayState={arrayState}
            showSceneLabels={showSceneLabels}
            cameraView={cameraView}
            cameraRequest={cameraRequest}
            selectedPanel={selectedPanel}
            colorCodeMitigations={colorCodeMitigations}
            onSelectPanel={setSelectedPanel}
          />

          {activeMitigations.length > 0 ? (
            <div
              className="mitigation-visual-key"
              style={{ "--concept-accent": MITIGATION_BASE_COLOR } as React.CSSProperties}
            >
              <i />
              <span>
                <strong>{activeMitigations.length === 1 ? MITIGATIONS[activeMitigations[0]].label : `${activeMitigations.length} active mitigations`}</strong>
                {colorCodeMitigations && viewMode === "pressure"
                  ? `Element colors · ${peakMitigationPressureKpa.toFixed(2)} kPa highest device peak`
                  : colorCodeMitigations && viewMode === "vibration"
                    ? `Element colors + motion · ${peakMitigationVibration.toFixed(0)} / 100 highest device peak`
                    : "Bright magenta geometry in the model"}
              </span>
            </div>
          ) : null}

          {viewMode === "pressure" ? (
            <div className={`pressure-visual-key ${activeMitigations.length > 0 ? "with-mitigation" : ""}`}>
              <div className="pressure-key-heading">
                <strong>Peak uplift · absolute scale</strong>
                <span>{pressureDemandLabel(result.peakUpliftKpa)} demand</span>
              </div>
              <div className="pressure-key-gradient" aria-hidden="true" />
              <div className="pressure-key-ticks" aria-label="Pressure color scale in kilopascals">
                <span>0</span><span>0.2</span><span>0.6</span><span>1.0</span><span>1.4+ kPa</span>
              </div>
              <small className="pressure-key-meaning">Blue low · Green moderate · Yellow elevated · Orange high · Red severe</small>
            </div>
          ) : null}

          <div className="wind-compass-card">
            <div className="mini-compass" aria-hidden="true">
              <span className="north-mark">N</span>
              <div className="compass-ring" />
              <ArrowDownRight
                size={28}
                style={{ transform: `rotate(${windBearing - 45}deg)` }}
              />
            </div>
            <div>
              <span className="metric-label">WIND FROM</span>
              <strong>{cardinalDirection(windBearing)} · {windBearing}°</strong>
              <small>{Math.abs(windBearing - geometry.maukaBearing) < 2 ? "Mauka → front" : "Custom bearing"}</small>
            </div>
          </div>

          <label className="array-state-select">
            <Eye size={15} />
            <span>Site condition</span>
            <select value={arrayState} onChange={(event) => setArrayState(event.target.value as ArrayState)}>
              <option value="repaired">Post-storm cleanup</option>
              <option value="restored">Fully restored array</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>

          <div className="metrics-rack">
            <Metric
              label="Peak uplift"
              value={result.peakUpliftKpa.toFixed(2)}
              unit="kPa"
              note={`${pressureDemandLabel(result.peakUpliftKpa)} · Row ${result.peakRow} · Col ${result.peakColumn}`}
              color={pressureColor(result.peakUpliftKpa)}
            />
            <Metric
              label="Front / rear"
              value={result.frontRearRatio.toFixed(2)}
              unit="×"
              note="Row 1 / Row 7"
              color={riskColor(result.frontRearRatio, 1.7)}
            />
            <Metric
              label="Vibration index"
              value={Math.round(result.vibrationIndex).toString()}
              unit="/100"
              note={`${result.sheddingFrequencyHz.toFixed(2)} Hz wake`}
              color={riskColor(result.vibrationIndex)}
            />
            <Metric
              label="Dynamic pressure"
              value={result.dynamicPressureKpa.toFixed(2)}
              unit="kPa"
              note={`${windSpeedMph} mph gust`}
              color="#8fe6ff"
            />
          </div>
        </section>

        <aside className="control-rail">
          <div className="rail-heading">
            <div>
              <span className="eyebrow">TEST CONFIGURATION</span>
              <h1>Wind scenario</h1>
            </div>
            <button className="icon-button" onClick={resetModel} aria-label="Reset model" title="Reset model">
              <RotateCcw size={15} />
            </button>
          </div>

          <label className="select-field">
            <span>Weather pattern</span>
            <div>
              <select
                value={scenario}
                onChange={(event) => applyScenario(event.target.value as ScenarioId)}
              >
                {Object.entries(SCENARIOS).map(([id, preset]) => (
                  <option value={id} key={id}>{preset.label} · {preset.note}</option>
                ))}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </div>
          </label>

          <ControlSlider
            label="Wind speed"
            value={windSpeedMph}
            min={10}
            max={150}
            step={1}
            unit="mph"
            onChange={setWindSpeedMph}
            accent="#7df0c5"
            markers={[{ value: SCENARIOS[scenario].windSpeedMph, label: `${SCENARIOS[scenario].label}: ${SCENARIOS[scenario].windSpeedMph} mph`, key: scenario, style: "tick" }]}
          />
          <ControlSlider
            label="Wind bearing"
            value={windBearing}
            min={0}
            max={359}
            step={1}
            unit={`° ${cardinalDirection(windBearing)}`}
            onChange={setWindBearing}
            accent="#8fe6ff"
            markers={[{ value: SCENARIOS[scenario].windBearing, label: `${SCENARIOS[scenario].label}: ${SCENARIOS[scenario].windBearing}°`, key: scenario }]}
            snapValue={SCENARIOS[scenario].windBearing}
            snapTolerance={4}
          />
          <ControlSlider
            label="Ambient turbulence"
            value={ambientTurbulence}
            min={4}
            max={35}
            step={1}
            unit="%"
            onChange={setAmbientTurbulence}
            accent="#e9ef72"
            markers={[{ value: SCENARIOS[scenario].ambientTurbulence, label: `${SCENARIOS[scenario].label}: ${SCENARIOS[scenario].ambientTurbulence}%`, key: scenario }]}
            snapValue={SCENARIOS[scenario].ambientTurbulence}
            snapTolerance={2}
          />

          <div className="section-rule" />

          <div className="section-heading">
            <div>
              <span className="eyebrow">FLOW CONTROL</span>
              <h2>Mitigation concept</h2>
            </div>
            <Shield size={17} />
          </div>
          <div className="mitigation-grid" role="group" aria-label="Active mitigation concepts">
            {mitigationOrder.map((id) => {
              const item = MITIGATIONS[id];
              const Icon = mitigationIcons[id];
              const active = id === "none"
                ? activeMitigations.length === 0
                : activeMitigations.includes(id);
              return (
                <button
                  className={active ? "active" : ""}
                  key={id}
                  onClick={() => id === "none" ? setActiveMitigations([]) : toggleMitigation(id)}
                  style={{ "--concept-accent": item.color } as React.CSSProperties}
                  aria-pressed={active}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  <small>{id === "none" ? item.short : `${active ? "ON" : "OFF"} · ${item.short}`}</small>
                </button>
              );
            })}
          </div>
          <p className="concept-note">
            {activeMitigations.length === 0
              ? MITIGATIONS.none.detail
              : `${activeMitigations.map((id) => MITIGATIONS[id].label).join(" + ")} operate together. Their modeled effects combine by panel and row.`}
          </p>

          <label className={`mitigation-color-toggle ${activeMitigations.length === 0 ? "disabled" : ""}`}>
            <span>
              <strong>Show color-coding on mitigation elements</strong>
              <small>
                {activeMitigations.length === 0
                  ? "Switch on a mitigation concept to view its element loads."
                  : viewMode === "flow"
                    ? "Pressure and vibration views use the panel heatmap scale."
                    : `Each physical element shows its own ${viewMode} demand.`}
              </small>
            </span>
            <input
              type="checkbox"
              checked={colorCodeMitigations}
              disabled={activeMitigations.length === 0}
              onChange={(event) => setColorCodeMitigations(event.target.checked)}
              aria-label="Show color-coding on mitigation elements"
            />
          </label>

          {activeMitigations.map((mitigation) => (
            <div
              key={mitigation}
              className="mitigation-tuning"
              style={{ "--concept-accent": MITIGATIONS[mitigation].color } as React.CSSProperties}
            >
              <div className="tuning-heading">
                <span><i /> {MITIGATIONS[mitigation].label} controls</span>
                <small>magenta model</small>
              </div>

              {mitigation === "screen" ? (
                <>
                  <ControlSlider
                    label="Screen porosity"
                    value={screenPorosity}
                    min={20}
                    max={80}
                    step={1}
                    unit="% open"
                    onChange={setScreenPorosity}
                    accent={MITIGATIONS.screen.color}
                    compact
                    markers={[{ value: 40, label: "Default: 40% open" }]}
                  />
                  <ControlSlider
                    label="Screen height"
                    value={screenHeightM}
                    min={0.8}
                    max={3.2}
                    step={0.1}
                    unit="m"
                    onChange={setScreenHeightM}
                    accent={MITIGATIONS.screen.color}
                    compact
                    markers={[{ value: 2.2, label: "Default: 2.2 m" }]}
                  />
                  <RowRangeSlider
                    label="Screen placement"
                    startRow={screenStartRow}
                    endRow={screenEndRow}
                    onStartChange={setScreenStartRow}
                    onEndChange={setScreenEndRow}
                    accent={MITIGATIONS.screen.color}
                    maxRow={rowCount}
                    defaultStart={rowCount}
                    defaultEnd={rowCount}
                  />
                  <p>
                    Each screen spans the full array width. Row {rowCount} is the rear mauka row.
                  </p>
                </>
              ) : null}

              {mitigation === "vanes" ? (
                <>
                  <ControlSlider
                    label="Vane length"
                    value={vaneLengthM}
                    min={0.5}
                    max={5.5}
                    step={0.05}
                    unit="m"
                    onChange={setVaneLengthM}
                    accent={MITIGATIONS.vanes.color}
                    compact
                    markers={[{ value: Number(geometryMetrics.tableChordM.toFixed(2)), label: `Default: rack chord ${geometryMetrics.tableChordM.toFixed(2)} m` }]}
                  />
                  <RowRangeSlider
                    label="Vane placement"
                    startRow={vaneStartRow}
                    endRow={vaneEndRow}
                    onStartChange={setVaneStartRow}
                    onEndChange={setVaneEndRow}
                    accent={MITIGATIONS.vanes.color}
                    maxRow={rowCount}
                    defaultStart={1}
                    defaultEnd={Math.min(3, rowCount)}
                  />
                  <p>
                    {vaneLengthM <= geometryMetrics.tableChordM
                      ? `${Math.round((vaneLengthM / geometryMetrics.tableChordM) * 100)}% of the ${geometryMetrics.tableChordM.toFixed(2)} m rack slope.`
                      : `${(vaneLengthM - geometryMetrics.tableChordM).toFixed(2)} m beyond the rack toward the row behind it.`}
                  </p>
                </>
              ) : null}

              {mitigation === "spoilers" ? (
                <>
                  <span className="option-label">Deflector form</span>
                  <div className="spoiler-options" role="group" aria-label="Front-edge deflector form">
                    {([
                      ["perforated", "Perforated"],
                      ["continuous", "Solid"],
                      ["tabs", "Tabs"],
                    ] as const).map(([id, label]) => (
                      <button
                        className={spoilerStyle === id ? "active" : ""}
                        key={id}
                        onClick={() => setSpoilerStyle(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <ControlSlider
                    label="Deflector height"
                    value={spoilerHeightM}
                    min={0.1}
                    max={0.7}
                    step={0.05}
                    unit="m"
                    onChange={setSpoilerHeightM}
                    accent={MITIGATIONS.spoilers.color}
                    compact
                    markers={[{ value: 0.3, label: "Default: 0.30 m" }]}
                  />
                  <ControlSlider
                    label="Deflector angle"
                    value={spoilerAngleDeg}
                    min={-30}
                    max={60}
                    step={5}
                    unit="°"
                    onChange={setSpoilerAngleDeg}
                    accent={MITIGATIONS.spoilers.color}
                    compact
                    markers={[{ value: 20, label: "Default: 20°" }]}
                  />
                  <RowRangeSlider
                    label="Deflector placement"
                    startRow={spoilerStartRow}
                    endRow={spoilerEndRow}
                    onStartChange={setSpoilerStartRow}
                    onEndChange={setSpoilerEndRow}
                    accent={MITIGATIONS.spoilers.color}
                    maxRow={rowCount}
                    defaultStart={1}
                    defaultEnd={Math.min(2, rowCount)}
                  />
                  <p>The device sits on the makai edge of each selected row.</p>
                </>
              ) : null}

              {mitigation === "dampers" ? (
                <>
                  <ControlSlider
                    label="Damper spacing"
                    value={damperSpacingM}
                    min={0.8}
                    max={4}
                    step={0.1}
                    unit="m"
                    onChange={setDamperSpacingM}
                    accent={MITIGATIONS.dampers.color}
                    compact
                    markers={[{ value: 2, label: "Default: 2.0 m" }]}
                  />
                  <ControlSlider
                    label="Added damping"
                    value={damperDampingPercent}
                    min={1}
                    max={10}
                    step={0.5}
                    unit="%"
                    onChange={setDamperDampingPercent}
                    accent={MITIGATIONS.dampers.color}
                    compact
                    markers={[{ value: 5.5, label: "Default: 5.5%" }]}
                  />
                  <RowRangeSlider
                    label="Damper placement"
                    startRow={damperStartRow}
                    endRow={damperEndRow}
                    onStartChange={setDamperStartRow}
                    onEndChange={setDamperEndRow}
                    accent={MITIGATIONS.dampers.color}
                    maxRow={rowCount}
                    defaultStart={1}
                    defaultEnd={Math.min(2, rowCount)}
                  />
                  <p>Magenta rings mark elastomer pads at rail-to-rack joints.</p>
                </>
              ) : null}
            </div>
          ))}

          {result.mitigationLoads.map((load) => (
            <DeviceLoadPanel
              key={load.concept}
              load={load}
              color={MITIGATIONS[load.concept].color}
            />
          ))}

          <button className="compare-button" onClick={() => setShowComparison(true)}>
            <BarChart3 size={16} />
            Compare concepts against baseline
            <span>{5 + (activeMitigations.length > 1 ? 1 : 0)}</span>
          </button>

          <details className="advanced-controls">
            <summary>
              <span><SlidersHorizontal size={15} /> Panel dynamics</span>
              <ChevronDown size={14} />
            </summary>
            <ControlSlider
              label="Natural frequency"
              value={panelFrequencyHz}
              min={0.5}
              max={8}
              step={0.1}
              unit="Hz"
              onChange={setPanelFrequencyHz}
              accent="#c2a8ff"
              compact
              markers={[{ value: geometry.naturalFrequencyHz, label: `Saved default: ${geometry.naturalFrequencyHz.toFixed(1)} Hz` }]}
            />
            <ControlSlider
              label="Structural damping"
              value={dampingPercent}
              min={0.5}
              max={12}
              step={0.5}
              unit="%"
              onChange={setDampingPercent}
              accent="#ffae6f"
              compact
              markers={[{ value: geometry.structuralDampingPercent, label: `Saved default: ${geometry.structuralDampingPercent.toFixed(1)}%` }]}
            />
            <p className="dynamics-warning"><strong>Research defaults, not site measurements.</strong> Field tests on a tracking PV rack found 2.9–5.0 Hz torsional modes and 1.07–2.99% damping. This model uses the conservative lower limits: 2.9 Hz and 1.1%.</p>
          </details>

          <div className="selected-panel-card">
            <div className="selected-panel-head">
              <div>
                <span className="eyebrow selection-eyebrow"><i /> ACTIVE SELECTION</span>
                <strong>
                  Row {selectedPanel.row} · Column {selectedResult.column} · Panel {selectedPanel.module}
                </strong>
              </div>
              <CircleGauge size={20} style={{ color: riskColor(selectedResult.vibrationIndex) }} />
            </div>
            <div className="selected-panel-key"><i /> Yellow outline and label in the 3D view</div>
            <div className="selected-values">
              <span><small>Peak</small><strong>{selectedResult.peakUpliftKpa.toFixed(2)} kPa</strong></span>
              <span><small>Turbulence</small><strong>{selectedResult.turbulencePercent.toFixed(0)}%</strong></span>
              <span><small>Vibration</small><strong>{selectedResult.vibrationIndex.toFixed(0)} / 100</strong></span>
            </div>
            <div className="selected-motion-value">
              <span>
                <small>Visual edge travel</small>
                <strong>{selectedVisualMotion.peakToPeakMm.toFixed(1)} mm peak-to-peak</strong>
              </span>
              <span>{selectedVisualMotion.panelLengthPercent.toFixed(2)}% of panel length</span>
            </div>
            <p className="selected-motion-note">Visual scale only. The vibration index is a load-response score, not measured displacement.</p>
          </div>

          <button className="assumption-link" onClick={() => setShowAssumptions(true)}>
            <Info size={14} />
            Model basis and assumptions
          </button>
        </aside>
      </section>

      <footer className="lab-footer">
        <span><span className="status-dot" /> SAVED ARRAY CONFIGURATION · PANEL FIELD</span>
        <span>JINKO 365 W · {geometry.panelLengthM.toFixed(3)} × {geometry.panelWidthM.toFixed(3)} m · {geometry.tiltDeg.toFixed(1)}° TILT</span>
        <span>{geometryMetrics.totalPanelCount} PANELS · {rowCount} ROWS · {geometry.rowSpacingM.toFixed(2)} m PITCH · EDITABLE GEOMETRY</span>
      </footer>

      {showComparison ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowComparison(false)}>
          <section className="modal comparison-modal" role="dialog" aria-modal="true" aria-label="Mitigation comparison" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">SCENARIO COMPARISON · {windSpeedMph} MPH FROM {cardinalDirection(windBearing)}</span>
                <h2>Each concept versus one baseline</h2>
                <p>Baseline removes all mitigation. Each concept row activates one concept alone. The current-combination row shows all selected concepts together.</p>
              </div>
              <button className="icon-button" onClick={() => setShowComparison(false)} aria-label="Close comparison"><X size={18} /></button>
            </div>
            <div className="comparison-constants">
              <span><small>Held constant</small><strong>{windSpeedMph} mph · {windBearing}° · {ambientTurbulence}% ambient turbulence</strong></span>
              <span><small>Saved geometry</small><strong>{geometryMetrics.totalPanelCount} panels · {rowCount} rows · {geometry.tiltDeg.toFixed(1)}° tilt</strong></span>
              <span><small>Dynamics</small><strong>{panelFrequencyHz.toFixed(1)} Hz · {dampingPercent.toFixed(1)}% damping</strong></span>
            </div>
            <div className="comparison-legend"><span>Concept and settings</span><span>Peak uplift</span><span>Panel vibration</span><span>Peak location</span><span>Added-device demand</span><span>Action</span></div>
            <div className="comparison-list">
              {comparisons.map(({ id, result: item }) => {
                const pressureDelta = 100 * (item.peakUpliftKpa / Math.max(baselineResult.peakUpliftKpa, 0.01) - 1);
                const vibrationDelta = 100 * (item.vibrationIndex / Math.max(baselineResult.vibrationIndex, 0.01) - 1);
                const itemLoad = item.mitigationLoads[0];
                const active = id === "none"
                  ? activeMitigations.length === 0
                  : activeMitigations.length === 1 && activeMitigations[0] === id;
                return (
                  <article key={id} className={active ? "active" : ""}>
                    <span className="comparison-name">
                      {MITIGATIONS[id].label}
                      <small>{getMitigationSummary(id, config)}</small>
                    </span>
                    <span className="comparison-value"><strong>{item.peakUpliftKpa.toFixed(2)} kPa</strong><small>{id === "none" ? "Baseline" : formatDelta(pressureDelta)}</small></span>
                    <span className="comparison-value"><strong>{item.vibrationIndex.toFixed(0)} / 100</strong><small>{id === "none" ? "Baseline" : formatDelta(vibrationDelta)}</small></span>
                    <span className="comparison-value"><strong>Row {item.peakRow} · Col {item.peakColumn}</strong><small>highest uplift panel</small></span>
                    <span className="comparison-value">
                      <strong>{itemLoad ? `${itemLoad.peakAttachmentLoadKn.toFixed(2)} kN` : "—"}</strong>
                      <small>{itemLoad ? `Row ${itemLoad.peakRow} · ${itemLoad.peakVibrationIndex.toFixed(0)} / 100 vibration` : "No added hardware"}</small>
                    </span>
                    <button type="button" onClick={() => { setActiveMitigations(id === "none" ? [] : [id]); setShowComparison(false); }}>{active ? "Active" : id === "none" ? "Use baseline" : "Use alone"}</button>
                  </article>
                );
              })}
              {activeMitigations.length > 1 ? (
                <ComparisonCombinationRow
                  result={result}
                  baseline={baselineResult}
                  activeMitigations={activeMitigations}
                />
              ) : null}
            </div>
            <div className="comparison-candidates">
              <strong>Other candidates to evaluate</strong>
              <span>Rack cross-bracing and shorter rail spans</span>
              <span>Positive-locking fasteners with a torque-inspection plan</span>
              <span>Edge-row reinforcement or a rebuild with a different tilt</span>
              <span>Pressure-equalization gaps, only after CFD and wind-tunnel checks</span>
            </div>
            <div className="modal-caution"><Info size={16} /> These are screening estimates. Use CFD, wind-tunnel work, and a structural modal test before construction.</div>
          </section>
        </div>
      ) : null}

      {showEvidence ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowEvidence(false)}>
          <section className="modal evidence-modal" role="dialog" aria-modal="true" aria-label="Site evidence" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">SOURCE IMAGERY</span>
                <h2>Geometry and failure evidence</h2>
                <p>The model uses the north-up satellite image and the post-storm cleanup image.</p>
              </div>
              <button className="icon-button" onClick={() => setShowEvidence(false)} aria-label="Close evidence"><X size={18} /></button>
            </div>
            <div className="evidence-grid">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/reference/satellite.png" alt="Satellite view of the facility and the large solar array" />
                <figcaption><strong>North-up site view</strong><span>{geometry.rowSpacingM.toFixed(2)} m row pitch · {southeastEdge.bearingDeg.toFixed(0)}° southeast endpoint line</span></figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/reference/post-storm.png" alt="Post-storm image showing the first two rows removed" />
                <figcaption><strong>Post-storm cleanup</strong><span>Rows 1–2 removed · intact modules consolidated into Rows 3–7</span></figcaption>
              </figure>
            </div>
          </section>
        </div>
      ) : null}

      {showAssumptions ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowAssumptions(false)}>
          <section className="modal assumptions-modal" role="dialog" aria-modal="true" aria-label="Model assumptions" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">MODEL BASIS · V0.8</span>
                <h2>What this model can test</h2>
              </div>
              <button className="icon-button" onClick={() => setShowAssumptions(false)} aria-label="Close assumptions"><X size={18} /></button>
            </div>
            <div className="assumption-grid">
              <article><span>01</span><h3>Saved geometry</h3><p>The configuration page controls panel counts, row offsets, spacing, panel dimensions, tilt, clearance, bearings, and rack assumptions.</p></article>
              <article><span>07</span><h3>Staggered row layout</h3><p>The rows use individual horizontal offsets. Row centers use a {geometry.rowSpacingM.toFixed(2)} m pitch.</p></article>
              <article><span>02</span><h3>Panel flow field</h3><p>The solver evaluates all {geometryMetrics.totalPanelCount} panels. It tracks angled wake overlap, exposed columns, row offset, screen shelter, and wake decay.</p></article>
              <article><span>03</span><h3>Local vibration</h3><p>Each panel uses its local turbulence, pressure, damping, and resonance response. The displayed travel follows the animation scale, not measured displacement.</p></article>
              <article><span>04</span><h3>Array totals</h3><p>The saved layout has {geometryMetrics.totalPanelCount} panels. It has {geometryMetrics.panelCounts.slice(2).reduce((sum, count) => sum + count, 0)} after Rows 1 and 2 are removed.</p></article>
              <article><span>05</span><h3>Estimated rack and site</h3><p>The rack uses a {geometryMetrics.tableChordM.toFixed(2)} m maximum slope and {geometry.lowEdgeClearanceM.toFixed(2)}–{geometryMetrics.highEdgeClearanceM.toFixed(2)} m clearance. The straight retaining wall follows the {southeastEdge.bearingDeg.toFixed(0)}° endpoint line at 3 m perpendicular clearance. Its top rises at the center.</p></article>
              <article><span>08</span><h3>Research-based dynamics</h3><p>The defaults use the low end of field tests on a tracking PV rack: 2.9 Hz torsional frequency and 1.1% damping. This fixed rack still needs a site modal test.</p></article>
              <article><span>09</span><h3>Added hardware demand</h3><p>The model resolves screen bays, vanes, deflector bays, and damper joints. It calculates pressure, force, attachment demand, overturning moment, and vibration response.</p></article>
              <article><span>10</span><h3>Device assumptions</h3><p>Loads use the <a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/" target="_blank" rel="noreferrer">NASA drag equation</a>, projected wind angle, local turbulence, and assumed device modes. Screen porosity follows the measured trend in the <a href="https://www.ars.usda.gov/ARSUserFiles/30200525/1095%20Windbreak%20drag%20as%20influenced%20by%20porosity.pdf" target="_blank" rel="noreferrer">USDA windbreak study</a>.</p></article>
              <article><span>11</span><h3>Terrain and wall flow</h3><p>The flow follows the rendered ground and clears the wall. Speed loss and turbulence depend on wall height, distance, and wind angle. The approximation follows <a href="https://wasp.dtu.dk/software/wasp-cfd/flow-model" target="_blank" rel="noreferrer">DTU terrain-flow methods</a> and <a href="https://publications.anl.gov/anlpubs/2021/05/167360.pdf" target="_blank" rel="noreferrer">Argonne wall-wake scaling</a>.</p></article>
              <article><span>12</span><h3>Absolute pressure colors</h3><p>Pressure colors use absolute peak uplift, not each scenario’s maximum. Blue is low demand. Green is moderate. Yellow is elevated. Orange is high. Red is severe. The scale uses 2.4 kPa as a provisional module reference from a similar <a href="https://jinkosolar.com.au/wp-content/uploads/2022/04/EaglePerc-JKM390-410M-72H-A1.1-EN.pdf" target="_blank" rel="noreferrer">Jinko Eagle PERC datasheet</a>. It does not establish rack, clamp, anchor, or fatigue capacity.</p></article>
              <article><span>13</span><h3>Combined mitigations</h3><p>Active screens, vanes, and deflectors multiply their local flow factors. Dampers add local structural damping. Each hardware model then uses the combined panel response. These interaction estimates still require CFD and physical validation.</p></article>
              <article><span>06</span><h3>Recorded wind</h3><p>The sound control uses the CC0 “Steady wind” recording from the USC/Sunset sound-effects collection. Speed controls its gain and playback rate.</p></article>
            </div>
            <div className="modal-caution"><Info size={16} /> Do not use these values for final structural design or manufacturer compliance.</div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function DeviceLoadPanel({ load, color }: { load: MitigationLoadResult; color: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="device-load-card" style={{ "--concept-accent": color } as React.CSSProperties}>
      <button
        type="button"
        className="device-load-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <div>
          <span className="eyebrow">ADDED HARDWARE DEMAND</span>
          <strong>{load.elementCount} modeled {load.elementLabel}{load.elementCount === 1 ? "" : "s"}</strong>
        </div>
        <span className="device-load-head-icons" aria-hidden="true">
          <Wrench size={17} />
          <ChevronDown size={14} />
        </span>
      </button>
      <div className={`device-load-body ${expanded ? "expanded" : ""}`} aria-hidden={!expanded}>
        <div className="device-load-body-inner">
          <div className="device-load-values">
            <span><small>Peak pressure</small><strong>{load.peakPressureKpa.toFixed(2)} kPa</strong></span>
            <span><small>Peak attachment</small><strong>{load.peakAttachmentLoadKn.toFixed(2)} kN</strong></span>
            <span><small>Device vibration</small><strong>{load.peakVibrationIndex.toFixed(0)} / 100</strong></span>
          </div>
          <div className="device-row-loads" role="table" aria-label="Mitigation demand by row">
            <div role="row" className="device-row-head">
              <span role="columnheader">Row</span>
              <span role="columnheader">Elements</span>
              <span role="columnheader">Total force</span>
              <span role="columnheader">Peak attachment</span>
              <span role="columnheader">Vibration</span>
            </div>
            {load.rows.map((row) => (
              <div role="row" key={row.row}>
                <strong role="cell">{row.row}</strong>
                <span role="cell">{row.elementCount}</span>
                <span role="cell">{row.totalForceKn.toFixed(1)} kN</span>
                <span role="cell">{row.peakAttachmentLoadKn.toFixed(2)} kN</span>
                <span role="cell">{row.peakVibrationIndex.toFixed(0)}</span>
              </div>
            ))}
          </div>
          <p>{load.loadBasis}</p>
          {load.peakOverturningMomentKnM > 0 ? (
            <p>Peak support moment: {load.peakOverturningMomentKnM.toFixed(2)} kN·m at Row {load.peakRow}, {load.elementLabel} {load.peakElement}.</p>
          ) : null}
          <p className="device-load-caution">Demand only. Add material, anchor, and fatigue capacities before any pass/fail decision.</p>
        </div>
      </div>
    </section>
  );
}

function ComparisonCombinationRow({
  result,
  baseline,
  activeMitigations,
}: {
  result: SimulationResult;
  baseline: SimulationResult;
  activeMitigations: MitigationConceptId[];
}) {
  const pressureDelta = 100 * (result.peakUpliftKpa / Math.max(baseline.peakUpliftKpa, 0.01) - 1);
  const vibrationDelta = 100 * (result.vibrationIndex / Math.max(baseline.vibrationIndex, 0.01) - 1);
  const peakLoad = result.mitigationLoads.reduce((current, load) =>
    load.peakAttachmentLoadKn > current.peakAttachmentLoadKn ? load : current,
  );
  return (
    <article className="active combination-row">
      <span className="comparison-name">
        Current combination
        <small>{activeMitigations.map((id) => MITIGATIONS[id].label).join(" + ")}</small>
      </span>
      <span className="comparison-value"><strong>{result.peakUpliftKpa.toFixed(2)} kPa</strong><small>{formatDelta(pressureDelta)}</small></span>
      <span className="comparison-value"><strong>{result.vibrationIndex.toFixed(0)} / 100</strong><small>{formatDelta(vibrationDelta)}</small></span>
      <span className="comparison-value"><strong>Row {result.peakRow} · Col {result.peakColumn}</strong><small>highest uplift panel</small></span>
      <span className="comparison-value">
        <strong>{peakLoad.peakAttachmentLoadKn.toFixed(2)} kN</strong>
        <small>{MITIGATIONS[peakLoad.concept].label} · Row {peakLoad.peakRow}</small>
      </span>
      <button type="button" disabled>Active</button>
    </article>
  );
}

function Metric({ label, value, unit, note, color }: { label: string; value: string; unit: string; note: string; color: string }) {
  return (
    <div className="metric-card">
      <span className="metric-marker" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
      <div>
        <span className="metric-label">{label}</span>
        <strong>{value}<small>{unit}</small></strong>
      </div>
      <span className="metric-note">{note}</span>
    </div>
  );
}

function formatRowRange(start: number, end: number) {
  return start === end ? `Row ${start}` : `Rows ${start}–${end}`;
}

function getMitigationSummary(id: MitigationId, config: SimulationConfig) {
  if (id === "none") return "Reference: no screen, vanes, deflectors, or dampers";
  if (id === "screen") {
    return `${formatRowRange(config.screenStartRow, config.screenEndRow)} · ${config.screenPorosity}% open · ${config.screenHeightM.toFixed(1)} m high · full-array width`;
  }
  if (id === "vanes") {
    return `${formatRowRange(config.vaneStartRow, config.vaneEndRow)} · ${config.vaneLengthM.toFixed(2)} m long`;
  }
  if (id === "spoilers") {
    return `${formatRowRange(config.spoilerStartRow, config.spoilerEndRow)} · ${config.spoilerStyle} · ${config.spoilerHeightM.toFixed(2)} m · ${config.spoilerAngleDeg}°`;
  }
  return `${formatRowRange(config.damperStartRow, config.damperEndRow)} · ${config.damperSpacingM.toFixed(1)} m spacing · +${config.damperDampingPercent.toFixed(1)}% damping`;
}

function formatDelta(value: number) {
  if (Math.abs(value) < 0.05) return "No change vs baseline";
  return `${Math.abs(value).toFixed(0)}% ${value < 0 ? "lower" : "higher"} vs baseline`;
}

function RowRangeSlider({
  label,
  startRow,
  endRow,
  onStartChange,
  onEndChange,
  accent,
  maxRow,
  defaultStart,
  defaultEnd,
}: {
  label: string;
  startRow: number;
  endRow: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  accent: string;
  maxRow: number;
  defaultStart: number;
  defaultEnd: number;
}) {
  const min = 1;
  const max = maxRow;
  const denominator = Math.max(1, max - min);
  const startPercent = ((startRow - min) / denominator) * 100;
  const endPercent = ((endRow - min) / denominator) * 100;
  const rangeLabel = startRow === endRow ? `Row ${startRow}` : `Rows ${startRow}–${endRow}`;
  const defaultPercent = ((defaultStart - min) / denominator) * 100;

  return (
    <fieldset className="row-range-control">
      <legend>
        <span>{label}</span>
        <strong>{rangeLabel}</strong>
      </legend>
      <div
        className={`row-range-track ${startRow === endRow ? "is-collapsed" : ""}`}
        style={{
          "--range-start": `${startPercent}%`,
          "--range-end": `${endPercent}%`,
          "--slider-accent": accent,
        } as React.CSSProperties}
      >
        <div className="row-range-fill" />
        <input
          className="row-range-start"
          aria-label="First row with a screen behind it"
          aria-valuetext={`Row ${startRow}`}
          type="range"
          min={min}
          max={max}
          step={1}
          value={startRow}
          onChange={(event) => onStartChange(Math.min(Number(event.target.value), endRow))}
          style={{ zIndex: startRow === endRow ? 4 : 3 }}
        />
        <input
          className="row-range-end"
          aria-label="Last row with a screen behind it"
          aria-valuetext={`Row ${endRow}`}
          type="range"
          min={min}
          max={max}
          step={1}
          value={endRow}
          onChange={(event) => onEndChange(Math.max(Number(event.target.value), startRow))}
          style={{ zIndex: 2 }}
        />
        <button
          type="button"
          className="range-default-marker"
          style={{ left: `${defaultPercent}%` }}
          onClick={() => {
            onStartChange(defaultStart);
            onEndChange(defaultEnd);
          }}
          aria-label={`Restore default placement, rows ${defaultStart} to ${defaultEnd}`}
          title={`Default: ${defaultStart === defaultEnd ? `Row ${defaultStart}` : `Rows ${defaultStart}–${defaultEnd}`}`}
        />
      </div>
      <div className="row-range-labels">
        <span>ROW 1 · FRONT</span>
        <button type="button" onClick={() => { onStartChange(defaultStart); onEndChange(defaultEnd); }}>
          Default {defaultStart === defaultEnd ? defaultStart : `${defaultStart}–${defaultEnd}`}
        </button>
        <span>ROW {max} · REAR</span>
      </div>
    </fieldset>
  );
}

function ControlSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  accent,
  compact = false,
  markers = [],
  snapValue,
  snapTolerance = 0,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  accent: string;
  compact?: boolean;
  markers?: Array<{ value: number; label: string; key?: string; style?: "dot" | "tick" }>;
  snapValue?: number;
  snapTolerance?: number;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  const decimalPlaces = step >= 1 ? 0 : Math.min(2, (step.toString().split(".")[1] ?? "").length);
  const displayValue = value.toFixed(decimalPlaces);
  return (
    <div className={`control-slider ${compact ? "compact" : ""}`}>
      <span><span>{label}</span><strong>{displayValue}<small>{unit}</small></strong></span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(snapValue !== undefined && Math.abs(next - snapValue) <= snapTolerance ? snapValue : next);
        }}
        style={{ "--slider-fill": `${percent}%`, "--slider-accent": accent } as React.CSSProperties}
      />
      {markers.length ? (
        <div className="slider-markers" aria-label={`${label} preset points`}>
          {markers.map((marker, index) => (
            <button
              type="button"
              className={marker.style === "tick" ? "slider-marker-tick" : undefined}
              key={`${marker.key ?? marker.value}-${index}`}
              style={{ left: `${Math.min(100, Math.max(0, ((marker.value - min) / (max - min)) * 100))}%` }}
              onClick={() => onChange(marker.value)}
              aria-label={marker.label}
              title={marker.label}
            />
          ))}
        </div>
      ) : null}
      {!compact ? <div className="range-labels"><span>{min}</span><span>{max}</span></div> : null}
    </div>
  );
}

function useWindAudio(windSpeedMph: number, ambientTurbulence: number, playing: boolean) {
  const [muted, setMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    if (typeof window === "undefined") return null;

    const audio = new Audio("/audio/wind-loop.mp3");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audio.preservesPitch = false;
    audioRef.current = audio;
    return audio;
  }, []);

  const toggle = useCallback(() => {
    const nextMuted = !muted;
    if (!nextMuted) {
      const audio = getAudio();
      if (audio && playing) void audio.play().catch(() => undefined);
    }
    setMuted(nextMuted);
  }, [getAudio, muted, playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const normalizedSpeed = Math.min(1, Math.max(0, windSpeedMph / 150));
    const turbulenceBoost = Math.min(0.12, ambientTurbulence / 400);
    audio.volume = muted || !playing
      ? 0
      : Math.min(0.82, 0.025 + Math.pow(normalizedSpeed, 1.18) * 0.68 + turbulenceBoost);
    audio.playbackRate = 0.78 + normalizedSpeed * 0.38;

    if (muted || !playing) {
      audio.pause();
    } else {
      void audio.play().catch(() => undefined);
    }
  }, [ambientTurbulence, muted, playing, windSpeedMph]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  return { muted, toggle };
}
