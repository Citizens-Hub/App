#include <emscripten/emscripten.h>
#include <emscripten/html5.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define PB_MODE_REACHABLE 1
#define PB_MODE_SAVING 2
#define PB_MODE_REVIEW 3

typedef struct {
  char *id;
  int ship_id;
  double x;
  double y;
  double msrp;
} PbNode;

typedef struct {
  int source_idx;
  int target_idx;
  double actual_cost;
  double official_cost;
  uint64_t review_required_bit;
} PbEdge;

typedef struct {
  int *out_offsets;
  int *out_edge_indices;
  int *in_offsets;
  int *in_edge_indices;
  int edge_total;
} GraphAdj;

typedef struct {
  PbNode *nodes;
  int node_count;
  int node_cap;

  PbEdge *edges;
  int edge_count;
  int edge_cap;
  unsigned char *edge_active;

  unsigned char *node_keep;
  unsigned char *edge_keep;
  double *layout_x;
  double *layout_y;
} PathBuilderContext;

typedef struct {
  char *data;
  size_t len;
  size_t cap;
} StrBuilder;

typedef struct {
  int idx;
  double cost;
} TargetCost;

typedef struct {
  int state_idx;
  double cost;
} HeapItem;

typedef struct {
  HeapItem *items;
  int len;
  int cap;
} MinHeap;

static PathBuilderContext g_ctx = {0};

static const PbNode *g_node_sort_nodes = NULL;
static const double *g_edge_sort_scores = NULL;
static const double *g_edge_sort_savings = NULL;
static const PbEdge *g_edge_sort_edges = NULL;

static char *x_strdup(const char *value) {
  if (!value) {
    return NULL;
  }

  size_t len = strlen(value);
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

  size_t needed = sb->len + extra + 1;
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

  size_t text_len = strlen(text);
  if (!sb_reserve(sb, text_len)) {
    return false;
  }

  memcpy(sb->data + sb->len, text, text_len);
  sb->len += text_len;
  sb->data[sb->len] = '\0';
  return true;
}

static bool sb_append_int(StrBuilder *sb, int value) {
  char buf[32];
  int written = snprintf(buf, sizeof(buf), "%d", value);
  if (written <= 0) {
    return false;
  }
  return sb_append(sb, buf);
}

static bool sb_append_double(StrBuilder *sb, double value) {
  if (!isfinite(value)) {
    value = 0.0;
  }

  char buf[64];
  int written = snprintf(buf, sizeof(buf), "%.6f", value);
  if (written <= 0) {
    return false;
  }

  return sb_append(sb, buf);
}

static void sb_free(StrBuilder *sb) {
  free(sb->data);
  sb->data = NULL;
  sb->len = 0;
  sb->cap = 0;
}

static void free_graph_adj(GraphAdj *adj) {
  free(adj->out_offsets);
  free(adj->out_edge_indices);
  free(adj->in_offsets);
  free(adj->in_edge_indices);

  adj->out_offsets = NULL;
  adj->out_edge_indices = NULL;
  adj->in_offsets = NULL;
  adj->in_edge_indices = NULL;
  adj->edge_total = 0;
}

static void reset_result_buffers(void) {
  free(g_ctx.node_keep);
  free(g_ctx.edge_keep);
  free(g_ctx.layout_x);
  free(g_ctx.layout_y);

  g_ctx.node_keep = NULL;
  g_ctx.edge_keep = NULL;
  g_ctx.layout_x = NULL;
  g_ctx.layout_y = NULL;
}

static void free_context_data(void) {
  for (int i = 0; i < g_ctx.node_count; i++) {
    free(g_ctx.nodes[i].id);
    g_ctx.nodes[i].id = NULL;
  }

  free(g_ctx.nodes);
  free(g_ctx.edges);
  free(g_ctx.edge_active);

  g_ctx.nodes = NULL;
  g_ctx.edges = NULL;
  g_ctx.edge_active = NULL;
  g_ctx.node_count = 0;
  g_ctx.node_cap = 0;
  g_ctx.edge_count = 0;
  g_ctx.edge_cap = 0;

  reset_result_buffers();
}

