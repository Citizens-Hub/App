import assert from 'node:assert/strict';
import { cropPixels, defaultEdit, imageDimensions, rotateEdit } from '../src/components/ShipPhotos/imageEditing';
const original = defaultEdit();
for (const rotation of [90, 270] as const) {
  assert.deepEqual(cropPixels(800, 600, { ...original, rotation }), { x: 0, y: 0, width: 600, height: 800, rotatedWidth: 600, rotatedHeight: 800 });
}
assert.deepEqual(cropPixels(800, 600, { rotation: 90, crop: { x: .25, y: .25, width: .5, height: .5 } }), { x: 150, y: 200, width: 300, height: 400, rotatedWidth: 600, rotatedHeight: 800 });
const bounded = cropPixels(100, 80, { rotation: 0, crop: { x: 2, y: -1, width: 2, height: Number.NaN } });
assert.equal(bounded.x, 99); assert.equal(bounded.y, 0); assert.equal(bounded.width, 1); assert.equal(bounded.height, 1);
let edit = original; for (let turn = 0; turn < 4; turn++) edit = rotateEdit(edit);
assert.deepEqual(edit, original); assert.deepEqual(defaultEdit(), original);
const png = new ArrayBuffer(24), view = new DataView(png);
view.setUint32(0, 0x89504e47); view.setUint32(12, 0x49484452); view.setUint32(16, 800); view.setUint32(20, 600);
assert.deepEqual(imageDimensions(png), { width: 800, height: 600 });
assert.throws(() => imageDimensions(new ArrayBuffer(4)));
const webp = new ArrayBuffer(30), bytes = new Uint8Array(webp);
for (const [offset, text] of [[0, 'RIFF'], [8, 'WEBP'], [12, 'VP8X']] as const) [...text].forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
bytes[24] = 255; bytes[25] = 3; bytes[27] = 255; bytes[28] = 1;
assert.deepEqual(imageDimensions(webp), { width: 1024, height: 512 });
console.log('Ship photo rotation, crop bounds, non-destructive reset and dimension header checks passed.');
