# PR-32: Write Runtime 派生命令装配层

## 目标

把 `selection/shortcut` 的装配从 `createWriteCommandSet` 主函数中抽离为独立“派生命令层”，继续拉直主链路。

## 现状问题

1. `createWriteCommandSet` 仍同时处理：
   1. 基础命令构建（`BaseCommandSet`）。
   2. 派生命令构建（`selection/shortcut`）。
2. 虽然已经有 `BaseCommandSet`，但“组合层次”不够显式。

## 设计

### A. 新增 DerivedCommandSet

1. 定义 `DerivedCommandSet = Pick<WriteRuntime['commands'], 'selection' | 'shortcut'>`。
2. 新增 `createDerivedCommandSet`：
   1. `selection` 依赖 `instance + baseCommands.node/edge`。
   2. `shortcut` 依赖 `selection + history`。

### B. createWriteCommandSet 只做组合

1. 构建 `baseCommands`。
2. 构建 `derivedCommands`。
3. 返回 `{ ...baseCommands, ...derivedCommands }`。

## 约束

1. 不改变任何命令签名。
2. 不改变命令创建顺序与依赖关系。
3. 不引入新状态。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工核对：
   1. `selection` 与 `shortcut` 行为不变。