static bool allocate_result_buffers(void) {
  reset_result_buffers();

  if (g_ctx.node_count > 0) {
    g_ctx.node_keep = (unsigned char *)calloc((size_t)g_ctx.node_count, sizeof(unsigned char));
    g_ctx.layout_x = (double *)malloc((size_t)g_ctx.node_count * sizeof(double));
    g_ctx.layout_y = (double *)malloc((size_t)g_ctx.node_count * sizeof(double));
    if (!g_ctx.node_keep || !g_ctx.layout_x || !g_ctx.layout_y) {
      return false;
    }

    for (int i = 0; i < g_ctx.node_count; i++) {
      g_ctx.layout_x[i] = g_ctx.nodes[i].x;
      g_ctx.layout_y[i] = g_ctx.nodes[i].y;
    }
  }

  if (g_ctx.edge_count > 0) {
    g_ctx.edge_keep = (unsigned char *)calloc((size_t)g_ctx.edge_count, sizeof(unsigned char));
    if (!g_ctx.edge_keep) {
      return false;
    }
  }

  return true;
}

static int find_node_idx_by_id(const char *node_id) {
  if (!node_id) {
    return -1;
  }

  for (int i = 0; i < g_ctx.node_count; i++) {
    if (g_ctx.nodes[i].id && strcmp(g_ctx.nodes[i].id, node_id) == 0) {
      return i;
    }
  }

  return -1;
}

static int read_i32_at(const unsigned char *bytes, int index) {
  int value = 0;
  if (!bytes || index < 0) {
    return value;
  }
  memcpy(&value, bytes + ((size_t)index * sizeof(int)), sizeof(int));
  return value;
}

static double read_f64_at(const unsigned char *bytes, int index) {
  double value = 0.0;
  if (!bytes || index < 0) {
    return value;
  }
  memcpy(&value, bytes + ((size_t)index * sizeof(double)), sizeof(double));
  return value;
}

static uint32_t read_u32_at(const unsigned char *bytes, int index) {
  uint32_t value = 0;
  if (!bytes || index < 0) {
    return value;
  }
  memcpy(&value, bytes + ((size_t)index * sizeof(uint32_t)), sizeof(uint32_t));
  return value;
}

static bool edge_is_active(int edge_idx) {
  if (edge_idx < 0 || edge_idx >= g_ctx.edge_count) {
    return false;
  }

  if (!g_ctx.edge_active) {
    return true;
  }

  return g_ctx.edge_active[edge_idx] != 0;
}

static bool build_graph_adj(const unsigned char *edge_mask, GraphAdj *adj) {
  memset(adj, 0, sizeof(*adj));

  int node_count = g_ctx.node_count;
  int edge_count = g_ctx.edge_count;

  if (node_count <= 0 || edge_count <= 0) {
    return true;
  }

  adj->out_offsets = (int *)calloc((size_t)node_count + 1, sizeof(int));
  adj->in_offsets = (int *)calloc((size_t)node_count + 1, sizeof(int));
  if (!adj->out_offsets || !adj->in_offsets) {
    return false;
  }

  int included_edges = 0;
  for (int i = 0; i < edge_count; i++) {
    if (!edge_is_active(i)) {
      continue;
    }
    if (edge_mask && edge_mask[i] == 0) {
      continue;
    }

    int source_idx = g_ctx.edges[i].source_idx;
    int target_idx = g_ctx.edges[i].target_idx;
    if (source_idx < 0 || source_idx >= node_count || target_idx < 0 || target_idx >= node_count) {
      continue;
    }

    adj->out_offsets[source_idx + 1] += 1;
    adj->in_offsets[target_idx + 1] += 1;
    included_edges += 1;
  }

  for (int i = 1; i <= node_count; i++) {
    adj->out_offsets[i] += adj->out_offsets[i - 1];
    adj->in_offsets[i] += adj->in_offsets[i - 1];
  }

  adj->out_edge_indices = (int *)malloc((size_t)included_edges * sizeof(int));
  adj->in_edge_indices = (int *)malloc((size_t)included_edges * sizeof(int));
  if ((!adj->out_edge_indices && included_edges > 0) || (!adj->in_edge_indices && included_edges > 0)) {
    return false;
  }

  int *out_cursor = (int *)malloc((size_t)node_count * sizeof(int));
  int *in_cursor = (int *)malloc((size_t)node_count * sizeof(int));
  if ((!out_cursor && node_count > 0) || (!in_cursor && node_count > 0)) {
    free(out_cursor);
    free(in_cursor);
    return false;
  }

  for (int i = 0; i < node_count; i++) {
    out_cursor[i] = adj->out_offsets[i];
    in_cursor[i] = adj->in_offsets[i];
  }

  for (int i = 0; i < edge_count; i++) {
    if (!edge_is_active(i)) {
      continue;
    }
    if (edge_mask && edge_mask[i] == 0) {
      continue;
    }

    int source_idx = g_ctx.edges[i].source_idx;
    int target_idx = g_ctx.edges[i].target_idx;
    if (source_idx < 0 || source_idx >= node_count || target_idx < 0 || target_idx >= node_count) {
      continue;
    }

    int out_pos = out_cursor[source_idx]++;
    int in_pos = in_cursor[target_idx]++;
    adj->out_edge_indices[out_pos] = i;
    adj->in_edge_indices[in_pos] = i;
  }

  free(out_cursor);
  free(in_cursor);
  adj->edge_total = included_edges;
  return true;
}

