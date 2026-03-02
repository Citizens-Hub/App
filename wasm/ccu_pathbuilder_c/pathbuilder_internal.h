#ifndef CCU_PATHBUILDER_INTERNAL_H
#define CCU_PATHBUILDER_INTERNAL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// Shared internal declarations for the split pathbuilder C modules.
// PathBuilder runtime modes selected by pbRun(mode, ...).
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

// Global mutable runtime context shared by API, helpers, and algorithms.
extern PathBuilderContext g_ctx;
extern const PbNode *g_node_sort_nodes;

char *x_strdup(const char *value);
bool ensure_capacity(void **buffer, int *cap, int count, size_t elem_size);

void sb_init(StrBuilder *sb);
bool sb_append(StrBuilder *sb, const char *text);
bool sb_append_int(StrBuilder *sb, int value);
bool sb_append_double(StrBuilder *sb, double value);
void sb_free(StrBuilder *sb);

void free_graph_adj(GraphAdj *adj);
void reset_result_buffers(void);
void free_context_data(void);
bool allocate_result_buffers(void);
int find_node_idx_by_id(const char *node_id);
int read_i32_at(const unsigned char *bytes, int index);
double read_f64_at(const unsigned char *bytes, int index);
uint32_t read_u32_at(const unsigned char *bytes, int index);
bool edge_is_active(int edge_idx);
bool build_graph_adj(const unsigned char *edge_mask, GraphAdj *adj);
bool mark_reachable_forward(const GraphAdj *adj, const unsigned char *start_mask, unsigned char *reachable);
bool mark_reachable_backward(const GraphAdj *adj, const unsigned char *target_mask, unsigned char *reachable);
int compare_node_xy(const void *left, const void *right);
bool normalize_layout_by_depth(int start_ship_id);

bool compute_best_review_route(
  int start_ship_id,
  int target_ship_id,
  int required_bit_count,
  int **route_edge_indices_out,
  int *route_edge_count_out,
  double *route_total_cost_out
);

bool compute_keep_reachable(int start_ship_id, int target_ship_id);
bool compute_keep_saving(int start_ship_id, int target_ship_id, double direct_upgrade_cost);

#endif
