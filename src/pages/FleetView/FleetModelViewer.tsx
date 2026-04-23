import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { CircularProgress, LinearProgress, Menu, MenuItem } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { FormattedMessage } from 'react-intl';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

import { getRenderableBounds, recenterObjectToRenderableBounds } from '@/utils/threeObjectBounds';

export interface FleetModelViewerShip {
  key: string;
  shipId: number;
  displayName: string;
  quantity: number;
  lengthMeters: number | null;
  beamMeters: number | null;
  heightMeters: number | null;
}

export type FleetModelViewerTransformMode = 'translate' | 'rotate';

export interface FleetModelViewerTransformState {
  position: [number, number, number];
  quaternion: [number, number, number, number];
}

export interface FleetModelViewerRotationState {
  x: number;
  y: number;
  z: number;
}

interface FleetModelViewerProps {
  open: boolean;
  ships: FleetModelViewerShip[];
  selectedShipKey?: string | null;
  transformMode?: FleetModelViewerTransformMode | null;
  savedTransforms?: Record<string, FleetModelViewerTransformState>;
  onSelectedShipKeyChange?: (shipKey: string | null) => void;
  onSelectedShipRotationChange?: (rotation: FleetModelViewerRotationState | null) => void;
  onShipTransformChange?: (shipKey: string, transform: FleetModelViewerTransformState) => void;
  onDeleteShip?: (shipKey: string) => void;
}

interface FleetLoadState {
  total: number;
  loaded: number;
  failed: number;
  currentShipName: string | null;
}

interface LoadedFleetObject {
  key: string;
  order: number;
  root: THREE.Group;
  rotationRoot: THREE.Group;
  footprint: number;
  depth: number;
  basePosition: THREE.Vector3;
  offsetPosition: THREE.Vector3;
  rotationQuaternion: THREE.Quaternion;
  savedWorldPosition: THREE.Vector3 | null;
}

interface FleetModelViewerContextMenuState {
  mouseX: number;
  mouseY: number;
  targetShipKey: string | null;
}

interface CameraFocusState {
  position: THREE.Vector3;
  target: THREE.Vector3;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
}

