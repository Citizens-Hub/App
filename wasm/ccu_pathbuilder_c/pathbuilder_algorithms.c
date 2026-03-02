#include "pathbuilder_internal.h"

#include <math.h>
#include <stdlib.h>
#include <string.h>

// Mode-specific graph algorithms. Exposed via pbRun in main.c.
static const double *g_edge_sort_scores = NULL;
static const double *g_edge_sort_savings = NULL;
static const PbEdge *g_edge_sort_edges = NULL;

static int compare_target_cost(const void *left, const void *right) {
  const TargetCost *a = (const TargetCost *)left;
  const TargetCost *b = (const TargetCost *)right;
  if (a->cost < b->cost) {
    return -1;
  }
  if (a->cost > b->cost) {
    return 1;
  }
  return a->idx - b->idx;
}

static int compare_edges_for_source(const void *left, const void *right) {
  int edge_a = *(const int *)left;
  int edge_b = *(const int *)right;

  double score_a = g_edge_sort_scores[edge_a];
  double score_b = g_edge_sort_scores[edge_b];
  if (score_a < score_b) {
    return -1;
  }
  if (score_a > score_b) {
    return 1;
  }

  double savings_a = g_edge_sort_savings[edge_a];
  double savings_b = g_edge_sort_savings[edge_b];
  if (savings_a > savings_b) {
    return -1;
  }
  if (savings_a < savings_b) {
    return 1;
  }

  double cost_a = g_edge_sort_edges[edge_a].actual_cost;
  double cost_b = g_edge_sort_edges[edge_b].actual_cost;
  if (cost_a < cost_b) {
    return -1;
  }
  if (cost_a > cost_b) {
    return 1;
  }

  return edge_a - edge_b;
}

static int compare_edges_global(const void *left, const void *right) {
  int edge_a = *(const int *)left;
  int edge_b = *(const int *)right;

  double score_a = g_edge_sort_scores[edge_a];
  double score_b = g_edge_sort_scores[edge_b];
  if (score_a < score_b) {
    return -1;
  }
  if (score_a > score_b) {
    return 1;
  }

  double savings_a = g_edge_sort_savings[edge_a];
  double savings_b = g_edge_sort_savings[edge_b];
  if (savings_a > savings_b) {
    return -1;
  }
  if (savings_a < savings_b) {
    return 1;
  }

  return edge_a - edge_b;
}

static int compare_edges_by_score_only(const void *left, const void *right) {
  int edge_a = *(const int *)left;
  int edge_b = *(const int *)right;

  double score_a = g_edge_sort_scores[edge_a];
  double score_b = g_edge_sort_scores[edge_b];
  if (score_a < score_b) {
    return -1;
  }
  if (score_a > score_b) {
    return 1;
  }

  return edge_a - edge_b;
}

static void heap_init(MinHeap *heap) {
  heap->items = NULL;
  heap->len = 0;
  heap->cap = 0;
}

static void heap_free(MinHeap *heap) {
  free(heap->items);
  heap->items = NULL;
  heap->len = 0;
  heap->cap = 0;
}

static bool heap_push(MinHeap *heap, int state_idx, double cost) {
  if (!ensure_capacity((void **)&heap->items, &heap->cap, heap->len, sizeof(HeapItem))) {
    return false;
  }

  int idx = heap->len++;
  heap->items[idx].state_idx = state_idx;
  heap->items[idx].cost = cost;

  while (idx > 0) {
    int parent = (idx - 1) / 2;
    if (heap->items[parent].cost <= heap->items[idx].cost) {
      break;
    }
    HeapItem tmp = heap->items[parent];
    heap->items[parent] = heap->items[idx];
    heap->items[idx] = tmp;
    idx = parent;
  }

  return true;
}

static bool heap_pop(MinHeap *heap, HeapItem *out_item) {
  if (!heap || !out_item || heap->len <= 0) {
    return false;
  }

  *out_item = heap->items[0];
  heap->len--;
  if (heap->len <= 0) {
    return true;
  }

  heap->items[0] = heap->items[heap->len];
  int idx = 0;

  while (true) {
    int left = idx * 2 + 1;
    int right = idx * 2 + 2;
    int smallest = idx;

    if (left < heap->len && heap->items[left].cost < heap->items[smallest].cost) {
      smallest = left;
    }
    if (right < heap->len && heap->items[right].cost < heap->items[smallest].cost) {
      smallest = right;
    }
    if (smallest == idx) {
      break;
    }

    HeapItem tmp = heap->items[idx];
    heap->items[idx] = heap->items[smallest];
    heap->items[smallest] = tmp;
    idx = smallest;
  }

  return true;
}

