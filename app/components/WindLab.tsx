"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  BarChart3,
  Camera,
  ChevronDown,
  CircleGauge,
  Eye,
  EyeOff,
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
  Volume2,
  VolumeX,
  Wind,
  X,
} from "lucide-react";
import { WindScene } from "./WindScene";
import {
  MAUKA_BEARING,
  HIGH_EDGE_CLEARANCE_M,
  LOW_EDGE_CLEARANCE_M,
  MITIGATIONS,
  PANEL_LENGTH_M,
  PANEL_TILT_DEG,
  PANEL_WIDTH_M,
  POST_STORM_PANEL_COUNT,
  RACK_SUPPORTS_PER_ROW,
  ROW_COUNT,
  ROW_PANEL_COUNTS,
  ROW_SPACING_M,
  ROW_STAGGER_M,
  SCENARIOS,
  TABLE_CHORD_M,
  TOTAL_PANEL_COUNT,
  cardinalDirection,
  getPanelResult,
  riskColor,
  simulate,
  type MitigationId,
  type ScenarioId,
  type SimulationConfig,
  type SpoilerStyle,
  type ViewMode,
} from "../lib/physics";

const mitigationOrder: MitigationId[] = ["none", "screen", "vanes", "spoilers", "dampers"];

const mitigationIcons: Record<MitigationId, typeof Shield> = {
  none: Grid3X3,
  screen: Shield,
  vanes: Layers3,
  spoilers: Sparkles,
  dampers: Activity,
};

