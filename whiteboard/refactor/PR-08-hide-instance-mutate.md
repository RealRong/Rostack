# PR-08 设计文档：收口并隐藏 instance.mutate

## 背景

`instance.mutate` 会形成第二写路径，与“单写入口”目标冲突。当前 Measure/Autofit 已切到命令方式，具备收口条件。

## 目标

1. 从 `InternalInstance` 移除 `mutate` 字段。
2. 从 `WriteRuntime` 对外接口移除 `mutate` 暴露。
3. engine 装配不再写入 `instance.mutate`。

## 设计原则

1. 写入统一走 `commands`（后续全部归入 gateway）。
2. 保持 writer 内部能力不受影响（`applyDraft` 仍可调用内部 mutate 逻辑）。
3. 类型先收口，避免新增调用方继续依赖旧入口。

## 文件落点

1. `packages/whiteboard-engine/src/types/instance/engine.ts`
2. `packages/whiteboard-engine/src/types/write/runtime.ts`
3. `packages/whiteboard-engine/src/instance/engine.ts`
4. `packages/whiteboard-engine/src/runtime/write/runtime.ts`

## 非目标

1. 不删除 writer 内部 `mutate` 方法。
2. 不改命令语义与读侧刷新时序。

## 验收标准

1. 代码中不再有 `instance.mutate = ...`。
2. `InternalInstance` 和 `WriteRuntime` 类型不再暴露 `mutate`。
3. 构建通过且命令行为不变。

## 回滚方案

1. 恢复类型字段与 engine/runtime 赋值逻辑。
