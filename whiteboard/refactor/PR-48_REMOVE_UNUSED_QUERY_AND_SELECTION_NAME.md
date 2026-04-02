# PR-48 清理历史残留噪音：移除无调用 Query 与 Selection name

## 背景

在完成命令面收敛后，仍有两处历史残留：

1. `query.geometry.nearestEdgeSegment`：原用于 edge routing 插点路径计算；现已迁移到 write planner 内部执行，外部调用为 0。
2. `selection.name`：`SelectionCommandsApi` 对外暴露固定字面量 `'Selection'`，当前没有任何业务读取。

这两处都属于“历史接口残留”，会增加认知成本与类型噪音。

## 目标

1. 删除无调用查询方法，收紧 `Query` 公开面。
2. 删除无意义固定字段，收紧 `SelectionCommandsApi`。
3. 保持行为不变，仅做结构降噪。

## 变更设计

### 1) Query 清理

1. 从 `types/instance/query.ts` 删除 `geometry.nearestEdgeSegment`。
2. 从 `runtime/read/api/query.ts` 删除对应实现与 `getNearestEdgeSegment` import。

### 2) Selection API 清理

1. 从 `types/write/commands.ts` 删除 `SelectionCommandsApi.name` 字段。
2. 从 `runtime/write/api/selection.ts` 返回对象删除 `name: 'Selection'`。

## 风险与控制

1. 风险：存在隐式调用未被检索到。
2. 控制：全仓 `rg` 确认调用为 0；执行 `pnpm -r lint` 与 `pnpm -r build`。

## 预期收益

1. 减少 Query 对外能力面，符合“只暴露被需要的稳定语义”。
2. 降低 Selection API 噪音，避免无意义固定字段继续扩散。
