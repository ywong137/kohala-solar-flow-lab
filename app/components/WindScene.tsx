"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ARRAY_AXIS_BEARING,
  LOW_EDGE_CLEARANCE_M,
  MAUKA_BEARING,
  MITIGATIONS,
  MODULES_PER_ROW,
  PANEL_GAP_M,
  PANELS_DEEP_PER_ROW,
  PANEL_SLOPE_M,
  PANEL_SPAN_M,
  PANEL_TILT_DEG,
  PANEL_THICKNESS_M,
  RACK_SUPPORTS_PER_ROW,
  ROW_COLUMN_COUNTS,
  ROW_COLUMN_OFFSETS,
  ROW_COUNT,
  ROW_PANEL_COUNTS,
  ROW_SPACING_M,
  TABLE_CHORD_M,
  circularDifference,
  getMitigationEffects,
  type SimulationConfig,
  type SimulationResult,
  type ViewMode,
} from "../lib/physics";

type SelectedPanel = { row: number; module: number };

type WindSceneProps = {
  config: SimulationConfig;
  result: SimulationResult;
  viewMode: ViewMode;
  playing: boolean;
  showDamage: boolean;
  cameraView: "perspective" | "mauka" | "makai" | "plan";
  cameraRequest: number;
  selectedPanel: SelectedPanel;
  onSelectPanel: (panel: SelectedPanel) => void;
};

type PanelVisual = {
  assembly: THREE.Group;
  glass: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  row: number;
  module: number;
  baseRotationX: number;
};

