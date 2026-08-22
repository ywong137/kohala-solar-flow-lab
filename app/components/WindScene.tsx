"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ARRAY_AXIS_BEARING,
  MAUKA_BEARING,
  MITIGATIONS,
  MODULES_PER_ROW,
  PANELS_DEEP_PER_ROW,
  PANEL_LENGTH_M,
  PANEL_THICKNESS_M,
  PANEL_WIDTH_M,
  ROW_COUNT,
  ROW_SPACING_M,
  TABLE_CHORD_M,
  circularDifference,
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
    const tilt = THREE.MathUtils.degToRad(14);
    const lowEdgeHeight = 0.58;
    const centerHeight = lowEdgeHeight + Math.sin(tilt) * TABLE_CHORD_M * 0.5;
    const modulePitch = PANEL_WIDTH_M + 0.055;
    const totalWidth = MODULES_PER_ROW * modulePitch - 0.055;

    for (let rowIndex = 0; rowIndex < ROW_COUNT; rowIndex += 1) {
      const rowNumber = rowIndex + 1;
      const z = ((ROW_COUNT - 1) / 2 - rowIndex) * ROW_SPACING_M;

      for (let depthIndex = 0; depthIndex < PANELS_DEEP_PER_ROW; depthIndex += 1) {
        const panelZ = (depthIndex - (PANELS_DEEP_PER_ROW - 1) / 2) * (PANEL_LENGTH_M + 0.055);
        for (let moduleIndex = 0; moduleIndex < MODULES_PER_ROW; moduleIndex += 1) {
          const x = (moduleIndex - (MODULES_PER_ROW - 1) / 2) * modulePitch;
          const moduleNumber = depthIndex * MODULES_PER_ROW + moduleIndex + 1;
          const assembly = new THREE.Group();
          assembly.position.set(
            x,
            centerHeight - Math.sin(tilt) * panelZ,
            z + Math.cos(tilt) * panelZ,
          );
          assembly.rotation.x = tilt;
          assembly.userData = { row: rowNumber, module: moduleNumber };

        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(PANEL_WIDTH_M + 0.055, PANEL_THICKNESS_M + 0.035, PANEL_LENGTH_M + 0.055),
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
            new THREE.BoxGeometry(PANEL_WIDTH_M - 0.045, PANEL_THICKNESS_M + 0.005, PANEL_LENGTH_M - 0.045),
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

      for (const railZ of [-TABLE_CHORD_M * 0.31, TABLE_CHORD_M * 0.31]) {
        const railHeight = centerHeight - Math.sin(tilt) * railZ - 0.12;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(totalWidth + 0.1, 0.08, 0.09), rackMaterial);
        rail.position.set(0, railHeight, z + railZ);
        rail.castShadow = true;
        arrayGroup.add(rail);
      }

      for (let support = 0; support < 6; support += 1) {
        const x = -totalWidth / 2 + 0.8 + support * ((totalWidth - 1.6) / 5);
        const postTop = new THREE.Vector3(x, centerHeight - 0.12, z - 0.15);
        const post = makeBeam(new THREE.Vector3(x, 0.08, z - 0.15), postTop, 0.045, rackMaterial);
        const brace = makeBeam(new THREE.Vector3(x, 0.08, z + 1.42), postTop, 0.038, rackMaterial);
        arrayGroup.add(post, brace);
      }

      const rowPosition = rowNumber === 1 ? " · FRONT" : rowNumber === 7 ? " · REAR" : "";
      const label = makeTextSprite(`ROW ${rowNumber}${rowPosition}`);
      label.position.set(-totalWidth / 2 - 3.35, 1.15, z);
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
    const mitigationMaterial = new THREE.MeshStandardMaterial({ color: 0x7df0c5, metalness: 0.25, roughness: 0.5, emissive: 0x173c31, emissiveIntensity: 0.7 });
    const screenGroup = new THREE.Group();
    for (let post = 0; post < 13; post += 1) {
      const x = -14.2 + post * 2.36;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.8, 8), rackMaterial);
      pole.position.set(x, 1.4, -20.2);
      screenGroup.add(pole);
    }
    for (let strip = 0; strip < 6; strip += 1) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.13, 0.05), mitigationMaterial);
      slat.position.set(0, 0.35 + strip * 0.45, -20.2);
      screenGroup.add(slat);
    }
    scene.add(screenGroup);
    mitigationGroups.screen = screenGroup;

    const vaneGroup = new THREE.Group();
    for (let row = 1; row <= 3; row += 1) {
      const z = ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M;
      for (let vane = 0; vane < 9; vane += 1) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.68, 1.5), mitigationMaterial);
        fin.position.set(-9.8 + vane * 2.45, 0.42, z);
        vaneGroup.add(fin);
      }
    }
    scene.add(vaneGroup);
    mitigationGroups.vanes = vaneGroup;

    const spoilerGroup = new THREE.Group();
    for (let row = 1; row <= 2; row += 1) {
      const z = ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M + 1.26;
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, 0.36, 0.08), mitigationMaterial);
      spoiler.position.set(0, 0.5, z);
      spoiler.rotation.x = -0.24;
      spoilerGroup.add(spoiler);
    }
    scene.add(spoilerGroup);
    mitigationGroups.spoilers = spoilerGroup;

    const damperGroup = new THREE.Group();
    const damperMaterial = new THREE.MeshStandardMaterial({ color: 0xffa85a, roughness: 0.72, emissive: 0x5c2205, emissiveIntensity: 0.55 });
    for (let row = 1; row <= 2; row += 1) {
      const z = ((ROW_COUNT - 1) / 2 - (row - 1)) * ROW_SPACING_M;
      for (let damper = 0; damper < 8; damper += 1) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 12), damperMaterial);
        pad.position.set(-9 + damper * 2.6, 0.77, z);
        damperGroup.add(pad);
      }
    }
    scene.add(damperGroup);
    mitigationGroups.dampers = damperGroup;

    const particleCount = 760;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleSeeds = new Float32Array(particleCount);
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
      line.userData.offset = -14 + lineIndex * 2.8;
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
      const spread = (Math.random() - 0.5) * 61;
      particlePositions[index * 3] = -flowX * 32 + transverseX * spread;
      particlePositions[index * 3 + 1] = 0.35 + Math.random() * 6.2;
      particlePositions[index * 3 + 2] = -flowZ * 32 + transverseZ * spread;
    };

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
      const windMotion = live.config.windSpeedMph * 0.085;

      if (live.cameraRequest !== lastCameraRequest) {
        setCamera(live.cameraView);
        lastCameraRequest = live.cameraRequest;
      }

      const visualKey = `${live.viewMode}-${live.result.peakUpliftKpa.toFixed(3)}-${live.result.vibrationIndex.toFixed(1)}-${live.showDamage}-${live.config.mitigation}-${live.selectedPanel.row}-${live.selectedPanel.module}`;
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
        Object.entries(mitigationGroups).forEach(([id, group]) => {
          group.visible = live.config.mitigation === id;
        });
        lastVisualKey = visualKey;
      }

      if (live.playing) {
        for (let index = 0; index < particleCount; index += 1) {
          const offset = index * 3;
          const x = particlePositions[offset];
          const z = particlePositions[offset + 2];
          const progress = normalizedFlowZ >= 0 ? clamp((z + 18) / 36, 0, 1) : clamp((18 - z) / 36, 0, 1);
          const inWake = Math.abs(x) < totalWidth * 0.62 && Math.abs(z) < 18;
          const wake = inWake ? (0.18 + progress * 0.92) * live.config.ambientTurbulence * 0.028 : 0.04;
          particlePositions[offset] += normalizedFlowX * windMotion * delta + Math.sin(elapsed * 2.4 + particleSeeds[index]) * wake * delta;
          particlePositions[offset + 2] += normalizedFlowZ * windMotion * delta + Math.cos(elapsed * 2.1 + particleSeeds[index]) * wake * delta;
          particlePositions[offset + 1] += Math.sin(elapsed * 3.2 + particleSeeds[index] * 2) * wake * delta;
          if (
            Math.abs(particlePositions[offset]) > 35 ||
            Math.abs(particlePositions[offset + 2]) > 34 ||
            particlePositions[offset + 1] < 0.18 ||
            particlePositions[offset + 1] > 8
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
        for (let point = 0; point < 52; point += 1) {
          const distance = -31 + point * (62 / 51);
          const progress = point / 51;
          const wake = Math.pow(progress, 1.8) * live.config.ambientTurbulence * 0.045;
          const wave = Math.sin(elapsed * 2.2 + point * 0.24 + line.userData.seed) * wake;
          positions[point * 3] = normalizedFlowX * distance + transverseX * (line.userData.offset + wave);
          positions[point * 3 + 1] = 1.05 + (line.userData.offset % 4) * 0.3 + Math.cos(elapsed * 2.7 + point * 0.3) * wake * 0.48;
          positions[point * 3 + 2] = normalizedFlowZ * distance + transverseZ * (line.userData.offset + wave);
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
        <span className="scene-kicker">SITE MODEL · EST. GEOMETRY</span>
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
