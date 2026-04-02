# PR-30: Write Runtime 命令装配声明式注册表

## 目标

继续压缩 `packages/whiteboard-engine/src/runtime/write/runtime.ts` 的装配样板代码，让命令创建逻辑从“命令式逐行初始化”转为“声明式注册 + 组合”。

## 现状问题

1. `createWriteCommandSet` 仍然按局部变量逐项创建 `write/edge/interaction/viewport/node/mindmap`，重复模式明显。
2. 基础命令与派生命令（`selection/shortcut`）混在一个函数内，关注点不够清晰。

## 设计

### A. 引入基础命令注册表

1. 定义 `BaseCommandSet`（`write/edge/interaction/viewport/node/mindmap`）。
2. 定义 `baseCommandBuilders`（声明式 builder map）。
3. 通过 `createBaseCommandSet` 统一构建基础命令集。

### B. 派生命令分层

1. `selection` 作为依赖 `node + edge` 的派生命令。
2. `shortcut` 作为依赖 `selection + history` 的派生命令。
3. `createWriteCommandSet` 仅做“基础命令 + 派生命令”的组合。

## 约束

1. 不改变任何对外 API、类型签名与行为。
2. 不改变执行顺序：`selection` 仍依赖 `node/edge`，`shortcut` 仍依赖 `selection/history`。
3. 不引入新的运行时开销与状态。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工核对：
   1. `selection` 各动作（group/delete/duplicate）保持可用。
   2. `shortcut` 调度行为保持一致。