interface CameraFocusTransitionState {
  active: boolean;
  startTime: number;
  durationMs: number;
  from: CameraFocusState;
  to: CameraFocusState;
}

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const MODEL_ENDPOINT = import.meta.env.VITE_PUBLIC_MODEL_ENDPOINT;
const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}draco/`;
const STATION_MODEL_BASE_URL = `${import.meta.env.BASE_URL}models/`;
// const INFINITE_STAGE_FLOOR_SIZE = 20000;
const INFINITE_STAGE_GRID_SIZE = 4000;
const INFINITE_STAGE_GRID_DIVISIONS = 64;
const INFINITE_STAGE_GRID_SNAP = 20;
const MANUAL_POSITION_EPSILON_SQ = 0.0001;
const CONTEXT_MENU_DRAG_THRESHOLD_SQ = 36;
const ROTATION_SNAP_RADIANS = THREE.MathUtils.degToRad(1);
const SELECTED_OUTLINE_VISIBLE_EDGE_COLOR = 0x7dd3fc;
const SELECTED_OUTLINE_HIDDEN_EDGE_COLOR = 0x0f172a;
const SELECTED_OUTLINE_STRENGTH = 6;
const SELECTED_OUTLINE_GLOW = 0.15;
const SELECTED_OUTLINE_THICKNESS = 1.6;
const COMPOSER_MULTISAMPLE_COUNT = 4;
const CAMERA_FOCUS_ANIMATION_DURATION_MS = 360;
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(42, 26, 62);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 8, 0);
const DEFAULT_CAMERA_MAX_DISTANCE = 900;
// const SKYBOX_TEXTURE_WIDTH = 2048;
// const SKYBOX_TEXTURE_HEIGHT = 1024;

interface FleetSceneBackdropConfig {
  key: string;
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  targetLongestDimension: number;
}

const FLEET_SCENE_BACKDROPS: FleetSceneBackdropConfig[] = [
  {
    key: 'StationAlpha',
    url: `${STATION_MODEL_BASE_URL}StationAlpha.dae`,
    position: [-1200, -460, -150],
    rotation: [0, Math.PI * 0.2, 0],
    targetLongestDimension: 24000,
  },
  {
    key: 'StationBravo',
    url: `${STATION_MODEL_BASE_URL}StationBravo.dae`,
    position: [300, 0, 1300],
    rotation: [0, -Math.PI * 0.34, 0],
    targetLongestDimension: 19500,
  },
  {
    key: 'StationCharlie',
    url: `${STATION_MODEL_BASE_URL}StationCharlie.dae`,
    position: [0, 400, -2305],
    rotation: [0, Math.PI, 0],
    targetLongestDimension: 32000,
  },
];

const MODEL_UNIT_SCALE_CANDIDATES = [
  { label: 'meters', scaleFactor: 1 },
  { label: 'centimeters', scaleFactor: 0.01 },
  { label: 'millimeters', scaleFactor: 0.001 },
  { label: 'decimeters', scaleFactor: 0.1 },
  { label: 'inches', scaleFactor: 0.0254 },
  { label: 'feet', scaleFactor: 0.3048 },
  { label: 'yards', scaleFactor: 0.9144 },
] as const;

interface DimensionalScaleResolution {
  scaleFactor: number;
  unitLabel: string;
  fitError: number | null;
  comparedDimensions: number;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => disposeMaterial(entry));
    return;
  }

  material.dispose();
}

function forceDoubleSided(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => forceDoubleSided(entry));
    return;
  }

  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if ('geometry' in child && child.geometry instanceof THREE.BufferGeometry) {
      child.geometry.dispose();
    }

    if ('material' in child && child.material) {
      disposeMaterial(child.material as THREE.Material | THREE.Material[]);
    }
  });
}

function frameObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  multiplier = 1,
) {
  const { center, sphere } = getRenderableBounds(object);
  const radius = Math.max(sphere.radius, 1);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect, 0.1);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const fitHeightDistance = radius / Math.sin(verticalFov / 2);
  const fitWidthDistance = radius / Math.sin(horizontalFov / 2);
  const distance = Math.max(fitHeightDistance, fitWidthDistance, radius * 2.4) * multiplier;
  const viewDirection = new THREE.Vector3(
    aspect < 1 ? 0.16 : 0.74,
    aspect < 1 ? 0.2 : 0.34,
    aspect < 1 ? 1.95 : 1.3,
  ).normalize();

  camera.near = Math.max(distance / 150, 0.01);
  camera.far = Math.max(distance * 70, 200);
  camera.position.copy(center.clone().add(viewDirection.multiplyScalar(distance)));
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = Math.max(radius * 0.75, 4);
  controls.maxDistance = Math.max(distance * 12, 120);
  controls.update();
}

function getLargestRenderableDimension(size: THREE.Vector3) {
  return Math.max(size.x, size.y, size.z, 1);
}

// function createDeterministicRandom(seed: number) {
//   let state = seed >>> 0;

//   return () => {
//     state = (state + 0x6D2B79F5) >>> 0;
//     let value = Math.imul(state ^ (state >>> 15), 1 | state);
//     value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
//     return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
//   };
// }

// function createFleetSceneSkyboxTexture() {
//   const canvas = document.createElement('canvas');
//   canvas.width = SKYBOX_TEXTURE_WIDTH;
//   canvas.height = SKYBOX_TEXTURE_HEIGHT;

//   const context = canvas.getContext('2d');
//   if (!context) {
//     return null;
//   }

//   const random = createDeterministicRandom(0xC1712E5);
//   const { width, height } = canvas;

//   const backgroundGradient = context.createLinearGradient(0, 0, 0, height);
//   backgroundGradient.addColorStop(0, '#030712');
//   backgroundGradient.addColorStop(0.38, '#08111f');
//   backgroundGradient.addColorStop(0.72, '#050b16');
//   backgroundGradient.addColorStop(1, '#010308');
//   context.fillStyle = backgroundGradient;
//   context.fillRect(0, 0, width, height);

//   const paintNebula = (
//     x: number,
//     y: number,
//     radius: number,
//     colorStops: Array<[number, string]>,
//     alpha: number,
//   ) => {
//     const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
//     colorStops.forEach(([offset, color]) => {
//       gradient.addColorStop(offset, color);
//     });
//     context.save();
//     context.globalAlpha = alpha;
//     context.globalCompositeOperation = 'screen';
//     context.fillStyle = gradient;
//     context.beginPath();
//     context.arc(x, y, radius, 0, Math.PI * 2);
//     context.fill();
//     context.restore();
//   };

//   paintNebula(width * 0.2, height * 0.24, height * 0.42, [
//     [0, 'rgba(96,165,250,0.95)'],
//     [0.24, 'rgba(14,165,233,0.38)'],
//     [0.58, 'rgba(37,99,235,0.14)'],
//     [1, 'rgba(0,0,0,0)'],
//   ], 0.35);

//   paintNebula(width * 0.78, height * 0.33, height * 0.32, [
//     [0, 'rgba(244,114,182,0.9)'],
//     [0.3, 'rgba(168,85,247,0.36)'],
//     [0.66, 'rgba(59,130,246,0.12)'],
//     [1, 'rgba(0,0,0,0)'],
//   ], 0.24);

//   paintNebula(width * 0.5, height * 0.82, height * 0.4, [
//     [0, 'rgba(250,204,21,0.55)'],
//     [0.28, 'rgba(56,189,248,0.22)'],
//     [0.62, 'rgba(14,116,144,0.08)'],
//     [1, 'rgba(0,0,0,0)'],
//   ], 0.2);

//   context.save();
//   context.globalCompositeOperation = 'screen';
//   for (let index = 0; index < 2400; index += 1) {
//     const x = random() * width;
//     const y = random() * height;
//     const radius = random() < 0.985
//       ? 0.25 + random() * 1.05
//       : 1.4 + random() * 2.8;
//     const brightness = 185 + Math.floor(random() * 70);
//     const tintShift = Math.floor(random() * 30);
//     context.fillStyle = `rgba(${brightness}, ${brightness - tintShift}, 255, ${0.2 + random() * 0.8})`;
//     context.beginPath();
//     context.arc(x, y, radius, 0, Math.PI * 2);
//     context.fill();

//     if (radius > 2.4) {
//       context.strokeStyle = `rgba(255,255,255,${0.08 + random() * 0.1})`;
//       context.lineWidth = 1;
//       context.beginPath();
//       context.moveTo(x - radius * 3.2, y);
//       context.lineTo(x + radius * 3.2, y);
//       context.moveTo(x, y - radius * 3.2);
//       context.lineTo(x, y + radius * 3.2);
//       context.stroke();
//     }
//   }
//   context.restore();

//   const vignette = context.createRadialGradient(width * 0.5, height * 0.5, height * 0.16, width * 0.5, height * 0.5, width * 0.7);
//   vignette.addColorStop(0, 'rgba(0,0,0,0)');
//   vignette.addColorStop(0.72, 'rgba(0,0,0,0.08)');
//   vignette.addColorStop(1, 'rgba(0,0,0,0.34)');
//   context.fillStyle = vignette;
//   context.fillRect(0, 0, width, height);

//   const texture = new THREE.CanvasTexture(canvas);
//   texture.colorSpace = THREE.SRGBColorSpace;
//   texture.mapping = THREE.EquirectangularReflectionMapping;
//   texture.needsUpdate = true;

//   return texture;
// }

function createFocusStateForObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
) : CameraFocusState {
  const { center, sphere } = getRenderableBounds(object);
  const radius = Math.max(sphere.radius, 1);
  const currentViewDirection = camera.position.clone().sub(controls.target);
  const viewDirection = currentViewDirection.lengthSq() > 0.001
    ? currentViewDirection.normalize()
    : new THREE.Vector3(0.74, 0.34, 1.3).normalize();
  const distance = Math.max(radius * 4.25, 12);

  return {
    position: center.clone().add(viewDirection.multiplyScalar(distance)),
    target: center,
    near: Math.max(distance / 150, 0.01),
    far: Math.max(distance * 70, 200),
    minDistance: Math.max(radius * 0.75, 4),
    maxDistance: Math.max(distance * 12, 120),
  };
}

function createCurrentCameraFocusState(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
): CameraFocusState {
  return {
    position: camera.position.clone(),
    target: controls.target.clone(),
    near: camera.near,
    far: camera.far,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
  };
}

function applyCameraFocusState(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  state: CameraFocusState,
) {
  camera.near = state.near;
  camera.far = state.far;
  camera.position.copy(state.position);
  camera.lookAt(state.target);
  camera.updateProjectionMatrix();

  controls.target.copy(state.target);
  controls.minDistance = state.minDistance;
  controls.maxDistance = state.maxDistance;
  controls.update();
}

function focusObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
) {
  applyCameraFocusState(camera, controls, createFocusStateForObject(camera, controls, object));
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - ((-2 * value + 2) ** 3) / 2;
}

function startCameraFocusTransition(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  transitionRef: MutableRefObject<CameraFocusTransitionState | null>,
  durationMs = CAMERA_FOCUS_ANIMATION_DURATION_MS,
) {
  transitionRef.current = {
    active: true,
    startTime: performance.now(),
    durationMs,
    from: createCurrentCameraFocusState(camera, controls),
    to: createFocusStateForObject(camera, controls, object),
  };
}

function stopCameraFocusTransition(transitionRef: MutableRefObject<CameraFocusTransitionState | null>) {
  if (transitionRef.current) {
    transitionRef.current.active = false;
  }
}

function updateCameraFocusTransition(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  transitionRef: MutableRefObject<CameraFocusTransitionState | null>,
  timestamp: number,
) {
  const transition = transitionRef.current;
  if (!transition || !transition.active) {
    return;
  }

  const progress = Math.min((timestamp - transition.startTime) / transition.durationMs, 1);
  const easedProgress = easeInOutCubic(progress);

  camera.position.lerpVectors(transition.from.position, transition.to.position, easedProgress);
  controls.target.lerpVectors(transition.from.target, transition.to.target, easedProgress);
  camera.near = THREE.MathUtils.lerp(transition.from.near, transition.to.near, easedProgress);
  camera.far = THREE.MathUtils.lerp(transition.from.far, transition.to.far, easedProgress);
  controls.minDistance = THREE.MathUtils.lerp(transition.from.minDistance, transition.to.minDistance, easedProgress);
  controls.maxDistance = THREE.MathUtils.lerp(transition.from.maxDistance, transition.to.maxDistance, easedProgress);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();

  if (progress >= 1) {
    applyCameraFocusState(camera, controls, transition.to);
    transition.active = false;
  }
}

function focusShipSelection(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  shipObjects: Map<string, THREE.Object3D>,
  shipKey: string | null,
  options?: {
    animated?: boolean;
    transitionRef?: MutableRefObject<CameraFocusTransitionState | null>;
  },
) {
  if (!shipKey) {
    return;
  }

  const targetObject = shipObjects.get(shipKey);
  if (!targetObject) {
    return;
  }

  if (options?.animated && options.transitionRef) {
    startCameraFocusTransition(camera, controls, targetObject, options.transitionRef);
    return;
  }

  focusObject(camera, controls, targetObject);
}

function resolveDimensionalScale(rawDimensions: number[], targetDimensions: number[]) {
  const dimensionCount = Math.min(rawDimensions.length, targetDimensions.length);
  if (dimensionCount === 0) {
    return {
      scaleFactor: 1,
      unitLabel: 'identity',
      fitError: null,
      comparedDimensions: 0,
    };
  }

  let bestResolution: DimensionalScaleResolution | null = null;

  MODEL_UNIT_SCALE_CANDIDATES.forEach(({ label, scaleFactor }) => {
    let totalRelativeError = 0;
    let isCandidateValid = true;

    for (let index = 0; index < dimensionCount; index += 1) {
      const rawDimension = rawDimensions[index];
      const targetDimension = targetDimensions[index];
      if (!Number.isFinite(rawDimension) || !Number.isFinite(targetDimension) || rawDimension <= 0 || targetDimension <= 0) {
        isCandidateValid = false;
        break;
      }

      const scaledDimension = rawDimension * scaleFactor;
      totalRelativeError += Math.abs(scaledDimension - targetDimension) / targetDimension;
    }

    if (!isCandidateValid) {
      return;
    }

    const fitError = totalRelativeError / dimensionCount;
    if (!Number.isFinite(fitError)) {
      return;
    }

    if (!bestResolution || fitError < bestResolution.fitError!) {
      bestResolution = {
        scaleFactor,
        unitLabel: label,
        fitError,
        comparedDimensions: dimensionCount,
      };
    }
  });

  return bestResolution || {
    scaleFactor: 1,
    unitLabel: 'identity',
    fitError: null,
    comparedDimensions: 0,
  };
}

function roundDebugDimension(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(3));
}

function toDebugBoundsSize(size: THREE.Vector3) {
  return {
    x: roundDebugDimension(size.x),
    y: roundDebugDimension(size.y),
    z: roundDebugDimension(size.z),
  };
}

function roundDegrees(angleRadians: number) {
  return Math.round(THREE.MathUtils.radToDeg(angleRadians));
}

function getRotationStateFromQuaternion(quaternion: THREE.Quaternion): FleetModelViewerRotationState {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');

  return {
    x: roundDegrees(euler.x),
    y: roundDegrees(euler.y),
    z: roundDegrees(euler.z),
  };
}

function serializeLoadedEntryTransform(entry: LoadedFleetObject): FleetModelViewerTransformState {
  return {
    position: [entry.root.position.x, entry.root.position.y, entry.root.position.z],
    quaternion: [
      entry.rotationQuaternion.x,
      entry.rotationQuaternion.y,
      entry.rotationQuaternion.z,
      entry.rotationQuaternion.w,
    ],
  };
}

function applySavedTransformToEntry(entry: LoadedFleetObject, transform: FleetModelViewerTransformState | undefined) {
  if (!transform) {
    return;
  }

  const { position, quaternion } = transform;
  if (
    position.length === 3
    && position.every((value) => Number.isFinite(value))
  ) {
    entry.savedWorldPosition = new THREE.Vector3(position[0], position[1], position[2]);
  }

  if (
    quaternion.length === 4
    && quaternion.every((value) => Number.isFinite(value))
  ) {
    entry.rotationQuaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]).normalize();
  }
}

function applyLoadedEntryTransform(entry: LoadedFleetObject) {
  entry.root.position.copy(entry.basePosition).add(entry.offsetPosition);
  entry.rotationRoot.quaternion.copy(entry.rotationQuaternion).normalize();
}

function syncLoadedEntryTransformFromScene(entry: LoadedFleetObject) {
  entry.offsetPosition.copy(entry.root.position).sub(entry.basePosition);
  entry.rotationQuaternion.copy(entry.rotationRoot.quaternion).normalize();
}

function prepareFleetObject(sceneObject: THREE.Object3D, ship: FleetModelViewerShip, order: number) {
  const root = new THREE.Group();
  const rotationRoot = new THREE.Group();
  root.name = ship.key;
  root.userData.shipKey = ship.key;
  rotationRoot.name = `${ship.key}::rotation-root`;
  rotationRoot.userData.shipKey = ship.key;

  sceneObject.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      forceDoubleSided(child.material);
    }
  });

  rotationRoot.add(sceneObject);
  root.add(rotationRoot);

  const initialBounds = getRenderableBounds(sceneObject);
  const rawDimensions = [initialBounds.size.x, initialBounds.size.y, initialBounds.size.z]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left);
  const targetDimensions = [ship.lengthMeters, ship.beamMeters, ship.heightMeters]
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left);
  const scaleResolution = resolveDimensionalScale(rawDimensions, targetDimensions);
  const scaleFactor = scaleResolution.scaleFactor;

  sceneObject.scale.setScalar(scaleFactor);
  const finalBounds = recenterObjectToRenderableBounds(sceneObject, { groundOnY: true });
  rotationRoot.position.y = finalBounds.center.y;
  sceneObject.position.y -= finalBounds.center.y;

  console.log('[FleetModelViewer] Model scale debug', {
    shipKey: ship.key,
    shipId: ship.shipId,
    shipName: ship.displayName,
    rawModelBounds: toDebugBoundsSize(initialBounds.size),
    rawModelDimensionsSorted: rawDimensions.map((value) => roundDebugDimension(value)),
    dataDimensions: {
      lengthMeters: roundDebugDimension(ship.lengthMeters),
      beamMeters: roundDebugDimension(ship.beamMeters),
      heightMeters: roundDebugDimension(ship.heightMeters),
    },
    dataDimensionsSorted: targetDimensions.map((value) => roundDebugDimension(value)),
    selectedUnit: scaleResolution.unitLabel,
    comparedDimensions: scaleResolution.comparedDimensions,
    fitErrorPercent: roundDebugDimension(
      scaleResolution.fitError === null ? null : scaleResolution.fitError * 100,
    ),
    scaleFactor: roundDebugDimension(scaleFactor),
    scaledModelBounds: toDebugBoundsSize(finalBounds.size),
    scaledModelDimensionsSorted: rawDimensions.map((value) => roundDebugDimension(value * scaleFactor)),
  });

  return {
    key: ship.key,
    order,
    root,
    rotationRoot,
    footprint: Math.max(finalBounds.size.x, 6),
    depth: Math.max(finalBounds.size.z, 6),
    basePosition: new THREE.Vector3(),
    offsetPosition: new THREE.Vector3(),
    rotationQuaternion: new THREE.Quaternion(),
    savedWorldPosition: null,
  };
}

function layoutFleetObjects(entries: LoadedFleetObject[]) {
  if (entries.length === 0) {
    return;
  }

  const columnCount = Math.max(1, Math.ceil(Math.sqrt(entries.length)));
  const rows: LoadedFleetObject[][] = [];
  const globalFootprint = Math.max(...entries.map((entry) => Math.max(entry.footprint, entry.depth)));
  const gap = Math.max(8, globalFootprint * 0.18);

  for (let index = 0; index < entries.length; index += columnCount) {
    rows.push(entries.slice(index, index + columnCount));
  }

  const rowDepths = rows.map((row) => Math.max(...row.map((entry) => entry.depth)));
  const totalDepth = rowDepths.reduce((sum, depth) => sum + depth, 0) + gap * Math.max(rows.length - 1, 0);
  let zCursor = -totalDepth / 2;

  rows.forEach((row, rowIndex) => {
    const rowDepth = rowDepths[rowIndex];
    const totalWidth = row.reduce((sum, entry) => sum + entry.footprint, 0) + gap * Math.max(row.length - 1, 0);
    let xCursor = -totalWidth / 2;

    row.forEach((entry) => {
      const nextBasePosition = new THREE.Vector3(
        xCursor + entry.footprint / 2,
        0,
        zCursor + rowDepth / 2,
      );
      const hasSavedWorldPosition = entry.savedWorldPosition !== null;
      const preserveManualPosition = hasSavedWorldPosition || entry.offsetPosition.lengthSq() > MANUAL_POSITION_EPSILON_SQ;
      const savedWorldPosition = entry.savedWorldPosition;
      const currentWorldPosition = savedWorldPosition
        ? savedWorldPosition.clone()
        : preserveManualPosition ? entry.root.position.clone() : null;

      entry.basePosition.copy(nextBasePosition);
      if (currentWorldPosition) {
        entry.offsetPosition.copy(currentWorldPosition).sub(nextBasePosition);
      } else {
        entry.offsetPosition.set(0, 0, 0);
      }
      entry.savedWorldPosition = null;
      applyLoadedEntryTransform(entry);
      xCursor += entry.footprint + gap;
    });

    zCursor += rowDepth + gap;
  });
}

function createInfiniteFleetStageSurface(isDarkMode: boolean) {
  const surface = new THREE.Group();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(INFINITE_STAGE_GRID_SIZE, INFINITE_STAGE_GRID_SIZE),
    new THREE.MeshStandardMaterial({
      color: isDarkMode ? 0x020617 : 0xe2e8f0,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: isDarkMode ? 0.9 : 0.94,
    }),
  );
  const grid = new THREE.GridHelper(
    INFINITE_STAGE_GRID_SIZE,
    INFINITE_STAGE_GRID_DIVISIONS,
    isDarkMode ? 0x38bdf8 : 0x7dd3fc,
    isDarkMode ? 0x1e293b : 0x94a3b8,
  );
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = isDarkMode ? 0.18 : 0.34;

  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.02;
  plane.receiveShadow = false;
  forceDoubleSided(plane.material);

  grid.position.y = 0.01;

  // surface.add(plane);
  surface.add(grid);

  return surface;
}

function styleSceneBackdropMaterial(material: THREE.Material | THREE.Material[], isDarkMode: boolean) {
  if (Array.isArray(material)) {
    material.forEach((entry) => styleSceneBackdropMaterial(entry, isDarkMode));
    return;
  }

  const typedMaterial = material as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
  };

  if (typedMaterial.color) {
    typedMaterial.color.set(isDarkMode ? 0x64748b : 0x94a3b8);
  }

  if (typedMaterial.emissive) {
    typedMaterial.emissive.set(isDarkMode ? 0x0f172a : 0xffffff);
    typedMaterial.emissiveIntensity = isDarkMode ? 0.22 : 0.06;
  }

  typedMaterial.transparent = true;
  typedMaterial.opacity = isDarkMode ? 0.2 : 0.34;
  typedMaterial.needsUpdate = true;
}

function prepareSceneBackdropObject(
  sceneObject: THREE.Object3D,
  config: FleetSceneBackdropConfig,
  isDarkMode: boolean,
) {
  sceneObject.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      forceDoubleSided(child.material);
      styleSceneBackdropMaterial(child.material, isDarkMode);
    }
  });

  const initialBounds = getRenderableBounds(sceneObject);
  const largestDimension = getLargestRenderableDimension(initialBounds.size);
  const scaleFactor = config.targetLongestDimension / largestDimension;
  if (Number.isFinite(scaleFactor) && scaleFactor > 0) {
    sceneObject.scale.multiplyScalar(scaleFactor);
  }

  recenterObjectToRenderableBounds(sceneObject, { centerY: true });
  sceneObject.position.set(...config.position);
  sceneObject.rotation.set(...config.rotation);
  sceneObject.updateWorldMatrix(true, true);
}

async function loadFleetSceneBackdrops(
  loader: ColladaLoader,
  environmentGroup: THREE.Group,
  options: {
    isDisposed: () => boolean;
    isDarkMode: boolean;
  },
) {
  const results = await Promise.allSettled(
    FLEET_SCENE_BACKDROPS.map(async (config) => {
      const collada = await loader.loadAsync(config.url);
      if (!collada) {
        throw new Error(`Collada scene returned no data for ${config.key}`);
      }

      return {
        config,
        sceneObject: collada.scene,
      };
    }),
  );

  results.forEach((result) => {
    if (result.status !== 'fulfilled') {
      console.warn('Failed to load fleet scene backdrop', result.reason);
      return;
    }

    const { config, sceneObject } = result.value;
    if (options.isDisposed()) {
      disposeObject3D(sceneObject);
      return;
    }

    prepareSceneBackdropObject(sceneObject, config, options.isDarkMode);
    environmentGroup.add(sceneObject);
  });
}

function snapStageSurfaceToCamera(surface: THREE.Object3D, camera: THREE.PerspectiveCamera) {
  surface.position.set(
    Math.round(camera.position.x / INFINITE_STAGE_GRID_SNAP) * INFINITE_STAGE_GRID_SNAP,
    0,
    Math.round(camera.position.z / INFINITE_STAGE_GRID_SNAP) * INFINITE_STAGE_GRID_SNAP,
  );
}

function resolveShipKeyFromObject(object: THREE.Object3D | null) {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (typeof current.userData.shipKey === 'string') {
      return current.userData.shipKey as string;
    }

    current = current.parent;
  }

  return null;
}

export default function FleetModelViewer({
  open,
  ships,
  selectedShipKey = null,
  transformMode = null,
  savedTransforms = {},
  onSelectedShipKeyChange,
  onSelectedShipRotationChange,
  onShipTransformChange,
  onDeleteShip,
}: FleetModelViewerProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const stageRef = useRef<THREE.Group | null>(null);
  const environmentGroupRef = useRef<THREE.Group | null>(null);
  const backgroundTextureRef = useRef<THREE.Texture | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const outlinePassRef = useRef<OutlinePass | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const colladaLoaderRef = useRef<ColladaLoader | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);
  const stageSurfaceRef = useRef<THREE.Group | null>(null);
  const animationFrameRef = useRef(0);
  const shipObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const loadedEntriesRef = useRef<Map<string, LoadedFleetObject>>(new Map());
  const pendingShipKeysRef = useRef<Set<string>>(new Set());
  const failedShipKeysRef = useRef<Set<string>>(new Set());
  const desiredShipsRef = useRef<FleetModelViewerShip[]>(ships);
  const savedTransformsRef = useRef<Record<string, FleetModelViewerTransformState>>(savedTransforms);
  const selectedShipKeyRef = useRef<string | null>(selectedShipKey);
  const transformModeRef = useRef<FleetModelViewerTransformMode | null>(transformMode);
  const isTransformDraggingRef = useRef(false);
  const requestTokenByKeyRef = useRef<Map<string, number>>(new Map());
  const requestSequenceRef = useRef(0);
  const cameraFocusTransitionRef = useRef<CameraFocusTransitionState | null>(null);
  const [activeShipKey, setActiveShipKey] = useState<string | null>(selectedShipKey);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnyLoadedModels, setHasAnyLoadedModels] = useState(false);
  const [contextMenuState, setContextMenuState] = useState<FleetModelViewerContextMenuState | null>(null);
  const [loadState, setLoadState] = useState<FleetLoadState>({
    total: ships.length,
    loaded: 0,
    failed: 0,
    currentShipName: null,
  });

  const closeContextMenu = useCallback(() => {
    setContextMenuState(null);
  }, []);

  const syncSelectionHighlight = useCallback(() => {
    const outlinePass = outlinePassRef.current;
    if (!outlinePass) {
      return;
    }

    const activeSelectedKey = selectedShipKeyRef.current;
    const selectedEntry = activeSelectedKey ? loadedEntriesRef.current.get(activeSelectedKey) : null;
    outlinePass.selectedObjects = selectedEntry ? [selectedEntry.root] : [];
  }, []);

  useEffect(() => {
    desiredShipsRef.current = ships;
  }, [ships]);

  useEffect(() => {
    savedTransformsRef.current = savedTransforms;
  }, [savedTransforms]);

  useEffect(() => {
    setActiveShipKey(selectedShipKey);
  }, [selectedShipKey]);

  useEffect(() => {
    selectedShipKeyRef.current = activeShipKey;
    syncSelectionHighlight();
    const activeSelectedKey = activeShipKey;
    if (!activeSelectedKey) {
      onSelectedShipRotationChange?.(null);
      return;
    }

    const entry = loadedEntriesRef.current.get(activeSelectedKey);
    onSelectedShipRotationChange?.(
      entry ? getRotationStateFromQuaternion(entry.rotationQuaternion) : null,
    );
  }, [activeShipKey, onSelectedShipRotationChange, syncSelectionHighlight]);

  useEffect(() => {
    transformModeRef.current = transformMode;
  }, [transformMode]);

  const updateLoadState = useCallback((currentShipName: string | null = null) => {
    const total = desiredShipsRef.current.length;
    const loaded = loadedEntriesRef.current.size;
    const failed = failedShipKeysRef.current.size;
    const pending = pendingShipKeysRef.current.size;

    setIsLoading(pending > 0);
    setHasAnyLoadedModels(loaded > 0);
    setLoadState((current) => ({
      total,
      loaded,
      failed,
      currentShipName: pending > 0 ? (currentShipName ?? current.currentShipName) : null,
    }));
  }, []);

  const reportSelectedShipRotation = useCallback(() => {
    const activeSelectedKey = selectedShipKeyRef.current;
    if (!activeSelectedKey) {
      onSelectedShipRotationChange?.(null);
      return;
    }

    const entry = loadedEntriesRef.current.get(activeSelectedKey);
    onSelectedShipRotationChange?.(
      entry ? getRotationStateFromQuaternion(entry.rotationQuaternion) : null,
    );
  }, [onSelectedShipRotationChange]);

  const reportShipTransform = useCallback((shipKey: string, entry: LoadedFleetObject) => {
    onShipTransformChange?.(shipKey, serializeLoadedEntryTransform(entry));
  }, [onShipTransformChange]);

  const setViewerSelection = useCallback((shipKey: string | null) => {
    const previousShipKey = selectedShipKeyRef.current;

    selectedShipKeyRef.current = shipKey;
    setActiveShipKey(shipKey);
    if (previousShipKey !== shipKey) {
      onSelectedShipKeyChange?.(shipKey);
    }
  }, [onSelectedShipKeyChange]);

  const focusCurrentStage = useCallback((options?: { animated?: boolean }) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const stage = stageRef.current;

    if (!camera || !controls || !stage || loadedEntriesRef.current.size === 0) {
      return;
    }

    const activeSelectedKey = selectedShipKeyRef.current;
    if (activeSelectedKey && shipObjectsRef.current.has(activeSelectedKey)) {
      focusShipSelection(camera, controls, shipObjectsRef.current, activeSelectedKey, {
        animated: options?.animated,
        transitionRef: cameraFocusTransitionRef,
      });
      return;
    }

    stopCameraFocusTransition(cameraFocusTransitionRef);
    frameObject(camera, controls, stage, 1.18);
  }, []);

  const handleDeselectFromContextMenu = useCallback(() => {
    closeContextMenu();
    stopCameraFocusTransition(cameraFocusTransitionRef);
    setViewerSelection(null);
  }, [closeContextMenu, setViewerSelection]);

  const handleDeleteFromContextMenu = useCallback(() => {
    const targetShipKey = contextMenuState?.targetShipKey;
    closeContextMenu();
    if (!targetShipKey) {
      return;
    }

    onDeleteShip?.(targetShipKey);
  }, [closeContextMenu, contextMenuState?.targetShipKey, onDeleteShip]);

  const syncStageSurfacePosition = useCallback(() => {
    const camera = cameraRef.current;
    const stageSurface = stageSurfaceRef.current;

    if (!camera || !stageSurface) {
      return;
    }

    snapStageSurfaceToCamera(stageSurface, camera);
  }, []);

  const syncTransformTarget = useCallback(() => {
    const transformControls = transformControlsRef.current;
    if (!transformControls) {
      return;
    }

    const controls = controlsRef.current;
    const activeTransformMode = transformModeRef.current;
    const activeSelectedKey = selectedShipKeyRef.current;
    if (!activeTransformMode || !activeSelectedKey) {
      transformControls.enabled = false;
      transformControls.detach();
      isTransformDraggingRef.current = false;
      if (controls) {
        controls.enabled = true;
      }
      return;
    }

    const entry = loadedEntriesRef.current.get(activeSelectedKey);
    if (!entry) {
      transformControls.enabled = false;
      transformControls.detach();
      return;
    }

    transformControls.enabled = true;
    transformControls.setMode(activeTransformMode);
    transformControls.setSpace(activeTransformMode === 'rotate' ? 'local' : 'world');
    transformControls.showX = true;
    transformControls.showY = true;
    transformControls.showZ = true;
    transformControls.setRotationSnap(activeTransformMode === 'rotate' ? ROTATION_SNAP_RADIANS : null);

    const targetObject = activeTransformMode === 'rotate'
      ? entry.rotationRoot
      : entry.root;

    if (transformControls.object !== targetObject) {
      transformControls.attach(targetObject);
    }
  }, []);

  const frameCurrentStage = useCallback(() => {
    focusCurrentStage();
  }, [focusCurrentStage]);

  const relayoutStage = useCallback((options?: { preserveCamera?: boolean }) => {
    const orderedEntries = desiredShipsRef.current
      .map((ship, index) => {
        const entry = loadedEntriesRef.current.get(ship.key);
        if (!entry) {
          return null;
        }

        entry.order = index;
        return entry;
      })
      .filter((entry): entry is LoadedFleetObject => entry !== null)
      .sort((left, right) => left.order - right.order);

    layoutFleetObjects(orderedEntries);
    syncTransformTarget();
    if (!options?.preserveCamera) {
      frameCurrentStage();
    }
  }, [frameCurrentStage, syncTransformTarget]);

  const removeLoadedEntry = useCallback((shipKey: string) => {
    const stage = stageRef.current;
    const entry = loadedEntriesRef.current.get(shipKey);
    if (!stage || !entry) {
      return;
    }

    if (
      transformControlsRef.current?.object === entry.root
      || transformControlsRef.current?.object === entry.rotationRoot
    ) {
      transformControlsRef.current.detach();
    }

    stage.remove(entry.root);
    disposeObject3D(entry.root);
    loadedEntriesRef.current.delete(shipKey);
    shipObjectsRef.current.delete(shipKey);
  }, []);

  const loadShip = useCallback(async (ship: FleetModelViewerShip) => {
    const loader = loaderRef.current;
    const stage = stageRef.current;

    if (!loader || !stage || loadedEntriesRef.current.has(ship.key) || pendingShipKeysRef.current.has(ship.key)) {
      return;
    }

    const requestToken = ++requestSequenceRef.current;
    requestTokenByKeyRef.current.set(ship.key, requestToken);
    pendingShipKeysRef.current.add(ship.key);
    failedShipKeysRef.current.delete(ship.key);
    updateLoadState(ship.displayName);

    try {
      const url = MODEL_ENDPOINT
        ? `${MODEL_ENDPOINT}/${ship.shipId}.glb`
        : `${API_BASE_URL}/api/ship-models/${ship.shipId}`;
      const gltf = await loader.loadAsync(url);
      const currentRequestToken = requestTokenByKeyRef.current.get(ship.key);
      const stillDesired = desiredShipsRef.current.some((entry) => entry.key === ship.key);
      const currentStage = stageRef.current;

      if (currentRequestToken !== requestToken || !stillDesired || !currentStage) {
        disposeObject3D(gltf.scene);
        return;
      }

      const order = desiredShipsRef.current.findIndex((entry) => entry.key === ship.key);
      const hadLoadedEntries = loadedEntriesRef.current.size > 0;
      const loadedEntry = prepareFleetObject(gltf.scene, ship, order >= 0 ? order : desiredShipsRef.current.length);
      applySavedTransformToEntry(loadedEntry, savedTransformsRef.current[ship.key]);
      currentStage.add(loadedEntry.root);
      loadedEntriesRef.current.set(ship.key, loadedEntry);
      shipObjectsRef.current.set(ship.key, loadedEntry.root);
      relayoutStage({ preserveCamera: hadLoadedEntries });
      syncSelectionHighlight();
      syncTransformTarget();
      if (ship.key === selectedShipKeyRef.current) {
        focusCurrentStage({ animated: hadLoadedEntries });
        reportSelectedShipRotation();
      }
    } catch (error) {
      if (requestTokenByKeyRef.current.get(ship.key) === requestToken && desiredShipsRef.current.some((entry) => entry.key === ship.key)) {
        console.error('Failed to load fleet model', ship.shipId, error);
        failedShipKeysRef.current.add(ship.key);
      }
    } finally {
      if (requestTokenByKeyRef.current.get(ship.key) === requestToken) {
        pendingShipKeysRef.current.delete(ship.key);
        updateLoadState(null);
      }
    }
  }, [focusCurrentStage, relayoutStage, reportSelectedShipRotation, syncSelectionHighlight, syncTransformTarget, updateLoadState]);

  useEffect(() => {
    if (!open || !containerRef.current) {
      return undefined;
    }

    const container = containerRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    const canUseComposerMultisample = renderer.capabilities.isWebGL2;
    const composerRenderTarget = new THREE.WebGLRenderTarget(1, 1);
    if (canUseComposerMultisample) {
      composerRenderTarget.samples = COMPOSER_MULTISAMPLE_COUNT;
    }
    const composer = new EffectComposer(renderer, composerRenderTarget);
    const renderPass = new RenderPass(scene, camera);
    const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    const fxaaPass = canUseComposerMultisample ? null : new ShaderPass(FXAAShader);
    const controls = new OrbitControls(camera, renderer.domElement);
    const transformControls = new TransformControls(camera, renderer.domElement);
    const transformControlsHelper = transformControls.getHelper();
    const colladaLoader = new ColladaLoader();
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader();
    const environmentGroup = new THREE.Group();
    const stage = new THREE.Group();
    const stageSurface = createInfiniteFleetStageSurface(isDarkMode);
    const gizmoScene = new THREE.Scene();

    sceneRef.current = scene;
    stageRef.current = stage;
    environmentGroupRef.current = environmentGroup;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    composerRef.current = composer;
    outlinePassRef.current = outlinePass;
    controlsRef.current = controls;
    transformControlsRef.current = transformControls;
    colladaLoaderRef.current = colladaLoader;
    loaderRef.current = loader;
    dracoLoaderRef.current = dracoLoader;
    stageSurfaceRef.current = stageSurface;
    shipObjectsRef.current = new Map();
    loadedEntriesRef.current = new Map();
    pendingShipKeysRef.current = new Set();
    failedShipKeysRef.current = new Set();
    requestTokenByKeyRef.current = new Map();
    requestSequenceRef.current = 0;

    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    loader.setDRACOLoader(dracoLoader);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDarkMode ? 1.05 : 1.14;
    renderer.shadowMap.enabled = false;

    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    composer.addPass(renderPass);
    composer.addPass(outlinePass);
    if (fxaaPass) {
      composer.addPass(fxaaPass);
    }

    outlinePass.edgeStrength = SELECTED_OUTLINE_STRENGTH;
    outlinePass.edgeGlow = SELECTED_OUTLINE_GLOW;
    outlinePass.edgeThickness = SELECTED_OUTLINE_THICKNESS;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.setHex(SELECTED_OUTLINE_VISIBLE_EDGE_COLOR);
    outlinePass.hiddenEdgeColor.setHex(isDarkMode ? SELECTED_OUTLINE_HIDDEN_EDGE_COLOR : 0x1e293b);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.panSpeed = 0.7;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 6;
    controls.maxDistance = DEFAULT_CAMERA_MAX_DISTANCE;
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    camera.position.copy(DEFAULT_CAMERA_POSITION);
    camera.near = 0.1;
    camera.far = 4000;
    camera.lookAt(DEFAULT_CAMERA_TARGET);
    camera.updateProjectionMatrix();
    controls.update();

    transformControls.setMode(transformModeRef.current || 'translate');
    transformControls.setSpace('world');
    transformControls.size = 0.9;
    transformControls.enabled = false;
    transformControls.showX = true;
    transformControls.showY = true;
    transformControls.showZ = true;
    transformControls.setRotationSnap(null);

    scene.add(new THREE.HemisphereLight(
      isDarkMode ? 0xe2e8f0 : 0xffffff,
      isDarkMode ? 0x020617 : 0xcbd5e1,
      isDarkMode ? 2.35 : 2.6,
    ));

    const keyLight = new THREE.DirectionalLight(0xffffff, isDarkMode ? 2.4 : 2.15);
    keyLight.position.set(9, 14, 12);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(isDarkMode ? 0x93c5fd : 0xbfdbfe, isDarkMode ? 1.2 : 0.9);
    fillLight.position.set(-10, 6, -12);
    scene.add(fillLight);

    const bounceLight = new THREE.DirectionalLight(isDarkMode ? 0xfef3c7 : 0xf8fafc, isDarkMode ? 0.7 : 0.55);
    bounceLight.position.set(0, -4, 10);
    scene.add(bounceLight);

    environmentGroup.name = 'fleet-scene-backdrops';
    scene.add(stageSurface);
    scene.add(environmentGroup);
    scene.add(stage);
    gizmoScene.add(transformControlsHelper);

    let disposed = true;
    void loadFleetSceneBackdrops(colladaLoader, environmentGroup, {
      isDisposed: () => disposed,
      isDarkMode,
    });

    const handleDraggingChanged = (event: { value: unknown }) => {
      const isDragging = Boolean(event.value);
      isTransformDraggingRef.current = isDragging;
      if (isDragging) {
        stopCameraFocusTransition(cameraFocusTransitionRef);
      }
      controls.enabled = !isDragging;
    };

    const handleTransformObjectChange = () => {
      const activeSelectedKey = selectedShipKeyRef.current;
      if (!activeSelectedKey) {
        return;
      }

      const entry = loadedEntriesRef.current.get(activeSelectedKey);
      if (!entry) {
        return;
      }

      syncLoadedEntryTransformFromScene(entry);
      reportShipTransform(activeSelectedKey, entry);
      reportSelectedShipRotation();
    };

    transformControls.addEventListener('dragging-changed', handleDraggingChanged);
    transformControls.addEventListener('objectChange', handleTransformObjectChange);

    const handleControlsStart = () => {
      stopCameraFocusTransition(cameraFocusTransitionRef);
      closeContextMenu();
    };

    controls.addEventListener('start', handleControlsStart);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      if (fxaaPass) {
        fxaaPass.material.uniforms.resolution.value.set(
          1 / (width * pixelRatio),
          1 / (height * pixelRatio),
        );
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownX = 0;
    let pointerDownY = 0;
    let pendingPointerSelection = false;
    let rightPointerDownX = 0;
    let rightPointerDownY = 0;
    let suppressContextMenu = false;

    const pickShipKeyFromPointerEvent = (event: Pick<MouseEvent | PointerEvent, 'clientX' | 'clientY'>) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      const width = Math.max(bounds.width, 1);
      const height = Math.max(bounds.height, 1);

      pointer.x = ((event.clientX - bounds.left) / width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects(stage.children, true);
      const matchingIntersection = intersections.find((intersection) => resolveShipKeyFromObject(intersection.object) !== null);
      return matchingIntersection ? resolveShipKeyFromObject(matchingIntersection.object) : null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      closeContextMenu();
      stopCameraFocusTransition(cameraFocusTransitionRef);

      if (event.button === 2) {
        rightPointerDownX = event.clientX;
        rightPointerDownY = event.clientY;
        suppressContextMenu = false;
        pendingPointerSelection = false;
        return;
      }

      if (event.button !== 0) {
        pendingPointerSelection = false;
        return;
      }

      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      pendingPointerSelection = !isTransformDraggingRef.current;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if ((event.buttons & 2) === 0 || suppressContextMenu) {
        return;
      }

      const deltaX = event.clientX - rightPointerDownX;
      const deltaY = event.clientY - rightPointerDownY;
      if ((deltaX * deltaX) + (deltaY * deltaY) > CONTEXT_MENU_DRAG_THRESHOLD_SQ) {
        suppressContextMenu = true;
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.button === 2) {
        return;
      }

      if (event.button !== 0 || !pendingPointerSelection || isTransformDraggingRef.current) {
        pendingPointerSelection = false;
        return;
      }

      pendingPointerSelection = false;
      const deltaX = event.clientX - pointerDownX;
      const deltaY = event.clientY - pointerDownY;
      if ((deltaX * deltaX) + (deltaY * deltaY) > 16) {
        return;
      }

      const shipKey = pickShipKeyFromPointerEvent(event);
      if (!shipKey) {
        return;
      }

      if (shipKey === selectedShipKeyRef.current) {
        focusCurrentStage({ animated: true });
        return;
      }

      setViewerSelection(shipKey);
      syncTransformTarget();
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (suppressContextMenu) {
        suppressContextMenu = false;
        closeContextMenu();
        return;
      }

      const shipKey = pickShipKeyFromPointerEvent(event);
      if (shipKey && shipKey !== selectedShipKeyRef.current) {
        setViewerSelection(shipKey);
      }

      const targetShipKey = shipKey ?? selectedShipKeyRef.current;
      if (!targetShipKey && !selectedShipKeyRef.current) {
        closeContextMenu();
        return;
      }

      setContextMenuState({
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
        targetShipKey,
      });
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);

    const animate = (timestamp: number) => {
      animationFrameRef.current = window.requestAnimationFrame(animate);
      updateCameraFocusTransition(camera, controls, cameraFocusTransitionRef, timestamp);
      controls.update();
      syncStageSurfacePosition();
      composer.render();
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(gizmoScene, camera);
      renderer.autoClear = true;
    };

    animate(performance.now());
    syncSelectionHighlight();
    syncTransformTarget();
    updateLoadState(null);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrameRef.current);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);

      controls.removeEventListener('start', handleControlsStart);
      transformControls.removeEventListener('dragging-changed', handleDraggingChanged);
      transformControls.removeEventListener('objectChange', handleTransformObjectChange);
      gizmoScene.remove(transformControlsHelper);

      if (stageSurfaceRef.current) {
        scene.remove(stageSurfaceRef.current);
        disposeObject3D(stageSurfaceRef.current);
        stageSurfaceRef.current = null;
      }

      if (environmentGroupRef.current) {
        scene.remove(environmentGroupRef.current);
        disposeObject3D(environmentGroupRef.current);
        environmentGroupRef.current = null;
      }

      if (backgroundTextureRef.current) {
        backgroundTextureRef.current.dispose();
        backgroundTextureRef.current = null;
      }

      scene.background = null;

      loadedEntriesRef.current.forEach((entry) => {
        stage.remove(entry.root);
        disposeObject3D(entry.root);
      });

      loadedEntriesRef.current = new Map();
      shipObjectsRef.current = new Map();
      pendingShipKeysRef.current = new Set();
      failedShipKeysRef.current = new Set();
      requestTokenByKeyRef.current = new Map();

      transformControls.detach();
      stopCameraFocusTransition(cameraFocusTransitionRef);
      outlinePass.selectedObjects = [];
      fxaaPass?.dispose();
      outlinePass.dispose();
      composer.dispose();
      transformControls.dispose();
      controls.dispose();
      dracoLoader.dispose();
      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      sceneRef.current = null;
      stageRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      composerRef.current = null;
      outlinePassRef.current = null;
      controlsRef.current = null;
      transformControlsRef.current = null;
      colladaLoaderRef.current = null;
      loaderRef.current = null;
      dracoLoaderRef.current = null;

      setIsLoading(false);
      setHasAnyLoadedModels(false);
      setLoadState({
        total: 0,
        loaded: 0,
        failed: 0,
        currentShipName: null,
      });
      onSelectedShipRotationChange?.(null);
    };
  }, [
    closeContextMenu,
    focusCurrentStage,
    onSelectedShipRotationChange,
    open,
    reportSelectedShipRotation,
    reportShipTransform,
    setViewerSelection,
    syncSelectionHighlight,
    syncStageSurfacePosition,
    syncTransformTarget,
    updateLoadState,
    isDarkMode,
  ]);

  useEffect(() => {
    if (!open || !sceneRef.current) {
      return;
    }

    const desiredKeys = new Set(ships.map((ship) => ship.key));

    Array.from(loadedEntriesRef.current.keys()).forEach((shipKey) => {
      if (!desiredKeys.has(shipKey)) {
        removeLoadedEntry(shipKey);
      }
    });

    Array.from(failedShipKeysRef.current).forEach((shipKey) => {
      if (!desiredKeys.has(shipKey)) {
        failedShipKeysRef.current.delete(shipKey);
      }
    });

    Array.from(pendingShipKeysRef.current).forEach((shipKey) => {
      if (!desiredKeys.has(shipKey)) {
        pendingShipKeysRef.current.delete(shipKey);
      }
    });

    Array.from(requestTokenByKeyRef.current.keys()).forEach((shipKey) => {
      if (!desiredKeys.has(shipKey)) {
        requestTokenByKeyRef.current.delete(shipKey);
      }
    });

    relayoutStage({ preserveCamera: true });
    updateLoadState(null);

    ships.forEach((ship) => {
      if (failedShipKeysRef.current.has(ship.key)) {
        return;
      }

      void loadShip(ship);
    });
  }, [loadShip, open, relayoutStage, removeLoadedEntry, ships, updateLoadState]);

  useEffect(() => {
    if (!open) {
      return;
    }

    syncTransformTarget();
    if (!activeShipKey) {
      stopCameraFocusTransition(cameraFocusTransitionRef);
      return;
    }

    focusCurrentStage({ animated: true });
  }, [activeShipKey, focusCurrentStage, open, syncTransformTarget]);

  useEffect(() => {
    if (!open) {
      return;
    }

    syncTransformTarget();
  }, [open, syncTransformTarget, transformMode]);

  if (!open) {
    return null;
  }

  const processedCount = loadState.loaded + loadState.failed;
  const progressPercent = loadState.total > 0
    ? Math.round((processedCount / loadState.total) * 100)
    : 0;
  const allModelsFailed = !isLoading
    && !hasAnyLoadedModels
    && loadState.total > 0
    && loadState.failed === loadState.total;

  return (
    <section className={`relative flex h-full min-h-0 flex-1 overflow-hidden ${isDarkMode ? 'bg-neutral-900' : 'bg-[#eef4fb]'}`}>
      <div
        ref={containerRef}
        className="relative h-full w-full"
      />

      {isLoading && (
        <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${isDarkMode ? 'bg-slate-950/18' : 'bg-white/30'}`}>
          <div className={`pointer-events-auto w-[min(88vw,360px)] rounded-md border p-4 text-sm backdrop-blur-md ${isDarkMode
            ? 'border-white/10 bg-slate-950/78 text-slate-100 shadow-2xl shadow-black/30'
            : 'border-white/80 bg-white/82 text-slate-900'}`}
          >
            <div className="mb-3 flex items-center gap-3">
              <CircularProgress size={18} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  <FormattedMessage
                    id="fleetview.viewer.loading"
                    defaultMessage="Loading fleet models"
                  />
                </div>
                {loadState.currentShipName && (
                  <div className={`mt-1 truncate text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                    {loadState.currentShipName}
                  </div>
                )}
              </div>
              <div className={`shrink-0 text-xs font-semibold tabular-nums ${isDarkMode ? 'text-slate-300' : 'text-slate-500'}`}>
                {processedCount}/{loadState.total}
              </div>
            </div>

            <LinearProgress
              variant="determinate"
              value={progressPercent}
              sx={{
                height: 8,
                borderRadius: 9999,
                backgroundColor: isDarkMode ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.22)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 9999,
                  backgroundColor: isDarkMode ? undefined : '#2563eb',
                },
              }}
            />
          </div>
        </div>
      )}

      {allModelsFailed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className={`pointer-events-auto max-w-lg rounded-md border p-5 text-center backdrop-blur-md ${isDarkMode
            ? 'border-white/10 bg-neutral-900 text-slate-100 shadow-2xl shadow-black/30'
            : 'border-white/80 bg-white/88 text-slate-900 shadow-[0_24px_80px_rgba(148,163,184,0.3)]'}`}
          >
            <div className={`text-lg font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-950'}`}>
              <FormattedMessage
                id="fleetview.viewer.allModelsFailedTitle"
                defaultMessage="Fleet models could not be loaded"
              />
            </div>
            <p className={`mt-3 text-sm leading-6 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              <FormattedMessage
                id="fleetview.viewer.allModelsFailedDescription"
                defaultMessage="The current fleet entries are matched to model ids, but every 3D request failed. Check model availability or try again later."
              />
            </p>
          </div>
        </div>
      )}

      <Menu
        open={contextMenuState !== null}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenuState ? { top: contextMenuState.mouseY, left: contextMenuState.mouseX } : undefined}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: isDarkMode ? alpha('#ffffff', 0.12) : alpha('#0f172a', 0.12),
              backgroundColor: isDarkMode ? '#121212' : alpha('#ffffff', 0.94),
              color: isDarkMode ? '#f5f5f5' : '#0f172a',
              boxShadow: isDarkMode
                ? '0 24px 64px rgba(0, 0, 0, 0.32)'
                : '0 24px 64px rgba(148, 163, 184, 0.24)',
              backdropFilter: 'blur(18px)',
              minWidth: 180,
            },
          },
        }}
      >
        {activeShipKey && (
          <MenuItem onClick={handleDeselectFromContextMenu}>
            <FormattedMessage
              id="fleetview.viewer.contextMenu.deselect"
              defaultMessage="Deselect"
            />
          </MenuItem>
        )}
        {contextMenuState?.targetShipKey && (
          <MenuItem onClick={handleDeleteFromContextMenu}>
            <FormattedMessage
              id="fleetview.viewer.contextMenu.deleteEntity"
              defaultMessage="Delete Entity"
            />
          </MenuItem>
        )}
      </Menu>
    </section>
  );
}