// REVIEW mode:
// shortest path on expanded state space (node, collected_review_bits_mask).
bool compute_best_review_route(
  int start_ship_id,
  int target_ship_id,
  int required_bit_count,
  int **route_edge_indices_out,
  int *route_edge_count_out,
  double *route_total_cost_out
) {
  if (!route_edge_indices_out || !route_edge_count_out || !route_total_cost_out) {
    return false;
  }

  *route_edge_indices_out = NULL;
  *route_edge_count_out = 0;
  *route_total_cost_out = 0.0;

  if (required_bit_count < 0 || required_bit_count > 20) {
    return false;
  }

  const int node_count = g_ctx.node_count;
  const int edge_count = g_ctx.edge_count;
  if (node_count <= 0 || edge_count <= 0) {
    return true;
  }

  const int mask_count = 1 << required_bit_count;
  const uint32_t all_required_mask = (required_bit_count == 0) ? 0u : ((uint32_t)mask_count - 1u);

  const size_t state_count_size = (size_t)node_count * (size_t)mask_count;
  if (state_count_size == 0 || state_count_size > (size_t)INT32_MAX) {
    return false;
  }
  const int state_count = (int)state_count_size;

  unsigned char *target_node_mask = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  int *start_node_ids = (int *)malloc((size_t)node_count * sizeof(int));
  if (!target_node_mask || !start_node_ids) {
    free(target_node_mask);
    free(start_node_ids);
    return false;
  }

  int start_count = 0;
  int target_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (g_ctx.nodes[i].ship_id == start_ship_id) {
      start_node_ids[start_count++] = i;
    }
    if (g_ctx.nodes[i].ship_id == target_ship_id) {
      target_node_mask[i] = 1;
      target_count++;
    }
  }

  if (start_count == 0 || target_count == 0) {
    free(target_node_mask);
    free(start_node_ids);
    return true;
  }

  GraphAdj adj = {0};
  if (!build_graph_adj(NULL, &adj)) {
    free(target_node_mask);
    free(start_node_ids);
    free_graph_adj(&adj);
    return false;
  }

  double *dist = (double *)malloc((size_t)state_count * sizeof(double));
  int *prev_state = (int *)malloc((size_t)state_count * sizeof(int));
  int *prev_edge = (int *)malloc((size_t)state_count * sizeof(int));
  unsigned char *settled = (unsigned char *)calloc((size_t)state_count, sizeof(unsigned char));
  if (!dist || !prev_state || !prev_edge || !settled) {
    free(dist);
    free(prev_state);
    free(prev_edge);
    free(settled);
    free(target_node_mask);
    free(start_node_ids);
    free_graph_adj(&adj);
    return false;
  }

  for (int i = 0; i < state_count; i++) {
    dist[i] = INFINITY;
    prev_state[i] = -1;
    prev_edge[i] = -1;
  }

  MinHeap heap;
  heap_init(&heap);

  for (int i = 0; i < start_count; i++) {
    int start_state = start_node_ids[i] * mask_count;
    if (start_state < 0 || start_state >= state_count) {
      continue;
    }
    if (0.0 < dist[start_state]) {
      dist[start_state] = 0.0;
      if (!heap_push(&heap, start_state, 0.0)) {
        heap_free(&heap);
        free(dist);
        free(prev_state);
        free(prev_edge);
        free(settled);
        free(target_node_mask);
        free(start_node_ids);
        free_graph_adj(&adj);
        return false;
      }
    }
  }

  int best_target_state = -1;
  double best_target_cost = INFINITY;
  HeapItem current_item = {0};

  // Dijkstra over state graph; edge transition merges review bits via OR.
  while (heap_pop(&heap, &current_item)) {
    int state_idx = current_item.state_idx;
    if (state_idx < 0 || state_idx >= state_count) {
      continue;
    }

    double known_cost = dist[state_idx];
    if (!isfinite(known_cost) || current_item.cost > known_cost + 1e-6) {
      continue;
    }

    if (settled[state_idx]) {
      continue;
    }
    settled[state_idx] = 1;

    int node_idx = state_idx / mask_count;
    uint32_t mask = (uint32_t)(state_idx % mask_count);

    if (target_node_mask[node_idx] && mask == all_required_mask) {
      best_target_state = state_idx;
      best_target_cost = known_cost;
      break;
    }

    int begin = adj.out_offsets[node_idx];
    int end = adj.out_offsets[node_idx + 1];
    for (int i = begin; i < end; i++) {
      int edge_idx = adj.out_edge_indices[i];
      if (edge_idx < 0 || edge_idx >= edge_count) {
        continue;
      }

      PbEdge edge = g_ctx.edges[edge_idx];
      if (!isfinite(edge.actual_cost) || edge.actual_cost < 0.0) {
        continue;
      }
      if (edge.target_idx < 0 || edge.target_idx >= node_count) {
        continue;
      }

      uint32_t required_mask = (uint32_t)(edge.review_required_bit & (uint64_t)all_required_mask);
      uint32_t next_mask = mask | required_mask;
      int next_state = edge.target_idx * mask_count + (int)next_mask;
      if (next_state < 0 || next_state >= state_count) {
        continue;
      }

      double candidate_cost = known_cost + edge.actual_cost;
      if (candidate_cost < dist[next_state] - 1e-6) {
        dist[next_state] = candidate_cost;
        prev_state[next_state] = state_idx;
        prev_edge[next_state] = edge_idx;
        if (!heap_push(&heap, next_state, candidate_cost)) {
          heap_free(&heap);
          free(dist);
          free(prev_state);
          free(prev_edge);
          free(settled);
          free(target_node_mask);
          free(start_node_ids);
          free_graph_adj(&adj);
          return false;
        }
      }
    }
  }

  if (best_target_state < 0 || !isfinite(best_target_cost)) {
    for (int node_idx = 0; node_idx < node_count; node_idx++) {
      if (!target_node_mask[node_idx]) {
        continue;
      }
      int state_idx = node_idx * mask_count + (int)all_required_mask;
      if (state_idx < 0 || state_idx >= state_count) {
        continue;
      }
      if (dist[state_idx] < best_target_cost) {
        best_target_cost = dist[state_idx];
        best_target_state = state_idx;
      }
    }
  }

  int *route_rev = NULL;
  int route_rev_count = 0;
  int route_rev_cap = 0;

  if (best_target_state >= 0 && isfinite(best_target_cost)) {
    int cursor_state = best_target_state;
    while (cursor_state >= 0 && cursor_state < state_count) {
      int edge_idx = prev_edge[cursor_state];
      if (edge_idx < 0) {
        break;
      }

      if (!ensure_capacity((void **)&route_rev, &route_rev_cap, route_rev_count, sizeof(int))) {
        free(route_rev);
        heap_free(&heap);
        free(dist);
        free(prev_state);
        free(prev_edge);
        free(settled);
        free(target_node_mask);
        free(start_node_ids);
        free_graph_adj(&adj);
        return false;
      }
      route_rev[route_rev_count++] = edge_idx;
      cursor_state = prev_state[cursor_state];
    }
  }

  if (route_rev_count > 0) {
    // Reverse backtracking result to forward edge order.
    int *route_fwd = (int *)malloc((size_t)route_rev_count * sizeof(int));
    if (!route_fwd) {
      free(route_rev);
      heap_free(&heap);
      free(dist);
      free(prev_state);
      free(prev_edge);
      free(settled);
      free(target_node_mask);
      free(start_node_ids);
      free_graph_adj(&adj);
      return false;
    }

    for (int i = 0; i < route_rev_count; i++) {
      route_fwd[i] = route_rev[route_rev_count - 1 - i];
    }
    *route_edge_indices_out = route_fwd;
    *route_edge_count_out = route_rev_count;
    *route_total_cost_out = best_target_cost;
  }

  free(route_rev);
  heap_free(&heap);
  free(dist);
  free(prev_state);
  free(prev_edge);
  free(settled);
  free(target_node_mask);
  free(start_node_ids);
  free_graph_adj(&adj);

  return true;
}

