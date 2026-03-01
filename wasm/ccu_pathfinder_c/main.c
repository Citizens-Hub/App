#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <math.h>
#include <stdbool.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  char *id;
  char *ship_id;
} WasmNode;

typedef struct {
  int source_node_idx;
  int target_node_idx;
  char *source_ship_id;
  double usd_price;
  double tp_price;
  bool is_used_up;
  bool allow_used_up_edge;
} WasmEdge;

typedef struct {
  int node_idx;
  double usd_cost;
  double tp_cost;
} WasmStart;

typedef struct {
  int *node_indices;
  int length;
} FoundPath;

typedef struct {
  int expanded;
  int pruned;
  int returned;
} SearchStats;

typedef struct {
  WasmNode *nodes;
  int node_count;
  int node_cap;

  WasmEdge *edges;
  int edge_count;
  int edge_cap;

  WasmStart *starts;
  int start_count;
  int start_cap;

  char *end_ship_id;
  double exchange_rate;
  double concierge_value;
  bool prune_opt;

  double *best_cost_by_node;
  bool *has_best_cost_by_node;

  FoundPath *paths;
  int path_count;
  int path_cap;

  SearchStats stats;
} PathFinderContext;

typedef struct {
  char *data;
  size_t len;
  size_t cap;
} StrBuilder;

static PathFinderContext g_ctx = {0};

static char *x_strdup(const char *value) {
  if (!value) {
    return NULL;
  }
  const size_t len = strlen(value);
  char *result = (char *)malloc(len + 1);
  if (!result) {
    return NULL;
  }
  memcpy(result, value, len + 1);
  return result;
}

static bool ensure_capacity(void **buffer, int *cap, int count, size_t elem_size) {
  if (count < *cap) {
    return true;
  }

  int next_cap = (*cap == 0) ? 16 : (*cap * 2);
  while (next_cap <= count) {
    next_cap *= 2;
  }

  void *next = realloc(*buffer, (size_t)next_cap * elem_size);
  if (!next) {
    return false;
  }

  *buffer = next;
  *cap = next_cap;
  return true;
}

static void sb_init(StrBuilder *sb) {
  sb->cap = 256;
  sb->len = 0;
  sb->data = (char *)malloc(sb->cap);
  if (sb->data) {
    sb->data[0] = '\0';
  }
}

static bool sb_reserve(StrBuilder *sb, size_t extra) {
  if (!sb->data) {
    return false;
  }

  const size_t needed = sb->len + extra + 1;
  if (needed <= sb->cap) {
    return true;
  }

  size_t next_cap = sb->cap;
  while (next_cap < needed) {
    next_cap *= 2;
  }

  char *next = (char *)realloc(sb->data, next_cap);
  if (!next) {
    return false;
  }

  sb->data = next;
  sb->cap = next_cap;
  return true;
}

static bool sb_append(StrBuilder *sb, const char *text) {
  if (!text) {
    return true;
  }
  const size_t text_len = strlen(text);
  if (!sb_reserve(sb, text_len)) {
    return false;
  }
  memcpy(sb->data + sb->len, text, text_len);
  sb->len += text_len;
  sb->data[sb->len] = '\0';
  return true;
}

static bool sb_append_char(StrBuilder *sb, char ch) {
  if (!sb_reserve(sb, 1)) {
    return false;
  }
  sb->data[sb->len++] = ch;
  sb->data[sb->len] = '\0';
  return true;
}

static bool sb_append_format(StrBuilder *sb, const char *fmt, ...) {
  if (!fmt) {
    return true;
  }

  va_list args;
  va_start(args, fmt);
  va_list args_copy;
  va_copy(args_copy, args);
  const int needed = vsnprintf(NULL, 0, fmt, args_copy);
  va_end(args_copy);

  if (needed < 0) {
    va_end(args);
    return false;
  }

  if (!sb_reserve(sb, (size_t)needed)) {
    va_end(args);
    return false;
  }

  vsnprintf(sb->data + sb->len, sb->cap - sb->len, fmt, args);
  va_end(args);
  sb->len += (size_t)needed;
  return true;
}

