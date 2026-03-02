#include "pathbuilder_internal.h"

#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

// Public WASM API surface: data loading, mode dispatch, and JSON responses.
// Build standard node/edge mask response used by REACHABLE and SAVING modes.
static char *build_success_response(double elapsed_ms) {
  StrBuilder sb;
  sb_init(&sb);

  if (!sb.data) {
    return x_strdup("{\"error\":\"failed to allocate response buffer\"}");
  }

  bool ok = true;
  ok = ok && sb_append(&sb, "{\"nodeMask\":[");

  for (int i = 0; ok && i < g_ctx.node_count; i++) {
    if (i > 0) {
      ok = ok && sb_append(&sb, ",");
    }
    ok = ok && sb_append_int(&sb, g_ctx.node_keep ? (g_ctx.node_keep[i] ? 1 : 0) : 0);
  }

  ok = ok && sb_append(&sb, "],\"edgeMask\":[");
  for (int i = 0; ok && i < g_ctx.edge_count; i++) {
    if (i > 0) {
      ok = ok && sb_append(&sb, ",");
    }
    ok = ok && sb_append_int(&sb, g_ctx.edge_keep ? (g_ctx.edge_keep[i] ? 1 : 0) : 0);
  }

  ok = ok && sb_append(&sb, "],\"x\":[");
  for (int i = 0; ok && i < g_ctx.node_count; i++) {
    if (i > 0) {
      ok = ok && sb_append(&sb, ",");
    }
    double x = g_ctx.layout_x ? g_ctx.layout_x[i] : 0.0;
    ok = ok && sb_append_double(&sb, x);
  }

  ok = ok && sb_append(&sb, "],\"y\":[");
  for (int i = 0; ok && i < g_ctx.node_count; i++) {
    if (i > 0) {
      ok = ok && sb_append(&sb, ",");
    }
    double y = g_ctx.layout_y ? g_ctx.layout_y[i] : 0.0;
    ok = ok && sb_append_double(&sb, y);
  }

  ok = ok && sb_append(&sb, "],\"elapsedMs\":");
  ok = ok && sb_append_double(&sb, elapsed_ms);
  ok = ok && sb_append(&sb, "}");

  if (!ok) {
    sb_free(&sb);
    return x_strdup("{\"error\":\"failed to build JSON response\"}");
  }

  return sb.data;
}

static char *build_review_response(
  const int *route_edge_indices,
  int route_edge_count,
  double route_total_cost,
  double elapsed_ms
) {
  StrBuilder sb;
  sb_init(&sb);

  if (!sb.data) {
    return x_strdup("{\"error\":\"failed to allocate review response buffer\"}");
  }

  bool ok = true;
  ok = ok && sb_append(&sb, "{\"routeEdgeIndices\":[");

  for (int i = 0; ok && i < route_edge_count; i++) {
    if (i > 0) {
      ok = ok && sb_append(&sb, ",");
    }
    int edge_idx = route_edge_indices ? route_edge_indices[i] : -1;
    ok = ok && sb_append_int(&sb, edge_idx);
  }

  ok = ok && sb_append(&sb, "],\"totalCost\":");
  ok = ok && sb_append_double(&sb, route_total_cost);
  ok = ok && sb_append(&sb, ",\"elapsedMs\":");
  ok = ok && sb_append_double(&sb, elapsed_ms);
  ok = ok && sb_append(&sb, "}");

  if (!ok) {
    sb_free(&sb);
    return x_strdup("{\"error\":\"failed to build review JSON response\"}");
  }

  return sb.data;
}

// Build a compact JSON error object; message content is escaped for safety.
static char *build_error_response(const char *message) {
  if (!message) {
    message = "unknown error";
  }

  StrBuilder sb;
  sb_init(&sb);
  if (!sb.data) {
    return x_strdup("{\"error\":\"failed to allocate error response\"}");
  }

  bool ok = true;
  ok = ok && sb_append(&sb, "{\"error\":\"");

  for (const char *p = message; ok && *p; p++) {
    if (*p == '\\' || *p == '"') {
      ok = ok && sb_append(&sb, "\\");
    }
    char buf[2] = {*p, '\0'};
    ok = ok && sb_append(&sb, buf);
  }

  ok = ok && sb_append(&sb, "\"}");

  if (!ok) {
    sb_free(&sb);
    return x_strdup("{\"error\":\"failed to build escaped error response\"}");
  }

  return sb.data;
}

