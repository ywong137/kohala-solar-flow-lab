import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENARIOS,
  getArrayBounds,
  getRowOffsetX,
  getRowWidth,
  getRetainingWallClearance,
  getRowCenterZ,
  getSoutheastEdgeLine,
  getScreenGeometry,
  simulate,
} from "../app/lib/physics.ts";
import { DEFAULT_ARRAY_CONFIG, cloneArrayConfig, getArrayMetrics } from "../app/lib/array-config.ts";

const baseConfig = {
  geometry: cloneArrayConfig(DEFAULT_ARRAY_CONFIG),
  ...SCENARIOS.storm,
  panelFrequencyHz: DEFAULT_ARRAY_CONFIG.naturalFrequencyHz,
  dampingPercent: DEFAULT_ARRAY_CONFIG.structuralDampingPercent,
  mitigation: "none",
  screenPorosity: 40,
  screenHeightM: 2.2,
  screenStartRow: 7,
  screenEndRow: 7,
  vaneLengthM: getArrayMetrics(DEFAULT_ARRAY_CONFIG).tableChordM,
  vaneStartRow: 1,
  vaneEndRow: 1,
  spoilerStyle: "perforated",
  spoilerHeightM: 0.3,
  spoilerAngleDeg: 20,
  spoilerStartRow: 1,
  spoilerEndRow: 1,
  damperSpacingM: 2,
  damperDampingPercent: 5.5,
  damperStartRow: 1,
  damperEndRow: 1,
};

test("continues one southeast endpoint line through both half rows", () => {
  const rightEdge = (row) => getRowOffsetX(row, DEFAULT_ARRAY_CONFIG) + getRowWidth(row, DEFAULT_ARRAY_CONFIG) / 2;
  const edgeLine = getSoutheastEdgeLine(DEFAULT_ARRAY_CONFIG);
  for (let row = 1; row <= DEFAULT_ARRAY_CONFIG.rows.length; row += 1) {
    const expectedX = edgeLine.interceptXM + edgeLine.slopeXPerZM * getRowCenterZ(row, DEFAULT_ARRAY_CONFIG);
    assert.ok(Math.abs(rightEdge(row) - expectedX) < 0.001);
    assert.ok(Math.abs(getRetainingWallClearance(rightEdge(row), getRowCenterZ(row, DEFAULT_ARRAY_CONFIG)) - 3) < 0.001);
  }
  assert.ok(Math.abs(edgeLine.bearingDeg - 53.5) < 0.2);
});

test("resolves every physical panel and column", () => {
  const result = simulate(baseConfig);
  const metrics = getArrayMetrics(baseConfig.geometry);
  assert.equal(result.rows.flatMap((row) => row.panels).length, metrics.totalPanelCount);
  assert.deepEqual(result.rows.map((row) => row.panels.length), metrics.panelCounts);

  const angled = simulate({ ...baseConfig, windBearing: 60 });
  const rowFourPressures = angled.rows[3].panels.map((panel) => panel.peakUpliftKpa);
  assert.ok(Math.max(...rowFourPressures) - Math.min(...rowFourPressures) > 0.02);
});

test("applies damper damping only to fitted rows", () => {
  const light = simulate({
    ...baseConfig,
    mitigation: "dampers",
    damperStartRow: 1,
    damperEndRow: 1,
    damperDampingPercent: 1,
  });
  const heavy = simulate({
    ...baseConfig,
    mitigation: "dampers",
    damperStartRow: 1,
    damperEndRow: 1,
    damperDampingPercent: 10,
  });

  assert.ok(heavy.rows[0].vibrationIndex < light.rows[0].vibrationIndex);
  for (let rowIndex = 1; rowIndex < light.rows.length; rowIndex += 1) {
    assert.equal(heavy.rows[rowIndex].vibrationIndex, light.rows[rowIndex].vibrationIndex);
    assert.equal(heavy.rows[rowIndex].peakUpliftKpa, light.rows[rowIndex].peakUpliftKpa);
  }
});

