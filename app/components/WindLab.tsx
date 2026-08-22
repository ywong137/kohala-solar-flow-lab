"use client";

import { useMemo, useState } from "react";
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
  Wind,
  X,
} from "lucide-react";
import { WindScene } from "./WindScene";
import {
  MAUKA_BEARING,
  MITIGATIONS,
  MODULES_PER_ROW,
  PANEL_LENGTH_M,
  PANEL_WIDTH_M,
  PANELS_DEEP_PER_ROW,
  ROW_COUNT,
  ROW_SPACING_M,
  SCENARIOS,
  cardinalDirection,
  riskColor,
  simulate,
  type MitigationId,
  type ScenarioId,
  type SimulationConfig,
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
  const [viewMode, setViewMode] = useState<ViewMode>("flow");
  const [playing, setPlaying] = useState(true);
  const [showDamage, setShowDamage] = useState(false);
  const [cameraView, setCameraView] = useState<"perspective" | "mauka" | "makai" | "plan">("perspective");
  const [cameraRequest, setCameraRequest] = useState(0);
  const [selectedPanel, setSelectedPanel] = useState({ row: 1, module: 30 });
  const [showComparison, setShowComparison] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const config: SimulationConfig = useMemo(
    () => ({
      windSpeedMph,
      windBearing,
      ambientTurbulence,
      panelFrequencyHz,
      dampingPercent,
      mitigation,
    }),
    [windSpeedMph, windBearing, ambientTurbulence, panelFrequencyHz, dampingPercent, mitigation],
  );
  const result = useMemo(() => simulate(config), [config]);
  const selectedResult = result.rows[selectedPanel.row - 1];
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
              note={`Row ${result.peakRow}`}
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
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  <small>{item.short}</small>
                </button>
              );
            })}
          </div>
          <p className="concept-note">{MITIGATIONS[mitigation].detail}</p>

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
                <span className="eyebrow">SELECTED PANEL</span>
                <strong>Row {selectedPanel.row} · Panel {selectedPanel.module}</strong>
              </div>
              <CircleGauge size={20} style={{ color: riskColor(selectedResult.vibrationIndex) }} />
            </div>
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
        <span><span className="status-dot" /> SITE CALIBRATION V0.1</span>
        <span>JINKO 365 W · {PANEL_LENGTH_M.toFixed(3)} × {PANEL_WIDTH_M.toFixed(3)} m · {PANELS_DEEP_PER_ROW}-DEEP TABLE</span>
        <span>{ROW_COUNT} ROWS · {MODULES_PER_ROW * PANELS_DEEP_PER_ROW} PANELS / ROW · {ROW_SPACING_M.toFixed(2)} m PITCH</span>
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
                <figcaption><strong>North-up site view</strong><span>Large array · rows run northwest to southeast</span></figcaption>
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
                <span className="eyebrow">MODEL BASIS · V0.1</span>
                <h2>What this model can test</h2>
              </div>
              <button className="icon-button" onClick={() => setShowAssumptions(false)} aria-label="Close assumptions"><X size={18} /></button>
            </div>
            <div className="assumption-grid">
              <article><span>01</span><h3>Geometry</h3><p>Seven rack rows use 40 Jinko panels per row. Each rack has two panels along its slope.</p></article>
              <article><span>02</span><h3>Flow response</h3><p>The solver adds panel-row wakes along the wind path. It predicts relative pressure and turbulence, not full CFD.</p></article>
              <article><span>03</span><h3>Vibration</h3><p>The model compares a panel-scale shedding estimate with an adjustable natural frequency and damping ratio.</p></article>
              <article><span>04</span><h3>Next calibration</h3><p>Add exact row pitch, tilt, column count, rail spans, fastener details, and measured modal frequencies.</p></article>
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
  return (
    <label className={`control-slider ${compact ? "compact" : ""}`}>
      <span><span>{label}</span><strong>{value}<small>{unit}</small></strong></span>
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