export function WindLab() {
  const [scenario, setScenario] = useState<ScenarioId | "custom">("storm");
  const [windSpeedMph, setWindSpeedMph] = useState<number>(SCENARIOS.storm.windSpeedMph);
  const [windBearing, setWindBearing] = useState<number>(SCENARIOS.storm.windBearing);
  const [ambientTurbulence, setAmbientTurbulence] = useState<number>(SCENARIOS.storm.ambientTurbulence);
  const [panelFrequencyHz, setPanelFrequencyHz] = useState(2.4);
  const [dampingPercent, setDampingPercent] = useState(2.5);
  const [mitigation, setMitigation] = useState<MitigationId>("none");
  const [screenPorosity, setScreenPorosity] = useState(40);
  const [screenHeightM, setScreenHeightM] = useState(2.2);
  const [screenStartRow, setScreenStartRow] = useState(7);
  const [screenEndRow, setScreenEndRow] = useState(7);
  const [vaneLengthM, setVaneLengthM] = useState(Number(TABLE_CHORD_M.toFixed(2)));
  const [vaneRowCount, setVaneRowCount] = useState(3);
  const [spoilerStyle, setSpoilerStyle] = useState<SpoilerStyle>("perforated");
  const [spoilerHeightM, setSpoilerHeightM] = useState(0.3);
  const [spoilerAngleDeg, setSpoilerAngleDeg] = useState(20);
  const [spoilerRowCount, setSpoilerRowCount] = useState(2);
  const [damperSpacingM, setDamperSpacingM] = useState(2);
  const [damperDampingPercent, setDamperDampingPercent] = useState(5.5);
  const [damperRowCount, setDamperRowCount] = useState(2);
  const [viewMode, setViewMode] = useState<ViewMode>("flow");
  const [playing, setPlaying] = useState(true);
  const [showDamage, setShowDamage] = useState(false);
  const [cameraView, setCameraView] = useState<"perspective" | "mauka" | "makai" | "plan">("perspective");
  const [cameraRequest, setCameraRequest] = useState(0);
  const [selectedPanel, setSelectedPanel] = useState({ row: 1, module: 9 });
  const [showComparison, setShowComparison] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const windAudio = useWindAudio(windSpeedMph, ambientTurbulence, playing);

  const config: SimulationConfig = useMemo(
    () => ({
      windSpeedMph,
      windBearing,
      ambientTurbulence,
      panelFrequencyHz,
      dampingPercent,
      mitigation,
      screenPorosity,
      screenHeightM,
      screenStartRow,
      screenEndRow,
      vaneLengthM,
      vaneRowCount,
      spoilerStyle,
      spoilerHeightM,
      spoilerAngleDeg,
      spoilerRowCount,
      damperSpacingM,
      damperDampingPercent,
      damperRowCount,
    }),
    [
      windSpeedMph,
      windBearing,
      ambientTurbulence,
      panelFrequencyHz,
      dampingPercent,
      mitigation,
      screenPorosity,
      screenHeightM,
      screenStartRow,
      screenEndRow,
      vaneLengthM,
      vaneRowCount,
      spoilerStyle,
      spoilerHeightM,
      spoilerAngleDeg,
      spoilerRowCount,
      damperSpacingM,
      damperDampingPercent,
      damperRowCount,
    ],
  );
  const result = useMemo(() => simulate(config), [config]);
  const selectedResult = getPanelResult(result, selectedPanel.row, selectedPanel.module);
  const baselineResult = useMemo(() => simulate({ ...config, mitigation: "none" }), [config]);
  const comparisons = useMemo(
    () => mitigationOrder.map((id) => ({ id, result: simulate({ ...config, mitigation: id }) })),
    [config],
  );

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
    setPanelFrequencyHz(2.4);
    setDampingPercent(2.5);
    setMitigation("none");
    setScreenPorosity(40);
    setScreenHeightM(2.2);
    setScreenStartRow(7);
    setScreenEndRow(7);
    setVaneLengthM(Number(TABLE_CHORD_M.toFixed(2)));
    setVaneRowCount(3);
    setSpoilerStyle("perforated");
    setSpoilerHeightM(0.3);
    setSpoilerAngleDeg(20);
    setSpoilerRowCount(2);
    setDamperSpacingM(2);
    setDamperDampingPercent(5.5);
    setDamperRowCount(2);
    setShowDamage(false);
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
            showDamage={showDamage}
            cameraView={cameraView}
            cameraRequest={cameraRequest}
            selectedPanel={selectedPanel}
            onSelectPanel={setSelectedPanel}
          />

          {mitigation !== "none" ? (
            <div
              className="mitigation-visual-key"
              style={{ "--concept-accent": MITIGATIONS[mitigation].color } as React.CSSProperties}
            >
              <i />
              <span>
                <strong>{MITIGATIONS[mitigation].label}</strong>
                Bright {MITIGATIONS[mitigation].colorName} geometry in the model
              </span>
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
              <small>{Math.abs(windBearing - MAUKA_BEARING) < 2 ? "Mauka → front" : "Custom bearing"}</small>
            </div>
          </div>

          <button className="damage-toggle" onClick={() => setShowDamage((value) => !value)}>
            {showDamage ? <EyeOff size={15} /> : <Eye size={15} />}
            {showDamage ? "Restore pre-storm array" : "Show post-storm damage"}
          </button>

          <div className="metrics-rack">
            <Metric
              label="Peak uplift"
              value={result.peakUpliftKpa.toFixed(2)}
              unit="kPa"
              note={`Row ${result.peakRow} · Col ${result.peakColumn}`}
              color={riskColor(result.peakUpliftKpa, 1.8)}
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
                onChange={(event) => {
                  const value = event.target.value as ScenarioId | "custom";
                  if (value === "custom") setScenario("custom");
                  else applyScenario(value);
                }}
              >
                <option value="custom">Custom configuration</option>
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
            onChange={(value) => {
              setWindSpeedMph(value);
              setScenario("custom");
            }}
            accent="#7df0c5"
          />
          <ControlSlider
            label="Wind bearing"
            value={windBearing}
            min={0}
            max={359}
            step={1}
            unit={`° ${cardinalDirection(windBearing)}`}
            onChange={(value) => {
              setWindBearing(value);
              setScenario("custom");
            }}
            accent="#8fe6ff"
          />
          <ControlSlider
            label="Ambient turbulence"
            value={ambientTurbulence}
            min={4}
            max={35}
            step={1}
            unit="%"
            onChange={(value) => {
              setAmbientTurbulence(value);
              setScenario("custom");
            }}
            accent="#e9ef72"
          />

          <div className="section-rule" />

          <div className="section-heading">
            <div>
              <span className="eyebrow">FLOW CONTROL</span>
              <h2>Mitigation concept</h2>
            </div>
            <Shield size={17} />
          </div>
          <div className="mitigation-grid">
            {mitigationOrder.map((id) => {
              const item = MITIGATIONS[id];
              const Icon = mitigationIcons[id];
              return (
                <button
                  className={mitigation === id ? "active" : ""}
                  key={id}
                  onClick={() => setMitigation(id)}
                  style={{ "--concept-accent": item.color } as React.CSSProperties}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  <small>{item.short}</small>
                </button>
              );
            })}
          </div>
          <p className="concept-note">{MITIGATIONS[mitigation].detail}</p>

          {mitigation !== "none" ? (
            <div
              className="mitigation-tuning"
              style={{ "--concept-accent": MITIGATIONS[mitigation].color } as React.CSSProperties}
            >
              <div className="tuning-heading">
                <span><i /> Visible concept controls</span>
                <small>{MITIGATIONS[mitigation].colorName}</small>
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
                  />
                  <RowRangeSlider
                    startRow={screenStartRow}
                    endRow={screenEndRow}
                    onStartChange={setScreenStartRow}
                    onEndChange={setScreenEndRow}
                    accent={MITIGATIONS.screen.color}
                  />
                  <p>
                    A screen sits behind each included row. Row 7 is the rear mauka row.
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
                  />
                  <ControlSlider
                    label="Rows fitted"
                    value={vaneRowCount}
                    min={1}
                    max={ROW_COUNT}
                    step={1}
                    unit="rows"
                    onChange={setVaneRowCount}
                    accent={MITIGATIONS.vanes.color}
                    compact
                  />
                  <p>
                    {vaneLengthM <= TABLE_CHORD_M
                      ? `${Math.round((vaneLengthM / TABLE_CHORD_M) * 100)}% of the ${TABLE_CHORD_M.toFixed(2)} m rack slope.`
                      : `${(vaneLengthM - TABLE_CHORD_M).toFixed(2)} m beyond the rack toward the row behind it.`}
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
                  />
                  <ControlSlider
                    label="Rows fitted"
                    value={spoilerRowCount}
                    min={1}
                    max={ROW_COUNT}
                    step={1}
                    unit="rows"
                    onChange={setSpoilerRowCount}
                    accent={MITIGATIONS.spoilers.color}
                    compact
                  />
                  <p>The device sits on the makai edge. Coverage starts at Row 1.</p>
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
                  />
                  <ControlSlider
                    label="Rows fitted"
                    value={damperRowCount}
                    min={1}
                    max={ROW_COUNT}
                    step={1}
                    unit="rows"
                    onChange={setDamperRowCount}
                    accent={MITIGATIONS.dampers.color}
                    compact
                  />
                  <p>Magenta rings mark elastomer pads at rail-to-rack joints.</p>
                </>
              ) : null}
            </div>
          ) : null}

          <button className="compare-button" onClick={() => setShowComparison(true)}>
            <BarChart3 size={16} />
            Compare all concepts
            <span>5</span>
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
            />
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
          </div>

          <button className="assumption-link" onClick={() => setShowAssumptions(true)}>
            <Info size={14} />
            Model basis and assumptions
          </button>
        </aside>
      </section>

      <footer className="lab-footer">
        <span><span className="status-dot" /> SITE CALIBRATION V0.7 · PANEL FIELD</span>
        <span>JINKO 365 W · {PANEL_LENGTH_M.toFixed(3)} × {PANEL_WIDTH_M.toFixed(3)} m · {PANEL_TILT_DEG.toFixed(1)}° TILT</span>
        <span>{TOTAL_PANEL_COUNT} PRE-STORM · R1/R7 {ROW_PANEL_COUNTS[0]} EACH · {ROW_SPACING_M.toFixed(2)} m PITCH · {ROW_STAGGER_M.toFixed(2)} m STAGGER</span>
      </footer>

      {showComparison ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowComparison(false)}>
          <section className="modal comparison-modal" role="dialog" aria-modal="true" aria-label="Mitigation comparison" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">SCENARIO COMPARISON · {windSpeedMph} MPH FROM {cardinalDirection(windBearing)}</span>
                <h2>Mitigation concept screen</h2>
                <p>Compare the reduced-order response against the same baseline wind.</p>
              </div>
              <button className="icon-button" onClick={() => setShowComparison(false)} aria-label="Close comparison"><X size={18} /></button>
            </div>
            <div className="comparison-legend"><span>Peak uplift pressure</span><span>Vibration index</span></div>
            <div className="comparison-list">
              {comparisons.map(({ id, result: item }) => {
                const reduction = 100 * (1 - item.vibrationIndex / Math.max(baselineResult.vibrationIndex, 0.01));
                return (
                  <button key={id} className={mitigation === id ? "active" : ""} onClick={() => setMitigation(id)}>
                    <span className="comparison-name">
                      {MITIGATIONS[id].label}
                      <small>{id === "none" ? "Reference" : `${Math.max(0, reduction).toFixed(0)}% vibration reduction`}</small>
                    </span>
                    <span className="bar-track"><i style={{ width: `${clampPercent(item.peakUpliftKpa / baselineResult.peakUpliftKpa * 100)}%` }} /></span>
                    <strong>{item.peakUpliftKpa.toFixed(2)} kPa</strong>
                    <span className="bar-track vibration"><i style={{ width: `${clampPercent(item.vibrationIndex)}%` }} /></span>
                    <strong>{item.vibrationIndex.toFixed(0)}</strong>
                  </button>
                );
              })}
            </div>
            <div className="modal-caution"><Info size={16} /> Rank these concepts with CFD and a structural modal test before construction.</div>
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
                <p>The model uses these two supplied site images.</p>
              </div>
              <button className="icon-button" onClick={() => setShowEvidence(false)} aria-label="Close evidence"><X size={18} /></button>
            </div>
            <div className="evidence-grid">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/reference/satellite.png" alt="Satellite view of the facility and the large solar array" />
                <figcaption><strong>North-up site view</strong><span>{ROW_SPACING_M.toFixed(2)} m row pitch · {ROW_STAGGER_M.toFixed(2)} m southeast stagger</span></figcaption>
              </figure>
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/reference/post-storm.png" alt="Post-storm image showing the first two rows removed" />
                <figcaption><strong>Post-storm condition</strong><span>Rows 1–2 removed · rear rows remain</span></figcaption>
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
                <span className="eyebrow">MODEL BASIS · V0.7</span>
                <h2>What this model can test</h2>
              </div>
              <button className="icon-button" onClick={() => setShowAssumptions(false)} aria-label="Close assumptions"><X size={18} /></button>
            </div>
            <div className="assumption-grid">
              <article><span>01</span><h3>Photo-counted geometry</h3><p>Rows 1 and 7 have 14 southeast-aligned columns. Rows 2–6 have 28 columns. Each table uses two portrait panels along the slope.</p></article>
              <article><span>07</span><h3>Staggered row layout</h3><p>The rows form a southeast echelon. Each rearward row shifts {ROW_STAGGER_M.toFixed(2)} m southeast. Row centers use a {ROW_SPACING_M.toFixed(2)} m pitch.</p></article>
              <article><span>02</span><h3>Panel flow field</h3><p>The solver evaluates all {TOTAL_PANEL_COUNT} panels. It tracks angled wake overlap, exposed columns, row stagger, screen shelter, and wake decay.</p></article>
              <article><span>03</span><h3>Local vibration</h3><p>Each panel uses its local turbulence and pressure. Dampers change only the fitted rows. This model is not full CFD.</p></article>
              <article><span>04</span><h3>Array totals</h3><p>The estimate has {TOTAL_PANEL_COUNT} panels before the storm. It has {POST_STORM_PANEL_COUNT} after Rows 1 and 2 are removed.</p></article>
              <article><span>05</span><h3>Estimated rack</h3><p>The rack uses a {TABLE_CHORD_M.toFixed(2)} m slope and {LOW_EDGE_CLEARANCE_M.toFixed(2)}–{HIGH_EDGE_CLEARANCE_M.toFixed(2)} m clearance. Full rows use {RACK_SUPPORTS_PER_ROW} support frames and four rails.</p></article>
              <article><span>06</span><h3>Recorded wind</h3><p>The sound control uses the CC0 “Steady wind” recording from the USC/Sunset sound-effects collection. Speed controls its gain and playback rate.</p></article>
            </div>
            <div className="modal-caution"><Info size={16} /> Do not use these values for final structural design or manufacturer compliance.</div>
          </section>
        </div>
      ) : null}
    </main>
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