test("uses inclusive placement ranges for every fitted concept", () => {
  const baseline = simulate(baseConfig);
  const vanes = simulate({ ...baseConfig, mitigation: "vanes", vaneStartRow: 3, vaneEndRow: 4 });
  const spoilers = simulate({ ...baseConfig, mitigation: "spoilers", spoilerStartRow: 3, spoilerEndRow: 4 });
  const dampers = simulate({ ...baseConfig, mitigation: "dampers", damperStartRow: 3, damperEndRow: 4, damperDampingPercent: 10 });

  // Flow devices can change rows downwind through their altered wakes. The rear upwind row stays unchanged.
  assert.equal(vanes.rows[6].peakUpliftKpa, baseline.rows[6].peakUpliftKpa);
  assert.equal(spoilers.rows[6].peakUpliftKpa, baseline.rows[6].peakUpliftKpa);
  assert.equal(dampers.rows[0].vibrationIndex, baseline.rows[0].vibrationIndex);
  assert.ok(vanes.rows[2].peakUpliftKpa < baseline.rows[2].peakUpliftKpa);
  assert.ok(spoilers.rows[3].peakUpliftKpa < baseline.rows[3].peakUpliftKpa);
  assert.ok(dampers.rows[2].vibrationIndex < baseline.rows[2].vibrationIndex);
  assert.ok(dampers.rows[3].vibrationIndex < baseline.rows[3].vibrationIndex);
});

test("keeps local flow devices on their fitted rows", () => {
  const baseline = simulate(baseConfig);
  for (const mitigation of ["vanes", "spoilers"]) {
    const fitted = simulate({ ...baseConfig, mitigation });
    assert.ok(fitted.rows[0].peakUpliftKpa < baseline.rows[0].peakUpliftKpa);
    for (let rowIndex = 1; rowIndex < fitted.rows.length; rowIndex += 1) {
      assert.equal(fitted.rows[rowIndex].peakUpliftKpa, baseline.rows[rowIndex].peakUpliftKpa);
    }
  }
});

test("makes every screen span the full array envelope", () => {
  const bounds = getArrayBounds(baseConfig.geometry);
  const rearScreen = getScreenGeometry(7, baseConfig.geometry);
  const fullRowScreen = getScreenGeometry(4, baseConfig.geometry);

  assert.equal(rearScreen.width, fullRowScreen.width);
  assert.equal(rearScreen.x, fullRowScreen.x);
  assert.ok(rearScreen.width > bounds.width);
});

test("resolves a saved custom row layout", () => {
  const geometry = cloneArrayConfig(DEFAULT_ARRAY_CONFIG);
  geometry.rows[0].columns = 20;
  geometry.rows[6].columns = 11;
  geometry.rows.push({ columns: 18, panelsDeep: 3, offsetXM: 6.2 });
  geometry.rowSpacingM = 7.1;
  const result = simulate({
    ...baseConfig,
    geometry,
    screenStartRow: 8,
    screenEndRow: 8,
  });

  assert.equal(result.rows.length, 8);
  assert.deepEqual(result.rows.map((row) => row.panels.length), getArrayMetrics(geometry).panelCounts);
});

test("places screens behind an inclusive row range", () => {
  const rearOnly = simulate({
    ...baseConfig,
    mitigation: "screen",
    screenStartRow: 7,
    screenEndRow: 7,
  });
  const rearTwo = simulate({
    ...baseConfig,
    mitigation: "screen",
    screenStartRow: 6,
    screenEndRow: 7,
  });

  assert.ok(rearTwo.rows[5].peakUpliftKpa < rearOnly.rows[5].peakUpliftKpa);
  assert.ok(rearTwo.rows[0].vibrationIndex < rearOnly.rows[0].vibrationIndex);
});

test("does not apply a rear screen to an upwind makai array", () => {
  const makaiBase = simulate({ ...baseConfig, ...SCENARIOS.makai });
  const makaiScreen = simulate({
    ...baseConfig,
    ...SCENARIOS.makai,
    mitigation: "screen",
    screenStartRow: 7,
    screenEndRow: 7,
  });

  assert.equal(makaiScreen.peakUpliftKpa, makaiBase.peakUpliftKpa);
  assert.equal(makaiScreen.vibrationIndex, makaiBase.vibrationIndex);
});

