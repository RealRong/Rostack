# PR-01 设计文档：新增 CQRS 类型目录与导出

## 背景

当前 engine 写链路已经具备命令、变更、读模型刷新等能力，但缺少稳定且语义化的 CQRS 契约层。后续要落 `CommandGateway`、`ReadInvalidation`、事件日志与兼容迁移，必须先有统一类型边界。

## 目标

1. 新增 `types/cqrs/` 目录，提供命令、事件、查询、投影契约类型。
2. 从 `@whiteboard/engine` 顶层导出这些契约，供后续 PR 复用。
3. 不改变任何现有运行时行为，只做类型层落地。

## 设计原则

1. 字段语义清晰，优先使用完整单词，不引入难懂缩写。
2. 类型先稳定，再逐步接入实现，避免在同一 PR 引入行为变化。
3. 保持向后兼容：旧类型与 API 不删除。

## 目录与文件

1. `packages/whiteboard-engine/src/types/cqrs/command.ts`
2. `packages/whiteboard-engine/src/types/cqrs/event.ts`
3. `packages/whiteboard-engine/src/types/cqrs/query.ts`
4. `packages/whiteboard-engine/src/types/cqrs/projection.ts`
5. `packages/whiteboard-engine/src/types/cqrs/index.ts`

## 契约概要

1. `CommandEnvelope`：命令输入统一封装。
2. `CommandResult`：命令处理统一结果。
3. `DomainEventEnvelope`：领域事件标准封装。
4. `EventJournal`：事件追加和订阅接口。
5. `QueryFacade`、`ReadFacade`：读侧门面占位类型。
6. `ProjectionRuntime`：投影运行时统一入口（先类型定义）。

## 非目标

1. 不引入 `CommandGateway` 实现。
2. 不改 write/read/core 现有调用链。
3. 不修改旧 `changeBus` 结构。

## 验收标准

1. `types/cqrs/*` 编译通过。
2. `@whiteboard/engine` 顶层可导出 CQRS 类型。
3. 运行时行为与现状一致。

## 回滚方案

1. 本 PR 仅新增类型与导出，回滚时删除新增文件即可。