static bool mark_reachable_forward(const GraphAdj *adj, const unsigned char *start_mask, unsigned char *reachable) {
  int node_count = g_ctx.node_count;
  if (node_count <= 0) {
    return true;
  }

  int *queue = (int *)malloc((size_t)node_count * sizeof(int));
  if (!queue) {
    return false;
  }

  int head = 0;
  int tail = 0;

  for (int i = 0; i < node_count; i++) {
    if (start_mask[i]) {
      reachable[i] = 1;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    int current = queue[head++];
    int begin = adj->out_offsets[current];
    int end = adj->out_offsets[current + 1];

    for (int i = begin; i < end; i++) {
      int edge_idx = adj->out_edge_indices[i];
      int next_node = g_ctx.edges[edge_idx].target_idx;
      if (next_node < 0 || next_node >= node_count) {
        continue;
      }
      if (!reachable[next_node]) {
        reachable[next_node] = 1;
        queue[tail++] = next_node;
      }
    }
  }

  free(queue);
  return true;
}

static bool mark_reachable_backward(const GraphAdj *adj, const unsigned char *target_mask, unsigned char *reachable) {
  int node_count = g_ctx.node_count;
  if (node_count <= 0) {
    return true;
  }

  int *queue = (int *)malloc((size_t)node_count * sizeof(int));
  if (!queue) {
    return false;
  }

  int head = 0;
  int tail = 0;

  for (int i = 0; i < node_count; i++) {
    if (target_mask[i]) {
      reachable[i] = 1;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    int current = queue[head++];
    int begin = adj->in_offsets[current];
    int end = adj->in_offsets[current + 1];

    for (int i = begin; i < end; i++) {
      int edge_idx = adj->in_edge_indices[i];
      int prev_node = g_ctx.edges[edge_idx].source_idx;
      if (prev_node < 0 || prev_node >= node_count) {
        continue;
      }
      if (!reachable[prev_node]) {
        reachable[prev_node] = 1;
        queue[tail++] = prev_node;
      }
    }
  }

  free(queue);
  return true;
}

static int compare_node_xy(const void *left, const void *right) {
  int left_idx = *(const int *)left;
  int right_idx = *(const int *)right;

  double left_x = g_node_sort_nodes[left_idx].x;
  double right_x = g_node_sort_nodes[right_idx].x;
  if (left_x < right_x) {
    return -1;
  }
  if (left_x > right_x) {
    return 1;
  }

  double left_y = g_node_sort_nodes[left_idx].y;
  double right_y = g_node_sort_nodes[right_idx].y;
  if (left_y < right_y) {
    return -1;
  }
  if (left_y > right_y) {
    return 1;
  }

  return left_idx - right_idx;
}

static int compare_int_asc(const void *left, const void *right) {
  int a = *(const int *)left;
  int b = *(const int *)right;
  return (a > b) - (a < b);
}

static int compare_double_asc(const void *left, const void *right) {
  double a = *(const double *)left;
  double b = *(const double *)right;
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

static int compare_node_in_column(const void *left, const void *right) {
  int left_idx = *(const int *)left;
  int right_idx = *(const int *)right;

  double left_msrp = g_node_sort_nodes[left_idx].msrp;
  double right_msrp = g_node_sort_nodes[right_idx].msrp;

  if (left_msrp < right_msrp) {
    return -1;
  }
  if (left_msrp > right_msrp) {
    return 1;
  }

  double left_y = g_node_sort_nodes[left_idx].y;
  double right_y = g_node_sort_nodes[right_idx].y;
  if (left_y < right_y) {
    return -1;
  }
  if (left_y > right_y) {
    return 1;
  }

  return left_idx - right_idx;
}

static int find_fallback_depth(double x, const double *columns, int column_count) {
  for (int i = 0; i < column_count; i++) {
    if (fabs(columns[i] - x) < 1e-6) {
      return i;
    }
  }

  return 0;
}

static bool normalize_layout_by_depth(int start_ship_id) {
  int node_count = g_ctx.node_count;
  int edge_count = g_ctx.edge_count;

  if (node_count <= 0) {
    return true;
  }

  int kept_node_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (g_ctx.node_keep[i]) {
      kept_node_count++;
    }
  }

  if (kept_node_count == 0) {
    return true;
  }

  GraphAdj adj = {0};
  if (!build_graph_adj(g_ctx.edge_keep, &adj)) {
    free_graph_adj(&adj);
    return false;
  }

  int *incoming_count = (int *)calloc((size_t)node_count, sizeof(int));
  int *root_ids = (int *)malloc((size_t)kept_node_count * sizeof(int));
  int *depth = (int *)malloc((size_t)node_count * sizeof(int));
  int *queue = (int *)malloc((size_t)kept_node_count * sizeof(int));
  if (!incoming_count || !root_ids || !depth || !queue) {
    free(incoming_count);
    free(root_ids);
    free(depth);
    free(queue);
    free_graph_adj(&adj);
    return false;
  }

  for (int i = 0; i < node_count; i++) {
    depth[i] = -1;
  }

  for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
    if (!g_ctx.edge_keep[edge_idx]) {
      continue;
    }

    int target_idx = g_ctx.edges[edge_idx].target_idx;
    if (target_idx >= 0 && target_idx < node_count && g_ctx.node_keep[target_idx]) {
      incoming_count[target_idx] += 1;
    }
  }

  int root_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (g_ctx.node_keep[i] && g_ctx.nodes[i].ship_id == start_ship_id) {
      root_ids[root_count++] = i;
    }
  }

  if (root_count == 0) {
    for (int i = 0; i < node_count; i++) {
      if (g_ctx.node_keep[i] && incoming_count[i] == 0) {
        root_ids[root_count++] = i;
      }
    }
  }

  if (root_count == 0) {
    free(incoming_count);
    free(root_ids);
    free(depth);
    free(queue);
    free_graph_adj(&adj);
    return true;
  }

  int head = 0;
  int tail = 0;
  for (int i = 0; i < root_count; i++) {
    int node_idx = root_ids[i];
    depth[node_idx] = 0;
    queue[tail++] = node_idx;
  }

  while (head < tail) {
    int current_idx = queue[head++];
    int current_depth = depth[current_idx] >= 0 ? depth[current_idx] : 0;

    int begin = adj.out_offsets[current_idx];
    int end = adj.out_offsets[current_idx + 1];

    for (int i = begin; i < end; i++) {
      int edge_idx = adj.out_edge_indices[i];
      int target_idx = g_ctx.edges[edge_idx].target_idx;
      if (target_idx < 0 || target_idx >= node_count || !g_ctx.node_keep[target_idx]) {
        continue;
      }

      int next_depth = current_depth + 1;
      int existing_depth = depth[target_idx];
      if (existing_depth < 0 || next_depth < existing_depth) {
        depth[target_idx] = next_depth;
        queue[tail++] = target_idx;
      }
    }
  }

  for (int i = 0; i < kept_node_count; i++) {
    bool changed = false;
    for (int edge_idx = 0; edge_idx < edge_count; edge_idx++) {
      if (!g_ctx.edge_keep[edge_idx]) {
        continue;
      }

      int source_idx = g_ctx.edges[edge_idx].source_idx;
      int target_idx = g_ctx.edges[edge_idx].target_idx;
      if (source_idx < 0 || source_idx >= node_count || target_idx < 0 || target_idx >= node_count) {
        continue;
      }
      if (!g_ctx.node_keep[source_idx] || !g_ctx.node_keep[target_idx]) {
        continue;
      }
      if (depth[source_idx] < 0) {
        continue;
      }

      int candidate_depth = depth[source_idx] + 1;
      if (depth[target_idx] < 0 || depth[target_idx] <= depth[source_idx]) {
        depth[target_idx] = candidate_depth;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  double *columns = (double *)malloc((size_t)kept_node_count * sizeof(double));
  if (!columns) {
    free(incoming_count);
    free(root_ids);
    free(depth);
    free(queue);
    free_graph_adj(&adj);
    return false;
  }

  int column_count = 0;
  for (int i = 0; i < node_count; i++) {
    if (!g_ctx.node_keep[i]) {
      continue;
    }
    columns[column_count++] = g_ctx.nodes[i].x;
  }

  qsort(columns, (size_t)column_count, sizeof(double), compare_double_asc);
  int unique_columns = 0;
  for (int i = 0; i < column_count; i++) {
    if (unique_columns == 0 || fabs(columns[unique_columns - 1] - columns[i]) > 1e-6) {
      columns[unique_columns++] = columns[i];
    }
  }

  int *resolved_depth = (int *)malloc((size_t)node_count * sizeof(int));
  if (!resolved_depth) {
    free(columns);
    free(incoming_count);
    free(root_ids);
    free(depth);
    free(queue);
    free_graph_adj(&adj);
    return false;
  }

  int max_depth = 0;
  for (int i = 0; i < node_count; i++) {
    if (!g_ctx.node_keep[i]) {
      resolved_depth[i] = -1;
      continue;
    }

    int fallback_depth = find_fallback_depth(g_ctx.nodes[i].x, columns, unique_columns);
    int final_depth = (depth[i] >= 0) ? depth[i] : fallback_depth;
    resolved_depth[i] = final_depth;
    if (final_depth > max_depth) {
      max_depth = final_depth;
    }
  }

  int depth_bucket_count = max_depth + 1;
  int *bucket_sizes = (int *)calloc((size_t)depth_bucket_count, sizeof(int));
  int *bucket_offsets = (int *)calloc((size_t)depth_bucket_count + 1, sizeof(int));
  if (!bucket_sizes || !bucket_offsets) {
    free(bucket_sizes);
    free(bucket_offsets);
    free(resolved_depth);
    free(columns);
    free(incoming_count);
    free(root_ids);
    free(depth);
    free(queue);
    free_graph_adj(&adj);
    return false;
  }

  for (int i = 0; i < node_count; i++) {
    if (!g_ctx.node_keep[i]) {
      continue;
    }
    int d = resolved_depth[i];
    if (d < 0) {
      continue;
    }
    bucket_sizes[d] += 1;
  }

  int max_column_size = 0;
  for (int i = 0; i < depth_bucket_count; i++) {
    if (bucket_sizes[i] > max_column_size) {
      max_column_size = bucket_sizes[i];
    }
    bucket_offsets[i + 1] = bucket_offsets[i] + bucket_sizes[i];
  }

  int *bucket_nodes = (int *)malloc((size_t)kept_node_count * sizeof(int));
  int *bucket_cursor = (int *)malloc((size_t)depth_bucket_count * sizeof(int));
  if (!bucket_nodes || !bucket_cursor) {
    free(bucket_nodes);
    free(bucket_cursor);
    free(bucket_sizes);
    free(bucket_offsets);
    free(resolved_depth);
    free(columns);
    free(incoming_count);
    free(root_ids);
    free(depth);
    free(queue);
    free_graph_adj(&adj);
    return false;
  }

  for (int i = 0; i < depth_bucket_count; i++) {
    bucket_cursor[i] = bucket_offsets[i];
  }

  for (int i = 0; i < node_count; i++) {
    if (!g_ctx.node_keep[i]) {
      continue;
    }

    int d = resolved_depth[i];
    if (d < 0) {
      continue;
    }

    int pos = bucket_cursor[d]++;
    bucket_nodes[pos] = i;
  }

  double min_x = 0.0;
  double min_y = 0.0;
  bool has_min = false;
  for (int i = 0; i < node_count; i++) {
    if (!g_ctx.node_keep[i]) {
      continue;
    }

    if (!has_min) {
      min_x = g_ctx.nodes[i].x;
      min_y = g_ctx.nodes[i].y;
      has_min = true;
      continue;
    }

    if (g_ctx.nodes[i].x < min_x) {
      min_x = g_ctx.nodes[i].x;
    }
    if (g_ctx.nodes[i].y < min_y) {
      min_y = g_ctx.nodes[i].y;
    }
  }

  const double horizontal_spacing = 500.0;
  const double vertical_spacing = 620.0;

  g_node_sort_nodes = g_ctx.nodes;
  for (int depth_value = 0; depth_value < depth_bucket_count; depth_value++) {
    int begin = bucket_offsets[depth_value];
    int end = bucket_offsets[depth_value + 1];
    int count = end - begin;
    if (count <= 0) {
      continue;
    }

    qsort(bucket_nodes + begin, (size_t)count, sizeof(int), compare_node_in_column);

    double column_offset = ((double)(max_column_size - count) * vertical_spacing) / 2.0;
    for (int i = 0; i < count; i++) {
      int node_idx = bucket_nodes[begin + i];
      g_ctx.layout_x[node_idx] = min_x + depth_value * horizontal_spacing;
      g_ctx.layout_y[node_idx] = min_y + column_offset + i * vertical_spacing;
    }
  }

  free(bucket_nodes);
  free(bucket_cursor);
  free(bucket_sizes);
  free(bucket_offsets);
  free(resolved_depth);
  free(columns);
  free(incoming_count);
  free(root_ids);
  free(depth);
  free(queue);
  free_graph_adj(&adj);

  return true;
}

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

static bool compute_best_review_route(
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

static bool compute_keep_reachable(int start_ship_id, int target_ship_id) {
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

static bool compute_keep_saving(int start_ship_id, int target_ship_id, double direct_upgrade_cost) {
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
