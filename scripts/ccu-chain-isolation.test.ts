import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import type { Edge, Node } from 'reactflow';
import type { CCUItem } from '../src/store/upgradesStore';
import type { CcuEdgeData, Ship } from '../src/types';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} });
const { default: service } = await import('../src/pages/CCUPlanner/services/PathFinderService');
const { hasCanvasConnection } = await import('../src/pages/CCUPlanner/services/CcuEdgeService');
const { HangarStrategy } = await import('../src/pages/CCUPlanner/services/CcuSourceTypeStrategy');
const { toPlannerHangarItems } = await import('../src/pages/CCUPlanner/services/plannerHangarItems');
const { readStoredCompletedPathsForActiveTab } = await import('../src/pages/CCUPlanner/services/completedPathsStorage');
const { CcuSourceType } = await import('../src/types');
const hangarStrategy = new HangarStrategy();
const ships = [
  { id: 1, name: 'C1 Spirit', msrp: 12500 },
  { id: 2, name: 'Marauder', msrp: 15000 },
  { id: 3, name: 'Prospector', msrp: 15500 },
] as Ship[];
const makeNode = (ship: Ship, chain: string): Node<{ ship: Ship }> => ({
  id: `ship-${ship.id}-${chain}`, position: { x: 0, y: 0 }, data: { ship },
});
const makeEdge = (source: Node<{ ship: Ship }>, target: Node<{ ship: Ship }>): Edge<CcuEdgeData> => ({
  id: `edge-${source.id}-${target.id}`,
  source: source.id,
  target: target.id,
  data: {
    sourceShip: source.data.ship,
    targetShip: target.data.ship,
    sourceType: CcuSourceType.HANGER,
    price: (target.data.ship.msrp - source.data.ship.msrp) / 100,
  },
});
const a = ships.map(ship => makeNode(ship, 'a'));
const b = ships.map(ship => makeNode(ship, 'b'));
const nodes = [...a, ...b];
const edges = [makeEdge(a[0], a[1]), makeEdge(a[1], a[2]), makeEdge(b[0], b[1]), makeEdge(b[1], b[2])];
const aIds = a.map(node => node.id);
const bIds = b.map(node => node.id);

function row(from: Ship, to: Ship, value: number, quantity: number, flags: Partial<CCUItem> = {}): CCUItem {
  return {
    name: `${from.name} to ${to.name}`, from, to, parsed: { from: from.name, to: to.name },
    value, quantity, belongsTo: 0, isBuyBack: false, canGift: false, ...flags,
  };
}
const normalRows = [row(ships[0], ships[1], 10, 1), row(ships[0], ships[1], 15, 6), row(ships[1], ships[2], 5, 7)];
const data = {
  ccus: [], wbHistory: [], importItems: [], priceHistoryMap: {},
  hangarItems: toPlannerHangarItems([
    normalRows[0], row(ships[0], ships[1], 1, 40, { isBuyBack: true }),
    normalRows[1], row(ships[0], ships[1], 2, 40, { isSubscription: true }), normalRows[2],
  ]),
};
const findJs = (targetId: string, searchEdges = edges, searchNodes = nodes, prune = false, serviceData = data) => {
  service.resetNodeBestCost();
  return service.findStartNodes(searchEdges, searchNodes).flatMap(start =>
    service.findAllPaths(start, targetId, searchEdges, searchNodes, 1, '0', prune, new Set(), [], [], 0, 0, serviceData)
  );
};
const edgeCompletion = () => edges.map(edge => service.isSingleEdgeInAnyCompletedPath(edge));
const remaining = (sourceId: number, targetId: number) => {
  const used = readStoredCompletedPathsForActiveTab().flatMap(route => route.path.edges ?? []).filter(edge =>
    edge.sourceType === CcuSourceType.HANGER && edge.sourceShipId === sourceId && edge.targetShipId === targetId
  ).length;
  return data.hangarItems.reduce((quantity, item) => {
    const [from, to] = [ships[sourceId - 1].name, ships[targetId - 1].name];
    return item.fromShip === from && item.toShip === to ? quantity + (item.quantity ?? 1) : quantity;
  }, 0) - used;
};

