# PR-03 设计文档：写链路 tracing 字段贯通

## 背景

后续要引入 `CommandGateway` 和事件日志，写链路必须可观测并可关联。当前 `changeBus` 事件缺少命令级追踪字段，不利于跨阶段排障与一致性比对。

## 目标

1. 在写链路新增 tracing 元数据：
   - `commandId`
   - `correlationId`
   - `transactionId`
   - `causationId`
2. 支持调用方透传 tracing；未提供时由 writer 自动生成。
3. 保持现有命令行为不变，tracing 仅用于可观测性。

## 设计原则

1. 兼容优先：对外 API 使用可选参数，不破坏现有调用。
2. 单点补齐：tracing 缺失时由 writer 统一生成，不在各业务命令中散落生成逻辑。
3. 可追溯：`change` 事件天然携带 tracing，供 read 和 reaction 消费。

## 文件落点

1. `packages/whiteboard-engine/src/types/command/source.ts`
2. `packages/whiteboard-engine/src/types/command/api.ts`
3. `packages/whiteboard-engine/src/types/write/change.ts`
4. `packages/whiteboard-engine/src/types/write/writer.ts`
5. `packages/whiteboard-engine/src/runtime/write/model.ts`
6. `packages/whiteboard-engine/src/runtime/write/runtime.ts`
7. `packages/whiteboard-engine/src/runtime/write/writer.ts`

## 兼容策略

1. `trace` 参数全部为可选。
2. 旧调用方不传 `trace` 也可正常运行。
3. `changeBus` 订阅方不读取 `trace` 也不受影响。

## 验收标准

1. 任意写入都能产出带 tracing 的 `Change`。
2. 透传 tracing 时，输出 `Change.trace` 与输入一致（缺省字段除外）。
3. 行为结果（operations、history、read 刷新）保持不变。

## 回滚方案

1. tracing 字段可整体删除，恢复旧类型签名。
2. writer 自动补齐逻辑可独立回滚，不影响业务命令。
