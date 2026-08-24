"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getArrayMetrics } from "../lib/array-config";
import {
  MITIGATION_BASE_COLOR,
  MITIGATIONS,
  PANEL_VISUAL_ROTATION_RAD_PER_INDEX,
  getArrayBounds,
  getFlowComponents,
  getInstalledScreenRows,
  isMitigationActive,
  getArrayPanelCentroid,
  getPanelResult,
  pressureColor,
  riskColor,
  getRetainingWallX,
  getRowCenterZ,
  getRowOffsetX,
  getRowWidth,
  getScreenFlowEffects,
  getScreenGeometry,
  getLowerTerrainHeight,
  rowIsInRange,
  getRetainingWallTopHeight,
  getSiteFlowEffects,
  getSiteTerrainHeight,
  getSiteTerrainLayout,
  resolveSiteFlowBoundary,
  type MitigationConceptId,
  type SimulationConfig,
  type SimulationResult,
  type ViewMode,
} from "../lib/physics";

type SelectedPanel = { row: number; module: number };
export type ArrayState = "repaired" | "restored";

type WindSceneProps = {
  config: SimulationConfig;
  result: SimulationResult;
  viewMode: ViewMode;
  playing: boolean;
  arrayState: ArrayState;
  showSceneLabels: boolean;
  cameraView: "perspective" | "mauka" | "makai" | "plan";
  cameraRequest: number;
  selectedPanel: SelectedPanel;
  colorCodeMitigations: boolean;
  onSelectPanel: (panel: SelectedPanel) => void;
};

type PanelVisual = {
  assembly: THREE.Group;
  glass: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  row: number;
  module: number;
  baseRotationX: number;
  basePosition: THREE.Vector3;
};

type RackVisual = {
  object: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
};

