# PR-47 Command API 域内收敛 + Edge Routing 语义化

## 背景

上一阶段已完成 `updateMany` 漏斗收敛与测量链路下沉，但仍有两类噪音：

1. 顶层重复命名空间：`commands.order` / `commands.group` 与 `commands.node` / `commands.edge` 内部能力重复。
2. edge routing 写入参数偏中间态：对外仍暴露 `Edge` / `pathPoints` 等调用方不应关心的内部细节。

## 目标

1. 去掉顶层重复入口，所有排序/分组能力只在所属 domain 暴露。
2. edge routing 对外统一为 `edgeId + 语义参数`，不再要求 UI 传 `Edge` 或 `pathPoints`。
3. 保持写链路不变：`commands -> apply -> planner -> writer -> core reduce -> readHints`。

## 设计

### 1) Commands 对外收口

1. 删除 `commands.order`。
2. 删除 `commands.group`。
3. `commands.node` 内部新增：
   - `group.create(ids)`
   - `group.ungroup(id)`
   - `order.set/bringToFront/sendToBack/bringForward/sendBackward`
4. `commands.edge` 内部新增：
   - `routing.insertAtPoint/move/remove/reset`
   - `order.set/bringToFront/sendToBack/bringForward/sendBackward`

### 2) WriteCommandMap 收口

1. `node`：
   - `group` -> `group.create`
   - `ungroup` -> `group.ungroup`
2. `edge`：
   - `routing.insert` -> `routing.insertAtPoint`
   - `routing.*` 全部改为 `edgeId` 驱动
   - 不再携带 `Edge/pathPoints`

### 3) Planner 职责调整

1. `edge` planner 增加 `read` 依赖（只读）。
2. `routing.insertAtPoint` 在 planner 内通过 `read.projection.edge.byId` 取路径点并计算 segment。
3. `routing.move/remove/reset` 在 planner 内通过 `edgeId` 读取文档 edge 后生成 patch。

### 4) UI 迁移

1. `EdgeLayer/useEdgePathInteraction` 改为调用 `commands.edge.routing.insertAtPoint(edge.id, pointWorld)`。
2. `useEdgeRoutingInteraction` 改为调用 `commands.edge.routing.move/remove`。
3. `selection` 的分组调用改为 `commands.node.group.create/ungroup`。

## 风险与控制

1. 风险：公开 API 破坏性变更（移除 `commands.order/group`）。
2. 控制：本仓库内所有调用点同步迁移并通过 `pnpm -r lint && pnpm -r build`。

## 结果检查

1. 写侧漏斗保持单一路径，无新增分叉。
2. 对外 API 语义更短更直，domain 边界更清晰。
3. edge routing 调用方不再接触中间态结构。
