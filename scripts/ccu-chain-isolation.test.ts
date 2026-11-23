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
const { getHangarCcuBalances, getHangarCcuRemainingByItem, toPlannerHangarItems } = await import('../src/pages/CCUPlanner/services/plannerHangarItems');
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
assert.equal(service.markPathAsCompleted(paths[0], ships[2], data.hangarItems, data.hangarItems), true);
assert.deepEqual(edgeCompletion(), [true, true, false, false], 'only chain A turns green');
assert.equal(service.isPathCompleted(paths[1]).completed, false);
assert.equal(remaining(1, 2), 6);
assert.equal(remaining(2, 3), 6);
assert.equal(service.getPriceInfo(edges[2], data).isUsedUp, false, 'a sold-out first row does not exhaust the pair');
assert.equal(service.getPriceInfo(edges[2], data).usdPrice, 15, 'the next route is quoted from the remaining lot');
assert.equal(hangarStrategy.isApplicable(ships[0], ships[1], [], [], data.hangarItems), true);
for (const prune of [false, true]) {
  assert.deepEqual(findJs(b[2].id, edges, nodes, prune), [bIds]);
}

assert.equal(service.markPathAsCompleted(paths[1], ships[2], data.hangarItems, data.hangarItems), true);
assert.equal(service.getCompletedPaths()[1].path.totalUsdPrice, 20, 'a route calculated before the first mark is repriced to the actual lot captured at completion');
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
assert.equal(service.markPathAsCompleted(paths[0], ships[2], data.hangarItems, data.hangarItems), true);
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
assert.equal(service.markPathAsCompleted(sharedPath, ships[2], data.hangarItems, data.hangarItems), true);
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
assert.equal(service.markPathAsCompleted(replacementPath, ships[2], data.hangarItems, data.hangarItems), true);
assert.equal(service.restoreCompletedPathsAfterUndo(multi), false, 'undo must not re-deduct stock after a later route completion');
const replacementCompletionId = service.getCompletedPaths().find(route => route.pathId !== bCompletionId)!.pathId;
service.unmarkCompletedPath(replacementCompletionId);
expectOnlyB();
console.log('CCU: physical connections, split inventory, tab isolation, automatic node-deletion cleanup and safe undo passed');

const currentCanvas = { nodes, edges };
const canvasWithoutA = { nodes: b, edges: edges.slice(2) };
assert.equal(service.markPathAsCompleted(paths[0], ships[2], data.hangarItems, data.hangarItems), true);
const appendedCompletionId = service.getCompletedPaths().find(route => route.pathId !== bCompletionId)!.pathId;
const twoCopiesOfEachPair = toPlannerHangarItems([normalRows[0], { ...normalRows[1], quantity: 1 }, { ...normalRows[2], quantity: 2 }]);
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
assert.equal(service.markPathAsCompleted(orphanPath, ships[2], data.hangarItems, data.hangarItems), true);
const orphanId = service.getCompletedPaths().find(route => route.pathId !== bCompletionId)!.pathId;
assert.equal(service.markPathAsCompleted(paths[0], ships[2], data.hangarItems, data.hangarItems), true);
service.loadCompletedPathsFromStorage();
assert.notEqual(service.getCompletedPaths()[2].path.edges[1].edge.id, edges[1].id, 'reload reconstructs completion edge IDs');

const repriced = { ...edges[1], data: { ...edges[1].data!, price: 123 } };
service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, { nodes, edges: [edges[0], repriced, ...edges.slice(2)] }, routeAKey);
assert.equal(service.isPathCompleted(paths[0]).completed, true, 'repricing the same connection does not disconnect it');
const nextCanvas = { nodes, edges: [edges[0], { ...edges[1], id: 'equivalent-canvas-edge' }, ...edges.slice(2)] };
service.reconcileCompletedPathsAfterGraphUndo(currentCanvas, nextCanvas, routeAKey);
assert.equal(service.isPathCompleted(paths[0]).completed, true, 'an equivalent connection with the same variant preserves completion');

