import { useEffect, useRef, useState } from 'react';
import { Alert, CircularProgress } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ShipModelPreviewProps {
  open: boolean;
  shipId?: number | null;
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
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (maxDim / 2) / Math.tan(fov / 2) / 2.2;

  object.position.sub(center);

  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 20, 100);
  camera.position.set(distance * 0.9, distance * 0.45, distance * 1.25);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.minDistance = distance * 0.35;
  controls.maxDistance = distance * 6;
  controls.update();
}

export default function ShipModelPreview({ open, shipId }: ShipModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const clock = new THREE.Timer();
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader();

    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    loader.setDRACOLoader(dracoLoader);

    let animationFrameId = 0;
    let disposed = false;
    let loadedRoot: THREE.Object3D | null = null;

    setIsLoading(true);
    setError(null);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = false;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.6;
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

    const grid = new THREE.GridHelper(14, 14, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -2.5;
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    scene.add(grid);

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
      animationFrameId = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsed();

      if (loadedRoot) {
        loadedRoot.rotation.y += elapsed === 0 ? 0 : 0.0015;
      }

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
        setIsLoading(false);
        animate();
      },
      undefined,
      (loadError) => {
        if (disposed) return;

        console.error('Failed to load ship model', loadError);
        setIsLoading(false);
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

      scene.remove(grid);
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
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          <FormattedMessage id="ccuPlanner.shipInfo.modelPreview" defaultMessage="3D Preview" />
        </div>
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <FormattedMessage id="ccuPlanner.shipInfo.modelPreviewHint" defaultMessage="Drag to orbit · Scroll to zoom" />
        </div>
      </div>

      <div className="relative overflow-hidden rounded border border-black/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(226,232,240,0.72)_52%,rgba(203,213,225,0.52))] dark:border-white/10 dark:bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.9),rgba(15,23,42,0.92)_55%,rgba(2,6,23,0.98))]">
        <div ref={containerRef} className="h-[320px] w-full md:h-[420px]" />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/65 backdrop-blur-[1px] dark:bg-slate-950/45">
            <div className="flex items-center gap-3 rounded-full border border-black/10 bg-white/90 px-4 py-2 text-sm text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-100">
              <CircularProgress size={18} />
              <FormattedMessage id="ccuPlanner.shipInfo.modelLoading" defaultMessage="Loading 3D model" />
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
