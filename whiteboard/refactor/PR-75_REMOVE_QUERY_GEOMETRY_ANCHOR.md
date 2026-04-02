# 目标
- 移除 `instance.query.geometry.anchorFromPoint`，回归 core 几何函数。
- 简化 query API，避免无状态算法常驻引擎层。

# 背景
`anchorFromPoint` 是纯算法，只依赖输入参数与配置，不需要引擎读写状态。
放在 engine 的 `query.geometry` 会扩大 API 面积，偏离最简原则。

# 方案
- 删除 `Query.geometry.anchorFromPoint` 定义与实现。
- 调用方改为直接使用 `@whiteboard/core/edge` 的 `getAnchorFromPoint`。
- 需要的配置从 `instance.config.edge` 读取，调用方自行组装参数。

# 接口变更
- 移除：`instance.query.geometry.anchorFromPoint(rect, rotation, point)`。
- 新增：`getAnchorFromPoint(rect, rotation, point, options)`（core）。

# 实现要点
- 删除 `query.ts` 中 `geometry` 字段与 `getAnchorFromPointRaw` 依赖。
- 更新 `packages/whiteboard-react` 中使用点。

# 风险与验证
- 风险：调用点未迁移导致类型错误。
- 验证：`pnpm -r lint`、`pnpm -r build`。