assert.deepEqual(data.hangarItems.map(item => item.quantity), [1, 6, 7], 'only owned, usable inventory rows count');
service.setCompletedPathsStorageKey('completedPaths:route-a');
service.clearCompletedPaths();
const paths = service.buildCompletePaths([aIds, bIds], edges, nodes, {}, data);
service.markPathAsCompleted(paths[0], ships[2]);
assert.deepEqual(edgeCompletion(), [true, true, false, false], 'only chain A turns green');
assert.equal(service.isPathCompleted(paths[1]).completed, false);
assert.equal(remaining(1, 2), 6);
assert.equal(remaining(2, 3), 6);
assert.equal(service.getPriceInfo(edges[2], data).isUsedUp, false, 'a sold-out first row does not exhaust the pair');
assert.equal(hangarStrategy.isApplicable(ships[0], ships[1], [], [], data.hangarItems), true);
for (const prune of [false, true]) {
  assert.deepEqual(findJs(b[2].id, edges, nodes, prune), [bIds]);
}

service.markPathAsCompleted(paths[1], ships[2]);
const aCompletionId = service.getCompletedPaths()[0].pathId;
const bCompletionId = service.getCompletedPaths()[1].pathId;
assert.equal(remaining(1, 2), 5);
assert.equal(remaining(2, 3), 5);
service.loadCompletedPathsFromStorage();
assert.deepEqual(edgeCompletion(), [true, true, true, true]);
assert.deepEqual(service.getCompletedPathsMissingCanvasNodes(nodes), []);

const routeAKey = 'completedPaths:route-a';
const otherTabKey = 'completedPaths:route-other';
const removeNodes = (...ids: string[]) => service.removeCompletedPathsContainingNodes(new Set(ids), routeAKey);
const expectOnlyB = () => {
  assert.deepEqual(service.getCompletedPaths().map(route => route.pathId), [bCompletionId]);
  assert.deepEqual(edgeCompletion(), [false, false, true, true], 'only the unrelated physical chain stays green');
  assert.equal(remaining(1, 2), 6);
  assert.equal(remaining(2, 3), 6);
};

const replacement = makeNode(ships[2], 'replacement');
const replacementEdge = makeEdge(a[1], replacement);
const afterTerminalRemoval = [...nodes.filter(node => node.id !== a[2].id), replacement];
const afterTerminalRemovalEdges = [edges[0], replacementEdge, ...edges.slice(2)];
assert.deepEqual(service.getCompletedPathsMissingCanvasNodes(afterTerminalRemoval).map(route => route.pathId), [aCompletionId], 'legacy orphan records are still discoverable');
assert.equal(remaining(1, 2), 5, 'the fallback does not clear records just because a graph is temporarily missing nodes');
assert.equal(removeNodes(replacement.id), null, 'a separate instance of the same model does not delete a completion');

service.setCompletedPathsStorageKey(otherTabKey);
service.clearCompletedPaths();
service.markPathAsCompleted(paths[0], ships[2]);
const otherTabCompletionId = service.getCompletedPaths()[0].pathId;
assert.equal(removeNodes(a[1].id), null, 'a stale event cannot change a different active tab, even with identical node IDs');
service.setCompletedPathsStorageKey(routeAKey);
service.loadCompletedPathsFromStorage();

for (const deletedNode of a) {
  const removal = removeNodes(deletedNode.id);
  assert.ok(removal);
  assert.deepEqual(removal.removedPaths.map(route => route.pathId), [aCompletionId], 'start, middle and terminal each clear the whole completion');
  expectOnlyB();
  service.loadCompletedPathsFromStorage();
  expectOnlyB();
  assert.deepEqual(service.getCompletedPathsMissingCanvasNodes(nodes.filter(node => node.id !== deletedNode.id)), []);
  assert.equal(service.restoreCompletedPathsAfterUndo(removal), true, 'undo can restore the completion when usage has not otherwise changed');
  assert.deepEqual(edgeCompletion(), [true, true, true, true]);
  assert.equal(remaining(1, 2), 5);
}

const sharedEdges = edges.slice(0, 2);
assert.equal(hasCanvasConnection(sharedEdges, a[0].id, a[1].id), true);
assert.equal(hasCanvasConnection(sharedEdges, b[0].id, a[1].id), false);
assert.equal(hasCanvasConnection(sharedEdges, a[1].id, a[0].id), false);
const newConnection = makeEdge(b[0], a[1]);
assert.deepEqual(findJs(a[2].id, [...sharedEdges, newConnection], [...a, b[0]]), [aIds, [b[0].id, a[1].id, a[2].id]]);
const sharedPath = service.buildCompletePaths([[b[0].id, a[1].id, a[2].id]], [...sharedEdges, newConnection], nodes, {}, data)[0];
service.markPathAsCompleted(sharedPath, ships[2]);
const sharedCompletionId = service.getCompletedPaths().find(route => route.pathId !== aCompletionId && route.pathId !== bCompletionId)!.pathId;
assert.equal(remaining(1, 2), 4);

