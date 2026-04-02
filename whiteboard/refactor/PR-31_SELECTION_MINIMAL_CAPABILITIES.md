# PR-31: Selection 依赖最小化（Minimal Capabilities）

## 目标

进一步执行漏斗原则，收窄 `selection` 对写命令的依赖面，减少桥接映射样板代码。

## 现状问题

1. `selection` 当前依赖形态是 `group + edge + node` 三组命令。
2. 实际使用上，`selection` 只需要：
   1. `node.create` / `node.delete` / `node.createGroup` / `node.ungroup`
   2. `edge.create` / `edge.delete` / `edge.select`
3. `runtime.ts` 因为依赖面过宽，需要专门的 `createSelectionDependencies` 做方法搬运。

## 设计

### A. 收窄 selection 命令依赖

1. `selection` 输入改为：
   1. `node: Pick<NodeCommandsApi, 'create' | 'delete' | 'createGroup' | 'ungroup'>`
   2. `edge: Pick<EdgeCommandsApi, 'create' | 'delete' | 'select'>`
2. 删除 `group` 依赖层。

### B. runtime 直接透传基础命令

1. `createWriteCommandSet` 中 `selection` 直接吃 `baseCommands.node/baseCommands.edge`。
2. 删除 `createSelectionDependencies` 及相关类型。

## 约束

1. 不改变 selection 行为。
2. 不改变 public commands API。
3. 不引入新状态或副作用。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工核对：
   1. `groupSelected/ungroupSelected` 正常。
   2. `deleteSelected/duplicateSelected` 正常。
