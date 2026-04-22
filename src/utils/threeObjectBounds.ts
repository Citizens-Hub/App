import * as THREE from 'three';

export interface ObjectBoundsSnapshot {
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  sphere: THREE.Sphere;
  hasRenderableContent: boolean;
}

function isFiniteBox(box: THREE.Box3) {
  return Number.isFinite(box.min.x)
    && Number.isFinite(box.min.y)
    && Number.isFinite(box.min.z)
    && Number.isFinite(box.max.x)
    && Number.isFinite(box.max.y)
    && Number.isFinite(box.max.z);
}

function isRenderableObject(object: THREE.Object3D): object is THREE.Mesh | THREE.Line | THREE.Points {
  return 'geometry' in object && object.geometry instanceof THREE.BufferGeometry;
}

export function getRenderableBounds(object: THREE.Object3D): ObjectBoundsSnapshot {
  const box = new THREE.Box3();
  const geometryBox = new THREE.Box3();
  const fallbackBox = new THREE.Box3().setFromObject(object);
  let hasRenderableContent = false;

  object.updateWorldMatrix(true, true);

  object.traverse((child) => {
    if (!child.visible || !isRenderableObject(child)) {
      return;
    }

    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox();
    }

    if (!child.geometry.boundingBox || child.geometry.boundingBox.isEmpty()) {
      return;
    }

    geometryBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    if (!isFiniteBox(geometryBox)) {
      return;
    }

    if (!hasRenderableContent) {
      box.copy(geometryBox);
      hasRenderableContent = true;
      return;
    }

    box.union(geometryBox);
  });

  const resolvedBox = hasRenderableContent ? box.clone() : fallbackBox;
  if (resolvedBox.isEmpty() || !isFiniteBox(resolvedBox)) {
    resolvedBox.min.set(0, 0, 0);
    resolvedBox.max.set(0, 0, 0);
  }

  return {
    box: resolvedBox,
    center: resolvedBox.getCenter(new THREE.Vector3()),
    size: resolvedBox.getSize(new THREE.Vector3()),
    sphere: resolvedBox.getBoundingSphere(new THREE.Sphere()),
    hasRenderableContent,
  };
}

export function recenterObjectToRenderableBounds(
  object: THREE.Object3D,
  options?: {
    groundOnY?: boolean;
    centerY?: boolean;
  },
) {
  const bounds = getRenderableBounds(object);
  const offset = new THREE.Vector3(
    bounds.center.x,
    options?.groundOnY ? bounds.box.min.y : options?.centerY ? bounds.center.y : 0,
    bounds.center.z,
  );

  object.position.sub(offset);
  object.updateWorldMatrix(true, true);

  return getRenderableBounds(object);
}
