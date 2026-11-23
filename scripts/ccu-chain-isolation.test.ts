import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import type { Edge, Node } from 'reactflow';
import type { CCUItem } from '../src/store/upgradesStore';
import type { CcuEdgeData, Ship } from '../src/types';

const storage = new Map<string, string>();
let rejectingStorageKey: string | undefined;
let onStorageRead: ((key: string) => void) | undefined;
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => {
    onStorageRead?.(key);
    return storage.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (key === rejectingStorageKey) throw new Error('Simulated localStorage write failure');
    storage.set(key, value);
  },
  removeItem: (key: string) => storage.delete(key),
} });
const { default: service } = await import('../src/pages/CCUPlanner/services/PathFinderService');
const { hasCanvasConnection } = await import('../src/pages/CCUPlanner/services/CcuEdgeService');
const { HangarStrategy } = await import('../src/pages/CCUPlanner/services/CcuSourceTypeStrategy');
const { getHangarCcuBalances, getHangarCcuRemainingByItem, toPlannerHangarItems } = await import('../src/pages/CCUPlanner/services/plannerHangarItems');
const { DEFAULT_PLANNER_TAB_ID, LEGACY_SINGLE_ROUTE_TAB_ID, getCompletedPathsStorageKeyForTab, readStoredCompletedPathsForActiveTab, scopeLegacyCompletedPathsFallback } =
  await import('../src/pages/CCUPlanner/services/completedPathsStorage');
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
io.saveToLocalStorage(legacyFlow);
const oldWorkspace = io.loadWorkspaceFromLocalStorage(ships, [], [], []);
assert.equal(oldWorkspace?.activeTabId, LEGACY_SINGLE_ROUTE_TAB_ID, 'read an actual pre-tab workspace in its converted canonical tab');
const legacyTabKey = getCompletedPathsStorageKeyForTab(LEGACY_SINGLE_ROUTE_TAB_ID);
scopeLegacyCompletedPathsFallback(['lot-test', oldWorkspace!.activeTabId]);

