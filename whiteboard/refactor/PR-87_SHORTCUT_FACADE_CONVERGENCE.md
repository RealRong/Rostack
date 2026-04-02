# PR-87 Shortcut Facade Convergence

更新时间：2026-03-06

## 目标

把 `shortcut` 从 `runtime/write/api` 移回 `instance/facade`，让 `runtime/write/api` 彻底只保留 document-domain API。

## 问题

当前 `shortcut` 已经不再走 write domain，但它的实现文件仍然位于：

`packages/whiteboard-engine/src/runtime/write/api/shortcut.ts`

这会造成目录语义不一致：

1. `runtime/write/api` 里的大部分文件是 document-domain command adapter。
2. `shortcut` 本质上是 commands facade convenience，不是 write api。

## 设计

1. 新增 `packages/whiteboard-engine/src/instance/facade/shortcut.ts`。
2. `instance/facade/commands.ts` 从本地 facade 引入 `shortcut`。
3. 删除 `runtime/write/api/shortcut.ts`。
4. 删除 `runtime/write/api/index.ts` 中的 `shortcut` 导出。
5. 删除 `types/write/commands.ts` 中只为 shortcut 服务的 `ShortcutActionDispatcher`。

## 预期结果

1. `runtime/write/api` 只保留 document-domain api。
2. `shortcut` 与 `selection` 一样，成为 facade 层 convenience。
3. write 核心边界与目录结构完全一致。