for (const id of [edges[1].id, 'official']) {
  if (!service.isPathCompleted(paths[0]).completed) assert.equal(service.markPathAsCompleted(paths[0], ships[2], data.hangarItems, data.hangarItems), true);
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
let lastWasmEdges: { sourceNodeId: string; targetNodeId: string; usdPrice: number }[] = [];
class TestWorker {
  onmessage?: (event: WorkerEvent) => void;
  constructor() {
    workerScope.postMessage = data => this.onmessage?.({ data: structuredClone(data) });
  }
  postMessage(data: unknown) {
    const request = data as { type: string; request?: { edges: typeof lastWasmEdges } };
    if (request.type === 'findPaths' && request.request) lastWasmEdges = structuredClone(request.request.edges);
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

const oneCopy = { ...data, hangarItems: toPlannerHangarItems([{ ...normalRows[1], quantity: 1 }, normalRows[2]]) };
assert.equal(service.getPriceInfo(edges[0], oneCopy).isUsedUp, true);
assert.equal(hangarStrategy.isApplicable(ships[0], ships[1], [], [], oneCopy.hangarItems), false);
assert.deepEqual(findJs(a[2].id, edges, nodes, false, oneCopy), []);
assert.deepEqual(findJs(b[2].id, edges, nodes, false, oneCopy), [bIds], 'the one used copy stays visible on its completed chain');
assert.deepEqual((await findWasm(a[2].id, edges, false, oneCopy)).paths, []);
assert.deepEqual((await findWasm(b[2].id, edges, false, oneCopy)).paths, [bIds]);

service.unmarkCompletedPath(bCompletionId);
assert.deepEqual((await findWasm(a[2].id, edges, false, oneCopy)).paths, [aIds], 'cancel refreshes a previously exhausted graph without changed graph references');
assert.deepEqual(edgeCompletion(), [false, false, false, false]);
console.log('CCU: real WASM worker/binary agree with JS, including exhausted and restored inventory');

const lotsKey = 'completedPaths:lot-test';
service.setCompletedPathsStorageKey(lotsKey);
service.clearCompletedPaths();
const lotRows = [
  row(ships[0], ships[1], 10, 1, { belongsTo: 44 }),
  row(ships[0], ships[1], 15, 6, { belongsTo: 44 }),
  row(ships[0], ships[1], 19, 1, { belongsTo: 55 }),
];
const onlyAccount = (ownerId: number) => toPlannerHangarItems(lotRows.filter(item => item.belongsTo === ownerId), false);
const onlyAccountA = onlyAccount(44);
const onlyAccountB = onlyAccount(55);
const pooled = toPlannerHangarItems(lotRows);
const pooledData = { ...data, hangarItems: pooled };
const lots = (items: typeof pooled) => getHangarCcuBalances(ships[0], ships[1], items).map(balance => balance.remaining);
const [accountAPath, accountBPath] = service.buildCompletePaths([aIds.slice(0, 2), bIds.slice(0, 2)], edges, nodes, {}, pooledData);
const wasmBPrice = async () => {
  await findWasm(b[1].id, edges, false, pooledData);
  return lastWasmEdges.find(edge => edge.sourceNodeId === b[0].id && edge.targetNodeId === b[1].id)?.usdPrice;
};
assert.equal(await wasmBPrice(), 10);
assert.equal(service.markPathAsCompleted(accountAPath, ships[1], pooled, pooled), true, 'All Accounts records the actual owner of the available lot');
assert.equal(await wasmBPrice(), 15, 'the same graph references now carry the next lot price into the real WASM request');
assert.deepEqual(lots(onlyAccountA), [0, 6]);
assert.deepEqual(lots(onlyAccountB), [1]);
assert.deepEqual(lots(pooled), [0, 6, 1]);
assert.equal(service.getPriceInfo(edges[2], { ...data, hangarItems: onlyAccountA }).usdPrice, 15);
assert.equal(service.getPriceInfo(edges[2], { ...data, hangarItems: onlyAccountB }).usdPrice, 19);
assert.equal(service.getCompletedHangarAllocation(edges[0])?.ownerId, 44);
assert.equal(service.getCompletedHangarAllocation(edges[0])?.unitPrice, 10);

const reordered = toPlannerHangarItems([
  lotRows[2], lotRows[1], { ...lotRows[0], name: lotRows[0].name.toUpperCase().replace(/ /g, '  ') },
]);
assert.deepEqual(lots(reordered), [1, 6, 0], 'order and formatting changes do not move existing stock deductions');
const sourceSidebar = getHangarCcuRemainingByItem(reordered, ships);
assert.equal(sourceSidebar.get(reordered[1]), 6, 'hiding the exhausted $10 row from display does not debit the visible $15 lot');
assert.deepEqual(lots(toPlannerHangarItems(lotRows.slice(1))), [6, 1], 'a missing reserved lot is not charged to another lot/account');

assert.equal(service.markPathAsCompleted(accountBPath, ships[1], onlyAccountB, pooled), true);
assert.deepEqual(lots(onlyAccountB), [0]);
assert.equal(service.markPathAsCompleted(sharedPath, ships[2], onlyAccountB, pooled), false, 'stock must be available for every step at commit time');
assert.equal(service.getCompletedPaths().length, 2, 'a failed mark is atomic');
service.loadCompletedPathsFromStorage();
assert.equal(service.getCompletedHangarAllocation(edges[2])?.ownerId, 55);
assert.equal(service.buildCompletePaths([aIds.slice(0, 2)], edges, nodes, {}, { ...data, hangarItems: onlyAccountB })[0].totalUsdPrice, 10, 'completed route displays the charged lot after selecting another account and reloading');
const accountReservationRemoval = service.removeCompletedPathsContainingNodes(new Set([a[1].id]), lotsKey);
assert.ok(accountReservationRemoval);
assert.deepEqual(lots(onlyAccountA), [1, 6]);
assert.deepEqual(lots(onlyAccountB), [0]);
assert.equal(service.restoreCompletedPathsAfterUndo(accountReservationRemoval), true);
assert.deepEqual(lots(onlyAccountA), [0, 6]);
assert.deepEqual(lots(onlyAccountB), [0]);
console.log('CCU: account/lot allocation, actual market value paid, remaining balances, reload and Undo passed');

const oldStoredRoute = {
  pathId: 'old-5d4b266',
  shipId: ships[1].id,
  shipName: ships[1].name,
  shipMsrp: ships[1].msrp,
  path: {
    startNodeId: a[0].id,
    nodes: a.slice(0, 2).map(node => ({
      nodeId: node.id, shipId: node.data.ship.id, shipName: node.data.ship.name, shipMsrp: node.data.ship.msrp,
    })),
    edges: [{ sourceShipId: ships[0].id, targetShipId: ships[1].id, sourceType: CcuSourceType.HANGER, price: edges[0].data!.price }],
    totalUsdPrice: 10,
    totalThirdPartyPrice: 0,
    hasUsdPricing: true,
    hasCnyPricing: false,
  },
};
const legacyRaw = JSON.stringify([oldStoredRoute]);
const { default: ImportExportService } = await import('../src/pages/CCUPlanner/services/ImportExportService');
const io = new ImportExportService();
const legacyFlow = { nodes: a.slice(0, 2), edges: [edges[0]], startShipPrices: {} };
const imported = io.importFromFlowData(legacyFlow, ships, { ...data, hangarItems: pooled });
assert.equal(imported?.edges[0].data?.sourceType, CcuSourceType.HANGER, 'old workspace/exported JSON requires no new graph fields');

for (const useLegacyGlobalFallback of [false, true]) {
  storage.delete(lotsKey);
  storage.delete('completedPaths');
  storage.set(useLegacyGlobalFallback ? 'completedPaths' : lotsKey, legacyRaw);
  service.loadCompletedPathsFromStorage();
  assert.equal(service.isPathCompleted(accountAPath).pathId, oldStoredRoute.pathId);
  assert.equal(service.getCompletedHangarAllocation(edges[0]), undefined, 'legacy edge cannot be assigned to an owner using its display price');
  assert.deepEqual(lots(onlyAccountA), [1, 6]);
  assert.deepEqual(lots(onlyAccountB), [1]);
  assert.deepEqual(lots(pooled), [0, 6, 1], 'unknown legacy ownership reserves one unit only in pooled view');
  assert.equal(service.markPathAsCompleted(accountBPath, ships[1], onlyAccountB, pooled), true);
  assert.equal(readStoredCompletedPathsForActiveTab()[0].path.edges?.[0].hangarAllocation, undefined, 'writing a new completion preserves old records as unassigned');
  service.loadCompletedPathsFromStorage();
  service.unmarkCompletedPath(oldStoredRoute.pathId);
  assert.deepEqual(lots(pooled), [1, 6, 0]);
  service.unmarkCompletedPath(service.getCompletedPaths()[0].pathId);
  service.loadCompletedPathsFromStorage();
  assert.deepEqual(service.getCompletedPaths(), [], 'explicit empty route ledger does not resurrect global legacy records');
}
console.log('CCU: pre-lot workspace/JSON, per-route records and legacy global fallback remain readable, cancellable and unassigned');

storage.set(lotsKey, legacyRaw);
service.loadCompletedPathsFromStorage();
const cappedRows = [lotRows[0], lotRows[2]];
const cappedA = toPlannerHangarItems([cappedRows[0]], false);
const cappedB = toPlannerHangarItems([cappedRows[1]], false);
const cappedPool = toPlannerHangarItems(cappedRows);
const third = [makeNode(ships[0], 'third-ownerless'), makeNode(ships[1], 'third-ownerless')];
const thirdEdges = [makeEdge(third[0], third[1])];
const thirdPath = service.buildCompletePaths([third.map(node => node.id)], thirdEdges, third, {}, { ...data, hangarItems: cappedPool })[0];
assert.deepEqual(lots(cappedA), [1], 'the legacy reservation does not guess the owning account');
assert.deepEqual(lots(cappedB), [1]);
assert.deepEqual(lots(cappedPool), [0, 1]);
assert.equal(service.markPathAsCompleted(accountBPath, ships[1], cappedA, cappedPool), true, 'one fresh reservation may use the selected account even if the unassigned debit was displayed first against that lot');
assert.equal(service.getCompletedHangarAllocation(edges[2])?.ownerId, 44);
assert.deepEqual(lots(cappedB), [1], 'the remaining account still owns its copy even while the uncertain pool is exhausted');
assert.deepEqual(lots(cappedPool), [0, 0]);
const cappedLedger = storage.get(lotsKey);
assert.equal(service.markPathAsCompleted(thirdPath, ships[1], cappedB, cappedPool), false, 'two selected accounts cannot overcommit one ownerless reservation');
assert.equal(storage.get(lotsKey), cappedLedger, 'a failed pooled check is atomic');
service.loadCompletedPathsFromStorage();
assert.equal(service.getCompletedPaths().length, 2);
assert.equal(readStoredCompletedPathsForActiveTab()[0].path.edges?.[0].hangarAllocation, undefined);
service.unmarkCompletedPath(oldStoredRoute.pathId);
assert.equal(service.markPathAsCompleted(thirdPath, ships[1], cappedA, cappedPool), false, 'a selected owner cannot borrow another account’s remaining lot');
assert.equal(service.markPathAsCompleted(thirdPath, ships[1], cappedB, cappedPool), true, 'cancelling the legacy entry releases its pooled capacity');
assert.equal(service.getCompletedHangarAllocation(thirdEdges[0])?.ownerId, 55);

for (const [oldFromNumeric, oldToNumeric] of [[false, false], [true, false], [false, true], [true, true]]) {
  service.clearCompletedPaths();
  const oldRow = {
    ...lotRows[0],
    from: { ...lotRows[0].from, id: oldFromNumeric ? ships[0].id : 0 },
    to: { ...lotRows[0].to, id: oldToNumeric ? ships[1].id : 0 },
  };
  const currentRow = { ...lotRows[0], from: { ...oldRow.from, id: ships[0].id }, to: { ...oldRow.to, id: ships[1].id } };
  const oldProjection = toPlannerHangarItems([oldRow]);
  const newProjection = toPlannerHangarItems([currentRow]);
  const reversedProjection = toPlannerHangarItems([{ ...currentRow, from: { ...currentRow.from, id: 0 }, to: { ...currentRow.to, id: 0 } }]);
  const oldKey = oldProjection[0].lot!.lotKey;
  const newKey = newProjection[0].lot!.lotKey;
  if (!oldFromNumeric || !oldToNumeric) assert.notEqual(oldKey, newKey, 'simulate a real 84d1511 identity change during hydration');
  assert.equal(service.markPathAsCompleted(accountAPath, ships[1], oldProjection, oldProjection), true);
  const ledgerBeforeHydration = storage.get(lotsKey);
  service.loadCompletedPathsFromStorage();
  const otherLots = [
    { ...currentRow, belongsTo: 55 }, { ...currentRow, value: 15 },
    { ...currentRow, canGift: true }, { ...currentRow, name: currentRow.name + ' (other lot)' },
  ];
  const displayed = toPlannerHangarItems([currentRow, ...otherLots]);
  assert.deepEqual(lots(displayed), [0, 1, 1, 1, 1], 'only the exact owner, giftability, title, price and canonical ship pair match');
  assert.equal(getHangarCcuRemainingByItem(displayed, ships).get(displayed[0]), 0, 'sidebar hydration keeps the same reservation');
  assert.equal(service.markPathAsCompleted(accountBPath, ships[1], newProjection, newProjection), false, 'hydrating IDs must not free the same single unit');
  assert.equal(storage.get(lotsKey), ledgerBeforeHydration, 'compatibility lookup does not rewrite an old key');
  assert.deepEqual(lots(toPlannerHangarItems([oldRow, currentRow])), [0, 1], 'equivalent old/new representations apply each existing reservation once');
  service.unmarkCompletedPath(service.getCompletedPaths()[0].pathId);
  assert.deepEqual(lots(newProjection), [1], 'cancellation releases a legacy-format lot on its hydrated row');
  assert.equal(service.markPathAsCompleted(accountBPath, ships[1], newProjection, newProjection), true);
  service.loadCompletedPathsFromStorage();
  assert.deepEqual(lots(reversedProjection), [0], 'numeric ledgers still work with name-only cached rows');
}
console.log('CCU: unassigned pooled reservations cannot overcommit, and persisted numeric/name/mixed lot identities survive hydration');