type FlowSample = {
  vx: number;
  vy: number;
  vz: number;
  turbulence: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const approximateGaussian = () =>
  (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.73;

function makePanelTexture(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 512, 256);
  gradient.addColorStop(0, "#143f55");
  gradient.addColorStop(0.5, "#082634");
  gradient.addColorStop(1, "#0c3447");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 256);
  context.strokeStyle = "rgba(170, 225, 237, .38)";
  context.lineWidth = 2;
  for (let column = 1; column < 12; column += 1) {
    context.beginPath();
    context.moveTo((column * 512) / 12, 0);
    context.lineTo((column * 512) / 12, 256);
    context.stroke();
  }
  for (let row = 1; row < 6; row += 1) {
    context.beginPath();
    context.moveTo(0, (row * 256) / 6);
    context.lineTo(512, (row * 256) / 6);
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
  context.fillStyle = "#343f3d";
  context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 13500; index += 1) {
    const value = 52 + Math.floor(Math.random() * 42);
    context.fillStyle = `rgba(${value - 8}, ${value}, ${value - 2}, ${0.18 + Math.random() * 0.48})`;
    const size = 0.4 + Math.random() * 1.8;
    context.fillRect(Math.random() * 512, Math.random() * 512, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeTextSprite(text: string, accent = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Sprite();
  context.fillStyle = accent ? "rgba(119, 246, 197, .92)" : "rgba(7, 17, 24, .82)";
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 20);
  context.fill();
  context.strokeStyle = accent ? "rgba(215, 255, 240, .8)" : "rgba(134, 211, 230, .45)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = accent ? "#07130f" : "#dffaff";
  context.font = "600 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 256, 66);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(5.8, 1.45, 1);
  return sprite;
}

function makeBeam(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
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
  showDamage,
  cameraView,
  cameraRequest,
  selectedPanel,
  onSelectPanel,
}: WindSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({
    config,
    result,
    viewMode,
    playing,
    showDamage,
    cameraView,
    cameraRequest,
    selectedPanel,
    onSelectPanel,
  });

  useEffect(() => {
    liveRef.current = {
      config,
      result,
      viewMode,
      playing,
      showDamage,
      cameraView,
      cameraRequest,
      selectedPanel,
      onSelectPanel,
    };
  }, [config, result, viewMode, playing, showDamage, cameraView, cameraRequest, selectedPanel, onSelectPanel]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x071219);
    scene.fog = new THREE.FogExp2(0x071219, 0.0135);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
    camera.position.set(29, 22, 31);

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
    controls.maxDistance = 74;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.target.set(0, 0.3, 0);

    scene.add(new THREE.HemisphereLight(0xbce9ff, 0x172018, 1.55));
    const sun = new THREE.DirectionalLight(0xfff3d2, 3.1);
    sun.position.set(-22, 34, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x54d9ff, 1.2);
    rim.position.set(24, 8, 30);
    scene.add(rim);

    const groundTexture = makeGroundTexture(renderer);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(82, 72, 1, 1),
      new THREE.MeshStandardMaterial({ map: groundTexture, color: 0x52605b, roughness: 0.97, metalness: 0.02 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(72, 36, 0x4b6a70, 0x243b40);
    grid.position.y = 0.015;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.24;
    });
    scene.add(grid);

    const arrayGroup = new THREE.Group();
    scene.add(arrayGroup);
    const panelVisuals: PanelVisual[] = [];
    const clickablePanels: THREE.Object3D[] = [];
    const panelTexture = makePanelTexture(renderer);
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa9a8, metalness: 0.82, roughness: 0.26 });
    const rackMaterial = new THREE.MeshStandardMaterial({ color: 0x758482, metalness: 0.88, roughness: 0.3 });
    const tilt = THREE.MathUtils.degToRad(PANEL_TILT_DEG);
    const lowEdgeHeight = LOW_EDGE_CLEARANCE_M;
    const centerHeight = lowEdgeHeight + Math.sin(tilt) * TABLE_CHORD_M * 0.5;
    const modulePitch = PANEL_SPAN_M + PANEL_GAP_M;
    const totalWidth = MODULES_PER_ROW * modulePitch - PANEL_GAP_M;
    const tableHorizontalDepth = Math.cos(tilt) * TABLE_CHORD_M;
    const rowFlowGeometry = ROW_COLUMN_COUNTS.map((columns, index) => ({
      row: index + 1,
      z: ((ROW_COUNT - 1) / 2 - index) * ROW_SPACING_M,
      offsetX: ROW_COLUMN_OFFSETS[index] * modulePitch,
      width: columns * modulePitch - PANEL_GAP_M,
    }));

    for (let rowIndex = 0; rowIndex < ROW_COUNT; rowIndex += 1) {
      const rowNumber = rowIndex + 1;
      const z = ((ROW_COUNT - 1) / 2 - rowIndex) * ROW_SPACING_M;
      const rowColumns = ROW_COLUMN_COUNTS[rowIndex];
      const rowOffsetX = ROW_COLUMN_OFFSETS[rowIndex] * modulePitch;
      const rowWidth = rowColumns * modulePitch - PANEL_GAP_M;

      for (let depthIndex = 0; depthIndex < PANELS_DEEP_PER_ROW; depthIndex += 1) {
        const panelZ = (depthIndex - (PANELS_DEEP_PER_ROW - 1) / 2) * (PANEL_SLOPE_M + PANEL_GAP_M);
        for (let moduleIndex = 0; moduleIndex < rowColumns; moduleIndex += 1) {
          const x = rowOffsetX + (moduleIndex - (rowColumns - 1) / 2) * modulePitch;
          const moduleNumber = depthIndex * rowColumns + moduleIndex + 1;
          const assembly = new THREE.Group();
          assembly.position.set(
            x,
            centerHeight - Math.sin(tilt) * panelZ,
            z + Math.cos(tilt) * panelZ,
          );
          assembly.rotation.x = tilt;
          assembly.userData = { row: rowNumber, module: moduleNumber };

          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(PANEL_SPAN_M + PANEL_GAP_M, PANEL_THICKNESS_M + 0.035, PANEL_SLOPE_M + PANEL_GAP_M),
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
            new THREE.BoxGeometry(PANEL_SPAN_M - 0.045, PANEL_THICKNESS_M + 0.005, PANEL_SLOPE_M - 0.045),
            glassMaterial,
          );
          glass.position.y = 0.055;
          glass.castShadow = true;
          glass.receiveShadow = true;
          glass.userData = { row: rowNumber, module: moduleNumber };
          assembly.add(glass);
          arrayGroup.add(assembly);
          panelVisuals.push({ assembly, glass, row: rowNumber, module: moduleNumber, baseRotationX: tilt });
          clickablePanels.push(glass);
        }
      }

      for (const railZ of [-TABLE_CHORD_M * 0.39, -TABLE_CHORD_M * 0.13, TABLE_CHORD_M * 0.13, TABLE_CHORD_M * 0.39]) {
        const railHeight = centerHeight - Math.sin(tilt) * railZ - 0.12;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(rowWidth + 0.1, 0.08, 0.09), rackMaterial);
        rail.position.set(rowOffsetX, railHeight, z + railZ);
        rail.castShadow = true;
        arrayGroup.add(rail);
      }

      const supportCount = rowColumns === MODULES_PER_ROW ? RACK_SUPPORTS_PER_ROW : 3;
      for (let support = 0; support < supportCount; support += 1) {
        const x = rowOffsetX - rowWidth / 2 + 0.5 + support * ((rowWidth - 1) / (supportCount - 1));
        const postTop = new THREE.Vector3(x, centerHeight - 0.12, z - 0.15);
        const post = makeBeam(new THREE.Vector3(x, 0.08, z - 0.15), postTop, 0.045, rackMaterial);
        const brace = makeBeam(new THREE.Vector3(x, 0.08, z + 1.42), postTop, 0.038, rackMaterial);
        arrayGroup.add(post, brace);
      }

      const rowPosition = rowNumber === 1 ? " · FRONT" : rowNumber === 7 ? " · REAR" : "";
      const label = makeTextSprite(`ROW ${rowNumber}${rowPosition} · ${ROW_PANEL_COUNTS[rowIndex]} PANELS`);
      label.position.set(rowOffsetX - rowWidth / 2 - 3.35, 1.15, z);
      label.scale.set(4.9, 1.22, 1);
      arrayGroup.add(label);
    }

    const maukaLabel = makeTextSprite("MAUKA · NE · UPWIND", true);
    maukaLabel.position.set(0, 1.8, -23.5);
    scene.add(maukaLabel);
    const makaiLabel = makeTextSprite("MAKAI · SW · DOWNWIND");
    makaiLabel.position.set(0, 1.8, 23.5);
    scene.add(makaiLabel);

    const directionMaterial = new THREE.MeshStandardMaterial({ color: 0x8bf2c9, emissive: 0x245e4b, emissiveIntensity: 1.1 });
    const maukaArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(14, 0.15, -22), 8, 0x7ff1c4, 1.2, 0.7);
    scene.add(maukaArrow);
    const bearingDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 32), directionMaterial);
    bearingDisc.position.set(14, 0.07, -22);
    scene.add(bearingDisc);

    const mitigationGroups: Record<string, THREE.Group> = {};
    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x7df0c5,
      metalness: 0.2,
      roughness: 0.38,
      emissive: 0x1e8f6b,
      emissiveIntensity: 1.3,
    });
    const vaneMaterial = new THREE.MeshStandardMaterial({
      color: 0x5ddcff,
      metalness: 0.25,
      roughness: 0.32,
      emissive: 0x176f91,
      emissiveIntensity: 1.45,
    });
    const spoilerMaterial = new THREE.MeshStandardMaterial({
      color: 0xff9b57,
      metalness: 0.2,
      roughness: 0.36,
      emissive: 0x9a3d0a,
      emissiveIntensity: 1.55,
    });
    const damperMaterial = new THREE.MeshStandardMaterial({
      color: 0xff66d8,
      roughness: 0.3,
      emissive: 0xc40083,
      emissiveIntensity: 2.4,
    });

    const screenGroup = new THREE.Group();
    const screenPosts: THREE.Mesh[] = [];
    const screenSlats: THREE.Mesh[] = [];
    const screenZ = -((ROW_COUNT - 1) / 2) * ROW_SPACING_M - 4.5;
    for (let post = 0; post < 9; post += 1) {
      const x = -totalWidth / 2 - 0.7 + post * ((totalWidth + 1.4) / 8);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 10), screenMaterial);
      pole.position.set(x, 1.1, screenZ);
      screenGroup.add(pole);
      screenPosts.push(pole);
    }
    for (let strip = 0; strip < 12; strip += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(totalWidth + 1.4, 1, 0.075), screenMaterial);
      slat.position.set(0, 0.2 + strip * 0.18, screenZ);
      screenGroup.add(slat);
      screenSlats.push(slat);
    }
    scene.add(screenGroup);
    mitigationGroups.screen = screenGroup;

    const vaneGroup = new THREE.Group();
    const vaneVisuals: THREE.Mesh[] = [];
    for (let row = 1; row <= ROW_COUNT; row += 1) {
      const z = ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M;
      const rowColumns = ROW_COLUMN_COUNTS[row - 1];
      const rowOffsetX = ROW_COLUMN_OFFSETS[row - 1] * modulePitch;
      const rowWidth = rowColumns * modulePitch - PANEL_GAP_M;
      const vaneCount = rowColumns === MODULES_PER_ROW ? 7 : 3;
      for (let vane = 0; vane < vaneCount; vane += 1) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.72, 1), vaneMaterial);
        fin.position.set(
          rowOffsetX - rowWidth / 2 + 0.45 + vane * ((rowWidth - 0.9) / (vaneCount - 1)),
          0.43,
          z,
        );
        fin.userData.rowZ = z;
        fin.userData.row = row;
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
    for (let row = 1; row <= ROW_COUNT; row += 1) {
      const edgeZ = ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M + tableHorizontalDepth / 2;
      const rowColumns = ROW_COLUMN_COUNTS[row - 1];
      const rowOffsetX = ROW_COLUMN_OFFSETS[row - 1] * modulePitch;
      const rowWidth = rowColumns * modulePitch - PANEL_GAP_M;
      const continuous = new THREE.Mesh(new THREE.BoxGeometry(rowWidth, 1, 0.075), spoilerMaterial);
      continuous.position.set(rowOffsetX, lowEdgeHeight + 0.15, edgeZ);
      continuous.userData.row = row;
      spoilerStyleGroups.continuous.add(continuous);
      spoilerVisuals.push(continuous);

      for (let moduleIndex = 0; moduleIndex < rowColumns; moduleIndex += 1) {
        const x = rowOffsetX + (moduleIndex - (rowColumns - 1) / 2) * modulePitch;
        const perforated = new THREE.Mesh(new THREE.BoxGeometry(modulePitch * 0.62, 1, 0.075), spoilerMaterial);
        perforated.position.set(x, lowEdgeHeight + 0.15, edgeZ);
        perforated.userData.row = row;
        spoilerStyleGroups.perforated.add(perforated);
        spoilerVisuals.push(perforated);

        const tab = new THREE.Mesh(new THREE.BoxGeometry(modulePitch * 0.42, 1, 0.095), spoilerMaterial);
        tab.position.set(x, lowEdgeHeight + 0.15, edgeZ);
        tab.userData.angleOffset = moduleIndex % 2 === 0 ? -6 : 6;
        tab.userData.row = row;
        spoilerStyleGroups.tabs.add(tab);
        spoilerVisuals.push(tab);
      }
    }
    scene.add(spoilerGroup);
    mitigationGroups.spoilers = spoilerGroup;

    const damperGroup = new THREE.Group();
    const damperSets: Array<{ row: number; width: number; offsetX: number; meshes: THREE.Mesh[] }> = [];
    const damperGlows: THREE.PointLight[] = [];
    const maxDampersPerRail = Math.ceil(totalWidth / 0.8) + 1;
    for (let row = 1; row <= ROW_COUNT; row += 1) {
      const z = ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M;
      const rowColumns = ROW_COLUMN_COUNTS[row - 1];
      const rowOffsetX = ROW_COLUMN_OFFSETS[row - 1] * modulePitch;
      const rowWidth = rowColumns * modulePitch - PANEL_GAP_M;
      for (const railZ of [-TABLE_CHORD_M * 0.39, -TABLE_CHORD_M * 0.13, TABLE_CHORD_M * 0.13, TABLE_CHORD_M * 0.39]) {
        const set: THREE.Mesh[] = [];
        const railHeight = centerHeight - Math.sin(tilt) * railZ - 0.12;
        for (let damper = 0; damper < maxDampersPerRail; damper += 1) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.052, 10, 18), damperMaterial);
          ring.rotation.y = Math.PI / 2;
          ring.position.set(0, railHeight, z + railZ);
          damperGroup.add(ring);
          set.push(ring);
        }
        damperSets.push({ row, width: rowWidth, offsetX: rowOffsetX, meshes: set });
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
      particlePositions[index * 3] = (Math.random() - 0.5) * 64;
      particlePositions[index * 3 + 1] = 0.35 + Math.random() * 6.2;
      particlePositions[index * 3 + 2] = (Math.random() - 0.5) * 62;
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
      const targets = {
        perspective: { position: new THREE.Vector3(29, 22, 31), target: new THREE.Vector3(0, 0.3, 0) },
        mauka: { position: new THREE.Vector3(0, 9, -37), target: new THREE.Vector3(0, 0.7, 2) },
        makai: { position: new THREE.Vector3(0, 9, 37), target: new THREE.Vector3(0, 0.7, -2) },
        plan: { position: new THREE.Vector3(0, 49, 0.01), target: new THREE.Vector3(0, 0, 0) },
      };
      camera.position.copy(targets[view].position);
      controls.target.copy(targets[view].target);
      controls.update();
    };

    const resetParticle = (index: number, flowX: number, flowZ: number) => {
      const transverseX = -flowZ;
      const transverseZ = flowX;
      const spread = (Math.random() - 0.5) * 66;
      const upstream = -34 - Math.random() * 2;
      const layer = Math.random();
      const height = layer < 0.36
        ? 0.14 + Math.random() * 0.8
        : layer < 0.8
          ? 0.9 + Math.random() * 1.75
          : 2.7 + Math.random() * 3.7;
      particlePositions[index * 3] = flowX * upstream + transverseX * spread;
      particlePositions[index * 3 + 1] = height;
      particlePositions[index * 3 + 2] = flowZ * upstream + transverseZ * spread;
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
      effects: ReturnType<typeof getMitigationEffects>,
      out: FlowSample,
    ) => {
      const crossRowAlignment = Math.abs(flowZ);
      const flowSign = flowZ >= 0 ? 1 : -1;
      const transverseX = -flowZ;
      const transverseZ = flowX;
      let speedFactor = live.config.mitigation === "screen" ? Math.sqrt(effects.pressureFactor) : 1;
      let verticalVelocity = 0;
      let lateralVelocity = 0;
      let turbulence = (live.config.ambientTurbulence / 100) * 0.55;

      for (const row of rowFlowGeometry) {
        if (live.showDamage && row.row <= 2) continue;
        if (Math.abs(x - row.offsetX) > row.width / 2 + 1.25) continue;

        const dz = z - row.z;
        const downstreamDistance = dz * flowSign;
        const halfDepth = tableHorizontalDepth / 2;
        const panelHeight = centerHeight - Math.tan(tilt) * dz;
        const rowTurbulence = live.result.rows[row.row - 1].turbulencePercent / 100;

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
            if (live.config.mitigation === "vanes" && row.row <= live.config.vaneRowCount) {
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
        if (wakeDistance > 0 && wakeDistance < ROW_SPACING_M * 1.55) {
          const wakeDecay = Math.exp(-wakeDistance / (ROW_SPACING_M * 0.9));
          const wakeStrength = crossRowAlignment * wakeDecay;
          const vortexPhase =
            phase + elapsed * (1.15 + visualSpeed * 0.055) + wakeDistance * 2.7 + row.row * 1.23;
          turbulence += rowTurbulence * wakeStrength * 0.34;
          speedFactor *= 1 - 0.13 * wakeStrength;
          lateralVelocity += Math.sin(vortexPhase) * visualSpeed * rowTurbulence * wakeStrength * 0.16;
          verticalVelocity += Math.cos(vortexPhase * 0.83) * visualSpeed * rowTurbulence * wakeStrength * 0.12;

          if (live.config.mitigation === "spoilers" && row.row <= live.config.spoilerRowCount) {
            turbulence *= 0.82;
            verticalVelocity += visualSpeed * wakeStrength * 0.035;
          }
        }
      }

      if (y < 0.24) {
        verticalVelocity += (1 - y / 0.24) * visualSpeed * 0.28;
      }

      const localTurbulence = clamp(turbulence * effects.turbulenceFactor, 0.018, 0.46);
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
      const flowBearing = (live.config.windBearing + 180) % 360;
      const flowX = Math.cos(THREE.MathUtils.degToRad(circularDifference(flowBearing, ARRAY_AXIS_BEARING)));
      const flowZ = Math.cos(THREE.MathUtils.degToRad(circularDifference(flowBearing, MAUKA_BEARING + 180)));
      const flowLength = Math.hypot(flowX, flowZ) || 1;
      const normalizedFlowX = flowX / flowLength;
      const normalizedFlowZ = flowZ / flowLength;
      const visualSpeed = live.config.windSpeedMph * 0.44704 * 0.19;
      const mitigationEffects = getMitigationEffects(live.config);

      if (live.cameraRequest !== lastCameraRequest) {
        setCamera(live.cameraView);
        lastCameraRequest = live.cameraRequest;
      }

      const visualKey = [
        live.viewMode,
        live.result.peakUpliftKpa.toFixed(3),
        live.result.vibrationIndex.toFixed(1),
        live.showDamage,
        live.config.mitigation,
        live.config.screenPorosity,
        live.config.screenHeightM,
        live.config.screenProtectedRows,
        live.config.vaneLengthM,
        live.config.vaneRowCount,
        live.config.spoilerStyle,
        live.config.spoilerHeightM,
        live.config.spoilerAngleDeg,
        live.config.spoilerRowCount,
        live.config.damperSpacingM,
        live.config.damperDampingPercent,
        live.config.damperRowCount,
        live.selectedPanel.row,
        live.selectedPanel.module,
      ].join("-");
      if (visualKey !== lastVisualKey) {
        const maxPressure = Math.max(...live.result.rows.map((row) => row.peakUpliftKpa), 0.01);
        for (const panel of panelVisuals) {
          const rowResult = live.result.rows[panel.row - 1];
          const selected = panel.row === live.selectedPanel.row && panel.module === live.selectedPanel.module;
          const risk = live.viewMode === "pressure"
            ? rowResult.peakUpliftKpa / maxPressure
            : live.viewMode === "vibration"
              ? rowResult.vibrationIndex / 100
              : 0.12;
          const color = new THREE.Color().setHSL(0.54 * (1 - clamp(risk, 0, 1)), 0.82, 0.43 + risk * 0.08);
          panel.glass.material.color.copy(color);
          panel.glass.material.emissive.copy(selected ? new THREE.Color(0x7df0c5) : color.clone().multiplyScalar(0.19));
          panel.glass.material.emissiveIntensity = selected ? 1.25 : live.viewMode === "flow" ? 0.32 : 0.66;
          panel.assembly.visible = !(live.showDamage && panel.row <= 2);
        }

        const screenHeight = live.config.screenHeightM;
        const screenCellHeight = screenHeight / screenSlats.length;
        const screenSolidHeight = screenCellHeight * (1 - live.config.screenPorosity / 100);
        screenPosts.forEach((post) => {
          post.scale.y = screenHeight;
          post.position.y = screenHeight / 2;
        });
        screenSlats.forEach((slat, index) => {
          slat.scale.y = Math.max(0.015, screenSolidHeight);
          slat.position.y = (index + 0.5) * screenCellHeight;
        });

        for (const vane of vaneVisuals) {
          vane.scale.z = live.config.vaneLengthM;
          vane.position.z = vane.userData.rowZ + tableHorizontalDepth / 2 - live.config.vaneLengthM / 2;
          vane.visible = vane.userData.row <= live.config.vaneRowCount;
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
          spoiler.visible = spoiler.userData.row <= live.config.spoilerRowCount;
        }

        const damperScale = 0.86 + live.config.damperDampingPercent * 0.035;
        for (const set of damperSets) {
          const damperCount = clamp(
            Math.ceil(set.width / live.config.damperSpacingM) + 1,
            2,
            maxDampersPerRail,
          );
          set.meshes.forEach((damper, index) => {
            damper.visible = set.row <= live.config.damperRowCount && index < damperCount;
            damper.position.x =
              set.offsetX - set.width / 2 + index * (set.width / Math.max(1, damperCount - 1));
            damper.scale.setScalar(damperScale);
          });
        }
        damperGlows.forEach((glow, index) => {
          glow.visible = index < live.config.damperRowCount;
          glow.intensity = 1.1 + live.config.damperDampingPercent * 0.15;
        });

        Object.entries(mitigationGroups).forEach(([id, group]) => {
          group.visible = live.config.mitigation === id;
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
            mitigationEffects,
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
          const newX =
            oldX +
            (particleFlowSample.vx + transverseX * particleTurbulence[turbulenceOffset]) * delta;
          const newZ =
            oldZ +
            (particleFlowSample.vz + transverseZ * particleTurbulence[turbulenceOffset]) * delta;
          let newY =
            oldY + (particleFlowSample.vy + particleTurbulence[turbulenceOffset + 1]) * delta;

          for (const row of rowFlowGeometry) {
            if (live.showDamage && row.row <= 2) continue;
            if (Math.abs(newX - row.offsetX) > row.width / 2) continue;
            const newDz = newZ - row.z;
            if (Math.abs(newDz) > tableHorizontalDepth / 2) continue;
            const oldPanelHeight = centerHeight - Math.tan(tilt) * (oldZ - row.z);
            const newPanelHeight = centerHeight - Math.tan(tilt) * newDz;
            const crossedPanel = (oldY - oldPanelHeight) * (newY - newPanelHeight) <= 0;
            if (crossedPanel || Math.abs(newY - newPanelHeight) < 0.1) {
              const side = oldY >= oldPanelHeight ? 1 : -1;
              newY = newPanelHeight + side * 0.105;
              particleTurbulence[turbulenceOffset + 1] *= -0.18;
            }
          }

          particlePositions[offset] = newX;
          particlePositions[offset + 1] = Math.max(0.1, newY);
          particlePositions[offset + 2] = newZ;
          const streamwisePosition = newX * normalizedFlowX + newZ * normalizedFlowZ;
          const transversePosition = newX * transverseX + newZ * transverseZ;
          if (
            streamwisePosition > 36 ||
            Math.abs(transversePosition) > 36 ||
            particlePositions[offset + 1] < 0.095 ||
            particlePositions[offset + 1] > 8.5
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
        let traceX = normalizedFlowX * -32 + transverseX * line.userData.offset;
        let traceY = line.userData.height;
        let traceZ = normalizedFlowZ * -32 + transverseZ * line.userData.offset;
        for (let point = 0; point < 52; point += 1) {
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
            mitigationEffects,
            streamlineFlowSample,
          );
          const horizontalSpeed = Math.max(
            0.1,
            Math.hypot(streamlineFlowSample.vx, streamlineFlowSample.vz),
          );
          const stepLength = 1.28;
          traceX += (streamlineFlowSample.vx / horizontalSpeed) * stepLength;
          traceZ += (streamlineFlowSample.vz / horizontalSpeed) * stepLength;
          traceY = clamp(
            traceY + (streamlineFlowSample.vy / horizontalSpeed) * stepLength,
            0.12,
            7.5,
          );
        }
        attribute.needsUpdate = true;
      }

      const vibrationScale = live.viewMode === "vibration" && live.playing ? 1 : 0;
      for (const panel of panelVisuals) {
        const rowResult = live.result.rows[panel.row - 1];
        const amplitude = vibrationScale * rowResult.vibrationIndex * 0.00011;
        const phase = panel.module * 0.31 + panel.row * 0.72;
        panel.assembly.rotation.x = panel.baseRotationX + Math.sin(elapsed * Math.PI * 4 + phase) * amplitude;
        panel.assembly.rotation.z = Math.cos(elapsed * Math.PI * 4.4 + phase) * amplitude * 0.62;
      }

      const arrowDirection = new THREE.Vector3(normalizedFlowX, 0, normalizedFlowZ);
      maukaArrow.setDirection(arrowDirection);
      maukaArrow.position.set(-normalizedFlowX * 23 + 14, 0.15, -normalizedFlowZ * 23);
      maukaArrow.setLength(8, 1.2, 0.7);
      bearingDisc.position.set(-normalizedFlowX * 23 + 14, 0.07, -normalizedFlowZ * 23);

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
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className="wind-scene" ref={hostRef}>
      <div className="scene-corner scene-location">
        <span className="scene-kicker">LANDSCAPE MODULES · R1/R7 SOUTHEAST ALIGNED · {PANEL_TILT_DEG.toFixed(1)}° TILT</span>
        <strong>20.130687° N, 155.881243° W</strong>
        <span>58-1200 Akoni Pule Hwy · Kohala</span>
      </div>
      <div className="scene-corner scene-solver">
        <span className="solver-pulse" />
        <span>REDUCED-ORDER SOLVER</span>
        <strong>{MITIGATIONS[config.mitigation].short}</strong>
      </div>
      <div className="scene-drag-hint">Drag to orbit · Scroll to zoom · Select a panel</div>
    </div>
  );
}