EMSCRIPTEN_KEEPALIVE
void pbReset(void) {
  free_context_data();
}

EMSCRIPTEN_KEEPALIVE
int pbAddNode(const char *node_id, int ship_id, double x, double y, double msrp) {
  if (!node_id) {
    return -1;
  }

  if (!ensure_capacity((void **)&g_ctx.nodes, &g_ctx.node_cap, g_ctx.node_count, sizeof(PbNode))) {
    return -1;
  }

  PbNode *node = &g_ctx.nodes[g_ctx.node_count];
  node->id = x_strdup(node_id);
  if (!node->id) {
    return -1;
  }

  node->ship_id = ship_id;
  node->x = x;
  node->y = y;
  node->msrp = msrp;

  g_ctx.node_count++;
  return g_ctx.node_count - 1;
}

EMSCRIPTEN_KEEPALIVE
int pbAddNodeBatch(
  const unsigned char *ship_ids_bytes,
  const unsigned char *x_bytes,
  const unsigned char *y_bytes,
  const unsigned char *msrp_bytes,
  int count
) {
  if (count < 0) {
    return -1;
  }

  if (count == 0) {
    return g_ctx.node_count;
  }

  if (!ship_ids_bytes || !x_bytes || !y_bytes || !msrp_bytes) {
    return -1;
  }

  if (!ensure_capacity(
        (void **)&g_ctx.nodes,
        &g_ctx.node_cap,
        g_ctx.node_count + count - 1,
        sizeof(PbNode))) {
    return -1;
  }

  int start_index = g_ctx.node_count;
  for (int i = 0; i < count; i++) {
    PbNode *node = &g_ctx.nodes[start_index + i];
    node->id = NULL;
    node->ship_id = read_i32_at(ship_ids_bytes, i);
    node->x = read_f64_at(x_bytes, i);
    node->y = read_f64_at(y_bytes, i);
    node->msrp = read_f64_at(msrp_bytes, i);
  }

  g_ctx.node_count += count;
  return start_index;
}

EMSCRIPTEN_KEEPALIVE
int pbAddEdgeByIndex(int source_idx, int target_idx, double actual_cost, double official_cost) {
  if (source_idx < 0 || source_idx >= g_ctx.node_count || target_idx < 0 || target_idx >= g_ctx.node_count) {
    return -1;
  }

  if (!ensure_capacity((void **)&g_ctx.edges, &g_ctx.edge_cap, g_ctx.edge_count, sizeof(PbEdge))) {
    return -1;
  }

  PbEdge *edge = &g_ctx.edges[g_ctx.edge_count];
  edge->source_idx = source_idx;
  edge->target_idx = target_idx;
  edge->actual_cost = actual_cost;
  edge->official_cost = official_cost;
  edge->review_required_bit = 0;

  g_ctx.edge_count++;
  return g_ctx.edge_count - 1;
}

EMSCRIPTEN_KEEPALIVE
int pbAddEdgeBatch(
  const unsigned char *source_idx_bytes,
  const unsigned char *target_idx_bytes,
  const unsigned char *actual_cost_bytes,
  const unsigned char *official_cost_bytes,
  int count
) {
  if (count < 0) {
    return -1;
  }

  if (count == 0) {
    return g_ctx.edge_count;
  }

  if (!source_idx_bytes || !target_idx_bytes || !actual_cost_bytes || !official_cost_bytes) {
    return -1;
  }

  for (int i = 0; i < count; i++) {
    int source_idx = read_i32_at(source_idx_bytes, i);
    int target_idx = read_i32_at(target_idx_bytes, i);
    if (source_idx < 0 || source_idx >= g_ctx.node_count || target_idx < 0 || target_idx >= g_ctx.node_count) {
      return -1;
    }
  }

  if (!ensure_capacity(
        (void **)&g_ctx.edges,
        &g_ctx.edge_cap,
        g_ctx.edge_count + count - 1,
        sizeof(PbEdge))) {
    return -1;
  }

  int start_index = g_ctx.edge_count;
  for (int i = 0; i < count; i++) {
    PbEdge *edge = &g_ctx.edges[start_index + i];
    edge->source_idx = read_i32_at(source_idx_bytes, i);
    edge->target_idx = read_i32_at(target_idx_bytes, i);
    edge->actual_cost = read_f64_at(actual_cost_bytes, i);
    edge->official_cost = read_f64_at(official_cost_bytes, i);
    edge->review_required_bit = 0;
  }

  g_ctx.edge_count += count;
  return start_index;
}