for (const useLegacyGlobalFallback of [false, true]) {
  const fixtureKey = useLegacyGlobalFallback ? legacyTabKey : lotsKey;
  storage.delete(fixtureKey);
  storage.delete('completedPaths');
  storage.set(useLegacyGlobalFallback ? 'completedPaths' : fixtureKey, legacyRaw);
  service.setCompletedPathsStorageKey(fixtureKey);
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

service.setCompletedPathsStorageKey(lotsKey);
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

const { getCcuEdgeDisplayWarning } = await import('../src/pages/CCUPlanner/services/ccuEdgeDisplay');
service.clearCompletedPaths();
const warningInventory = toPlannerHangarItems([lotRows[0], { ...lotRows[1], quantity: 1 }]);
const warningState = (edge: Edge<CcuEdgeData>, hangarItems = warningInventory, pooledHangarItems = hangarItems) => {
  const isCompleted = service.isSingleEdgeInAnyCompletedPath(edge);
  const allocation = service.getCompletedHangarAllocation(edge);
  const price = service.getPriceInfo(edge, { ...data, hangarItems }, allocation);
  return { ...price, ...getCcuEdgeDisplayWarning({
    data: edge.data!, price: price.usdPrice, isCompleted, hasCompletedHangarAllocation: !!allocation, isUsedUp: price.isUsedUp,
    hangarItems, pooledHangarItems,
  }) };
};
assert.equal(warningState(thirdEdges[0]).usdPrice, 10);
assert.equal(warningState(thirdEdges[0]).showsPriceWarning, false);
assert.equal(service.markPathAsCompleted(accountAPath, ships[1], warningInventory, warningInventory), true);
assert.equal(warningState(thirdEdges[0]).usdPrice, 15, 'the existing pending canvas edge quotes the next batch');
assert.equal(warningState(thirdEdges[0]).showsPriceWarning, false);
assert.equal(service.markPathAsCompleted(accountBPath, ships[1], warningInventory, warningInventory), true);
assert.ok(warningState(thirdEdges[0]).usdPrice > 0, 'an exhausted lot may still return a nonzero fallback price');
assert.equal(warningState(thirdEdges[0]).isHangarOutOfStock, true, 'the unchanged physical edge must show the red warning');
assert.equal(warningState(thirdEdges[0]).showsPriceWarning, true, 'canvas and export use the same warning state');
assert.equal(warningState(edges[0]).showsPriceWarning, false, 'completed Hangar edges do not turn red when all stock is consumed');
assert.equal(warningState(edges[2]).usdPrice, 15, 'its existing paid lot price stays pinned');
const deletedLastClaim = service.removeCompletedPathsContainingNodes(new Set([b[1].id]), lotsKey);
assert.ok(deletedLastClaim);
assert.equal(warningState(thirdEdges[0]).showsPriceWarning, false, 'releasing the last unit clears red immediately');
assert.equal(warningState(thirdEdges[0]).usdPrice, 15);
assert.equal(service.restoreCompletedPathsAfterUndo(deletedLastClaim), true);
assert.equal(warningState(thirdEdges[0]).showsPriceWarning, true, 'undo restoring the reservation restores the warning');
service.clearCompletedPaths();
const freeInventory = toPlannerHangarItems([{ ...lotRows[0], value: 0 }]);
assert.equal(warningState(thirdEdges[0], freeInventory).usdPrice, 0);
assert.equal(warningState(thirdEdges[0], freeInventory).showsPriceWarning, false, 'available free stock is not a warning');
assert.equal(getCcuEdgeDisplayWarning({
  data: { ...thirdEdges[0].data, sourceType: CcuSourceType.OFFICIAL }, price: 0, isCompleted: false,
  hangarItems: freeInventory, pooledHangarItems: freeInventory,
}).showsPriceWarning, true, 'the preexisting non-Hangar zero-price warning is unchanged');

storage.set(lotsKey, legacyRaw);
service.loadCompletedPathsFromStorage();
assert.equal(service.markPathAsCompleted(accountBPath, ships[1], cappedA, cappedPool), true);
assert.equal(warningState(thirdEdges[0], cappedB, cappedPool).isUsedUp, false, 'selected owner has an apparent unit');
assert.equal(warningState(thirdEdges[0], cappedB, cappedPool).showsPriceWarning, true, 'pending edge reflects the effective pooled legacy cap');
console.log('CCU: shared canvas/export red warning follows exhaustion, completion, release, undo and the pooled cap');

const migrationKey = 'completedPaths:existing-custom-route';
service.setCompletedPathsStorageKey(migrationKey);
service.clearCompletedPaths();
assert.equal(service.markPathAsCompleted(accountBPath, ships[1], cappedA, cappedPool), true);
const explicitRecord = JSON.parse(storage.get(migrationKey)!)[0];
const oldThirdRoute = {
  ...oldStoredRoute, pathId: 'old-queue-two',
  path: {
    ...oldStoredRoute.path, startNodeId: third[0].id,
    nodes: oldStoredRoute.path.nodes.map((node, index) => ({ ...node, nodeId: third[index].id })),
  },
};
const unrelatedPair = toPlannerHangarItems([
  row(ships[1], ships[0], 1, 7, { belongsTo: 55 }),
  row(ships[0], ships[1], 2, 7, { belongsTo: 55, isBuyBack: true }),
  row(ships[0], ships[1], 3, 7, { belongsTo: -1 }),
]);
const unupgraded = JSON.stringify([oldStoredRoute, oldThirdRoute, explicitRecord]);
storage.set(migrationKey, unupgraded);
service.loadCompletedPathsFromStorage();
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, []), false, 'empty or delayed inventory leaves the old records byte-for-byte intact');
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, [], cappedPool), false, 'wait for the canonical ship catalog');
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, unrelatedPair), false, 'reverse pair, buyback and ownerless stock cannot be adopted');
assert.equal(storage.get(migrationKey), unupgraded);
assert.equal(service.isPathCompleted(accountAPath).completed, true, 'unmatched route remains complete in history');
assert.equal(warningState(edges[0], unrelatedPair).showsPriceWarning, true, 'preserved legacy completion gets red ! when it has no eligible stock');
assert.equal(warningState(edges[2], unrelatedPair).showsPriceWarning, false, 'the explicitly allocated completed route stays green');
assert.equal(service.migrateLegacyHangarAllocations(lotsKey, ships, cappedPool), false, 'no work on an old active tab or detached ledger');

rejectingStorageKey = migrationKey;
const originalConsoleError = console.error;
try {
  console.error = (...args) => { if (args[0] !== 'Failed to upgrade legacy completed Hangar paths:') originalConsoleError(...args); };
  assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, cappedPool), false);
} finally {
  console.error = originalConsoleError;
  rejectingStorageKey = undefined;
}
assert.equal(storage.get(migrationKey), unupgraded, 'a failed write leaves storage unchanged');
assert.equal(service.getCompletedHangarAllocation(edges[0]), undefined, 'a failed write never updates memory');
let reads = 0;
const interveningSnapshot = JSON.stringify([oldStoredRoute, oldThirdRoute, explicitRecord, { extraUnknownField: true }]);
onStorageRead = key => {
  if (key === migrationKey && ++reads === 2) storage.set(key, interveningSnapshot);
};
try {
  assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, cappedPool), false);
} finally {
  onStorageRead = undefined;
}
assert.equal(storage.get(migrationKey), interveningSnapshot, 'an intervening change before write is not overwritten');
assert.equal(service.getCompletedHangarAllocation(edges[0]), undefined);

assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, cappedPool), true, 'inventory arriving later upgrades only what fits');
const afterFirstMigration = storage.get(migrationKey)!;
const [upgradedRoute, deferredRoute, keptExplicit, keptUnknown] = JSON.parse(afterFirstMigration);
const adoptedLot = upgradedRoute.path.edges[0].hangarAllocation;
assert.deepEqual(adoptedLot, { ...cappedPool[1].lot, inferredFromLegacy: true }, 'explicit owner 44 holds the first lot, so the old route adopts actual owner 55');
delete upgradedRoute.path.edges[0].hangarAllocation;
assert.deepEqual(upgradedRoute, oldStoredRoute, 'completion identity, recorded totals, price and old edge fields are not rewritten');
assert.deepEqual(deferredRoute, oldThirdRoute, 'a second legacy completion may not reserve the same physical unit twice');
assert.deepEqual(keptExplicit, explicitRecord);
assert.deepEqual(keptUnknown, { extraUnknownField: true }, 'unknown legacy data is preserved during migration');
assert.deepEqual(lots(cappedPool), [0, 0]);
assert.deepEqual(lots(cappedA), [0]);
assert.deepEqual(lots(cappedB), [0], 'owner-specific remaining now reports the assigned unit');
assert.equal(warningState(edges[0], cappedA, cappedPool).showsPriceWarning, false, 'selected owner cannot turn an assigned completed edge red');
assert.equal(warningState(thirdEdges[0], cappedA, cappedPool).showsPriceWarning, true, 'unresolved legacy completion is red after the available lot was assigned to an earlier record');
const pendingMigrationEdge = makeEdge(makeNode(ships[0], 'pending-migration'), makeNode(ships[1], 'pending-migration'));
assert.equal(warningState(pendingMigrationEdge, cappedPool).showsPriceWarning, true, 'pending exact-pair edges are red too');
assert.equal(service.buildCompletePaths([aIds.slice(0, 2)], edges, nodes, {}, { ...data, hangarItems: cappedA })[0].totalUsdPrice, 10, 'live rebuilding does not replace historical route price with the inferred $19 lot');
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, cappedPool), false);
assert.equal(storage.get(migrationKey), afterFirstMigration, 'repeat runs add no inventory debit');
service.loadCompletedPathsFromStorage();
assert.deepEqual(service.getCompletedHangarAllocation(edges[0]), adoptedLot, 'allocation survives reload');
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, [...cappedPool].reverse()), false, 'reordering cannot reassign migrated or explicit lots');
const replenished = toPlannerHangarItems([lotRows[0], lotRows[2], lotRows[1]]);
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, replenished), true);
assert.equal(service.getCompletedHangarAllocation(thirdEdges[0])?.unitPrice, 15, 'a later real replenishment resolves the deferred completion');
service.unmarkCompletedPath(oldStoredRoute.pathId);
assert.deepEqual(lots(replenished), [0, 1, 5], 'unmarking releases only its own formerly legacy lot');

storage.set(migrationKey, JSON.stringify([oldStoredRoute, explicitRecord]));
service.loadCompletedPathsFromStorage();
const migrationUndo = service.removeCompletedPathsContainingNodes(new Set([b[1].id]), migrationKey);
assert.ok(migrationUndo);
assert.equal(service.migrateLegacyHangarAllocations(migrationKey, ships, cappedA), true, 'stock is now reserved by a previously unallocated completion');
assert.equal(service.restoreCompletedPathsAfterUndo(migrationUndo), false, 'Undo will not steal it back even though the other path IDs did not change');
assert.deepEqual(lots(cappedA), [0]);

storage.set('completedPaths', legacyRaw);
storage.delete(legacyTabKey);
const blankDefaultKey = getCompletedPathsStorageKeyForTab(DEFAULT_PLANNER_TAB_ID);
storage.delete(blankDefaultKey);
scopeLegacyCompletedPathsFallback([DEFAULT_PLANNER_TAB_ID, LEGACY_SINGLE_ROUTE_TAB_ID, 'other-blank']);
service.setCompletedPathsStorageKey(blankDefaultKey);
service.loadCompletedPathsFromStorage();
assert.equal(service.getCompletedPaths().length, 0, 'another tab without a ledger does not inherit global records');
assert.deepEqual(lots(cappedPool), [1, 1], 'sidebar does not reserve a different tab’s global fallback');
assert.equal(service.migrateLegacyHangarAllocations(blankDefaultKey, ships, cappedPool), false);
assert.equal(storage.has(blankDefaultKey), false);
service.setCompletedPathsStorageKey(legacyTabKey);
service.loadCompletedPathsFromStorage();
assert.equal(service.isPathCompleted(accountAPath).completed, true, 'the old global ledger belongs to its upgraded workspace tab');
assert.equal(service.migrateLegacyHangarAllocations(legacyTabKey, ships, cappedPool), true);
assert.equal(storage.get('completedPaths'), legacyRaw, 'the global compatibility snapshot is never rewritten');
assert.equal(service.getCompletedHangarAllocation(edges[0])?.ownerId, 44, 'unambiguous stock or a tie uses first available full-inventory lot order');
service.unmarkCompletedPath(oldStoredRoute.pathId);
service.loadCompletedPathsFromStorage();
assert.equal(service.migrateLegacyHangarAllocations(legacyTabKey, ships, cappedPool), false);
assert.equal(storage.get(legacyTabKey), '[]', 'explicit empty tab remains authoritative after cancellation');
console.log('CCU: scoped idempotent legacy upgrade uses exact pooled lots, protects explicit holds/Undo, and preserves unresolved red warnings and historical totals');
