import assert from "node:assert/strict";
import test from "node:test";

import {
  SCENARIOS,
  getArrayBounds,
  getPanelVisualMotion,
  getRowOffsetX,
  getRowWidth,
  getRetainingWallClearance,
  getRetainingWallX,
  getRetainingWallTopHeight,
  getRowCenterZ,
  getSoutheastEdgeLine,
  getSiteFlowEffects,
  getSiteTerrainHeight,
  getScreenGeometry,
  pressureColor,
  pressureDemandLabel,
  resolveSiteFlowBoundary,
  riskColor,
  simulate,
} from "../app/lib/physics.ts";
import { DEFAULT_ARRAY_CONFIG, cloneArrayConfig, getArrayMetrics } from "../app/lib/array-config.ts";

const baseConfig = {
  geometry: cloneArrayConfig(DEFAULT_ARRAY_CONFIG),
  ...SCENARIOS.storm,
  panelFrequencyHz: DEFAULT_ARRAY_CONFIG.naturalFrequencyHz,
  dampingPercent: DEFAULT_ARRAY_CONFIG.structuralDampingPercent,
  activeMitigations: [],
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

test("turns yellow at 26 vibration and reports the displayed panel travel", () => {
  assert.equal(riskColor(26), "#e9ef72");
  const motion = getPanelVisualMotion(26, DEFAULT_ARRAY_CONFIG);
  assert.ok(Math.abs(motion.peakToPeakMm - 5.6) < 0.1);
  assert.ok(Math.abs(motion.panelLengthPercent - 0.286) < 0.005);
});

test("uses an absolute pressure-demand scale across weather scenarios", () => {
  assert.equal(pressureColor(0.08), "#69d9ff");
  assert.equal(pressureDemandLabel(0.08), "Low");
  assert.equal(pressureDemandLabel(0.32), "Moderate");
  assert.equal(pressureDemandLabel(0.7), "Elevated");
  assert.equal(pressureDemandLabel(1.1), "High");
  assert.equal(pressureDemandLabel(1.53), "Severe");
  assert.notEqual(pressureColor(0.08), pressureColor(1.53));
});

test("keeps sea breezes blue while escalating high-wind pressure", () => {
  const makaiSeaBreeze = simulate({ ...baseConfig, ...SCENARIOS.makai });
  const southeastCrosswind = simulate({ ...baseConfig, ...SCENARIOS.cross });
  const maukaStorm = simulate({ ...baseConfig, ...SCENARIOS.storm });

  assert.equal(pressureDemandLabel(makaiSeaBreeze.peakUpliftKpa), "Low");
  assert.equal(pressureDemandLabel(southeastCrosswind.peakUpliftKpa), "Moderate");
  assert.equal(pressureDemandLabel(maukaStorm.peakUpliftKpa), "Severe");
});

test("routes site flow over the hill and retaining wall", () => {
  const z = 0;
  const wallX = getRetainingWallX(z, DEFAULT_ARRAY_CONFIG);
  const wallTop = getRetainingWallTopHeight(z, DEFAULT_ARRAY_CONFIG);
  const lowerGround = getSiteTerrainHeight(wallX - 1, z, DEFAULT_ARRAY_CONFIG);
  const hillGround = getSiteTerrainHeight(wallX + 20, z, DEFAULT_ARRAY_CONFIG);

  assert.ok(hillGround > lowerGround + wallTop);

  const crosswindWake = getSiteFlowEffects(
    wallX - 3,
    1.1,
    z,
    { x: -1, z: 0 },
    DEFAULT_ARRAY_CONFIG,
  );
  const alongWall = getSiteFlowEffects(
    wallX - 3,
    1.1,
    z,
    { x: 0, z: 1 },
    DEFAULT_ARRAY_CONFIG,
  );
  assert.ok(crosswindWake.wallWakeFactor > alongWall.wallWakeFactor);
  assert.ok(crosswindWake.speedFactor < alongWall.speedFactor);
  assert.ok(crosswindWake.turbulenceAdd > alongWall.turbulenceAdd);

  const wallCrossing = resolveSiteFlowBoundary(
    { x: wallX + 0.3, y: 0.5, z },
    { x: wallX - 0.3, y: 0.5, z },
    DEFAULT_ARRAY_CONFIG,
  );
  assert.equal(wallCrossing.clearedWall, true);
  assert.ok(wallCrossing.y >= wallTop + 0.1);

  const hillCollision = resolveSiteFlowBoundary(
    { x: wallX + 18, y: hillGround + 1, z },
    { x: wallX + 20, y: 0, z },
    DEFAULT_ARRAY_CONFIG,
  );
  assert.equal(hillCollision.hitTerrain, true);
  assert.ok(hillCollision.y >= hillGround + 0.1);
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
    activeMitigations: ["dampers"],
    damperStartRow: 1,
    damperEndRow: 1,
    damperDampingPercent: 1,
  });
  const heavy = simulate({
    ...baseConfig,
    activeMitigations: ["dampers"],
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
  const vanes = simulate({ ...baseConfig, activeMitigations: ["vanes"], vaneStartRow: 3, vaneEndRow: 4 });
  const spoilers = simulate({ ...baseConfig, activeMitigations: ["spoilers"], spoilerStartRow: 3, spoilerEndRow: 4 });
  const dampers = simulate({ ...baseConfig, activeMitigations: ["dampers"], damperStartRow: 3, damperEndRow: 4, damperDampingPercent: 10 });

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
    const fitted = simulate({ ...baseConfig, activeMitigations: [mitigation] });
    assert.ok(fitted.rows[0].peakUpliftKpa < baseline.rows[0].peakUpliftKpa);
    for (let rowIndex = 1; rowIndex < fitted.rows.length; rowIndex += 1) {
      assert.equal(fitted.rows[rowIndex].peakUpliftKpa, baseline.rows[rowIndex].peakUpliftKpa);
    }
  }
});

