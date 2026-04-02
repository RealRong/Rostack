# 目标
- 将 edgeEndpointsById 从查询层下沉到投影层，减少查询层转发与依赖。
- 让 edge 端点语义成为稳定投影的一部分，符合漏斗原则。

# 背景
目前端点读取通过 `instance.query.edgeEndpointsById` 暴露，查询层既转发又带依赖，语义偏临时。
端点是 edge 的投影结果，应该收敛到 `read.projection.edge`。

# 方案
- 删除 `instance.query.edgeEndpointsById`。
- 在 `read.projection.edge` 上新增 `endpointsById(edgeId)`。
- `EdgesView` 增加 `endpointsById` 方法，保持 `ids/byId` 结构不变。
- 查询层不再依赖 edge 读取运行时。

# 接口变更
- 移除：`instance.query.edgeEndpointsById(edgeId)`。
- 新增：`instance.read.projection.edge.endpointsById(edgeId)`。

# 实现要点
- edge 读取阶段生成的视图对象上增加 `endpointsById`，内部仍使用缓存快照。
- 查询层删除端点相关代码与依赖。
- React 与引擎内所有调用点迁移到投影层。

# 风险与验证
- 风险：调用点遗漏导致类型错误。
- 验证：全量类型检查与构建通过；运行 `pnpm -r lint`、`pnpm -r build`。