// Keep only nodes/edges that lie on at least one start -> target path.
bool compute_keep_reachable(int start_ship_id, int target_ship_id) {
  int node_count = g_ctx.node_count;
  int edge_count = g_ctx.edge_count;

  if (node_count <= 0 || edge_count <= 0) {
    return true;
  }

  unsigned char *start_mask = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  unsigned char *target_mask = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  unsigned char *reachable_from_start = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  unsigned char *can_reach_target = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));

  if (!start_mask || !target_mask || !reachable_from_start || !can_reach_target) {
    free(start_mask);
    free(target_mask);
    free(reachable_from_start);
    free(can_reach_target);
    return false;
  }

  int start_count = 0;
  int target_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (g_ctx.nodes[i].ship_id == start_ship_id) {
      start_mask[i] = 1;
      start_count++;
    }
    if (g_ctx.nodes[i].ship_id == target_ship_id) {
      target_mask[i] = 1;
      target_count++;
    }
  }

  if (start_count == 0 || target_count == 0) {
    free(start_mask);
    free(target_mask);
    free(reachable_from_start);
    free(can_reach_target);
    return true;
  }

  GraphAdj adj = {0};
  if (!build_graph_adj(NULL, &adj)) {
    free(start_mask);
    free(target_mask);
    free(reachable_from_start);
    free(can_reach_target);
    free_graph_adj(&adj);
    return false;
  }

  bool ok_forward = mark_reachable_forward(&adj, start_mask, reachable_from_start);
  bool ok_backward = mark_reachable_backward(&adj, target_mask, can_reach_target);

  if (!ok_forward || !ok_backward) {
    free(start_mask);
    free(target_mask);
    free(reachable_from_start);
    free(can_reach_target);
    free_graph_adj(&adj);
    return false;
  }

  int kept_node_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (reachable_from_start[i] && can_reach_target[i]) {
      g_ctx.node_keep[i] = 1;
      kept_node_count++;
    }
  }

  int kept_edge_count = 0;
  for (int i = 0; i < edge_count; i++) {
    if (!edge_is_active(i)) {
      continue;
    }
    int source_idx = g_ctx.edges[i].source_idx;
    int target_idx = g_ctx.edges[i].target_idx;

    if (source_idx < 0 || source_idx >= node_count || target_idx < 0 || target_idx >= node_count) {
      continue;
    }

    if (g_ctx.node_keep[source_idx] && g_ctx.node_keep[target_idx]) {
      g_ctx.edge_keep[i] = 1;
      kept_edge_count++;
    }
  }

  if (kept_edge_count == 0 || kept_node_count == 0) {
    memset(g_ctx.node_keep, 0, (size_t)node_count * sizeof(unsigned char));
    memset(g_ctx.edge_keep, 0, (size_t)edge_count * sizeof(unsigned char));

    free(start_mask);
    free(target_mask);
    free(reachable_from_start);
    free(can_reach_target);
    free_graph_adj(&adj);
    return true;
  }

  bool normalized = normalize_layout_by_depth(start_ship_id);

  free(start_mask);
  free(target_mask);
  free(reachable_from_start);
  free(can_reach_target);
  free_graph_adj(&adj);
  return normalized;
}