test("combines every active mitigation and reports each hardware load", () => {
  const baseline = simulate(baseConfig);
  const screenOnly = simulate({ ...baseConfig, activeMitigations: ["screen"] });
  const allActive = simulate({
    ...baseConfig,
    activeMitigations: ["screen", "vanes", "spoilers", "dampers"],
    vaneEndRow: 3,
    spoilerEndRow: 2,
    damperEndRow: 2,
  });

  assert.deepEqual(
    allActive.mitigationLoads.map((load) => load.concept),
    ["screen", "vanes", "spoilers", "dampers"],
  );
  assert.deepEqual(baseline.mitigationLoads, []);
  assert.ok(allActive.peakUpliftKpa < screenOnly.peakUpliftKpa);
  assert.ok(allActive.vibrationIndex < 100);
  assert.ok(allActive.mitigationLoads.every((load) => load.elementCount > 0));
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
    activeMitigations: ["screen"],
    screenStartRow: 7,
    screenEndRow: 7,
  });
  const rearTwo = simulate({
    ...baseConfig,
    activeMitigations: ["screen"],
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
    activeMitigations: ["screen"],
    screenStartRow: 7,
    screenEndRow: 7,
  });

  assert.equal(makaiScreen.peakUpliftKpa, makaiBase.peakUpliftKpa);
  assert.equal(makaiScreen.vibrationIndex, makaiBase.vibrationIndex);
});

test("resolves wind-screen demand by bay and fitted row", () => {
  const openScreen = simulate({
    ...baseConfig,
    activeMitigations: ["screen"],
    screenPorosity: 80,
    screenStartRow: 6,
    screenEndRow: 7,
  });
  const solidScreen = simulate({
    ...baseConfig,
    activeMitigations: ["screen"],
    screenPorosity: 20,
    screenStartRow: 6,
    screenEndRow: 7,
  });

  const openScreenLoad = openScreen.mitigationLoads[0];
  const solidScreenLoad = solidScreen.mitigationLoads[0];
  assert.equal(openScreenLoad.concept, "screen");
  assert.deepEqual(openScreenLoad.rows.map((row) => row.row), [6, 7]);
  assert.ok(openScreenLoad.rows.every((row) => row.elementCount > 1));
  assert.ok(solidScreenLoad.peakPressureKpa > openScreenLoad.peakPressureKpa);
  assert.ok(solidScreenLoad.peakAttachmentLoadKn > 0);
  assert.ok(solidScreenLoad.peakOverturningMomentKnM > 0);
});

test("scales added-hardware demand with wind speed and direction", () => {
  const slow = simulate({ ...baseConfig, activeMitigations: ["spoilers"], windSpeedMph: 45 });
  const fast = simulate({ ...baseConfig, activeMitigations: ["spoilers"], windSpeedMph: 90 });
  const alongRows = simulate({ ...baseConfig, activeMitigations: ["spoilers"], windBearing: 130 });

  assert.ok(fast.mitigationLoads[0].peakPressureKpa > slow.mitigationLoads[0].peakPressureKpa * 3.5);
  assert.ok(fast.mitigationLoads[0].peakAttachmentLoadKn > slow.mitigationLoads[0].peakAttachmentLoadKn * 3.5);
  assert.ok(alongRows.mitigationLoads[0].peakPressureKpa < fast.mitigationLoads[0].peakPressureKpa);
  assert.equal(fast.mitigationLoads[0].rows[0].elementCount, baseConfig.geometry.rows[0].columns);
});

test("includes local rack motion in attached mitigation vibration", () => {
  for (const mitigation of ["vanes", "spoilers"]) {
    const result = simulate({
      ...baseConfig,
      activeMitigations: [mitigation],
      vaneStartRow: 2,
      vaneEndRow: 2,
      spoilerStartRow: 2,
      spoilerEndRow: 2,
    });
    const rowPanels = result.rows[1].panels;
    const deviceRow = result.mitigationLoads[0].rows[0];
    const panelPeak = Math.max(...rowPanels.map((panel) => panel.vibrationIndex));
    const panelMinimum = Math.min(...rowPanels.map((panel) => panel.vibrationIndex));
    const devicePeak = Math.max(...deviceRow.elements.map((element) => element.vibrationIndex));
    const deviceMinimum = Math.min(...deviceRow.elements.map((element) => element.vibrationIndex));

    assert.ok(devicePeak >= panelPeak * 0.99);
    assert.ok(deviceMinimum >= panelMinimum);
    assert.ok(devicePeak - deviceMinimum > 10);
  }
});

test("resolves transferred cyclic demand at every fitted damper", () => {
  const dense = simulate({
    ...baseConfig,
    activeMitigations: ["dampers"],
    damperSpacingM: 0.8,
    damperStartRow: 2,
    damperEndRow: 3,
  });
  const sparse = simulate({
    ...baseConfig,
    activeMitigations: ["dampers"],
    damperSpacingM: 4,
    damperStartRow: 2,
    damperEndRow: 3,
  });

  assert.deepEqual(dense.mitigationLoads[0].rows.map((row) => row.row), [2, 3]);
  assert.ok(dense.mitigationLoads[0].elementCount > sparse.mitigationLoads[0].elementCount);
  assert.ok(dense.mitigationLoads[0].peakAttachmentLoadKn < sparse.mitigationLoads[0].peakAttachmentLoadKn);
  assert.equal(dense.mitigationLoads[0].peakOverturningMomentKnM, 0);
});
