import assert from "node:assert/strict";
import test from "node:test";

import {
  ROW_PANEL_COUNTS,
  SCENARIOS,
  TABLE_CHORD_M,
  TOTAL_PANEL_COUNT,
  simulate,
} from "../app/lib/physics.ts";

const baseConfig = {
  ...SCENARIOS.storm,
  panelFrequencyHz: 2.4,
  dampingPercent: 2.5,
  mitigation: "none",
  screenPorosity: 40,
  screenHeightM: 2.2,
  screenStartRow: 7,
  screenEndRow: 7,
  vaneLengthM: TABLE_CHORD_M,
  vaneRowCount: 1,
  spoilerStyle: "perforated",
  spoilerHeightM: 0.3,
  spoilerAngleDeg: 20,
  spoilerRowCount: 1,
  damperSpacingM: 2,
  damperDampingPercent: 5.5,
  damperRowCount: 1,
};

test("resolves every physical panel and column", () => {
  const result = simulate(baseConfig);
  assert.equal(result.rows.flatMap((row) => row.panels).length, TOTAL_PANEL_COUNT);
  assert.deepEqual(result.rows.map((row) => row.panels.length), ROW_PANEL_COUNTS);

  const angled = simulate({ ...baseConfig, windBearing: 60 });
  const rowFourPressures = angled.rows[3].panels.map((panel) => panel.peakUpliftKpa);
  assert.ok(Math.max(...rowFourPressures) - Math.min(...rowFourPressures) > 0.02);
});

test("applies damper damping only to fitted rows", () => {
  const light = simulate({
    ...baseConfig,
    mitigation: "dampers",
    damperRowCount: 1,
    damperDampingPercent: 1,
  });
  const heavy = simulate({
    ...baseConfig,
    mitigation: "dampers",
    damperRowCount: 1,
    damperDampingPercent: 10,
  });

  assert.ok(heavy.rows[0].vibrationIndex < light.rows[0].vibrationIndex);
  for (let rowIndex = 1; rowIndex < light.rows.length; rowIndex += 1) {
    assert.equal(heavy.rows[rowIndex].vibrationIndex, light.rows[rowIndex].vibrationIndex);
    assert.equal(heavy.rows[rowIndex].peakUpliftKpa, light.rows[rowIndex].peakUpliftKpa);
  }
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
