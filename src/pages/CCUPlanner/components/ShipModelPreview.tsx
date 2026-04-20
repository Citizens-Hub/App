import { useEffect, useRef, useState } from 'react';
import { Alert, CircularProgress, LinearProgress } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ShipModelPreviewProps {
  open: boolean;
  shipId?: number | null;
  showHeader?: boolean;
  variant?: 'inline' | 'fullscreen';
}

interface ModelLoadProgress {
  loadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;
const DRACO_DECODER_PATH = `${import.meta.env.BASE_URL}draco/`;

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

function frameObject(camera: THREE.PerspectiveCamera, controls: OrbitControls, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center.clone();
  const radius = Math.max(sphere.radius, 1);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = Math.max(camera.aspect, 0.1);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const fitHeightDistance = radius / Math.sin(verticalFov / 2);
  const fitWidthDistance = radius / Math.sin(horizontalFov / 2);
  const distance = Math.max(fitHeightDistance, fitWidthDistance, radius * 2.2) * (aspect < 1 ? 1.15 : 1.05);
  const viewDirection = new THREE.Vector3(
    aspect < 1 ? 0.12 : 0.72,
    aspect < 1 ? 0.16 : 0.32,
    aspect < 1 ? 1.95 : 1.35,
  ).normalize();

  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 40, 100);
  camera.position.copy(center.clone().add(viewDirection.multiplyScalar(distance)));
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = distance * 0.5;
  controls.maxDistance = distance * 7;
  controls.update();
}

function formatTransferSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} MB`;
  }

  if (bytes >= 1024) {
    const value = bytes / 1024;
    return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} KB`;
  }

  return `${bytes} B`;
}

export default function ShipModelPreview({
  open,
  shipId,
  showHeader = true,
  variant = 'inline',
}: ShipModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<ModelLoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isFullscreen = variant === 'fullscreen';
  const progressPercent = loadProgress?.percent ?? null;
  const progressLabel =
    progressPercent !== null
      ? `${progressPercent}%`
      : loadProgress && loadProgress.loadedBytes > 0
        ? formatTransferSize(loadProgress.loadedBytes)
        : null;

  useEffect(() => {
    if (!open || !shipId || !containerRef.current) {
      return undefined;
    }

    const container = containerRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    const controls = new OrbitControls(camera, renderer.domElement);
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader();

    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    loader.setDRACOLoader(dracoLoader);

    let animationFrameId = 0;
    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;

    setIsLoading(true);
    setLoadProgress({
      loadedBytes: 0,
      totalBytes: null,
      percent: null,
    });
    setError(null);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = false;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.8));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 1.1);
    rimLight.position.set(-6, 4, -8);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xfef3c7, 0.65);
    fillLight.position.set(-2, -1, 5);
    scene.add(fillLight);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);

      if (loadedRoot) {
        frameObject(camera, controls, loadedRoot);
      }
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const animate = () => {
      animationFrameId = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    const MODEL_ENDPOINT = import.meta.env.VITE_PUBLIC_MODEL_ENDPOINT

    loader.load(
      MODEL_ENDPOINT ? `${MODEL_ENDPOINT}/${shipId}.glb` :
         `${API_BASE_URL}/api/ship-models/${shipId}`,
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }

        loadedRoot = gltf.scene;
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = false;
            child.receiveShadow = false;
            forceDoubleSided(child.material);
          }
        });
        scene.add(gltf.scene);
        frameObject(camera, controls, gltf.scene);
        setLoadProgress((current) => ({
          loadedBytes: current?.totalBytes ?? current?.loadedBytes ?? 0,
          totalBytes: current?.totalBytes ?? current?.loadedBytes ?? null,
          percent: 100,
        }));
        setIsLoading(false);
        animate();
      },
      (progressEvent) => {
        if (disposed) {
          return;
        }

        const totalBytes = progressEvent.total > 0 ? progressEvent.total : null;
        const percent = totalBytes
          ? Math.min(100, Math.round((progressEvent.loaded / totalBytes) * 100))
          : null;

        setLoadProgress((current) => {
          if (
            current &&
            current.loadedBytes === progressEvent.loaded &&
            current.totalBytes === totalBytes &&
            current.percent === percent
          ) {
            return current;
          }

          return {
            loadedBytes: progressEvent.loaded,
            totalBytes,
            percent,
          };
        });
      },
      (loadError) => {
        if (disposed) return;

        console.error('Failed to load ship model', loadError);
        setIsLoading(false);
        setLoadProgress(null);
        setError('failed');
      },
    );

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      controls.dispose();
      dracoLoader.dispose();
      window.cancelAnimationFrame(animationFrameId);

      if (loadedRoot) {
        scene.remove(loadedRoot);
        disposeObject3D(loadedRoot);
      }

      renderer.dispose();

      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [open, shipId]);

  if (!shipId) {
    return null;
  }

  return (
    <section className={isFullscreen ? 'flex flex-1 min-h-0 flex-col' : 'flex flex-col gap-2'}>
      {showHeader && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            <FormattedMessage id="ccuPlanner.shipInfo.modelPreview" defaultMessage="3D Preview" />
          </div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <FormattedMessage id="ccuPlanner.shipInfo.modelPreviewHint" defaultMessage="Drag to orbit · Scroll to zoom" />
          </div>
        </div>
      )}

      <div className={`relative overflow-hidden border border-black/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(226,232,240,0.72)_52%,rgba(203,213,225,0.52))] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.9),rgba(15,23,42,0.92)_55%,rgba(2,6,23,0.98))] ${isFullscreen ? 'flex-1 min-h-0 rounded-none border-x-0 border-b-0' : 'rounded'}`}>
        <div
          ref={containerRef}
          className={isFullscreen ? 'h-full w-full' : 'h-[320px] w-full md:h-[420px]'}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[1px] dark:bg-slate-950/45">
            <div className="w-[min(88vw,340px)] border border-black/10 bg-white/90 p-4 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-100">
              <div className="mb-3 flex items-center gap-3">
                <CircularProgress size={18} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium">
                      <FormattedMessage id="ccuPlanner.shipInfo.modelLoading" defaultMessage="Loading 3D model" />
                    </span>
                    {progressLabel && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                        {progressLabel}
                      </span>
                    )}
                  </div>

                  {loadProgress?.totalBytes && loadProgress.loadedBytes > 0 && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatTransferSize(loadProgress.loadedBytes)} / {formatTransferSize(loadProgress.totalBytes)}
                    </div>
                  )}
                </div>
              </div>

              <LinearProgress
                variant={progressPercent !== null ? 'determinate' : 'indeterminate'}
                value={progressPercent ?? 0}
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

        {error && !isLoading && (
          <div className="absolute inset-x-4 top-4">
            <Alert severity="info">
              <FormattedMessage
                id="ccuPlanner.shipInfo.modelUnavailable"
                defaultMessage="3D model is not available for this ship yet."
              />
            </Alert>
          </div>
        )}
      </div>
    </section>
  );
}
