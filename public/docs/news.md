# 更新说说明 1.4.0

这次版本对自动路径规划器做了完整重构，并正式更名为「探索路径」。

核心目标是让你在给定时间范围内，更清晰地探索 Warbond / 涨价 CCU 的可行路径，并且可以在结果页直接做规则约束和交互排查。

## 本次更新重点

- 支持在指定时间范围内构建路径图，按历史可用价格和 SKU 有效区间生成候选路径。
- 支持快速排除 CCU 或 SKU，并即时重新计算结果。
- 交互联动优化：鼠标悬停 SKU 时，右侧价格历史图会高亮对应 SKU 曲线，便于对照。

![TinySnap-2026-02-28-14.06.43.png](https://worker.citizenshub.app/api/blog/attachments/34f25e29-3a1c-4b3d-9e87-6fb9c405adaf)

![TinySnap-2026-02-28-14.09.43.png](https://worker.citizenshub.app/api/blog/attachments/802a4951-1182-411c-b156-74a5920461e7)

![TinySnap-2026-02-28-14.09.59.png](https://worker.citizenshub.app/api/blog/attachments/d212f1b5-e65b-4827-abfb-e13972ac9b89)

![TinySnap-2026-02-28-14.10.15.png](https://worker.citizenshub.app/api/blog/attachments/8e2a70d1-17d0-44f4-96d3-7110018062c3)