function RowRangeSlider({
  startRow,
  endRow,
  onStartChange,
  onEndChange,
  accent,
}: {
  startRow: number;
  endRow: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  accent: string;
}) {
  const min = 1;
  const max = ROW_COUNT;
  const startPercent = ((startRow - min) / (max - min)) * 100;
  const endPercent = ((endRow - min) / (max - min)) * 100;
  const rangeLabel = startRow === endRow ? `Row ${startRow}` : `Rows ${startRow}–${endRow}`;

  return (
    <fieldset className="row-range-control">
      <legend>
        <span>Screen placement</span>
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
      </div>
      <div className="row-range-labels">
        <span>ROW 1 · FRONT</span>
        <span>ROW 7 · REAR</span>
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
}) {
  const percent = ((value - min) / (max - min)) * 100;
  const decimalPlaces = step >= 1 ? 0 : Math.min(2, (step.toString().split(".")[1] ?? "").length);
  const displayValue = value.toFixed(decimalPlaces);
  return (
    <label className={`control-slider ${compact ? "compact" : ""}`}>
      <span><span>{label}</span><strong>{displayValue}<small>{unit}</small></strong></span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ "--slider-fill": `${percent}%`, "--slider-accent": accent } as React.CSSProperties}
      />
      {!compact ? <div className="range-labels"><span>{min}</span><span>{max}</span></div> : null}
    </label>
  );
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(3, value));
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
