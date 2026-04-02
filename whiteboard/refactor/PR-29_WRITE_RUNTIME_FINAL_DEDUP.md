# PR-29: Write Runtime 最后一轮去重（selection 依赖收敛 + facade 直通）

## 目标

在不改变行为的前提下，继续降低写运行时装配的重复感，解决 `runtime.ts`“看起来绕、重复”的问题。

## 现状问题

1. `runtime.ts` 内部仍有一段较长的 `selection` 依赖拼装对象，语义是“桥接命令能力”，但结构噪音较高。
2. `instance/facade/commands.ts` 仍存在“先取出再同名转发”的中间变量，属于机械转发。

## 设计

### A. runtime.ts：提取 selection 依赖构造器

1. 新增独立 helper：`createSelectionDependencies`。
2. 输入仅包含 `nodeCommands` 与 `edgeCommands`。
3. 输出 `selection` 所需的 `group/node/edge` 能力集。

效果：

1. `createWriteCommandSet` 只保留“装配顺序”。
2. `selection` 依赖映射从主流程剥离，主链路更直。

### B. commands facade：去掉纯别名转发

1. 在 `createCommands` 中直接解构 `writeRuntime.commands`。
2. 删除仅用于同名透传的中间常量。
3. 保留必要转换层：`doc/tool/history/host/order/group`。

效果：

1. facade 文件聚焦“对外 API 组织”，而不是“变量搬运”。
2. 代码更短，认知负担更低。

## 约束

1. 不改变任何 public API 的方法名与参数。
2. 不改变写链路时序。
3. 不改变 selection/shortcut/history 行为。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工核对：
   1. `selection` 的 group/delete/duplicate 行为无回归。
   2. `doc.reset` 与 `history` 行为无回归。