test("resolves wind-screen demand by bay and fitted row", () => {
  const openScreen = simulate({
    ...baseConfig,
    mitigation: "screen",
    screenPorosity: 80,
    screenStartRow: 6,
    screenEndRow: 7,
  });
  const solidScreen = simulate({
    ...baseConfig,
    mitigation: "screen",
    screenPorosity: 20,
    screenStartRow: 6,
    screenEndRow: 7,
  });

  assert.equal(openScreen.mitigationLoad.concept, "screen");
  assert.deepEqual(openScreen.mitigationLoad.rows.map((row) => row.row), [6, 7]);
  assert.ok(openScreen.mitigationLoad.rows.every((row) => row.elementCount > 1));
  assert.ok(solidScreen.mitigationLoad.peakPressureKpa > openScreen.mitigationLoad.peakPressureKpa);
  assert.ok(solidScreen.mitigationLoad.peakAttachmentLoadKn > 0);
  assert.ok(solidScreen.mitigationLoad.peakOverturningMomentKnM > 0);
});

test("scales added-hardware demand with wind speed and direction", () => {
  const slow = simulate({ ...baseConfig, mitigation: "spoilers", windSpeedMph: 45 });
  const fast = simulate({ ...baseConfig, mitigation: "spoilers", windSpeedMph: 90 });
  const alongRows = simulate({ ...baseConfig, mitigation: "spoilers", windBearing: 130 });

  assert.ok(fast.mitigationLoad.peakPressureKpa > slow.mitigationLoad.peakPressureKpa * 3.5);
  assert.ok(fast.mitigationLoad.peakAttachmentLoadKn > slow.mitigationLoad.peakAttachmentLoadKn * 3.5);
  assert.ok(alongRows.mitigationLoad.peakPressureKpa < fast.mitigationLoad.peakPressureKpa);
  assert.equal(fast.mitigationLoad.rows[0].elementCount, baseConfig.geometry.rows[0].columns);
});

test("includes local rack motion in attached mitigation vibration", () => {
  for (const mitigation of ["vanes", "spoilers"]) {
    const result = simulate({
      ...baseConfig,
      mitigation,
      vaneStartRow: 2,
      vaneEndRow: 2,
      spoilerStartRow: 2,
      spoilerEndRow: 2,
    });
    const rowPanels = result.rows[1].panels;
    const deviceRow = result.mitigationLoad.rows[0];
    const panelPeak = Math.max(...rowPanels.map((panel) => panel.vibrationIndex));
    const panelMinimum = Math.min(...rowPanels.map((panel) => panel.vibrationIndex));
    const devicePeak = Math.max(...deviceRow.elements.map((element) => element.vibrationIndex));
    const deviceMinimum = Math.min(...deviceRow.elements.map((element) => element.vibrationIndex));

    assert.ok(devicePeak >= panelPeak);
    assert.ok(deviceMinimum >= panelMinimum);
    assert.ok(devicePeak - deviceMinimum > 10);
  }
});

test("resolves transferred cyclic demand at every fitted damper", () => {
  const dense = simulate({
    ...baseConfig,
    mitigation: "dampers",
    damperSpacingM: 0.8,
    damperStartRow: 2,
    damperEndRow: 3,
  });
  const sparse = simulate({
    ...baseConfig,
    mitigation: "dampers",
    damperSpacingM: 4,
    damperStartRow: 2,
    damperEndRow: 3,
  });

  assert.deepEqual(dense.mitigationLoad.rows.map((row) => row.row), [2, 3]);
  assert.ok(dense.mitigationLoad.elementCount > sparse.mitigationLoad.elementCount);
  assert.ok(dense.mitigationLoad.peakAttachmentLoadKn < sparse.mitigationLoad.peakAttachmentLoadKn);
  assert.equal(dense.mitigationLoad.peakOverturningMomentKnM, 0);
});
