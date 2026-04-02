# PR-06 设计文档：Measure 改为 system command 生产者

## 背景

`Measure` 当前直接调用 `instance.mutate`，属于旁路写入口。按照漏斗原则，应当通过统一命令链路写入，避免反应层直接触达底层 mutation。

## 目标

1. `Measure` 不再依赖 `mutate`。
2. `Measure` 改为调用 `commands.write.apply` 生成并提交 `system` 命令。
3. 其他行为保持不变：去抖/去重策略、尺寸阈值、pending/committed 缓存不变。

## 设计原则

1. 反应层只产生命令，不直接提交 operations。
2. 保持调用时序与原逻辑一致，避免交互回归。
3. 依赖注入来自 write runtime，避免读取未初始化的 `instance.commands`。

## 文件落点

1. `packages/whiteboard-engine/src/instance/reactions/Measure.ts`
2. `packages/whiteboard-engine/src/instance/reactions/Reactions.ts`

## 关键变更

1. `Measure.Options` 从 `mutate` 切为 `applyWrite`。
2. flush 阶段将每个尺寸变更映射为：
   - `domain: 'node'`
   - `command: { type: 'update', id, patch: { size } }`
   - `source: 'system'`
3. `Reactions` 构造 `Measure` 时注入 `writeRuntime.commands.write.apply`。

## 非目标

1. 不调整 Autofit（下一 PR）。
2. 不改变写命令结构。

## 验收标准

1. Measure 代码中不再出现 `mutate` 调用。
2. 尺寸更新仍然生效，且走统一写入口。
3. replace/reset 场景下缓存清理行为保持一致。

## 回滚方案

1. 将 `applyWrite` 注入改回 `mutate`，恢复旧路径。
