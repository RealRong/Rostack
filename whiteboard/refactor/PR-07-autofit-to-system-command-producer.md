# PR-07 设计文档：Autofit 改为 system command 生产者

## 背景

`Autofit` 当前直接写 `instance.mutate`，与单写漏斗冲突。需要与 Measure 一致，转为命令生产者模式。

## 目标

1. `Autofit` 移除对 `mutate` 的直接依赖。
2. `Autofit` 通过 `commands.write.apply` 发送 `system` 命令。
3. 保持原有脏检测、增量同步与布局比较逻辑。

## 设计原则

1. 反应层只负责“计算并发出命令”。
2. 命令提交路径统一，不改变 Autofit 算法细节。
3. 继续复用 changeBus 驱动，避免时序变化。

## 文件落点

1. `packages/whiteboard-engine/src/instance/reactions/Autofit.ts`
2. `packages/whiteboard-engine/src/instance/reactions/Reactions.ts`

## 关键变更

1. `Autofit.Options` 注入 `applyWrite`。
2. `runSync` 产出的 `node.update` 操作映射为系统命令并逐条提交。
3. `Reactions` 构造时注入 `writeRuntime.commands.write.apply`。

## 非目标

1. 不改变 Autofit 触发条件和 dirty 合并策略。
2. 不引入新的 layout 算法。

## 验收标准

1. Autofit 不再直接调用 `mutate`。
2. group 自动收缩/扩展行为与旧版本一致。
3. 仍能在 replace/full/dirtyNodeIds 场景正确触发。

## 回滚方案

1. 将 Autofit 提交路径恢复到 `instance.mutate`。