type FlowSample = {
  vx: number;
  vy: number;
  vz: number;
  turbulence: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Hand-traced outer gravel boundary from the north-up 1378 × 1046 satellite image.
// The affine calibration uses the seven photographed row centers and their saved site coordinates.
const SATELLITE_GRAVEL_PIXEL_OUTLINE = [
  [851, 642],
  [810, 600],
  [792, 596],
  [752, 578],
  [740, 567],
  [701, 556],
  [681, 561],
  [667, 559],
  [659, 555],
  [655, 556],
  [642, 565],
  [631, 569],
  [621, 579],
  [616, 581],
  [611, 591],
  [586, 616],
  [574, 631],
  [545, 689],
  [535, 749],
  [549, 788],
  [574, 809],
  [587, 817],
  [612, 815],
  [621, 810],
  [636, 808],
  [671, 789],
  [683, 778],
  [702, 772],
  [865, 682],
  [867, 677],
] as const;

const SATELLITE_SITE_AFFINE = {
  xToPixelX: 3.77581121,
  zToPixelX: -3.23715279,
  xToPixelY: 3.23079084,
  zToPixelY: 3.82954774,
  originPixelX: 676.12,
  originPixelY: 661.4,
};

function satellitePixelToSite(pixelX: number, pixelY: number) {
  const affine = SATELLITE_SITE_AFFINE;
  const shiftedX = pixelX - affine.originPixelX;
  const shiftedY = pixelY - affine.originPixelY;
  const determinant = affine.xToPixelX * affine.zToPixelY - affine.zToPixelX * affine.xToPixelY;
  return new THREE.Vector2(
    (shiftedX * affine.zToPixelY - affine.zToPixelX * shiftedY) / determinant,
    (affine.xToPixelX * shiftedY - shiftedX * affine.xToPixelY) / determinant,
  );
}

const approximateGaussian = () =>
  (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73;
const hash = (value: number) => {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
};

function makePanelTexture(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 256, 512);
  gradient.addColorStop(0, "#143f55");
  gradient.addColorStop(0.5, "#082634");
  gradient.addColorStop(1, "#0c3447");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 512);
  context.strokeStyle = "rgba(170, 225, 237, .38)";
  context.lineWidth = 2;
  for (let column = 1; column < 6; column += 1) {
    context.beginPath();
    context.moveTo((column * 256) / 6, 0);
    context.lineTo((column * 256) / 6, 512);
    context.stroke();
  }
  for (let row = 1; row < 12; row += 1) {
    context.beginPath();
    context.moveTo(0, (row * 512) / 12);
    context.lineTo(256, (row * 512) / 12);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeGroundTexture(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#676460";
  context.fillRect(0, 0, 512, 512);
  const gravelColors = [
    [46, 45, 44],
    [73, 71, 69],
    [92, 89, 86],
    [118, 114, 108],
  ];
  for (let index = 0; index < 22000; index += 1) {
    const color = gravelColors[Math.floor(Math.random() * gravelColors.length)];
    context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.34 + Math.random() * 0.58})`;
    const width = 0.55 + Math.random() * 2.4;
    const height = 0.45 + Math.random() * 1.55;
    context.beginPath();
    context.ellipse(Math.random() * 512, Math.random() * 512, width, height, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 11);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeFieldTexture(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#706a3d";
  context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 9000; index += 1) {
    const warm = 92 + Math.floor(Math.random() * 54);
    context.strokeStyle = `rgba(${warm + 34}, ${warm + 19}, ${Math.max(34, warm - 32)}, ${0.12 + Math.random() * 0.24})`;
    context.beginPath();
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    context.moveTo(x, y);
    context.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 5);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeSkyTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const sky = context.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#71848e");
  sky.addColorStop(0.45, "#9eacb0");
  sky.addColorStop(1, "#d3d0bf");
  context.fillStyle = sky;
  context.fillRect(0, 0, 1024, 512);
  for (let index = 0; index < 140; index += 1) {
    const x = hash(index + 31) * 1024;
    const y = 55 + hash(index + 82) * 250;
    const width = 55 + hash(index + 143) * 190;
    const height = 14 + hash(index + 207) * 42;
    const shade = 128 + Math.floor(hash(index + 281) * 72);
    context.fillStyle = `rgba(${shade}, ${shade + 3}, ${shade + 4}, ${0.025 + hash(index + 353) * 0.12})`;
    context.beginPath();
    context.ellipse(x, y, width, height, hash(index + 401) * 0.35, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type TextSpriteStyle = "default" | "accent" | "selection";

function makeTextSprite(text: string, style: TextSpriteStyle = "default") {
  const canvas = document.createElement("canvas");
  canvas.height = 128;
  let context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  const accent = style === "accent";
  const selection = style === "selection";
  const font = "600 42px Arial";
  context.font = font;
  canvas.width = Math.min(1536, Math.max(320, Math.ceil(context.measureText(text).width + 72)));
  context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  context.fillStyle = selection
    ? "rgba(255, 231, 106, .96)"
    : accent
      ? "rgba(119, 246, 197, .74)"
      : "rgba(7, 17, 24, .62)";
  context.beginPath();
  context.roundRect(8, 8, canvas.width - 16, 112, 20);
  context.fill();
  context.strokeStyle = selection
    ? "rgba(255, 250, 206, .96)"
    : accent
      ? "rgba(215, 255, 240, .62)"
      : "rgba(134, 211, 230, .32)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = selection || accent ? "#07130f" : "#dffaff";
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, 66);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
  const sprite = new THREE.Sprite(material);
  const worldHeight = selection ? 0.98 : 1.22;
  sprite.scale.set(worldHeight * canvas.width / canvas.height, worldHeight, 1);
  return sprite;
}

function makeRackBeam(
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width, direction.length(), depth), material);
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  beam.castShadow = true;
  return beam;
}

export function WindScene({
  config,
  result,
  viewMode,
  playing,
  arrayState,
  showSceneLabels,
  cameraView,
  cameraRequest,
  selectedPanel,
  colorCodeMitigations,
  onSelectPanel,
}: WindSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const geometryKey = JSON.stringify(config.geometry);
  const liveRef = useRef({
    config,
    result,
    viewMode,
    playing,
    arrayState,
    showSceneLabels,
    cameraView,
    cameraRequest,
    selectedPanel,
    colorCodeMitigations,
    onSelectPanel,
  });

  useEffect(() => {
    liveRef.current = {
      config,
      result,
      viewMode,
      playing,
      arrayState,
      showSceneLabels,
      cameraView,
      cameraRequest,
      selectedPanel,
      colorCodeMitigations,
      onSelectPanel,
    };
  }, [config, result, viewMode, playing, arrayState, showSceneLabels, cameraView, cameraRequest, selectedPanel, colorCodeMitigations, onSelectPanel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const geometry = liveRef.current.config.geometry;
    const geometryMetrics = getArrayMetrics(geometry);
    const rowCount = geometry.rows.length;
    const panelSpanM = geometry.panelWidthM;
    const panelSlopeM = geometry.panelLengthM;
    const panelGapM = geometry.panelGapM;
    const panelThicknessM = geometry.panelThicknessM;
    const tableChordM = geometryMetrics.tableChordM;
    const rowSpacingM = geometry.rowSpacingM;
    const tilt = THREE.MathUtils.degToRad(geometry.tiltDeg);
    const arrayBounds = getArrayBounds(geometry);
    const arrayCenterX = arrayBounds.centerX;
    const arrayPanelCentroid = getArrayPanelCentroid(geometry);
    const rowCentersZ = geometry.rows.map((_, index) => getRowCenterZ(index + 1, geometry));
    const arrayFootprintDepth = Math.max(...rowCentersZ) - Math.min(...rowCentersZ)
      + tableChordM * Math.cos(tilt);
    const sceneWidth = Math.max(92, arrayBounds.width + 26);
    const sceneDepth = Math.max(84, (rowCount - 1) * rowSpacingM + tableChordM + 28);
    const sceneExtent = Math.max(sceneWidth, sceneDepth);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9aa9aa);
    scene.fog = new THREE.FogExp2(0xa8b2ae, 0.0055);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, Math.max(180, sceneExtent * 4));
    camera.position.set(35, 27, 40);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 12;
    controls.maxDistance = Math.max(100, sceneExtent * 2.2);
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.target.set(0, 0.3, 0);

    scene.add(new THREE.HemisphereLight(0xdce8eb, 0x433f28, 1.75));
    const sun = new THREE.DirectionalLight(0xfff0d2, 2.65);
    sun.position.set(-22, 34, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -42;
    sun.shadow.camera.right = 42;
    sun.shadow.camera.top = 42;
    sun.shadow.camera.bottom = -42;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8bc9d8, 0.75);
    rim.position.set(24, 8, 30);
    scene.add(rim);

    const skyTexture = makeSkyTexture();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(230, 48, 24),
      new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false }),
    );
    sky.position.y = 14;
    scene.add(sky);

    const groundTexture = makeGroundTexture(renderer);
    const fieldTexture = makeFieldTexture(renderer);
    const terrainLayout = getSiteTerrainLayout(geometry);
    const {
      gravelDepth,
      gravelCenterZ,
      gravelMinX,
      gravelMinZ,
      gravelMaxZ,
      wallDepth,
      wallMinZ,
      wallMaxZ,
      retainedHillWidth,
    } = terrainLayout;
    const wallXAt = (z: number) => getRetainingWallX(z, geometry);
    const wallTopHeightAt = (z: number) => getRetainingWallTopHeight(z, geometry);
    const lowerTerrainHeightAt = (x: number, z: number) => getLowerTerrainHeight(x, z, geometry);
    const siteTerrainHeightAt = (x: number, z: number) => getSiteTerrainHeight(x, z, geometry);

    const fieldWidth = 240;
    const fieldDepth = 155;
    const fieldCenterZ = -23;
    const fieldGeometry = new THREE.PlaneGeometry(fieldWidth, fieldDepth, 72, 56);
    const fieldPositions = fieldGeometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < fieldPositions.count; index += 1) {
      const worldX = arrayCenterX + fieldPositions.getX(index);
      const worldZ = fieldCenterZ - fieldPositions.getY(index);
      fieldPositions.setZ(index, lowerTerrainHeightAt(worldX, worldZ));
    }
    fieldPositions.needsUpdate = true;
    fieldGeometry.computeVertexNormals();
    const field = new THREE.Mesh(
      fieldGeometry,
      new THREE.MeshStandardMaterial({ map: fieldTexture, color: 0x91854c, roughness: 1 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(arrayCenterX, 0, fieldCenterZ);
    field.receiveShadow = true;
    scene.add(field);

    const gravelPositions: number[] = [];
    const gravelUvs: number[] = [];
    const gravelIndices: number[] = [];
    const gravelOutline = SATELLITE_GRAVEL_PIXEL_OUTLINE.map(([pixelX, pixelY]) =>
      satellitePixelToSite(pixelX, pixelY),
    );
    // Keep the photographed wall-side vertices beneath the rendered wall.
    for (const index of [0, ...Array.from({ length: 6 }, (_, offset) => 24 + offset)]) {
      gravelOutline[index].x = wallXAt(gravelOutline[index].y) + 0.75;
    }
    const gravelFaces = THREE.ShapeUtils.triangulateShape(gravelOutline, []);
    const gravelBoundsMinX = Math.min(...gravelOutline.map((point) => point.x));
    const gravelBoundsMaxX = Math.max(...gravelOutline.map((point) => point.x));
    const gravelBoundsMinZ = Math.min(...gravelOutline.map((point) => point.y));
    const gravelBoundsMaxZ = Math.max(...gravelOutline.map((point) => point.y));
    gravelOutline.forEach((point) => {
      gravelPositions.push(point.x, -0.025, point.y);
      gravelUvs.push(
        (point.x - gravelBoundsMinX) / Math.max(0.001, gravelBoundsMaxX - gravelBoundsMinX),
        (point.y - gravelBoundsMinZ) / Math.max(0.001, gravelBoundsMaxZ - gravelBoundsMinZ),
      );
    });
    // ShapeUtils triangulates in XY. Reverse each face after mapping Y to world Z.
    gravelFaces.forEach((face) => gravelIndices.push(face[0], face[2], face[1]));
    const gravelGeometry = new THREE.BufferGeometry();
    gravelGeometry.setAttribute("position", new THREE.Float32BufferAttribute(gravelPositions, 3));
    gravelGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(gravelUvs, 2));
    gravelGeometry.setIndex(gravelIndices);
    gravelGeometry.computeVertexNormals();
    const ground = new THREE.Mesh(
      gravelGeometry,
      new THREE.MeshStandardMaterial({
        map: groundTexture,
        bumpMap: groundTexture,
        bumpScale: 0.075,
        color: 0xa7a29c,
        roughness: 1,
        metalness: 0,
      }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const hillApronPositions: number[] = [];
    const hillApronUvs: number[] = [];
    const hillApronIndices: number[] = [];
    const hillCrossSegments = 28;
    const hillDepthSegments = 48;
    const hillApronMinZ = wallMinZ - 14;
    const hillApronDepth = wallDepth + 28;
    for (let depthSegment = 0; depthSegment <= hillDepthSegments; depthSegment += 1) {
      const depthProgress = depthSegment / hillDepthSegments;
      const z = hillApronMinZ + depthProgress * hillApronDepth;
      const edgeX = wallXAt(z) + 0.12;
      for (let crossSegment = 0; crossSegment <= hillCrossSegments; crossSegment += 1) {
        const crossProgress = crossSegment / hillCrossSegments;
        const x = edgeX + crossProgress * retainedHillWidth;
        hillApronPositions.push(x, siteTerrainHeightAt(x, z) + 0.015, z);
        hillApronUvs.push(crossProgress, depthProgress);
        if (depthSegment < hillDepthSegments && crossSegment < hillCrossSegments) {
          const start = depthSegment * (hillCrossSegments + 1) + crossSegment;
          const nextRow = start + hillCrossSegments + 1;
          hillApronIndices.push(start, nextRow, start + 1, start + 1, nextRow, nextRow + 1);
        }
      }
    }
    const hillApronGeometry = new THREE.BufferGeometry();
    hillApronGeometry.setAttribute("position", new THREE.Float32BufferAttribute(hillApronPositions, 3));
    hillApronGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(hillApronUvs, 2));
    hillApronGeometry.setIndex(hillApronIndices);
    hillApronGeometry.computeVertexNormals();
    const hillApron = new THREE.Mesh(
      hillApronGeometry,
      new THREE.MeshStandardMaterial({ map: fieldTexture, color: 0x91854c, roughness: 1, side: THREE.DoubleSide }),
    );
    hillApron.receiveShadow = true;
    scene.add(hillApron);

    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 92),
      new THREE.MeshStandardMaterial({ color: 0x416b75, roughness: 0.48, metalness: 0.08, transparent: true, opacity: 0.92 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(arrayCenterX, -0.45, 96);
    scene.add(ocean);

    const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x65704b, roughness: 1 });
    for (let index = 0; index < 9; index += 1) {
      const radius = 17 + hash(index + 610) * 18;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, 7 + hash(index + 650) * 8, 7), hillMaterial);
      hill.position.set(arrayCenterX - 95 + index * 24, 2.8, -90 - hash(index + 690) * 18);
      hill.scale.z = 0.72;
      scene.add(hill);
    }

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x59442d, roughness: 1 });
    const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x405737, roughness: 1 });
    for (let index = 0; index < 24; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const tree = new THREE.Group();
      const trunkHeight = 1.8 + hash(index + 730) * 2.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, trunkHeight, 7), trunkMaterial);
      trunk.position.y = trunkHeight / 2;
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1 + hash(index + 770) * 1.4, 0), canopyMaterial);
      canopy.scale.set(1.5, 0.62, 1.05);
      canopy.position.y = trunkHeight + 0.25;
      tree.add(trunk, canopy);
      const treeX = arrayCenterX + side * (32 + hash(index + 810) * 63);
      const treeZ = -62 + hash(index + 850) * 96;
      const treeY = siteTerrainHeightAt(treeX, treeZ);
      tree.position.set(treeX, treeY, treeZ);
      scene.add(tree);
    }

    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3025, roughness: 1 });
    const rockGeometry = new THREE.DodecahedronGeometry(0.33, 0);
    const wallColumns = Math.ceil(wallDepth / 0.46);
    const wallStoneData: Array<{ column: number; layer: number; layers: number; z: number }> = [];
    for (let column = 0; column < wallColumns; column += 1) {
      const z = wallMinZ + column * (wallDepth / Math.max(1, wallColumns - 1));
      const layers = Math.max(3, Math.ceil(wallTopHeightAt(z) / 0.23));
      for (let layer = 0; layer < layers; layer += 1) wallStoneData.push({ column, layer, layers, z });
    }
    const rockCount = wallStoneData.length;
    const wall = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
    const stone = new THREE.Object3D();
    for (let index = 0; index < rockCount; index += 1) {
      const { column, layer, layers, z } = wallStoneData[index];
      const top = wallTopHeightAt(z);
      stone.position.set(
        wallXAt(z) + (hash(index + 900) - 0.5) * 0.58,
        (layer + 0.52) * (top / layers) + hash(index + 930) * 0.035,
        z + (hash(index + 960) - 0.5) * 0.22,
      );
      stone.rotation.set(hash(index + 990) * 0.5, hash(index + 1020) * Math.PI, hash(index + 1050) * 0.4);
      stone.scale.set(0.9 + hash(index + 1080) * 0.55, 0.52 + hash(index + 1110) * 0.3, 0.82 + hash(column + 1140) * 0.48);
      stone.updateMatrix();
      wall.setMatrixAt(index, stone.matrix);
    }
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    const arrayGroup = new THREE.Group();
    scene.add(arrayGroup);
    const panelVisuals: PanelVisual[] = [];
    const rackVisuals: RackVisual[] = [];
    const clickablePanels: THREE.Object3D[] = [];
    const sceneLabels: THREE.Sprite[] = [];
    const panelTexture = makePanelTexture(renderer);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c0be, metalness: 0.7, roughness: 0.32 });
    const rackMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb9b7, metalness: 0.68, roughness: 0.38 });
    const lowEdgeHeight = geometry.lowEdgeClearanceM;
    const modulePitch = geometryMetrics.modulePitchM;
    const fullRowWidth = Math.max(...geometry.rows.map((_, index) => getRowWidth(index + 1, geometry)));
    const rowFlowGeometry = geometry.rows.map((rowConfig, index) => ({
      row: index + 1,
      columns: rowConfig.columns,
      panelsDeep: rowConfig.panelsDeep,
      tableChordM: rowConfig.panelsDeep * panelSlopeM + (rowConfig.panelsDeep - 1) * panelGapM,
      horizontalDepth: Math.cos(tilt) * (rowConfig.panelsDeep * panelSlopeM + (rowConfig.panelsDeep - 1) * panelGapM),
      centerHeight: lowEdgeHeight + Math.sin(tilt) * (rowConfig.panelsDeep * panelSlopeM + (rowConfig.panelsDeep - 1) * panelGapM) * 0.5,
      z: getRowCenterZ(index + 1, geometry),
      offsetX: getRowOffsetX(index + 1, geometry),
      width: getRowWidth(index + 1, geometry),
    }));
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowNumber = rowIndex + 1;
      const rowConfig = geometry.rows[rowIndex];
      const z = getRowCenterZ(rowNumber, geometry);
      const rowColumns = rowConfig.columns;
      const rowOffsetX = getRowOffsetX(rowNumber, geometry);
      const rowWidth = getRowWidth(rowNumber, geometry);
      const rowChordM = rowConfig.panelsDeep * panelSlopeM + (rowConfig.panelsDeep - 1) * panelGapM;
      const rowCenterHeight = lowEdgeHeight + Math.sin(tilt) * rowChordM * 0.5;

      for (let depthIndex = 0; depthIndex < rowConfig.panelsDeep; depthIndex += 1) {
        const panelZ = (depthIndex - (rowConfig.panelsDeep - 1) / 2) * (panelSlopeM + panelGapM);
        for (let moduleIndex = 0; moduleIndex < rowColumns; moduleIndex += 1) {
          const x = rowOffsetX + (moduleIndex - (rowColumns - 1) / 2) * modulePitch;
          const moduleNumber = depthIndex * rowColumns + moduleIndex + 1;
          const assembly = new THREE.Group();
          assembly.position.set(
            x,
            rowCenterHeight - Math.sin(tilt) * panelZ,
            z + Math.cos(tilt) * panelZ,
          );
          assembly.rotation.x = tilt;
          assembly.userData = { row: rowNumber, module: moduleNumber };

          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(panelSpanM + panelGapM, panelThicknessM + 0.035, panelSlopeM + panelGapM),
            frameMaterial,
          );
          frame.castShadow = true;
          frame.receiveShadow = true;
          assembly.add(frame);

          const glassMaterial = new THREE.MeshStandardMaterial({
            map: panelTexture,
            color: 0x164b61,
            roughness: 0.29,
            metalness: 0.28,
            emissive: 0x031b27,
            emissiveIntensity: 0.42,
          });
          const glass = new THREE.Mesh(
            new THREE.BoxGeometry(panelSpanM - 0.045, panelThicknessM + 0.005, panelSlopeM - 0.045),
            glassMaterial,
          );
          glass.position.y = 0.055;
          glass.castShadow = true;
          glass.receiveShadow = true;
          glass.userData = { row: rowNumber, module: moduleNumber };
          assembly.add(glass);
          arrayGroup.add(assembly);
          panelVisuals.push({
            assembly,
            glass,
            row: rowNumber,
            module: moduleNumber,
            baseRotationX: tilt,
            basePosition: assembly.position.clone(),
          });
          clickablePanels.push(glass);
        }
      }

      for (const railZ of [-rowChordM * 0.39, -rowChordM * 0.13, rowChordM * 0.13, rowChordM * 0.39]) {
        const railHeight = rowCenterHeight - Math.sin(tilt) * railZ - 0.17;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(rowWidth + 0.1, 0.2, 0.17), rackMaterial);
        rail.position.set(rowOffsetX, railHeight, z + railZ);
        rail.castShadow = true;
        arrayGroup.add(rail);
        rackVisuals.push({ object: rail, basePosition: rail.position.clone(), baseQuaternion: rail.quaternion.clone() });
      }

      const supportCount = Math.max(2, Math.round(geometry.rackSupportsFullRow * rowWidth / fullRowWidth));
      for (let support = 0; support < supportCount; support += 1) {
        const x = rowOffsetX - rowWidth / 2 + 0.5 + support * ((rowWidth - 1) / (supportCount - 1));
        const postTop = new THREE.Vector3(x, rowCenterHeight - 0.12, z - 0.15);
        const post = makeRackBeam(new THREE.Vector3(x, 0.08, z - 0.15), postTop, 0.12, 0.15, rackMaterial);
        const brace = makeRackBeam(new THREE.Vector3(x, 0.08, z + 1.42), postTop, 0.09, 0.12, rackMaterial);
        arrayGroup.add(post, brace);
        rackVisuals.push(
          { object: post, basePosition: post.position.clone(), baseQuaternion: post.quaternion.clone() },
          { object: brace, basePosition: brace.position.clone(), baseQuaternion: brace.quaternion.clone() },
        );
      }

      const rowPosition = rowNumber === 1 ? " · FRONT" : rowNumber === rowCount ? " · REAR" : "";
      const label = makeTextSprite(`ROW ${rowNumber}${rowPosition} · ${rowColumns * rowConfig.panelsDeep} PANELS`);
      label.position.set(rowOffsetX - rowWidth / 2 - label.scale.x / 2 - 0.9, 1.15, z);
      arrayGroup.add(label);
      sceneLabels.push(label);
    }

    const maukaLabel = makeTextSprite("MAUKA · NE · UPWIND", "accent");
    maukaLabel.position.set(arrayCenterX, 1.8, -sceneDepth / 2 + 4);
    scene.add(maukaLabel);
    sceneLabels.push(maukaLabel);
    const makaiLabel = makeTextSprite("MAKAI · SW · DOWNWIND");
    makaiLabel.position.set(arrayCenterX, 1.8, sceneDepth / 2 - 4);
    scene.add(makaiLabel);
    sceneLabels.push(makaiLabel);

    const selectionMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe76a,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
    });
    const selectionMarker = new THREE.Group();
    const selectionBorderThickness = 0.055;
    const selectionBorderHeight = 0.035;
    for (const z of [-panelSlopeM / 2 - 0.055, panelSlopeM / 2 + 0.055]) {
      const border = new THREE.Mesh(
        new THREE.BoxGeometry(panelSpanM + 0.18, selectionBorderHeight, selectionBorderThickness),
        selectionMaterial,
      );
      border.position.z = z;
      border.renderOrder = 30;
      selectionMarker.add(border);
    }
    for (const x of [-panelSpanM / 2 - 0.055, panelSpanM / 2 + 0.055]) {
      const border = new THREE.Mesh(
        new THREE.BoxGeometry(selectionBorderThickness, selectionBorderHeight, panelSlopeM + 0.18),
        selectionMaterial,
      );
      border.position.x = x;
      border.renderOrder = 30;
      selectionMarker.add(border);
    }
    const selectionTag = makeTextSprite("SELECTED PANEL", "selection");
    selectionTag.position.set(0, 1.15, 0);
    selectionTag.renderOrder = 31;
    selectionMarker.add(selectionTag);
    selectionMarker.visible = false;
    scene.add(selectionMarker);

    const windMarkerLength = Math.min(
      42,
      Math.max(18, Math.hypot(arrayBounds.width, arrayFootprintDepth) * 0.58),
    );
    const windMarkerHeadLength = Math.min(8, Math.max(5, windMarkerLength * 0.24));
    const windMarkerHeadWidth = Math.min(7, Math.max(4.2, windMarkerLength * 0.18));
    const windMarkerShaftWidth = windMarkerHeadWidth * 0.34;
    const windMarkerShape = new THREE.Shape();
    windMarkerShape.moveTo(-windMarkerLength / 2, -windMarkerShaftWidth / 2);
    windMarkerShape.lineTo(windMarkerLength / 2 - windMarkerHeadLength, -windMarkerShaftWidth / 2);
    windMarkerShape.lineTo(windMarkerLength / 2 - windMarkerHeadLength, -windMarkerHeadWidth / 2);
    windMarkerShape.lineTo(windMarkerLength / 2, 0);
    windMarkerShape.lineTo(windMarkerLength / 2 - windMarkerHeadLength, windMarkerHeadWidth / 2);
    windMarkerShape.lineTo(windMarkerLength / 2 - windMarkerHeadLength, windMarkerShaftWidth / 2);
    windMarkerShape.lineTo(-windMarkerLength / 2, windMarkerShaftWidth / 2);
    windMarkerShape.closePath();
    const windMarkerGeometry = new THREE.ShapeGeometry(windMarkerShape);
    const directionMaterial = new THREE.MeshBasicMaterial({
      color: 0x7ff1c4,
      transparent: true,
      opacity: 0.48,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const windDirectionGraphic = new THREE.Group();
    const windDirectionFill = new THREE.Mesh(windMarkerGeometry, directionMaterial);
    windDirectionFill.rotation.x = -Math.PI / 2;
    windDirectionGraphic.add(windDirectionFill);
    const windDirectionOutline = new THREE.LineSegments(
      new THREE.EdgesGeometry(windMarkerGeometry),
      new THREE.LineBasicMaterial({ color: 0xa8ffe0, transparent: true, opacity: 0.76, depthWrite: false }),
    );
    windDirectionOutline.rotation.x = -Math.PI / 2;
    windDirectionOutline.position.y = 0.008;
    windDirectionGraphic.add(windDirectionOutline);
    windDirectionGraphic.position.set(arrayPanelCentroid.xM, 0.02, arrayPanelCentroid.zM);
    scene.add(windDirectionGraphic);

    const mitigationGroups: Record<string, THREE.Group> = {};
    const mitigationBaseColor = new THREE.Color(MITIGATION_BASE_COLOR);
    const mitigationBaseEmissive = new THREE.Color(0xc40083);
    const screenMaterial = new THREE.MeshStandardMaterial({
      color: mitigationBaseColor,
      metalness: 0.2,
      roughness: 0.38,
      emissive: mitigationBaseEmissive,
      emissiveIntensity: 1.3,
    });
    const vaneMaterial = new THREE.MeshStandardMaterial({
      color: mitigationBaseColor,
      metalness: 0.25,
      roughness: 0.32,
      emissive: mitigationBaseEmissive,
      emissiveIntensity: 1.45,
    });
    const spoilerMaterial = new THREE.MeshStandardMaterial({
      color: mitigationBaseColor,
      metalness: 0.2,
      roughness: 0.36,
      emissive: mitigationBaseEmissive,
      emissiveIntensity: 1.55,
    });
    const damperMaterial = new THREE.MeshStandardMaterial({
      color: mitigationBaseColor,
      roughness: 0.3,
      emissive: mitigationBaseEmissive,
      emissiveIntensity: 2.4,
    });
    type DeviceConcept = MitigationConceptId;
    const deviceMaterialVisuals: Array<{
      concept: DeviceConcept;
      row: number;
      element: number;
      material: THREE.MeshStandardMaterial;
    }> = [];
    const registerDeviceMaterial = (
      concept: DeviceConcept,
      row: number,
      element: number,
      template: THREE.MeshStandardMaterial,
    ) => {
      const material = template.clone();
      deviceMaterialVisuals.push({ concept, row, element, material });
      return material;
    };

    const screenGroup = new THREE.Group();
    const screenAssemblies: Array<{
      row: number;
      group: THREE.Group;
      posts: THREE.Mesh[];
      slats: THREE.Mesh[];
      stripCount: number;
    }> = [];
    for (let row = 1; row <= rowCount; row += 1) {
      const screenGeometry = getScreenGeometry(row, geometry);
      const group = new THREE.Group();
      const posts: THREE.Mesh[] = [];
      const slats: THREE.Mesh[] = [];
      const stripCount = 12;
      const segmentCount = Math.max(1, Math.ceil(screenGeometry.width / 4));
      const segmentWidth = screenGeometry.width / segmentCount;
      const postCount = segmentCount + 1;
      const bayMaterials = Array.from({ length: segmentCount }, (_, segment) =>
        registerDeviceMaterial("screen", row, segment + 1, screenMaterial),
      );
      for (let post = 0; post < postCount; post += 1) {
        const x = screenGeometry.x - screenGeometry.width / 2 + post * (screenGeometry.width / (postCount - 1));
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 1, 10),
          bayMaterials[Math.min(post, segmentCount - 1)],
        );
        pole.position.set(x, 1.1, screenGeometry.z);
        pole.userData.element = Math.min(post, segmentCount - 1) + 1;
        group.add(pole);
        posts.push(pole);
      }
      for (let strip = 0; strip < stripCount; strip += 1) {
        for (let segment = 0; segment < segmentCount; segment += 1) {
          const slat = new THREE.Mesh(
            new THREE.BoxGeometry(segmentWidth * 0.985, 1, 0.075),
            bayMaterials[segment],
          );
          slat.position.set(
            screenGeometry.x - screenGeometry.width / 2 + (segment + 0.5) * segmentWidth,
            0.2 + strip * 0.18,
            screenGeometry.z,
          );
          slat.userData.strip = strip;
          slat.userData.segment = segment;
          group.add(slat);
          slats.push(slat);
        }
      }
      screenGroup.add(group);
      screenAssemblies.push({ row, group, posts, slats, stripCount });
    }
    scene.add(screenGroup);
    mitigationGroups.screen = screenGroup;

    const vaneGroup = new THREE.Group();
    const vaneVisuals: THREE.Mesh[] = [];
    for (let row = 1; row <= rowCount; row += 1) {
      const z = getRowCenterZ(row, geometry);
      const rowOffsetX = getRowOffsetX(row, geometry);
      const rowWidth = getRowWidth(row, geometry);
      const rowHorizontalDepth = rowFlowGeometry[row - 1].horizontalDepth;
      const vaneCount = Math.max(3, Math.round(7 * rowWidth / fullRowWidth));
      for (let vane = 0; vane < vaneCount; vane += 1) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.075, 0.72, 1),
          registerDeviceMaterial("vanes", row, vane + 1, vaneMaterial),
        );
        fin.position.set(
          rowOffsetX - rowWidth / 2 + 0.45 + vane * ((rowWidth - 0.9) / (vaneCount - 1)),
          0.43,
          z,
        );
        fin.userData.rowZ = z;
        fin.userData.rowHorizontalDepth = rowHorizontalDepth;
        fin.userData.row = row;
        fin.userData.element = vane + 1;
        vaneGroup.add(fin);
        vaneVisuals.push(fin);
      }
    }
    scene.add(vaneGroup);
    mitigationGroups.vanes = vaneGroup;

    const spoilerGroup = new THREE.Group();
    const spoilerStyleGroups: Record<SimulationConfig["spoilerStyle"], THREE.Group> = {
      perforated: new THREE.Group(),
      continuous: new THREE.Group(),
      tabs: new THREE.Group(),
    };
    const spoilerVisuals: THREE.Mesh[] = [];
    Object.values(spoilerStyleGroups).forEach((group) => spoilerGroup.add(group));
    for (let row = 1; row <= rowCount; row += 1) {
      const edgeZ = getRowCenterZ(row, geometry) + rowFlowGeometry[row - 1].horizontalDepth / 2;
      const rowColumns = geometry.rows[row - 1].columns;
      const rowOffsetX = getRowOffsetX(row, geometry);

      for (let moduleIndex = 0; moduleIndex < rowColumns; moduleIndex += 1) {
        const x = rowOffsetX + (moduleIndex - (rowColumns - 1) / 2) * modulePitch;
        const element = moduleIndex + 1;
        const continuous = new THREE.Mesh(
          new THREE.BoxGeometry(modulePitch * 0.985, 1, 0.075),
          registerDeviceMaterial("spoilers", row, element, spoilerMaterial),
        );
        continuous.position.set(x, lowEdgeHeight + 0.15, edgeZ);
        continuous.userData.row = row;
        continuous.userData.element = element;
        spoilerStyleGroups.continuous.add(continuous);
        spoilerVisuals.push(continuous);

        const perforated = new THREE.Mesh(
          new THREE.BoxGeometry(modulePitch * 0.62, 1, 0.075),
          registerDeviceMaterial("spoilers", row, element, spoilerMaterial),
        );
        perforated.position.set(x, lowEdgeHeight + 0.15, edgeZ);
        perforated.userData.row = row;
        perforated.userData.element = element;
        spoilerStyleGroups.perforated.add(perforated);
        spoilerVisuals.push(perforated);

        const tab = new THREE.Mesh(
          new THREE.BoxGeometry(modulePitch * 0.42, 1, 0.095),
          registerDeviceMaterial("spoilers", row, element, spoilerMaterial),
        );
        tab.position.set(x, lowEdgeHeight + 0.15, edgeZ);
        tab.userData.angleOffset = moduleIndex % 2 === 0 ? -6 : 6;
        tab.userData.row = row;
        tab.userData.element = element;
        spoilerStyleGroups.tabs.add(tab);
        spoilerVisuals.push(tab);
      }
    }
    scene.add(spoilerGroup);
    mitigationGroups.spoilers = spoilerGroup;

    const damperGroup = new THREE.Group();
    const damperSets: Array<{ row: number; rail: number; width: number; offsetX: number; meshes: THREE.Mesh[] }> = [];
    const damperGlows: THREE.PointLight[] = [];
    const maxDampersPerRail = Math.ceil(fullRowWidth / 0.8) + 1;
    for (let row = 1; row <= rowCount; row += 1) {
      const z = getRowCenterZ(row, geometry);
      const rowOffsetX = getRowOffsetX(row, geometry);
      const rowWidth = getRowWidth(row, geometry);
      const rowChordM = rowFlowGeometry[row - 1].tableChordM;
      const rowCenterHeight = rowFlowGeometry[row - 1].centerHeight;
      for (const [rail, railZ] of [-rowChordM * 0.39, -rowChordM * 0.13, rowChordM * 0.13, rowChordM * 0.39].entries()) {
        const set: THREE.Mesh[] = [];
        const railHeight = rowCenterHeight - Math.sin(tilt) * railZ - 0.12;
        for (let damper = 0; damper < maxDampersPerRail; damper += 1) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.052, 10, 18),
            damperMaterial.clone(),
          );
          ring.rotation.y = Math.PI / 2;
          ring.position.set(0, railHeight, z + railZ);
          damperGroup.add(ring);
          set.push(ring);
        }
        damperSets.push({ row, rail, width: rowWidth, offsetX: rowOffsetX, meshes: set });
      }
      const glow = new THREE.PointLight(0xff3fc8, 1.9, 8, 2);
      glow.position.set(rowOffsetX, 1.15, z);
      damperGroup.add(glow);
      damperGlows.push(glow);
    }
    scene.add(damperGroup);
    mitigationGroups.dampers = damperGroup;

    const particleCount = 760;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSeeds = new Float32Array(particleCount);
    const particleTurbulence = new Float32Array(particleCount * 2);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * 72;
      particlePositions[index * 3 + 1] = 0.35 + Math.random() * 6.2;
      particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 72;
      particleSeeds[index] = Math.random() * Math.PI * 2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x8fe6ff,
      size: 0.075,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const streamlineGroup = new THREE.Group();
    const streamlines: THREE.Line[] = [];
    for (let lineIndex = 0; lineIndex < 11; lineIndex += 1) {
      const points = new Float32Array(52 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
      const material = new THREE.LineBasicMaterial({
        color: lineIndex % 2 ? 0x5dccf4 : 0x7df0c5,
        transparent: true,
        opacity: 0.19,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geometry, material);
      line.userData.offset = -15 + lineIndex * 3;
      line.userData.height = [0.26, 0.42, 0.65, 0.9, 1.2, 1.55, 2, 2.6, 3.3, 4.2, 5.3][lineIndex];
      line.userData.seed = Math.random() * Math.PI * 2;
      streamlineGroup.add(line);
      streamlines.push(line);
    }
    scene.add(streamlineGroup);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerDown = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickablePanels, false)[0];
      if (hit?.object.userData.row) {
        liveRef.current.onSelectPanel({
          row: hit.object.userData.row,
          module: hit.object.userData.module,
        });
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const clock = new THREE.Clock();
    let animationFrame = 0;
    let lastCameraRequest = -1;
    let lastVisualKey = "";

    const setCamera = (view: WindSceneProps["cameraView"]) => {
      const sideDistance = Math.max(52, sceneDepth * 0.72);
      const planHeight = Math.max(68, sceneExtent * 0.86);
      const targets = {
        perspective: { position: new THREE.Vector3(wallXAt(12) - 2.4, Math.max(4.8, sceneDepth * 0.07), sideDistance * 0.56), target: new THREE.Vector3(arrayCenterX, 0.9, 12) },
        mauka: { position: new THREE.Vector3(arrayCenterX, sideDistance * 0.23, -sideDistance), target: new THREE.Vector3(arrayCenterX, 0.7, 2) },
        makai: { position: new THREE.Vector3(arrayCenterX, Math.max(4.6, sceneDepth * 0.064), sideDistance * 0.59), target: new THREE.Vector3(arrayCenterX, 0.85, 10.5) },
        plan: { position: new THREE.Vector3(arrayCenterX, planHeight, 0.01), target: new THREE.Vector3(arrayCenterX, 0, 0) },
      };
      camera.position.copy(targets[view].position);
      controls.target.copy(targets[view].target);
      controls.update();
    };

    const resetParticle = (index: number, flowX: number, flowZ: number) => {
      const transverseX = -flowZ;
      const transverseZ = flowX;
      const spread = (Math.random() - 0.5) * 76;
      const upstream = -41 - Math.random() * 2;
      const layer = Math.random();
      const height = layer < 0.36
        ? 0.14 + Math.random() * 0.8
        : layer < 0.8
          ? 0.9 + Math.random() * 1.75
          : 2.7 + Math.random() * 3.7;
      const x = flowX * upstream + transverseX * spread;
      const z = flowZ * upstream + transverseZ * spread;
      particlePositions[index * 3] = x;
      particlePositions[index * 3 + 1] = Math.max(height, siteTerrainHeightAt(x, z) + 0.12);
      particlePositions[index * 3 + 2] = z;
      particleTurbulence[index * 2] = 0;
      particleTurbulence[index * 2 + 1] = 0;
    };

    const sampleFlowField = (
      x: number,
      y: number,
      z: number,
      phase: number,
      flowX: number,
      flowZ: number,
      visualSpeed: number,
      elapsed: number,
      live: typeof liveRef.current,
      out: FlowSample,
    ) => {
      const crossRowAlignment = Math.abs(flowZ);
      const flowSign = flowZ >= 0 ? 1 : -1;
      const transverseX = -flowZ;
      const transverseZ = flowX;
      const screenEffects = getScreenFlowEffects(live.config, x, z, {
        x: flowX,
        z: flowZ,
        crossRowAlignment,
      });
      let speedFactor = screenEffects.speedFactor;
      let verticalVelocity = 0;
      let lateralVelocity = 0;
      let turbulence = (live.config.ambientTurbulence / 100) * 0.55;
      const siteFlowEffects = getSiteFlowEffects(x, y, z, { x: flowX, z: flowZ }, geometry);
      speedFactor *= siteFlowEffects.speedFactor;
      verticalVelocity += siteFlowEffects.verticalVelocityRatio * visualSpeed;
      lateralVelocity += siteFlowEffects.lateralVelocityRatio * visualSpeed;
      turbulence += siteFlowEffects.turbulenceAdd;

      for (const row of rowFlowGeometry) {
        if (live.arrayState !== "restored" && row.row <= 2) continue;
        if (Math.abs(x - row.offsetX) > row.width / 2 + 1.25) continue;

        const dz = z - row.z;
        const downstreamDistance = dz * flowSign;
        const halfDepth = row.horizontalDepth / 2;
        const panelHeight = row.centerHeight - Math.tan(tilt) * dz;
        const rowResult = live.result.rows[row.row - 1];
        const columnCount = row.columns;
        const columnIndex = clamp(
          Math.round((x - row.offsetX) / modulePitch + (columnCount - 1) / 2),
          0,
          columnCount - 1,
        );
        const rowTurbulence = rowResult.panels[columnIndex].turbulencePercent / 100;

        if (Math.abs(dz) <= halfDepth + 0.12) {
          const abovePanel = y >= panelHeight;
          const surfaceGap = Math.abs(y - panelHeight);
          const leadingDistance = downstreamDistance + halfDepth;
          const leadingPulse = Math.exp(-Math.pow(leadingDistance / 0.38, 2));
          const followsSlope = -Math.tan(tilt) * flowZ * visualSpeed;

          if (abovePanel) {
            speedFactor *= 0.96;
            verticalVelocity += followsSlope * 0.5 + leadingPulse * visualSpeed * crossRowAlignment * 0.14;
          } else {
            const localClearance = Math.max(0.16, panelHeight);
            const contraction = clamp((1.25 - localClearance) / 1.1, 0, 0.68);
            speedFactor *= 1 + contraction * crossRowAlignment * (flowSign > 0 ? 0.2 : 0.08);
            verticalVelocity += followsSlope * (flowSign > 0 ? 0.76 : 0.46);
            turbulence += rowTurbulence * crossRowAlignment * (flowSign > 0 ? 0.08 : 0.14);
            if (isMitigationActive(live.config, "vanes") && rowIsInRange(row.row, live.config.vaneStartRow, live.config.vaneEndRow, rowCount)) {
              turbulence *= 0.76;
              lateralVelocity *= 0.62;
            }
          }

          if (surfaceGap < 0.2) {
            const repulsion = (1 - surfaceGap / 0.2) * visualSpeed * 0.58;
            verticalVelocity += (abovePanel ? 1 : -1) * repulsion;
            speedFactor *= 0.84 + surfaceGap * 0.6;
          }
        }

        const wakeDistance = downstreamDistance - halfDepth;
        if (wakeDistance > 0 && wakeDistance < rowSpacingM * 1.55) {
          const wakeDecay = Math.exp(-wakeDistance / (rowSpacingM * 0.9));
          const wakeStrength = crossRowAlignment * wakeDecay;
          const vortexPhase =
            phase + elapsed * (1.15 + visualSpeed * 0.055) + wakeDistance * 2.7 + row.row * 1.23;
          turbulence += rowTurbulence * wakeStrength * 0.34;
          speedFactor *= 1 - 0.13 * wakeStrength;
          lateralVelocity += Math.sin(vortexPhase) * visualSpeed * rowTurbulence * wakeStrength * 0.16;
          verticalVelocity += Math.cos(vortexPhase * 0.83) * visualSpeed * rowTurbulence * wakeStrength * 0.12;

          if (isMitigationActive(live.config, "spoilers") && rowIsInRange(row.row, live.config.spoilerStartRow, live.config.spoilerEndRow, rowCount)) {
            turbulence *= 0.82;
            verticalVelocity += visualSpeed * wakeStrength * 0.035;
          }
        }
      }

      const terrainClearance = y - siteFlowEffects.groundHeightM;
      if (terrainClearance < 0.28) {
        verticalVelocity += (1 - terrainClearance / 0.28) * visualSpeed * 0.42;
      }

      const localTurbulence = clamp(turbulence * screenEffects.turbulenceFactor, 0.018, 0.46);
      const localSpeed = visualSpeed * clamp(speedFactor, 0.5, 1.34);
      out.vx = flowX * localSpeed + transverseX * lateralVelocity;
      out.vy = verticalVelocity;
      out.vz = flowZ * localSpeed + transverseZ * lateralVelocity;
      out.turbulence = localTurbulence;
    };

    const particleFlowSample: FlowSample = { vx: 0, vy: 0, vz: 0, turbulence: 0 };
    const streamlineFlowSample: FlowSample = { vx: 0, vy: 0, vz: 0, turbulence: 0 };

    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;
      const live = liveRef.current;
      const flow = getFlowComponents(live.config.windBearing, geometry);
      const normalizedFlowX = flow.x;
      const normalizedFlowZ = flow.z;
      const visualSpeed = live.config.windSpeedMph * 0.44704 * 0.19;
      if (live.cameraRequest !== lastCameraRequest) {
        setCamera(live.cameraView);
        lastCameraRequest = live.cameraRequest;
      }

      const visualKey = [
        live.viewMode,
        live.result.peakUpliftKpa.toFixed(3),
        live.result.vibrationIndex.toFixed(1),
        live.config.windSpeedMph,
        live.config.windBearing,
        live.config.ambientTurbulence,
        live.config.panelFrequencyHz,
        live.config.dampingPercent,
        live.arrayState,
        live.config.activeMitigations.join(","),
        live.config.screenPorosity,
        live.config.screenHeightM,
        live.config.screenStartRow,
        live.config.screenEndRow,
        live.config.vaneLengthM,
        live.config.vaneStartRow,
        live.config.vaneEndRow,
        live.config.spoilerStyle,
        live.config.spoilerHeightM,
        live.config.spoilerAngleDeg,
        live.config.spoilerStartRow,
        live.config.spoilerEndRow,
        live.config.damperSpacingM,
        live.config.damperDampingPercent,
        live.config.damperStartRow,
        live.config.damperEndRow,
        live.showSceneLabels,
        live.cameraView,
        live.selectedPanel.row,
        live.selectedPanel.module,
        live.colorCodeMitigations,
      ].join("-");
      if (visualKey !== lastVisualKey) {
        sceneLabels.forEach((label) => {
          label.visible = live.showSceneLabels;
        });
        let activePanel: PanelVisual | null = null;
        for (const panel of panelVisuals) {
          const panelResult = getPanelResult(live.result, panel.row, panel.module);
          const selected = panel.row === live.selectedPanel.row && panel.module === live.selectedPanel.module;
          const color = live.viewMode === "flow"
            ? new THREE.Color().setHSL(0.54 * (1 - 0.12), 0.82, 0.43 + 0.12 * 0.08)
            : new THREE.Color(
              live.viewMode === "pressure"
                ? pressureColor(panelResult.peakUpliftKpa)
                : riskColor(panelResult.vibrationIndex),
            );
          panel.glass.material.color.copy(color);
          panel.glass.material.emissive.copy(selected ? new THREE.Color(0xffd84f) : color.clone().multiplyScalar(0.19));
          panel.glass.material.emissiveIntensity = selected ? 2.1 : live.viewMode === "flow" ? 0.32 : 0.66;
          panel.assembly.visible = !(live.arrayState === "repaired" && panel.row <= 2);
          panel.assembly.position.copy(panel.basePosition);
          panel.assembly.rotation.set(panel.baseRotationX, 0, 0);
          if (selected && panel.assembly.visible) activePanel = panel;
        }
        for (const rack of rackVisuals) {
          rack.object.position.copy(rack.basePosition);
          rack.object.quaternion.copy(rack.baseQuaternion);
        }
        if (activePanel) {
          activePanel.assembly.add(selectionMarker);
          selectionMarker.position.set(0, 0.14, 0);
          selectionMarker.rotation.set(0, 0, 0);
          selectionMarker.visible = true;
        } else {
          selectionMarker.visible = false;
        }

        const screenHeight = live.config.screenHeightM;
        const activeScreenRows = new Set(getInstalledScreenRows(live.config));
        for (const screen of screenAssemblies) {
          const screenCellHeight = screenHeight / screen.stripCount;
          const screenSolidHeight = screenCellHeight * (1 - live.config.screenPorosity / 100);
          screen.group.visible = activeScreenRows.has(screen.row);
          screen.posts.forEach((post) => {
            post.scale.y = screenHeight;
            post.position.y = screenHeight / 2;
          });
          screen.slats.forEach((slat) => {
            slat.scale.y = Math.max(0.015, screenSolidHeight);
            slat.position.y = (slat.userData.strip + 0.5) * screenCellHeight;
          });
        }

        for (const vane of vaneVisuals) {
          vane.scale.z = live.config.vaneLengthM;
          vane.position.z = vane.userData.rowZ + vane.userData.rowHorizontalDepth / 2 - live.config.vaneLengthM / 2;
          vane.visible = rowIsInRange(vane.userData.row, live.config.vaneStartRow, live.config.vaneEndRow, rowCount);
        }

        Object.entries(spoilerStyleGroups).forEach(([style, group]) => {
          group.visible = style === live.config.spoilerStyle;
        });
        for (const spoiler of spoilerVisuals) {
          spoiler.scale.y = live.config.spoilerHeightM;
          spoiler.position.y = lowEdgeHeight + live.config.spoilerHeightM / 2;
          spoiler.rotation.x = THREE.MathUtils.degToRad(
            -live.config.spoilerAngleDeg + (spoiler.userData.angleOffset ?? 0),
          );
          spoiler.visible = rowIsInRange(spoiler.userData.row, live.config.spoilerStartRow, live.config.spoilerEndRow, rowCount);
        }

        const damperScale = 0.86 + live.config.damperDampingPercent * 0.035;
        for (const set of damperSets) {
          const damperCount = clamp(
            Math.ceil(set.width / live.config.damperSpacingM) + 1,
            2,
            maxDampersPerRail,
          );
          set.meshes.forEach((damper, index) => {
            damper.visible = rowIsInRange(set.row, live.config.damperStartRow, live.config.damperEndRow, rowCount) && index < damperCount;
            damper.position.x =
              set.offsetX - set.width / 2 + index * (set.width / Math.max(1, damperCount - 1));
            damper.scale.setScalar(damperScale);
            damper.userData.element = set.rail * damperCount + index + 1;
          });
        }
        damperGlows.forEach((glow, index) => {
          glow.visible = rowIsInRange(index + 1, live.config.damperStartRow, live.config.damperEndRow, rowCount);
          glow.intensity = 1.1 + live.config.damperDampingPercent * 0.15;
        });

        const activeElements = new Map(
          live.result.mitigationLoads.flatMap((load) => load.rows.flatMap((row) =>
            row.elements.map((element) => [`${load.concept}:${row.row}:${element.element}`, element] as const),
          )),
        );
        const loadColoringActive = live.colorCodeMitigations
          && (live.viewMode === "pressure" || live.viewMode === "vibration")
          && live.result.mitigationLoads.length > 0;
        const applyDeviceColor = (
          concept: DeviceConcept,
          row: number,
          element: number,
          material: THREE.MeshStandardMaterial,
        ) => {
          const elementLoad = activeElements.get(`${concept}:${row}:${element}`);
          if (!loadColoringActive || !elementLoad) {
            material.color.copy(mitigationBaseColor);
            material.emissive.copy(mitigationBaseEmissive);
            material.emissiveIntensity = concept === "dampers" ? 2.4 : 1.35;
            return;
          }
          const loadColor = new THREE.Color(
            live.viewMode === "pressure"
              ? pressureColor(elementLoad.pressureKpa)
              : riskColor(elementLoad.vibrationIndex),
          );
          material.color.copy(loadColor);
          material.emissive.copy(loadColor).multiplyScalar(0.62);
          material.emissiveIntensity = 1.55;
        };
        for (const visual of deviceMaterialVisuals) {
          applyDeviceColor(visual.concept, visual.row, visual.element, visual.material);
        }
        for (const set of damperSets) {
          set.meshes.forEach((damper) => {
            applyDeviceColor(
              "dampers",
              set.row,
              damper.userData.element,
              damper.material as THREE.MeshStandardMaterial,
            );
          });
        }

        Object.entries(mitigationGroups).forEach(([id, group]) => {
          group.visible = isMitigationActive(live.config, id as MitigationConceptId);
        });
        lastVisualKey = visualKey;
      }

      if (live.playing) {
        for (let index = 0; index < particleCount; index += 1) {
          const offset = index * 3;
          const turbulenceOffset = index * 2;
          const oldX = particlePositions[offset];
          const oldY = particlePositions[offset + 1];
          const oldZ = particlePositions[offset + 2];
          sampleFlowField(
            oldX,
            oldY,
            oldZ,
            particleSeeds[index],
            normalizedFlowX,
            normalizedFlowZ,
            visualSpeed,
            elapsed,
            live,
            particleFlowSample,
          );

          const correlationTime = 0.34 + oldY * 0.045;
          const decay = Math.exp(-delta / correlationTime);
          const turbulenceScale =
            visualSpeed * particleFlowSample.turbulence * Math.sqrt(1 - decay * decay) * 0.52;
          particleTurbulence[turbulenceOffset] =
            particleTurbulence[turbulenceOffset] * decay + approximateGaussian() * turbulenceScale;
          particleTurbulence[turbulenceOffset + 1] =
            particleTurbulence[turbulenceOffset + 1] * decay + approximateGaussian() * turbulenceScale * 0.62;

          const transverseX = -normalizedFlowZ;
          const transverseZ = normalizedFlowX;
          let newX =
            oldX +
            (particleFlowSample.vx + transverseX * particleTurbulence[turbulenceOffset]) * delta;
          let newZ =
            oldZ +
            (particleFlowSample.vz + transverseZ * particleTurbulence[turbulenceOffset]) * delta;
          let newY =
            oldY + (particleFlowSample.vy + particleTurbulence[turbulenceOffset + 1]) * delta;

          for (const row of rowFlowGeometry) {
            if (live.arrayState !== "restored" && row.row <= 2) continue;
            if (Math.abs(newX - row.offsetX) > row.width / 2) continue;
            const newDz = newZ - row.z;
            if (Math.abs(newDz) > row.horizontalDepth / 2) continue;
            const oldPanelHeight = row.centerHeight - Math.tan(tilt) * (oldZ - row.z);
            const newPanelHeight = row.centerHeight - Math.tan(tilt) * newDz;
            const crossedPanel = (oldY - oldPanelHeight) * (newY - newPanelHeight) <= 0;
            if (crossedPanel || Math.abs(newY - newPanelHeight) < 0.1) {
              const side = oldY >= oldPanelHeight ? 1 : -1;
              newY = newPanelHeight + side * 0.105;
              particleTurbulence[turbulenceOffset + 1] *= -0.18;
            }
          }

          const siteBoundary = resolveSiteFlowBoundary(
            { x: oldX, y: oldY, z: oldZ },
            { x: newX, y: newY, z: newZ },
            geometry,
            0.1,
          );
          newX = siteBoundary.x;
          newY = siteBoundary.y;
          newZ = siteBoundary.z;
          if (siteBoundary.hitTerrain) {
            particleTurbulence[turbulenceOffset + 1] = Math.abs(
              particleTurbulence[turbulenceOffset + 1],
            ) * 0.22;
          }
          if (siteBoundary.clearedWall) {
            particleTurbulence[turbulenceOffset] *= 0.35;
            particleTurbulence[turbulenceOffset + 1] = Math.max(
              0.18 * Math.max(visualSpeed, 0.1),
              Math.abs(particleTurbulence[turbulenceOffset + 1]),
            );
          }

          particlePositions[offset] = newX;
          particlePositions[offset + 1] = newY;
          particlePositions[offset + 2] = newZ;
          const streamwisePosition = newX * normalizedFlowX + newZ * normalizedFlowZ;
          const transversePosition = newX * transverseX + newZ * transverseZ;
          if (
            streamwisePosition > 42 ||
            Math.abs(transversePosition) > 42 ||
            particlePositions[offset + 1] < siteTerrainHeightAt(newX, newZ) + 0.095 ||
            particlePositions[offset + 1] > 9.5
          ) {
            resetParticle(index, normalizedFlowX, normalizedFlowZ);
          }
        }
        particleGeometry.attributes.position.needsUpdate = true;
      }

      particles.visible = live.viewMode !== "pressure" || live.playing;
      streamlineGroup.visible = live.viewMode === "flow";
      particleMaterial.color.set(live.viewMode === "vibration" ? 0xffb071 : 0x8fe6ff);

      for (const line of streamlines) {
        const attribute = line.geometry.attributes.position as THREE.BufferAttribute;
        const positions = attribute.array as Float32Array;
        const transverseX = -normalizedFlowZ;
        const transverseZ = normalizedFlowX;
        let traceX = normalizedFlowX * -39 + transverseX * line.userData.offset;
        let traceY = line.userData.height;
        let traceZ = normalizedFlowZ * -39 + transverseZ * line.userData.offset;
        for (let point = 0; point < 52; point += 1) {
          traceY = Math.max(traceY, siteTerrainHeightAt(traceX, traceZ) + 0.12);
          positions[point * 3] = traceX;
          positions[point * 3 + 1] = traceY;
          positions[point * 3 + 2] = traceZ;
          sampleFlowField(
            traceX,
            traceY,
            traceZ,
            line.userData.seed,
            normalizedFlowX,
            normalizedFlowZ,
            Math.max(visualSpeed, 0.1),
            elapsed,
            live,
            streamlineFlowSample,
          );
          const horizontalSpeed = Math.max(
            0.1,
            Math.hypot(streamlineFlowSample.vx, streamlineFlowSample.vz),
          );
          const stepLength = 1.5;
          const nextX = traceX + (streamlineFlowSample.vx / horizontalSpeed) * stepLength;
          const nextZ = traceZ + (streamlineFlowSample.vz / horizontalSpeed) * stepLength;
          const nextY = clamp(
            traceY + (streamlineFlowSample.vy / horizontalSpeed) * stepLength,
            0.12,
            9.5,
          );
          const siteBoundary = resolveSiteFlowBoundary(
            { x: traceX, y: traceY, z: traceZ },
            { x: nextX, y: nextY, z: nextZ },
            geometry,
            0.12,
          );
          traceX = siteBoundary.x;
          traceY = siteBoundary.y;
          traceZ = siteBoundary.z;
        }
        attribute.needsUpdate = true;
      }

      const vibrationScale = live.viewMode === "vibration" && live.playing ? 1 : 0;
      const deviceLoadElements = new Map(
        live.result.mitigationLoads.flatMap((load) => load.rows.flatMap((row) =>
          row.elements.map((element) => [`${load.concept}:${row.row}:${element.element}`, element] as const),
        )),
      );
      const elementVibration = (concept: MitigationConceptId, row: number, element: number) =>
        deviceLoadElements.get(`${concept}:${row}:${element}`)?.vibrationIndex ?? 0;
      for (const screen of screenAssemblies) {
        const screenZ = getScreenGeometry(screen.row, geometry).z;
        screen.slats.forEach((slat, index) => {
          const amplitude = vibrationScale * elementVibration("screen", screen.row, slat.userData.segment + 1) * 0.00055;
          const phase = screen.row * 0.71 + index * 0.33;
          slat.position.z = screenZ + Math.sin(elapsed * 7.4 + phase) * amplitude;
          slat.rotation.y = Math.cos(elapsed * 6.8 + phase) * amplitude * 0.08;
        });
        screen.posts.forEach((post, index) => {
          const amplitude = vibrationScale * elementVibration("screen", screen.row, post.userData.element) * 0.00055;
          post.rotation.x = Math.sin(elapsed * 6.3 + screen.row + index * 0.21) * amplitude * 0.04;
        });
      }
      for (const vane of vaneVisuals) {
        const amplitude = vibrationScale
          * elementVibration("vanes", vane.userData.row, vane.userData.element)
          * 0.00009;
        vane.rotation.y = Math.sin(elapsed * 9.1 + vane.userData.row * 0.8 + vane.position.x * 0.13) * amplitude;
      }
      for (const spoiler of spoilerVisuals) {
        const amplitude = vibrationScale
          * elementVibration("spoilers", spoiler.userData.row, spoiler.userData.element)
          * 0.00008;
        const baseAngle = THREE.MathUtils.degToRad(
          -live.config.spoilerAngleDeg + (spoiler.userData.angleOffset ?? 0),
        );
        spoiler.rotation.x = baseAngle + Math.sin(elapsed * 10.2 + spoiler.userData.row + spoiler.position.x * 0.2) * amplitude;
      }
      const damperBaseScale = 0.86 + live.config.damperDampingPercent * 0.035;
      for (const set of damperSets) {
        set.meshes.forEach((damper) => {
          const pulse = 1 + vibrationScale
            * elementVibration("dampers", set.row, damper.userData.element)
            * 0.00042
            * Math.sin(elapsed * 11.4 + set.row * 0.63 + damper.userData.element * 0.11);
          damper.scale.setScalar(damperBaseScale * pulse);
        });
      }
      const selectionPulse = 1 + Math.sin(elapsed * 3.2) * 0.025;
      selectionMarker.scale.setScalar(selectionPulse);
      selectionMaterial.opacity = 0.86 + Math.sin(elapsed * 3.2) * 0.1;
      for (const panel of panelVisuals) {
        const panelResult = getPanelResult(live.result, panel.row, panel.module);
        const amplitude = vibrationScale
          * panelResult.vibrationIndex
          * PANEL_VISUAL_ROTATION_RAD_PER_INDEX;
        const phase = panel.module * 0.31 + panel.row * 0.72;
        panel.assembly.rotation.x = panel.baseRotationX + Math.sin(elapsed * Math.PI * 4 + phase) * amplitude;
        panel.assembly.rotation.z = Math.cos(elapsed * Math.PI * 4.4 + phase) * amplitude * 0.62;
      }

      windDirectionGraphic.rotation.y = Math.atan2(-normalizedFlowZ, normalizedFlowX);

      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          object.geometry?.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material?.dispose());
        }
      });
      panelTexture?.dispose();
      groundTexture?.dispose();
      fieldTexture?.dispose();
      skyTexture?.dispose();
      screenMaterial.dispose();
      vaneMaterial.dispose();
      spoilerMaterial.dispose();
      damperMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [geometryKey]);

  return (
    <div className="wind-scene" ref={hostRef}>
      <div className="scene-corner scene-location">
        <span className="scene-kicker">PORTRAIT MODULES · {config.geometry.rowSpacingM.toFixed(2)} m PITCH · EDITABLE ROW OFFSETS</span>
        <strong>20.130687° N, 155.881243° W</strong>
        <span>58-1200 Akoni Pule Hwy · Kohala</span>
      </div>
      <div className="scene-corner scene-solver">
        <span className="solver-pulse" />
        <span>{getArrayMetrics(config.geometry).totalPanelCount}-PANEL FIELD SOLVER</span>
        <strong>
          {config.activeMitigations.length === 0
            ? MITIGATIONS.none.short
            : config.activeMitigations.length === 1
              ? MITIGATIONS[config.activeMitigations[0]].short
              : `${config.activeMitigations.length} ACTIVE MITIGATIONS`}
        </strong>
      </div>
      <div className="scene-drag-hint">Drag to orbit · Scroll to zoom · Select a panel</div>
    </div>
  );
}
