# PR-28: Write Runtime 装配去重复（pipeline 与 command set 拆分）

## 目标

降低 `packages/whiteboard-engine/src/runtime/write/runtime.ts` 与 `instance/facade/commands.ts` 的重复装配代码，保持行为不变。

## 现状问题

1. `runtime.ts` 同时负责：
   1. 写流水线（planner/writer/gateway）装配。
   2. 命令集合装配。
   3. selection 依赖映射与 shortcut 绑定。
2. `createCommands` 对 `writeRuntime.commands` 再次手工逐项映射，出现二次重复。

## 设计

### A. runtime.ts 拆分职责

1. 提取 `createWritePipeline`：
   1. 创建 `changeBus`、`writer`、`apply`、`gateway`。
2. 提取 `createWriteCommandSet`：
   1. 创建 `write/edge/interaction/viewport/node/mindmap/selection/shortcut`。
   2. 内聚 selection 依赖映射。

效果：`runtime` 主函数只做“组装 + 返回”。

### B. createCommands 去重复映射

1. 对与 `Commands` 结构一致的部分直接透传（`interaction/selection/edge/viewport/node/mindmap/write`）。
2. 仅保留真正需要转换的部分：
   1. `doc/tool/history/host`
   2. `order`（来自 node/edge 扩展方法）
   3. `group`（来自 node 扩展方法）

## 约束

1. 不改变外部 API 行为与命名。
2. 不改变写链路执行顺序。
3. 不改变 shortcut 与 selection 的运行时依赖关系。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工核对：
   1. node/edge/viewport/mindmap 写操作可用。
   2. selection 与 shortcut 动作可用。
   3. history 与 doc.reset 行为保持一致。