static bool sb_append_json_string(StrBuilder *sb, const char *value) {
  if (!sb_append_char(sb, '"')) {
    return false;
  }

  if (value) {
    const unsigned char *ptr = (const unsigned char *)value;
    while (*ptr) {
      const unsigned char ch = *ptr;
      if (ch == '"' || ch == '\\') {
        if (!sb_append_char(sb, '\\') || !sb_append_char(sb, (char)ch)) {
          return false;
        }
      } else if (ch <= 0x1F) {
        if (!sb_append_format(sb, "\\u%04x", (unsigned int)ch)) {
          return false;
        }
      } else if (!sb_append_char(sb, (char)ch)) {
        return false;
      }
      ptr++;
    }
  }

  return sb_append_char(sb, '"');
}

static void sb_free(StrBuilder *sb) {
  free(sb->data);
  sb->data = NULL;
  sb->len = 0;
  sb->cap = 0;
}

static int find_node_idx_by_id(const char *node_id) {
  if (!node_id) {
    return -1;
  }
  for (int i = 0; i < g_ctx.node_count; i++) {
    if (strcmp(g_ctx.nodes[i].id, node_id) == 0) {
      return i;
    }
  }
  return -1;
}

static double calculate_total_cost(double usd_price, double tp_price, double exchange_rate, double concierge_value) {
  return usd_price * exchange_rate + tp_price * (1.0 + concierge_value);
}

static void clear_search_state(void) {
  for (int i = 0; i < g_ctx.path_count; i++) {
    free(g_ctx.paths[i].node_indices);
    g_ctx.paths[i].node_indices = NULL;
    g_ctx.paths[i].length = 0;
  }
  g_ctx.path_count = 0;

  free(g_ctx.best_cost_by_node);
  free(g_ctx.has_best_cost_by_node);
  g_ctx.best_cost_by_node = NULL;
  g_ctx.has_best_cost_by_node = NULL;

  g_ctx.stats.expanded = 0;
  g_ctx.stats.pruned = 0;
  g_ctx.stats.returned = 0;
}

static void free_context_data(void) {
  clear_search_state();

  for (int i = 0; i < g_ctx.node_count; i++) {
    free(g_ctx.nodes[i].id);
    free(g_ctx.nodes[i].ship_id);
  }
  free(g_ctx.nodes);
  g_ctx.nodes = NULL;
  g_ctx.node_count = 0;
  g_ctx.node_cap = 0;

  for (int i = 0; i < g_ctx.edge_count; i++) {
    free(g_ctx.edges[i].source_ship_id);
  }
  free(g_ctx.edges);
  g_ctx.edges = NULL;
  g_ctx.edge_count = 0;
  g_ctx.edge_cap = 0;

  free(g_ctx.starts);
  g_ctx.starts = NULL;
  g_ctx.start_count = 0;
  g_ctx.start_cap = 0;

  free(g_ctx.paths);
  g_ctx.paths = NULL;
  g_ctx.path_cap = 0;

  free(g_ctx.end_ship_id);
  g_ctx.end_ship_id = NULL;

  g_ctx.exchange_rate = 1.0;
  g_ctx.concierge_value = 0.0;
  g_ctx.prune_opt = false;
}

static bool append_found_path(const int *path_stack, int path_len) {
  if (!ensure_capacity((void **)&g_ctx.paths, &g_ctx.path_cap, g_ctx.path_count, sizeof(FoundPath))) {
    return false;
  }

  int *indices_copy = (int *)malloc((size_t)path_len * sizeof(int));
  if (!indices_copy) {
    return false;
  }
  memcpy(indices_copy, path_stack, (size_t)path_len * sizeof(int));

  g_ctx.paths[g_ctx.path_count].node_indices = indices_copy;
  g_ctx.paths[g_ctx.path_count].length = path_len;
  g_ctx.path_count++;
  g_ctx.stats.returned++;
  return true;
}

