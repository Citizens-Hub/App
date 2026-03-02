#include "pathbuilder_internal.h"

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Shared runtime state and graph/layout utilities used by all modes.
PathBuilderContext g_ctx = {0};
const PbNode *g_node_sort_nodes = NULL;

char *x_strdup(const char *value) {
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

bool ensure_capacity(void **buffer, int *cap, int count, size_t elem_size) {
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

void sb_init(StrBuilder *sb) {
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

bool sb_append(StrBuilder *sb, const char *text) {
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

bool sb_append_int(StrBuilder *sb, int value) {
  char buf[32];
  int written = snprintf(buf, sizeof(buf), "%d", value);
  if (written <= 0) {
    return false;
  }
  return sb_append(sb, buf);
}

bool sb_append_double(StrBuilder *sb, double value) {
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

void sb_free(StrBuilder *sb) {
  free(sb->data);
  sb->data = NULL;
  sb->len = 0;
  sb->cap = 0;
}

void free_graph_adj(GraphAdj *adj) {
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

void reset_result_buffers(void) {
  free(g_ctx.node_keep);
  free(g_ctx.edge_keep);
  free(g_ctx.layout_x);
  free(g_ctx.layout_y);

  g_ctx.node_keep = NULL;
  g_ctx.edge_keep = NULL;
  g_ctx.layout_x = NULL;
  g_ctx.layout_y = NULL;
}

void free_context_data(void) {
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

bool allocate_result_buffers(void) {
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

int find_node_idx_by_id(const char *node_id) {
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

int read_i32_at(const unsigned char *bytes, int index) {
  int value = 0;
  if (!bytes || index < 0) {
    return value;
  }
  memcpy(&value, bytes + ((size_t)index * sizeof(int)), sizeof(int));
  return value;
}

double read_f64_at(const unsigned char *bytes, int index) {
  double value = 0.0;
  if (!bytes || index < 0) {
    return value;
  }
  memcpy(&value, bytes + ((size_t)index * sizeof(double)), sizeof(double));
  return value;
}

uint32_t read_u32_at(const unsigned char *bytes, int index) {
  uint32_t value = 0;
  if (!bytes || index < 0) {
    return value;
  }
  memcpy(&value, bytes + ((size_t)index * sizeof(uint32_t)), sizeof(uint32_t));
  return value;
}

bool edge_is_active(int edge_idx) {
  if (edge_idx < 0 || edge_idx >= g_ctx.edge_count) {
    return false;
  }

  if (!g_ctx.edge_active) {
    return true;
  }

  return g_ctx.edge_active[edge_idx] != 0;
}

bool build_graph_adj(const unsigned char *edge_mask, GraphAdj *adj) {
  // Build CSR-like forward/backward adjacency from the current edge set.
  // edge_mask is optional and lets callers materialize filtered working graphs.
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

bool mark_reachable_forward(const GraphAdj *adj, const unsigned char *start_mask, unsigned char *reachable) {
  // Multi-source BFS on outgoing edges.
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

bool mark_reachable_backward(const GraphAdj *adj, const unsigned char *target_mask, unsigned char *reachable) {
  // Multi-source BFS on reverse graph (incoming edges).
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

int compare_node_xy(const void *left, const void *right) {
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

bool normalize_layout_by_depth(int start_ship_id) {
  // Recompute layout coordinates for kept nodes:
  // 1) assign depth from roots, 2) bucket by depth, 3) reorder inside columns.
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
