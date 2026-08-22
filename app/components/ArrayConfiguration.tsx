"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  DEFAULT_ARRAY_CONFIG,
  cloneArrayConfig,
  getArrayMetrics,
  loadArrayConfig,
  resetArrayConfig,
  saveArrayConfig,
  type ArrayGeometryConfig,
} from "../lib/array-config";
import { getRowCenterZ, getRowWidth } from "../lib/physics";

export function ArrayConfiguration() {
  const [config, setConfig] = useState<ArrayGeometryConfig>(cloneArrayConfig());
  const [savedConfig, setSavedConfig] = useState<ArrayGeometryConfig>(cloneArrayConfig());
  const [savedMessage, setSavedMessage] = useState("Calibrated defaults loaded");
  const metrics = useMemo(() => getArrayMetrics(config), [config]);
  const maxColumns = Math.max(...config.rows.map((row) => row.columns));
  const plan = useMemo(() => {
    const rows = config.rows.map((row, index) => {
      const width = getRowWidth(index + 1, config);
      return {
        ...row,
        index,
        width,
        centerX: row.offsetXM,
        centerZ: getRowCenterZ(index + 1, config),
        chord: row.panelsDeep * config.panelLengthM + (row.panelsDeep - 1) * config.panelGapM,
      };
    });
    const minX = Math.min(...rows.map((row) => row.centerX - row.width / 2));
    const maxX = Math.max(...rows.map((row) => row.centerX + row.width / 2));
    const minZ = Math.min(...rows.map((row) => row.centerZ - row.chord / 2));
    const maxZ = Math.max(...rows.map((row) => row.centerZ + row.chord / 2));
    return { rows, minX, minZ, width: maxX - minX, depth: maxZ - minZ };
  }, [config]);
  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadArrayConfig();
      setConfig(saved);
      setSavedConfig(saved);
      setSavedMessage("Saved configuration loaded");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const updateGlobal = <K extends keyof ArrayGeometryConfig>(key: K, value: ArrayGeometryConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setSavedMessage("Unsaved changes");
  };

  const updateRow = (index: number, key: "columns" | "panelsDeep" | "offsetXM", value: number) => {
    const nextValue = key === "columns"
      ? Math.min(60, Math.max(1, Math.round(value || 1)))
      : key === "panelsDeep"
        ? Math.min(4, Math.max(1, Math.round(value || 1)))
        : Math.min(30, Math.max(-30, Number.isFinite(value) ? value : 0));
    setConfig((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row),
    }));
    setSavedMessage("Unsaved changes");
  };

  const save = () => {
    const saved = saveArrayConfig(config);
    setConfig(saved);
    setSavedConfig(saved);
    setSavedMessage("Saved. The simulator will use this layout.");
  };

  const restoreDefaults = () => {
    const defaults = resetArrayConfig();
    setConfig(defaults);
    setSavedConfig(defaults);
    setSavedMessage("Calibrated defaults restored and saved");
  };

  const addRow = () => {
    if (config.rows.length >= 12) return;
    const rear = config.rows[config.rows.length - 1];
    setConfig((current) => ({
      ...current,
      rows: [...current.rows, { columns: rear.columns, panelsDeep: rear.panelsDeep, offsetXM: rear.offsetXM + 1.55 }],
    }));
    setSavedMessage("Unsaved changes");
  };

  const removeRearRow = () => {
    if (config.rows.length <= 2) return;
    setConfig((current) => ({ ...current, rows: current.rows.slice(0, -1) }));
    setSavedMessage("Unsaved changes");
  };

  return (
    <main className="config-shell">
      <header className="config-topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><div className="brand-title">KOHALA FLOW LAB</div><div className="brand-subtitle">ARRAY CONFIGURATION</div></div>
        </div>
        <Link className="quiet-button" href="/"><ArrowLeft size={15} /> Back to simulator</Link>
      </header>

      <div className="config-page">
        <section className="config-intro">
          <div>
            <span className="eyebrow">SAVED MODEL INPUTS</span>
            <h1>Array geometry</h1>
            <p>Change the rebuilt layout or replace photo estimates with site measurements. Save before you return to the simulator.</p>
          </div>
          <div className="config-actions">
            <span className={hasChanges ? "unsaved" : "saved"}>{hasChanges ? null : <Check size={13} />}{savedMessage}</span>
            <button className="quiet-button" type="button" onClick={() => { setConfig(cloneArrayConfig(savedConfig)); setSavedMessage("Unsaved changes discarded"); }} disabled={!hasChanges}>Revert unsaved</button>
            <button className="quiet-button" type="button" onClick={restoreDefaults}><RotateCcw size={14} /> Restore calibrated defaults</button>
            <button className="primary-button" type="button" onClick={save}><Save size={15} /> Save and apply</button>
          </div>
        </section>

        <section className="config-summary" aria-label="Current configuration totals">
          <span><small>Total panels</small><strong>{metrics.totalPanelCount}</strong></span>
          <span><small>Rows</small><strong>{metrics.rowCount}</strong></span>
          <span><small>Longest row</small><strong>{maxColumns} columns</strong></span>
          <span><small>Maximum rack chord</small><strong>{metrics.tableChordM.toFixed(2)} m</strong></span>
        </section>

        <section className="config-card layout-editor">
          <div className="config-section-head">
            <div><span className="eyebrow">PLAN VIEW</span><h2>Rows, counts, and offsets</h2><p>Row 1 is the front makai row. The last row is the rear mauka row.</p></div>
            <div className="row-actions">
              <button className="quiet-button" type="button" onClick={addRow} disabled={config.rows.length >= 12}><Plus size={14} /> Add rear row</button>
              <button className="quiet-button" type="button" onClick={removeRearRow} disabled={config.rows.length <= 2}><Trash2 size={14} /> Remove rear row</button>
            </div>
          </div>

          <div className="layout-plan" aria-label={`Satellite-style plan view with ${config.rows.length} rows and ${metrics.totalPanelCount} panels`}>
            <span className="layout-plan-north">N ↑</span>
            <span className="layout-plan-mauka">MAUKA · REAR</span>
            <span className="layout-plan-makai">MAKAI · FRONT</span>
            <div className="layout-plan-array">
              {plan.rows.map((row) => (
                <div
                  className="layout-plan-row"
                  key={row.index}
                  style={{
                    left: `${((row.centerX - row.width / 2 - plan.minX) / plan.width) * 100}%`,
                    top: `${((row.centerZ - row.chord / 2 - plan.minZ) / plan.depth) * 100}%`,
                    width: `${(row.width / plan.width) * 100}%`,
                    height: `${Math.max(2.8, (row.chord / plan.depth) * 100)}%`,
                    "--panel-columns": row.columns,
                    "--panel-depth": row.panelsDeep,
                  } as React.CSSProperties}
                >
                  <span>R{row.index + 1}</span>
                  <strong>{row.columns * row.panelsDeep}</strong>
                </div>
              ))}
            </div>
            <div className="layout-plan-scale"><i /><span>10 m</span></div>
          </div>

          <div className="row-editor-grid">
            {config.rows.map((row, index) => (
              <article className="row-editor" key={index}>
                <div><strong>Row {index + 1}</strong><small>{index === 0 ? "FRONT · MAKAI" : index === config.rows.length - 1 ? "REAR · MAUKA" : `${row.columns * row.panelsDeep} panels`}</small></div>
                <label><span>Columns across</span><input type="number" min={1} max={60} value={row.columns} onChange={(event) => updateRow(index, "columns", Number(event.target.value))} /></label>
                <label><span>Panels along slope</span><input type="number" min={1} max={4} value={row.panelsDeep} onChange={(event) => updateRow(index, "panelsDeep", Number(event.target.value))} /></label>
                <ConfigSlider label="Horizontal offset" value={row.offsetXM} min={-30} max={30} step={0.05} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.rows[index]?.offsetXM ?? 0} onChange={(value) => updateRow(index, "offsetXM", value)} />
              </article>
            ))}
          </div>
        </section>

        <section className="config-card">
          <div className="config-section-head"><div><span className="eyebrow">GLOBAL GEOMETRY</span><h2>Spacing, panels, and rack</h2><p>Every marker labeled “Default” is clickable.</p></div></div>
          <div className="config-control-grid">
            <ConfigSlider label="Row center spacing" value={config.rowSpacingM} min={3} max={15} step={0.05} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.rowSpacingM} onChange={(value) => updateGlobal("rowSpacingM", value)} />
            <ConfigSlider label="Panel width across row" value={config.panelWidthM} min={0.5} max={2.5} step={0.001} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.panelWidthM} onChange={(value) => updateGlobal("panelWidthM", value)} />
            <ConfigSlider label="Panel length along slope" value={config.panelLengthM} min={0.8} max={3.5} step={0.001} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.panelLengthM} onChange={(value) => updateGlobal("panelLengthM", value)} />
            <ConfigSlider label="Panel thickness" value={config.panelThicknessM} min={0.015} max={0.12} step={0.001} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.panelThicknessM} onChange={(value) => updateGlobal("panelThicknessM", value)} />
            <ConfigSlider label="Gap between panels" value={config.panelGapM} min={0} max={0.2} step={0.005} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.panelGapM} onChange={(value) => updateGlobal("panelGapM", value)} />
            <ConfigSlider label="Panel tilt" value={config.tiltDeg} min={0} max={50} step={0.1} unit="°" defaultValue={DEFAULT_ARRAY_CONFIG.tiltDeg} onChange={(value) => updateGlobal("tiltDeg", value)} />
            <ConfigSlider label="Low-edge clearance" value={config.lowEdgeClearanceM} min={0.1} max={3} step={0.01} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.lowEdgeClearanceM} onChange={(value) => updateGlobal("lowEdgeClearanceM", value)} />
            <ConfigSlider label="Full-row support frames" value={config.rackSupportsFullRow} min={2} max={20} step={1} unit="" defaultValue={DEFAULT_ARRAY_CONFIG.rackSupportsFullRow} onChange={(value) => updateGlobal("rackSupportsFullRow", value)} />
            <ConfigSlider label="Screen offset behind row" value={config.screenRowOffsetM} min={0.5} max={10} step={0.05} unit="m" defaultValue={DEFAULT_ARRAY_CONFIG.screenRowOffsetM} onChange={(value) => updateGlobal("screenRowOffsetM", value)} />
          </div>
        </section>

        <section className="config-card">
          <div className="config-section-head"><div><span className="eyebrow">ORIENTATION AND DYNAMICS</span><h2>Bearings and saved model defaults</h2><p>The dynamics defaults come from published field tests. They are not measurements from this rack.</p></div></div>
          <div className="config-control-grid">
            <ConfigSlider label="Array row-axis bearing" value={config.arrayAxisBearing} min={0} max={359} step={1} unit="°" defaultValue={DEFAULT_ARRAY_CONFIG.arrayAxisBearing} onChange={(value) => updateGlobal("arrayAxisBearing", value)} />
            <ConfigSlider label="Mauka wind bearing" value={config.maukaBearing} min={0} max={359} step={1} unit="°" defaultValue={DEFAULT_ARRAY_CONFIG.maukaBearing} onChange={(value) => updateGlobal("maukaBearing", value)} />
            <ConfigSlider label="Natural frequency" value={config.naturalFrequencyHz} min={0.3} max={15} step={0.1} unit="Hz" defaultValue={DEFAULT_ARRAY_CONFIG.naturalFrequencyHz} onChange={(value) => updateGlobal("naturalFrequencyHz", value)} />
            <ConfigSlider label="Structural damping" value={config.structuralDampingPercent} min={0.1} max={20} step={0.1} unit="%" defaultValue={DEFAULT_ARRAY_CONFIG.structuralDampingPercent} onChange={(value) => updateGlobal("structuralDampingPercent", value)} />
          </div>
          <div className="config-caution">
            <strong>Research basis:</strong> A field-tested tracking PV support had three torsional modes from 2.9–5.0 Hz and damping from 1.07–2.99%.
            The defaults use the lower bounds, 2.9 Hz and 1.1%, as a conservative screening case. A flexible cable PV support measured 1.49–3.53 Hz and 0.4–1.7% damping.
            This fixed rack has different rails, posts, joints, foundations, and soil. Use an impact or shaker test before design.
            <span className="research-links"><a href="https://research-repository.rmit.edu.au/articles/journal_contribution/Modal_analysis_of_tracking_photovoltaic_support_system/27578556" target="_blank" rel="noreferrer">RMIT field modal study</a><a href="https://www.mdpi.com/2076-3417/15/11/5919" target="_blank" rel="noreferrer">Flexible PV field study</a></span>
          </div>
        </section>

        <p className="storage-note">This configuration is saved in this browser. It does not change the default for other people who open the public link.</p>
      </div>
    </main>
  );
}

function ConfigSlider({ label, value, min, max, step, unit, defaultValue, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; defaultValue: number; onChange: (value: number) => void }) {
  const digits = step >= 1 ? 0 : Math.min(3, (step.toString().split(".")[1] ?? "").length);
  const marker = Math.min(100, Math.max(0, (defaultValue - min) / (max - min) * 100));
  return (
    <div className="config-slider">
      <span><span>{label}</span><strong>{value.toFixed(digits)} <small>{unit}</small></strong></span>
      <div>
        <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <button type="button" className="config-default-marker" style={{ left: `${marker}%` }} onClick={() => onChange(defaultValue)} aria-label={`Restore ${label} default, ${defaultValue}${unit}`} title={`Default: ${defaultValue}${unit}`} />
      </div>
      <button type="button" className="config-default-label" onClick={() => onChange(defaultValue)}>Default {defaultValue}{unit}</button>
    </div>
  );
}