static void dfs_search(int node_idx, bool *visited, int *path_stack, int path_len, double usd_cost, double tp_cost) {
  if (node_idx < 0 || node_idx >= g_ctx.node_count) {
    return;
  }

  if (visited[node_idx]) {
    return;
  }

  visited[node_idx] = true;
  path_stack[path_len] = node_idx;
  path_len++;

  const double total_cost = calculate_total_cost(usd_cost, tp_cost, g_ctx.exchange_rate, g_ctx.concierge_value);
  if (g_ctx.prune_opt && g_ctx.has_best_cost_by_node[node_idx] && total_cost >= g_ctx.best_cost_by_node[node_idx]) {
    g_ctx.stats.pruned++;
    visited[node_idx] = false;
    return;
  }

  g_ctx.best_cost_by_node[node_idx] = total_cost;
  g_ctx.has_best_cost_by_node[node_idx] = true;

  if (strcmp(g_ctx.nodes[node_idx].ship_id, g_ctx.end_ship_id) == 0) {
    (void)append_found_path(path_stack, path_len);
    visited[node_idx] = false;
    return;
  }

  g_ctx.stats.expanded++;
  for (int i = 0; i < g_ctx.edge_count; i++) {
    const WasmEdge *edge = &g_ctx.edges[i];
    if (strcmp(edge->source_ship_id, g_ctx.nodes[node_idx].ship_id) != 0) {
      continue;
    }
    if (edge->is_used_up && !edge->allow_used_up_edge) {
      continue;
    }
    if (edge->target_node_idx < 0 || edge->target_node_idx >= g_ctx.node_count) {
      continue;
    }
    if (visited[edge->target_node_idx]) {
      continue;
    }
    dfs_search(edge->target_node_idx, visited, path_stack, path_len, usd_cost + edge->usd_price, tp_cost + edge->tp_price);
  }

  visited[node_idx] = false;
}

static char *build_response_json(double elapsed_ms) {
  StrBuilder sb;
  sb_init(&sb);
  if (!sb.data) {
    return x_strdup("{\"error\":\"out of memory\"}");
  }

  bool ok = sb_append(&sb, "{\"paths\":[");
  for (int i = 0; ok && i < g_ctx.path_count; i++) {
    if (i > 0) {
      ok = sb_append_char(&sb, ',');
    }
    if (!ok) {
      break;
    }
    ok = sb_append_char(&sb, '[');
    const FoundPath path = g_ctx.paths[i];
    for (int j = 0; ok && j < path.length; j++) {
      if (j > 0) {
        ok = sb_append_char(&sb, ',');
      }
      if (!ok) {
        break;
      }
      const int node_idx = path.node_indices[j];
      if (node_idx < 0 || node_idx >= g_ctx.node_count) {
        ok = sb_append_json_string(&sb, "");
      } else {
        ok = sb_append_json_string(&sb, g_ctx.nodes[node_idx].id);
      }
    }
    if (!ok) {
      break;
    }
    ok = sb_append_char(&sb, ']');
  }

  if (ok) {
    ok = sb_append_format(
        &sb,
        "],\"elapsedMs\":%.6f,\"stats\":{\"expanded\":%d,\"pruned\":%d,\"returned\":%d}}",
        elapsed_ms,
        g_ctx.stats.expanded,
        g_ctx.stats.pruned,
        g_ctx.stats.returned
    );
  }

  char *result = NULL;
  if (ok) {
    result = sb.data;
  } else {
    result = x_strdup("{\"error\":\"failed to build response\"}");
    free(sb.data);
  }
  sb.data = NULL;
  sb_free(&sb);
  return result;
}

EMSCRIPTEN_KEEPALIVE
void ccuReset(void) {
  free_context_data();
}

EMSCRIPTEN_KEEPALIVE
void ccuSetConfig(const char *end_ship_id, double exchange_rate, double concierge_value, int prune_opt) {
  free(g_ctx.end_ship_id);
  g_ctx.end_ship_id = x_strdup(end_ship_id ? end_ship_id : "");

  if (isnan(exchange_rate) || isinf(exchange_rate)) {
    exchange_rate = 1.0;
  }
  if (isnan(concierge_value) || isinf(concierge_value)) {
    concierge_value = 0.0;
  }

  g_ctx.exchange_rate = exchange_rate;
  g_ctx.concierge_value = concierge_value;
  g_ctx.prune_opt = (prune_opt != 0);
}

EMSCRIPTEN_KEEPALIVE
int ccuAddNode(const char *node_id, const char *ship_id) {
  if (!node_id || !ship_id) {
    return 0;
  }
  if (find_node_idx_by_id(node_id) >= 0) {
    return 1;
  }

  if (!ensure_capacity((void **)&g_ctx.nodes, &g_ctx.node_cap, g_ctx.node_count, sizeof(WasmNode))) {
    return 0;
  }

  WasmNode node = {
      .id = x_strdup(node_id),
      .ship_id = x_strdup(ship_id),
  };
  if (!node.id || !node.ship_id) {
    free(node.id);
    free(node.ship_id);
    return 0;
  }

  g_ctx.nodes[g_ctx.node_count] = node;
  g_ctx.node_count++;
  return 1;
}

