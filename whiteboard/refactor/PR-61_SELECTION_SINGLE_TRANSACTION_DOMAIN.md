# PR-61 selection 高阶动作收敛为单事务 write domain

## 背景

当前 `selection` 高阶动作（`groupSelected / ungroupSelected / deleteSelected / duplicateSelected`）通过 `selection -> node api / edge api` 级联调用，存在以下问题：

1. 一次用户意图会产生多次 `write.apply`，history 粒度过细。
2. planner 与 writer 的链路被 API 转发层切碎，`selection` 语义没有独立 write domain。
3. duplicate/group 这类组合动作跨多次提交，trace 与 change bus 噪音偏高。

## 目标

1. 引入 `selection` write domain，让高阶动作一次规划、一次提交。
2. `selection` 高阶动作在 planner 内直接生成完整 operations。
3. 保持当前功能与外部命令 API 语义不变。

## 方案

1. 扩展命令类型：
   - 新增 `SelectionWriteCommand`。
   - `WriteDomain` 增加 `'selection'`。
   - `WriteCommandMap` 增加 `selection`。

2. 新增 planner domain：
   - 新建 `runtime/write/stages/plan/domains/selection.ts`。
   - 在 router 注册 `planSelection`。
   - 支持动作：
     - `group`：直接用 `corePlan.node.group`，并在 `value` 返回 `selectedNodeIds`（group id）。
     - `ungroup`：批量展开选中 group，聚合为单个 draft。
     - `delete`：支持 edge 优先删除；节点删除时先扩展 group 子树并删除关联 edge。
     - `duplicate`：在 planner 内维护工作文档（`reduceOperations`）逐步生成 node/edge create operations，确保 parent/edge 映射正确；`value` 返回 duplicated node ids。

3. 改造 selection API：
   - `groupSelected / ungroupSelected / deleteSelected / duplicateSelected` 改为单次 `apply({ domain: 'selection', ... })`。
   - 通过 dispatch 结果 `value` 回填选中态。
   - `select / toggle / selectAll / clear / getSelectedNodeIds` 继续保留为本地状态语义。

4. 清理 write 命令组装：
   - `createWriteCommands` 中 `selection` 不再依赖 node/edge 命令注入。

## 风险

1. `duplicate` 规划逻辑从 API 迁入 planner，复杂度上升。
2. `selection` 新增 write domain 后，类型层会有小范围 breaking（内部）。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