// Heuristic subgraph builder for SAVING mode.
// Steps: rough shortest-cost estimates -> candidate selection -> pruning -> connectivity cleanup.
bool compute_keep_saving(int start_ship_id, int target_ship_id, double direct_upgrade_cost) {
  int node_count = g_ctx.node_count;
  int edge_count = g_ctx.edge_count;

  if (node_count <= 0 || edge_count <= 0) {
    return true;
  }

  unsigned char *start_mask = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  unsigned char *target_mask = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  if (!start_mask || !target_mask) {
    free(start_mask);
    free(target_mask);
    return false;
  }

  int start_count = 0;
  int target_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (g_ctx.nodes[i].ship_id == start_ship_id) {
      start_mask[i] = 1;
      start_count++;
    }
    if (g_ctx.nodes[i].ship_id == target_ship_id) {
      target_mask[i] = 1;
      target_count++;
    }
  }

  if (start_count == 0 || target_count == 0) {
    free(start_mask);
    free(target_mask);
    return true;
  }

  GraphAdj adj_all = {0};
  if (!build_graph_adj(NULL, &adj_all)) {
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  int *topo_nodes = (int *)malloc((size_t)node_count * sizeof(int));
  double *dist_from_start = (double *)malloc((size_t)node_count * sizeof(double));
  double *dist_to_target = (double *)malloc((size_t)node_count * sizeof(double));
  int *best_prev_edge = (int *)malloc((size_t)node_count * sizeof(int));
  if (!topo_nodes || !dist_from_start || !dist_to_target || !best_prev_edge) {
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  for (int i = 0; i < node_count; i++) {
    topo_nodes[i] = i;
    dist_from_start[i] = INFINITY;
    dist_to_target[i] = INFINITY;
    best_prev_edge[i] = -1;
  }

  g_node_sort_nodes = g_ctx.nodes;
  // Use (x, y) ordering as a stable processing order for relaxation passes.
  qsort(topo_nodes, (size_t)node_count, sizeof(int), compare_node_xy);

  for (int i = 0; i < node_count; i++) {
    if (start_mask[i]) {
      dist_from_start[i] = 0.0;
    }
  }

  for (int order = 0; order < node_count; order++) {
    int node_idx = topo_nodes[order];
    double current_cost = dist_from_start[node_idx];
    if (!isfinite(current_cost)) {
      continue;
    }

    int begin = adj_all.out_offsets[node_idx];
    int end = adj_all.out_offsets[node_idx + 1];

    for (int i = begin; i < end; i++) {
      int edge_idx = adj_all.out_edge_indices[i];
      PbEdge edge = g_ctx.edges[edge_idx];
      double edge_cost = edge.actual_cost;
      if (!isfinite(edge_cost) || edge_cost < 0.0) {
        continue;
      }

      double next_cost = current_cost + edge_cost;
      if (next_cost < dist_from_start[edge.target_idx] - 1e-6) {
        dist_from_start[edge.target_idx] = next_cost;
        best_prev_edge[edge.target_idx] = edge_idx;
      }
    }
  }

  for (int i = 0; i < node_count; i++) {
    if (target_mask[i]) {
      dist_to_target[i] = 0.0;
    }
  }

  for (int order = node_count - 1; order >= 0; order--) {
    int node_idx = topo_nodes[order];
    int begin = adj_all.out_offsets[node_idx];
    int end = adj_all.out_offsets[node_idx + 1];

    for (int i = begin; i < end; i++) {
      int edge_idx = adj_all.out_edge_indices[i];
      PbEdge edge = g_ctx.edges[edge_idx];
      double edge_cost = edge.actual_cost;
      double tail_cost = dist_to_target[edge.target_idx];
      if (!isfinite(edge_cost) || edge_cost < 0.0 || !isfinite(tail_cost)) {
        continue;
      }

      double candidate = edge_cost + tail_cost;
      if (candidate < dist_to_target[node_idx]) {
        dist_to_target[node_idx] = candidate;
      }
    }
  }

  TargetCost *target_costs = (TargetCost *)malloc((size_t)target_count * sizeof(TargetCost));
  if (!target_costs) {
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  int target_pos = 0;
  for (int i = 0; i < node_count; i++) {
    if (!target_mask[i]) {
      continue;
    }

    target_costs[target_pos].idx = i;
    target_costs[target_pos].cost = dist_from_start[i];
    target_pos++;
  }

  qsort(target_costs, (size_t)target_pos, sizeof(TargetCost), compare_target_cost);

  int best_target_idx = -1;
  double best_target_cost = INFINITY;
  if (target_pos > 0) {
    best_target_idx = target_costs[0].idx;
    best_target_cost = target_costs[0].cost;
  }

  if (!isfinite(best_target_cost) || best_target_cost >= direct_upgrade_cost || best_target_idx < 0) {
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return true;
  }

  unsigned char *mandatory_edge = (unsigned char *)calloc((size_t)edge_count, sizeof(unsigned char));
  unsigned char *visited_backtrack_nodes = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  if (!mandatory_edge || !visited_backtrack_nodes) {
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  int cursor = best_target_idx;
  // Backtrack one low-cost route; these edges are always retained.
  while (cursor >= 0 && cursor < node_count && !start_mask[cursor] && !visited_backtrack_nodes[cursor]) {
    visited_backtrack_nodes[cursor] = 1;
    int prev_edge = best_prev_edge[cursor];
    if (prev_edge < 0 || prev_edge >= edge_count) {
      break;
    }

    mandatory_edge[prev_edge] = 1;
    cursor = g_ctx.edges[prev_edge].source_idx;
  }

  double *edge_score = (double *)malloc((size_t)edge_count * sizeof(double));
  double *edge_savings = (double *)malloc((size_t)edge_count * sizeof(double));
  unsigned char *candidate_edge = (unsigned char *)calloc((size_t)edge_count, sizeof(unsigned char));
  if (!edge_score || !edge_savings || !candidate_edge) {
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  int candidate_count = 0;
  // Score each edge by a lower bound through it, then gate into candidate pool.
  for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
    if (!edge_is_active(edge_idx)) {
      edge_score[edge_idx] = INFINITY;
      edge_savings[edge_idx] = 0.0;
      continue;
    }
    PbEdge edge = g_ctx.edges[edge_idx];

    double source_cost = dist_from_start[edge.source_idx];
    double target_remain_cost = dist_to_target[edge.target_idx];
    double edge_cost = edge.actual_cost;

    if (!isfinite(source_cost) || !isfinite(target_remain_cost) || !isfinite(edge_cost) || edge_cost < 0.0) {
      edge_score[edge_idx] = INFINITY;
      edge_savings[edge_idx] = 0.0;
      continue;
    }

    double lower_bound = source_cost + edge_cost + target_remain_cost;
    double savings = edge.official_cost - edge.actual_cost;

    edge_score[edge_idx] = lower_bound;
    edge_savings[edge_idx] = savings;

    if (mandatory_edge[edge_idx]) {
      candidate_edge[edge_idx] = 1;
      candidate_count++;
      continue;
    }

    if (start_mask[edge.source_idx] && target_mask[edge.target_idx] && savings <= 1e-6) {
      continue;
    }

    double exploration_slack = fmax(1.0, fmin(8.0, best_target_cost * 0.12));
    double relaxed_bound = fmin(direct_upgrade_cost, best_target_cost + exploration_slack);

    if (savings <= 1e-6) {
      double no_saving_bound = fmin(direct_upgrade_cost, best_target_cost + fmin(2.0, exploration_slack * 0.5));
      if (lower_bound < no_saving_bound) {
        candidate_edge[edge_idx] = 1;
        candidate_count++;
      }
      continue;
    }

    if (lower_bound < relaxed_bound) {
      candidate_edge[edge_idx] = 1;
      candidate_count++;
    }
  }

  if (candidate_count == 0) {
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return true;
  }

  const int max_edges_per_source = node_count > 220 ? 1 : 2;
  const int max_no_saving_per_source = 1;
  const int max_total_edges = node_count > 300 ? 180 : 260;
  const int max_no_saving_edges_total = (int)fmax(20.0, floor((double)max_total_edges * 0.16));

  unsigned char *selected_edge = (unsigned char *)calloc((size_t)edge_count, sizeof(unsigned char));
  int *source_edge_buffer = (int *)malloc((size_t)candidate_count * sizeof(int));
  if (!selected_edge || !source_edge_buffer) {
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  g_edge_sort_scores = edge_score;
  g_edge_sort_savings = edge_savings;
  g_edge_sort_edges = g_ctx.edges;

  int selected_count = 0;
  // Per-source quota: keep mandatory edges first, then best saving/no-saving options.
  for (int source_node = 0; source_node < node_count; source_node++) {
    int source_edge_count = 0;
    int begin = adj_all.out_offsets[source_node];
    int end = adj_all.out_offsets[source_node + 1];
    for (int cursor_idx = begin; cursor_idx < end; cursor_idx++) {
      int edge_idx = adj_all.out_edge_indices[cursor_idx];
      if (!candidate_edge[edge_idx]) {
        continue;
      }
      source_edge_buffer[source_edge_count++] = edge_idx;
    }

    if (source_edge_count == 0) {
      continue;
    }

    qsort(source_edge_buffer, (size_t)source_edge_count, sizeof(int), compare_edges_for_source);

    int mandatory_in_source = 0;
    for (int i = 0; i < source_edge_count; i++) {
      int edge_idx = source_edge_buffer[i];
      if (mandatory_edge[edge_idx] && !selected_edge[edge_idx]) {
        selected_edge[edge_idx] = 1;
        selected_count++;
        mandatory_in_source++;
      }
    }

    int slots_left = max_edges_per_source - mandatory_in_source;
    if (slots_left < 0) {
      slots_left = 0;
    }

    for (int i = 0; i < source_edge_count && slots_left > 0; i++) {
      int edge_idx = source_edge_buffer[i];
      if (selected_edge[edge_idx]) {
        continue;
      }

      if (edge_savings[edge_idx] > 1e-6) {
        selected_edge[edge_idx] = 1;
        selected_count++;
        slots_left--;
      }
    }

    int no_saving_slots = max_no_saving_per_source;
    if (no_saving_slots > slots_left) {
      no_saving_slots = slots_left;
    }

    for (int i = 0; i < source_edge_count && no_saving_slots > 0; i++) {
      int edge_idx = source_edge_buffer[i];
      if (selected_edge[edge_idx]) {
        continue;
      }

      if (edge_savings[edge_idx] <= 1e-6) {
        selected_edge[edge_idx] = 1;
        selected_count++;
        no_saving_slots--;
      }
    }
  }

  if (selected_count > max_total_edges) {
    // Enforce global cap while preserving mandatory edges.
    int *mandatory_list = (int *)malloc((size_t)selected_count * sizeof(int));
    int *non_mandatory_list = (int *)malloc((size_t)selected_count * sizeof(int));
    if (!mandatory_list || !non_mandatory_list) {
      free(mandatory_list);
      free(non_mandatory_list);
      free(selected_edge);
      free(source_edge_buffer);
      free(edge_score);
      free(edge_savings);
      free(candidate_edge);
      free(mandatory_edge);
      free(visited_backtrack_nodes);
      free(target_costs);
      free(topo_nodes);
      free(dist_from_start);
      free(dist_to_target);
      free(best_prev_edge);
      free(start_mask);
      free(target_mask);
      free_graph_adj(&adj_all);
      return false;
    }

    int mandatory_count = 0;
    int non_mandatory_count = 0;
    for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
      if (!selected_edge[edge_idx]) {
        continue;
      }
      if (mandatory_edge[edge_idx]) {
        mandatory_list[mandatory_count++] = edge_idx;
      } else {
        non_mandatory_list[non_mandatory_count++] = edge_idx;
      }
    }

    qsort(non_mandatory_list, (size_t)non_mandatory_count, sizeof(int), compare_edges_global);

    memset(selected_edge, 0, (size_t)edge_count * sizeof(unsigned char));
    selected_count = 0;

    for (int i = 0; i < mandatory_count; i++) {
      int edge_idx = mandatory_list[i];
      selected_edge[edge_idx] = 1;
      selected_count++;
    }

    int slots_left = max_total_edges - selected_count;
    if (slots_left < 0) {
      slots_left = 0;
    }

    int keep_count = non_mandatory_count < slots_left ? non_mandatory_count : slots_left;
    for (int i = 0; i < keep_count; i++) {
      int edge_idx = non_mandatory_list[i];
      selected_edge[edge_idx] = 1;
      selected_count++;
    }

    free(mandatory_list);
    free(non_mandatory_list);
  }

  int no_saving_selected_count = 0;
  for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
    if (!selected_edge[edge_idx]) {
      continue;
    }
    if (mandatory_edge[edge_idx]) {
      continue;
    }
    if (edge_savings[edge_idx] <= 1e-6) {
      no_saving_selected_count++;
    }
  }

  if (no_saving_selected_count > max_no_saving_edges_total) {
    // Trim excessive no-saving edges by score.
    int *no_saving_list = (int *)malloc((size_t)no_saving_selected_count * sizeof(int));
    if (!no_saving_list) {
      free(selected_edge);
      free(source_edge_buffer);
      free(edge_score);
      free(edge_savings);
      free(candidate_edge);
      free(mandatory_edge);
      free(visited_backtrack_nodes);
      free(target_costs);
      free(topo_nodes);
      free(dist_from_start);
      free(dist_to_target);
      free(best_prev_edge);
      free(start_mask);
      free(target_mask);
      free_graph_adj(&adj_all);
      return false;
    }

    int pos = 0;
    for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
      if (!selected_edge[edge_idx] || mandatory_edge[edge_idx]) {
        continue;
      }
      if (edge_savings[edge_idx] <= 1e-6) {
        no_saving_list[pos++] = edge_idx;
      }
    }

    qsort(no_saving_list, (size_t)pos, sizeof(int), compare_edges_by_score_only);

    for (int i = max_no_saving_edges_total; i < pos; i++) {
      selected_edge[no_saving_list[i]] = 0;
    }

    free(no_saving_list);
  }

  unsigned char *pre_kept_edge = (unsigned char *)calloc((size_t)edge_count, sizeof(unsigned char));
  if (!pre_kept_edge) {
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return false;
  }

  int pre_kept_edge_count = 0;
  for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
    if (candidate_edge[edge_idx] && selected_edge[edge_idx]) {
      pre_kept_edge[edge_idx] = 1;
      pre_kept_edge_count++;
    }
  }

  if (pre_kept_edge_count == 0) {
    free(pre_kept_edge);
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    return true;
  }

  GraphAdj adj_kept = {0};
  if (!build_graph_adj(pre_kept_edge, &adj_kept)) {
    free(pre_kept_edge);
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    free_graph_adj(&adj_kept);
    return false;
  }

  unsigned char *reachable_from_start = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  unsigned char *can_reach_target = (unsigned char *)calloc((size_t)node_count, sizeof(unsigned char));
  if (!reachable_from_start || !can_reach_target) {
    free(reachable_from_start);
    free(can_reach_target);
    free(pre_kept_edge);
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    free_graph_adj(&adj_kept);
    return false;
  }

  bool ok_forward = mark_reachable_forward(&adj_kept, start_mask, reachable_from_start);
  bool ok_backward = mark_reachable_backward(&adj_kept, target_mask, can_reach_target);
  if (!ok_forward || !ok_backward) {
    free(reachable_from_start);
    free(can_reach_target);
    free(pre_kept_edge);
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    free_graph_adj(&adj_kept);
    return false;
  }

  for (int i = 0; i < node_count; i++) {
    if (reachable_from_start[i] && can_reach_target[i]) {
      g_ctx.node_keep[i] = 1;
    }
  }

  int final_edge_count = 0;
  for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
    if (!pre_kept_edge[edge_idx]) {
      continue;
    }

    int source_idx = g_ctx.edges[edge_idx].source_idx;
    int target_idx = g_ctx.edges[edge_idx].target_idx;
    if (source_idx < 0 || source_idx >= node_count || target_idx < 0 || target_idx >= node_count) {
      continue;
    }

    if (g_ctx.node_keep[source_idx] && g_ctx.node_keep[target_idx]) {
      g_ctx.edge_keep[edge_idx] = 1;
      final_edge_count++;
    }
  }

  if (final_edge_count == 0) {
    memset(g_ctx.node_keep, 0, (size_t)node_count * sizeof(unsigned char));
    memset(g_ctx.edge_keep, 0, (size_t)edge_count * sizeof(unsigned char));

    free(reachable_from_start);
    free(can_reach_target);
    free(pre_kept_edge);
    free(selected_edge);
    free(source_edge_buffer);
    free(edge_score);
    free(edge_savings);
    free(candidate_edge);
    free(mandatory_edge);
    free(visited_backtrack_nodes);
    free(target_costs);
    free(topo_nodes);
    free(dist_from_start);
    free(dist_to_target);
    free(best_prev_edge);
    free(start_mask);
    free(target_mask);
    free_graph_adj(&adj_all);
    free_graph_adj(&adj_kept);
    return true;
  }

  bool normalized = normalize_layout_by_depth(start_ship_id);

  free(reachable_from_start);
  free(can_reach_target);
  free(pre_kept_edge);
  free(selected_edge);
  free(source_edge_buffer);
  free(edge_score);
  free(edge_savings);
  free(candidate_edge);
  free(mandatory_edge);
  free(visited_backtrack_nodes);
  free(target_costs);
  free(topo_nodes);
  free(dist_from_start);
  free(dist_to_target);
  free(best_prev_edge);
  free(start_mask);
  free(target_mask);
  free_graph_adj(&adj_all);
  free_graph_adj(&adj_kept);

  return normalized;
}