const multi = removeNodes(a[1].id, a[2].id, a[2].id);
assert.ok(multi);
assert.deepEqual(new Set(multi.removedPaths.map(route => route.pathId)), new Set([aCompletionId, sharedCompletionId]), 'multi-delete clears each route sharing the removed physical node only once');
expectOnlyB();
assert.equal(service.isSingleEdgeInAnyCompletedPath(newConnection), false);
assert.equal(service.isSingleEdgeInAnyCompletedPath(replacementEdge), false);
const replacementPath = service.buildCompletePaths(findJs(replacement.id, afterTerminalRemovalEdges, afterTerminalRemoval), afterTerminalRemovalEdges, afterTerminalRemoval, {}, data)[0];
assert.equal(service.isPathCompleted(replacementPath).completed, false);
service.loadCompletedPathsFromStorage();
expectOnlyB();

service.setCompletedPathsStorageKey(otherTabKey);
service.loadCompletedPathsFromStorage();
assert.deepEqual(service.getCompletedPaths().map(route => route.pathId), [otherTabCompletionId]);
assert.equal(service.restoreCompletedPathsAfterUndo(multi), false, 'an undo cannot move reservations into the wrong tab');
service.setCompletedPathsStorageKey(routeAKey);
service.loadCompletedPathsFromStorage();
service.markPathAsCompleted(replacementPath, ships[2]);
assert.equal(service.restoreCompletedPathsAfterUndo(multi), false, 'undo must not re-deduct stock after a later route completion');
const replacementCompletionId = service.getCompletedPaths().find(route => route.pathId !== bCompletionId)!.pathId;
service.unmarkCompletedPath(replacementCompletionId);
expectOnlyB();
console.log('CCU: physical connections, split inventory, tab isolation, automatic node-deletion cleanup and safe undo passed');

const currentCanvas = { nodes, edges };
const canvasWithoutA = { nodes: b, edges: edges.slice(2) };
service.markPathAsCompleted(paths[0], ships[2]);
const appendedCompletionId = service.getCompletedPaths().find(route => route.pathId !== bCompletionId)!.pathId;
const twoCopiesOfEachPair = toPlannerHangarItems([row(ships[0], ships[1], 5, 2), row(ships[1], ships[2], 5, 2)]);
assert.equal(hangarStrategy.isApplicable(ships[0], ships[1], [], [], twoCopiesOfEachPair), false, 'marking appended A uses the last available copy');
service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, canvasWithoutA, otherTabKey);
assert.equal(service.isPathCompleted(paths[0]).pathId, appendedCompletionId, 'a mismatched tab key is ignored');
service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, canvasWithoutA, routeAKey);
expectOnlyB();
assert.equal(hangarStrategy.isApplicable(ships[0], ships[1], [], [], twoCopiesOfEachPair), true, 'undoing the route addition releases the last used copy immediately');
service.loadCompletedPathsFromStorage();
expectOnlyB();

// An old orphan overlaps A on real nodes and an edge, but was already incomplete before Undo.
const orphanTerminal = makeNode(ships[2], 'old-orphan');
const orphanEdge = makeEdge(a[1], orphanTerminal);
const orphanPath = service.buildCompletePaths([[a[0].id, a[1].id, orphanTerminal.id]], [...edges, orphanEdge], [...nodes, orphanTerminal], {}, data)[0];
service.markPathAsCompleted(orphanPath, ships[2]);
const orphanId = service.getCompletedPaths().find(route => route.pathId !== bCompletionId)!.pathId;
service.markPathAsCompleted(paths[0], ships[2]);
service.loadCompletedPathsFromStorage();
assert.notEqual(service.getCompletedPaths()[2].path.edges[1].edge.id, edges[1].id, 'reload reconstructs completion edge IDs');

const repriced = { ...edges[1], data: { ...edges[1].data!, price: 123 } };
service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, { nodes, edges: [edges[0], repriced, ...edges.slice(2)] }, routeAKey);
assert.equal(service.isPathCompleted(paths[0]).completed, true, 'repricing the same connection does not disconnect it');
const nextCanvas = { nodes, edges: [edges[0], { ...edges[1], id: 'equivalent-canvas-edge' }, ...edges.slice(2)] };
service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, nextCanvas, routeAKey);
assert.equal(service.isPathCompleted(paths[0]).completed, true, 'an equivalent connection with the same variant preserves completion');