EMSCRIPTEN_KEEPALIVE
int ccuAddEdge(
    const char *source_node_id,
    const char *source_ship_id,
    const char *target_node_id,
    double usd_price,
    double tp_price,
    int is_used_up,
    int allow_used_up_edge
) {
  if (!source_node_id || !source_ship_id || !target_node_id) {
    return 0;
  }

  const int source_idx = find_node_idx_by_id(source_node_id);
  const int target_idx = find_node_idx_by_id(target_node_id);
  if (source_idx < 0 || target_idx < 0) {
    return 0;
  }

  if (!ensure_capacity((void **)&g_ctx.edges, &g_ctx.edge_cap, g_ctx.edge_count, sizeof(WasmEdge))) {
    return 0;
  }

  WasmEdge edge = {
      .source_node_idx = source_idx,
      .target_node_idx = target_idx,
      .source_ship_id = x_strdup(source_ship_id),
      .usd_price = usd_price,
      .tp_price = tp_price,
      .is_used_up = (is_used_up != 0),
      .allow_used_up_edge = (allow_used_up_edge != 0),
  };
  if (!edge.source_ship_id) {
    return 0;
  }

  g_ctx.edges[g_ctx.edge_count] = edge;
  g_ctx.edge_count++;
  return 1;
}

EMSCRIPTEN_KEEPALIVE
int ccuAddStart(const char *node_id, double usd_cost, double tp_cost) {
  if (!node_id) {
    return 0;
  }

  const int node_idx = find_node_idx_by_id(node_id);
  if (node_idx < 0) {
    return 0;
  }

  if (!ensure_capacity((void **)&g_ctx.starts, &g_ctx.start_cap, g_ctx.start_count, sizeof(WasmStart))) {
    return 0;
  }

  WasmStart start = {
      .node_idx = node_idx,
      .usd_cost = usd_cost,
      .tp_cost = tp_cost,
  };
  g_ctx.starts[g_ctx.start_count] = start;
  g_ctx.start_count++;
  return 1;
}

EMSCRIPTEN_KEEPALIVE
void ccuClearStarts(void) {
  g_ctx.start_count = 0;
}

EMSCRIPTEN_KEEPALIVE
char *ccuFindAllPathsC(void) {
  clear_search_state();

  const double started_at = emscripten_get_now();
  if (g_ctx.node_count > 0 && g_ctx.start_count > 0 && g_ctx.end_ship_id && g_ctx.end_ship_id[0] != '\0') {
    g_ctx.best_cost_by_node = (double *)calloc((size_t)g_ctx.node_count, sizeof(double));
    g_ctx.has_best_cost_by_node = (bool *)calloc((size_t)g_ctx.node_count, sizeof(bool));
    bool *visited = (bool *)calloc((size_t)g_ctx.node_count, sizeof(bool));
    int *path_stack = (int *)malloc((size_t)g_ctx.node_count * sizeof(int));

    if (!g_ctx.best_cost_by_node || !g_ctx.has_best_cost_by_node || !visited || !path_stack) {
      free(g_ctx.best_cost_by_node);
      free(g_ctx.has_best_cost_by_node);
      free(visited);
      free(path_stack);
      g_ctx.best_cost_by_node = NULL;
      g_ctx.has_best_cost_by_node = NULL;
      return x_strdup("{\"error\":\"out of memory\"}");
    }

    for (int i = 0; i < g_ctx.start_count; i++) {
      const WasmStart start = g_ctx.starts[i];
      if (start.node_idx < 0 || start.node_idx >= g_ctx.node_count) {
        continue;
      }
      dfs_search(start.node_idx, visited, path_stack, 0, start.usd_cost, start.tp_cost);
    }

    free(visited);
    free(path_stack);
  }

  const double elapsed_ms = emscripten_get_now() - started_at;
  return build_response_json(elapsed_ms);
}

EMSCRIPTEN_KEEPALIVE
void ccuFreeCString(char *ptr) {
  free(ptr);
}
