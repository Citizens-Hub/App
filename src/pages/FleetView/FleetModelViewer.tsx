import { useCallback, useEffect, useRef, useState } from 'react';
import { CircularProgress, LinearProgress } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

interface FleetModelViewerProps {
  open: boolean;
  ships: FleetModelViewerShip[];
  selectedShipKey?: string | null;
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
  footprint: number;
  depth: number;
}

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const MODEL_ENDPOINT = import.meta.env.VITE_PUBLIC_MODEL_ENDPOINT;
const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}draco/`;

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => disposeMaterial(entry));
    return;
  }

  material.dispose();
}

function disposeGridHelper(grid: THREE.GridHelper | null) {
  if (!grid) {
    return;
  }

  grid.geometry.dispose();
  disposeMaterial(grid.material as THREE.Material | THREE.Material[]);
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

function focusObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
) {
  const { center, sphere } = getRenderableBounds(object);
  const radius = Math.max(sphere.radius, 1);
  const currentViewDirection = camera.position.clone().sub(controls.target);
  const viewDirection = currentViewDirection.lengthSq() > 0.001
    ? currentViewDirection.normalize()
    : new THREE.Vector3(0.74, 0.34, 1.3).normalize();
  const distance = Math.max(radius * 4.25, 12);

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

function focusShipSelection(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  shipObjects: Map<string, THREE.Object3D>,
  shipKey: string | null,
) {
  if (!shipKey) {
    return;
  }

  const targetObject = shipObjects.get(shipKey);
  if (!targetObject) {
    return;
  }

  focusObject(camera, controls, targetObject);
}

function resolveDimensionalScale(rawDimensions: number[], targetDimensions: number[]) {
  const dimensionCount = Math.min(rawDimensions.length, targetDimensions.length);
  if (dimensionCount === 0) {
    return 1;
  }

  let scaleFactor = Number.POSITIVE_INFINITY;

  for (let index = 0; index < dimensionCount; index += 1) {
    const rawDimension = rawDimensions[index];
    const targetDimension = targetDimensions[index];
    if (!Number.isFinite(rawDimension) || !Number.isFinite(targetDimension) || rawDimension <= 0 || targetDimension <= 0) {
      return 1;
    }

    scaleFactor = Math.min(scaleFactor, targetDimension / rawDimension);
  }

  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    return 1;
  }

  return scaleFactor;
}

function prepareFleetObject(sceneObject: THREE.Object3D, ship: FleetModelViewerShip, order: number) {
  const root = new THREE.Group();
  root.name = ship.key;
  root.userData.shipKey = ship.key;

  sceneObject.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      forceDoubleSided(child.material);
    }
  });

  root.add(sceneObject);

  const initialBounds = getRenderableBounds(sceneObject);
  const rawDimensions = [initialBounds.size.x, initialBounds.size.y, initialBounds.size.z]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left);
  const targetDimensions = [ship.lengthMeters, ship.beamMeters, ship.heightMeters]
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left);
  const scaleFactor = resolveDimensionalScale(rawDimensions, targetDimensions);

  sceneObject.scale.setScalar(scaleFactor);
  const finalBounds = recenterObjectToRenderableBounds(sceneObject, { groundOnY: true });

  return {
    key: ship.key,
    order,
    root,
    footprint: Math.max(finalBounds.size.x, 6),
    depth: Math.max(finalBounds.size.z, 6),
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
      entry.root.position.set(
        xCursor + entry.footprint / 2,
        0,
        zCursor + rowDepth / 2,
      );
      xCursor += entry.footprint + gap;
    });

    zCursor += rowDepth + gap;
  });
}

function roundUpToUnit(value: number, unit: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return unit;
  }

  return Math.ceil(value / unit) * unit;
}

function createFleetStageSurface(stage: THREE.Object3D) {
  const { size: stageSize } = getRenderableBounds(stage);
  const fleetSpan = Math.max(stageSize.x, stageSize.z, 48);
  const gridSize = roundUpToUnit(fleetSpan * 1.4, 10);
  const cellSize = Math.max(4, roundUpToUnit(gridSize / 18, 2));
  const gridDivisions = Math.max(12, Math.min(72, Math.round(gridSize / cellSize)));
  const normalizedGridDivisions = gridDivisions % 2 === 0 ? gridDivisions : gridDivisions + 1;
  const grid = new THREE.GridHelper(gridSize, normalizedGridDivisions, 0x38bdf8, 0x334155);
  const gridMaterial = grid.material as THREE.Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.35;

  return {
    grid,
  };
}

export default function FleetModelViewer({
  open,
  ships,
  selectedShipKey = null,
}: FleetModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const stageRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const animationFrameRef = useRef(0);
  const shipObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const loadedEntriesRef = useRef<Map<string, LoadedFleetObject>>(new Map());
  const pendingShipKeysRef = useRef<Set<string>>(new Set());
  const failedShipKeysRef = useRef<Set<string>>(new Set());
  const desiredShipsRef = useRef<FleetModelViewerShip[]>(ships);
  const selectedShipKeyRef = useRef<string | null>(selectedShipKey);
  const requestTokenByKeyRef = useRef<Map<string, number>>(new Map());
  const requestSequenceRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnyLoadedModels, setHasAnyLoadedModels] = useState(false);
  const [loadState, setLoadState] = useState<FleetLoadState>({
    total: ships.length,
    loaded: 0,
    failed: 0,
    currentShipName: null,
  });

  useEffect(() => {
    desiredShipsRef.current = ships;
  }, [ships]);

  useEffect(() => {
    selectedShipKeyRef.current = selectedShipKey;
  }, [selectedShipKey]);

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

  const syncStageSurface = useCallback(() => {
    const scene = sceneRef.current;
    const stage = stageRef.current;

    if (!scene || !stage) {
      return;
    }

    if (gridRef.current) {
      scene.remove(gridRef.current);
      disposeGridHelper(gridRef.current);
    }

    const { grid } = createFleetStageSurface(stage);
    gridRef.current = grid;
    scene.add(grid);
  }, []);

  const frameCurrentStage = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const stage = stageRef.current;

    if (!camera || !controls || !stage || loadedEntriesRef.current.size === 0) {
      return;
    }

    const activeSelectedKey = selectedShipKeyRef.current;
    if (activeSelectedKey && shipObjectsRef.current.has(activeSelectedKey)) {
      focusShipSelection(camera, controls, shipObjectsRef.current, activeSelectedKey);
      return;
    }

    frameObject(camera, controls, stage, 1.18);
  }, []);

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
    syncStageSurface();
    if (!options?.preserveCamera) {
      frameCurrentStage();
    }
  }, [frameCurrentStage, syncStageSurface]);

  const removeLoadedEntry = useCallback((shipKey: string) => {
    const stage = stageRef.current;
    const entry = loadedEntriesRef.current.get(shipKey);
    if (!stage || !entry) {
      return;
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
      currentStage.add(loadedEntry.root);
      loadedEntriesRef.current.set(ship.key, loadedEntry);
      shipObjectsRef.current.set(ship.key, loadedEntry.root);
      relayoutStage({ preserveCamera: hadLoadedEntries });
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
  }, [relayoutStage, updateLoadState]);

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
    const controls = new OrbitControls(camera, renderer.domElement);
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader();
    const stage = new THREE.Group();

    sceneRef.current = scene;
    stageRef.current = stage;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    loaderRef.current = loader;
    dracoLoaderRef.current = dracoLoader;
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
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;

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

    scene.add(new THREE.HemisphereLight(0xe2e8f0, 0x020617, 2.35));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(9, 14, 12);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
    fillLight.position.set(-10, 6, -12);
    scene.add(fillLight);

    const bounceLight = new THREE.DirectionalLight(0xfef3c7, 0.7);
    bounceLight.position.set(0, -4, 10);
    scene.add(bounceLight);

    scene.add(stage);
    syncStageSurface();

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const animate = () => {
      animationFrameRef.current = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();
    updateLoadState(null);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrameRef.current);

      if (gridRef.current) {
        scene.remove(gridRef.current);
        disposeGridHelper(gridRef.current);
        gridRef.current = null;
      }

      loadedEntriesRef.current.forEach((entry) => {
        stage.remove(entry.root);
        disposeObject3D(entry.root);
      });

      loadedEntriesRef.current = new Map();
      shipObjectsRef.current = new Map();
      pendingShipKeysRef.current = new Set();
      failedShipKeysRef.current = new Set();
      requestTokenByKeyRef.current = new Map();

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
      controlsRef.current = null;
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
    };
  }, [open, syncStageSurface, updateLoadState]);

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

    frameCurrentStage();
  }, [frameCurrentStage, open, selectedShipKey]);

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
    <section className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-neutral-900">
      <div
        ref={containerRef}
        className="h-full w-full"
      />

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/18">
          <div className="pointer-events-auto w-[min(88vw,360px)] rounded-md border border-white/10 bg-slate-950/78 p-4 text-sm text-slate-100 shadow-2xl shadow-black/30 backdrop-blur-md">
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
                  <div className="mt-1 truncate text-xs text-slate-300">
                    {loadState.currentShipName}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">
                {processedCount}/{loadState.total}
              </div>
            </div>

            <LinearProgress
              variant="determinate"
              value={progressPercent}
              sx={{
                height: 8,
                borderRadius: 9999,
                backgroundColor: 'rgba(148, 163, 184, 0.18)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 9999,
                },
              }}
            />
          </div>
        </div>
      )}

      {allModelsFailed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-lg rounded-md border border-white/10 bg-neutral-900 p-5 text-center text-slate-100 shadow-2xl shadow-black/30 backdrop-blur-md">
            <div className="text-lg font-semibold">
              <FormattedMessage
                id="fleetview.viewer.allModelsFailedTitle"
                defaultMessage="Fleet models could not be loaded"
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              <FormattedMessage
                id="fleetview.viewer.allModelsFailedDescription"
                defaultMessage="The current fleet entries are matched to model ids, but every 3D request failed. Check model availability or try again later."
              />
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