EMSCRIPTEN_KEEPALIVE
int pbAddEdge(const char *source_node_id, const char *target_node_id, double actual_cost, double official_cost) {
  int source_idx = find_node_idx_by_id(source_node_id);
  int target_idx = find_node_idx_by_id(target_node_id);
  return pbAddEdgeByIndex(source_idx, target_idx, actual_cost, official_cost);
}

EMSCRIPTEN_KEEPALIVE
int pbSetEdgeReviewBitsBatch(const unsigned char *review_bits_bytes, int count) {
  if (count < 0 || count != g_ctx.edge_count) {
    return -1;
  }

  if (count == 0) {
    return 0;
  }

  if (!review_bits_bytes) {
    return -1;
  }

  for (int i = 0; i < count; i++) {
    g_ctx.edges[i].review_required_bit = (uint64_t)read_u32_at(review_bits_bytes, i);
  }

  return count;
}

EMSCRIPTEN_KEEPALIVE
int pbSetEdgeActiveMaskBatch(const unsigned char *edge_active_bytes, int count) {
  if (count < 0 || count != g_ctx.edge_count) {
    return -1;
  }

  free(g_ctx.edge_active);
  g_ctx.edge_active = NULL;

  if (count == 0) {
    return 0;
  }

  if (!edge_active_bytes) {
    return -1;
  }

  g_ctx.edge_active = (unsigned char *)malloc((size_t)count * sizeof(unsigned char));
  if (!g_ctx.edge_active) {
    return -1;
  }

  memcpy(g_ctx.edge_active, edge_active_bytes, (size_t)count * sizeof(unsigned char));
  return count;
}

EMSCRIPTEN_KEEPALIVE
char *pbRun(int mode, int start_ship_id, int target_ship_id, double direct_upgrade_cost) {
  const double start_time = emscripten_get_now();

  if (mode == PB_MODE_REVIEW) {
    // REVIEW mode reuses the 4th numeric argument as required review bit count.
    int required_bit_count = (int)llround(direct_upgrade_cost);
    if (required_bit_count < 0 || fabs(direct_upgrade_cost - (double)required_bit_count) > 1e-6) {
      return build_error_response("invalid review bit count");
    }

    int *route_edge_indices = NULL;
    int route_edge_count = 0;
    double route_total_cost = 0.0;

    bool ok = compute_best_review_route(
      start_ship_id,
      target_ship_id,
      required_bit_count,
      &route_edge_indices,
      &route_edge_count,
      &route_total_cost
    );

    if (!ok) {
      free(route_edge_indices);
      return build_error_response("review pathbuilder computation failed");
    }

    const double elapsed_ms = emscripten_get_now() - start_time;
    char *response = build_review_response(route_edge_indices, route_edge_count, route_total_cost, elapsed_ms);
    free(route_edge_indices);
    return response;
  }

  if (!allocate_result_buffers()) {
    return build_error_response("failed to allocate working buffers");
  }

  bool ok = false;
  if (mode == PB_MODE_REACHABLE) {
    ok = compute_keep_reachable(start_ship_id, target_ship_id);
  } else if (mode == PB_MODE_SAVING) {
    ok = compute_keep_saving(start_ship_id, target_ship_id, direct_upgrade_cost);
  } else {
    return build_error_response("invalid pathbuilder mode");
  }

  if (!ok) {
    return build_error_response("pathbuilder computation failed");
  }

  const double elapsed_ms = emscripten_get_now() - start_time;
  return build_success_response(elapsed_ms);
}

EMSCRIPTEN_KEEPALIVE
void pbFreeCString(char *ptr) {
  free(ptr);
}