for (const id of [edges[1].id, 'official']) {
  if (!service.isPathCompleted(paths[0]).completed) service.markPathAsCompleted(paths[0], ships[2]);
  const officialVariant = { ...edges[1], id, data: { ...edges[1].data!, sourceType: CcuSourceType.OFFICIAL } };
  service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, { nodes, edges: [edges[0], officialVariant, ...edges.slice(2)] }, routeAKey);
  assert.equal(service.isPathCompleted(paths[0]).completed, false, 'undoing a hangar source/edge clears its reservation even if an official edge survives');
  assert.deepEqual(service.getCompletedPaths().map(route => route.pathId), [bCompletionId, orphanId], 'unrelated chains and old orphan records are untouched');
}
assert.deepEqual(service.getCompletedPathsMissingCanvasNodes(nodes).map(route => route.pathId), [orphanId]);
service.loadCompletedPathsFromStorage();
service.unmarkCompletedPath(orphanId);
expectOnlyB();
console.log('CCU: graph Undo clears newly disconnected completions after reload and preserves unrelated routes and orphans');

// Run the real worker and bundled binary with the same messages the adapter sends in the browser.
const require = createRequire(import.meta.url);
type WorkerEvent = { data: unknown };
const workerScope: {
  onmessage?: (event: WorkerEvent) => void;
  postMessage?: (data: unknown) => void;
  createCcuPathfinderCModule?: (options: unknown) => Promise<unknown>;
} = {};
const vmContext = vm.createContext({
  console, performance, process, require, __dirname: `${process.cwd()}/public/wasm`,
  WebAssembly, TextDecoder, TextEncoder, setTimeout, clearTimeout, self: workerScope,
});
vm.runInContext(fs.readFileSync('public/wasm/ccu-pathfinder-c.js', 'utf8'), vmContext);
const createWasm: (options: unknown) => Promise<unknown> = vm.runInContext('createCcuPathfinderCModule', vmContext);
workerScope.createCcuPathfinderCModule = () => createWasm({ wasmBinary: fs.readFileSync('public/wasm/ccu-pathfinder-c.wasm') });
vm.runInContext(fs.readFileSync('public/workers/pathFinderCWasm.worker.js', 'utf8'), vmContext);
class TestWorker {
  onmessage?: (event: WorkerEvent) => void;
  constructor() {
    workerScope.postMessage = data => this.onmessage?.({ data: structuredClone(data) });
  }
  postMessage(data: unknown) {
    workerScope.onmessage?.({ data: structuredClone(data) });
  }
}
Object.defineProperty(globalThis, 'window', { value: {} });
Object.defineProperty(globalThis, 'Worker', { value: TestWorker });
const { default: wasmService } = await import('../src/pages/CCUPlanner/services/PathFinderCWasmService');
const findWasm = (endNodeId: string, searchEdges = edges, pruneOpt = false, serviceData = data) => wasmService.findAllPaths({
  startNodes: service.findStartNodes(searchEdges, nodes), endNodeId, nodes, edges: searchEdges, exchangeRate: 1,
  conciergeValue: '0', pruneOpt, startShipPrices: {}, data: serviceData,
});

for (const prune of [false, true]) {
  assert.deepEqual((await findWasm(b[2].id, edges, prune)).paths, [bIds]);
}
assert.deepEqual((await findWasm(a[2].id, [...sharedEdges, newConnection])).paths, [aIds, [b[0].id, a[1].id, a[2].id]]);

const oneCopy = { ...data, hangarItems: toPlannerHangarItems(normalRows.filter((_, index) => index !== 1)) };
assert.equal(service.getPriceInfo(edges[0], oneCopy).isUsedUp, true);
assert.equal(hangarStrategy.isApplicable(ships[0], ships[1], [], [], oneCopy.hangarItems), false);
assert.deepEqual(findJs(a[2].id, edges, nodes, false, oneCopy), []);
assert.deepEqual(findJs(b[2].id, edges, nodes, false, oneCopy), [bIds], 'the one used copy stays visible on its completed chain');
assert.deepEqual((await findWasm(a[2].id, edges, false, oneCopy)).paths, []);
assert.deepEqual((await findWasm(b[2].id, edges, false, oneCopy)).paths, [bIds]);

service.unmarkCompletedPath(bCompletionId);
const refreshedEdges = edges.map(edge => ({ ...edge, data: { ...edge.data! } }));
assert.deepEqual((await findWasm(a[2].id, refreshedEdges, false, oneCopy)).paths, [aIds], 'cancel refreshes a previously exhausted graph');
assert.deepEqual(edgeCompletion(), [false, false, false, false]);
console.log('CCU: real WASM worker/binary agree with JS, including exhausted and restored inventory');
