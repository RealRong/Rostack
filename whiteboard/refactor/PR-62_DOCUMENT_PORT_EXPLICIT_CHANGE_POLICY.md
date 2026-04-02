# PR-62 文档写入端口显式化（移除 silent 隐式分支）

## 背景

当前文档写入端口是：

- `document.replace(doc, { silent? })`

其中 `silent` 把两件事耦合在一个接口里：

1. 写入 runtime document。
2. 是否触发 `onDocumentChange` 回调。

这会导致 reset/docId 切换路径语义不直观：调用点必须知道 `silent` 约定，链路阅读成本高。

## 目标

1. 把“写入文档”和“回调策略”拆开，接口语义显式。
2. 保持现有行为不变：
   - apply 路径会触发 `onDocumentChange`
   - reset/replace 路径默认不触发 `onDocumentChange`
3. 清理 `silent` 选项，避免隐式控制流。

## 方案

1. 调整 document port：
   - `get(): Document`
   - `set(doc: Document): void`
   - `notifyChange(doc: Document): void`

2. engine 组装层改造：
   - `setDocument` 只负责写入 atom。
   - `notifyDocumentChange` 只负责调用 `onDocumentChange`。

3. writer 改造：
   - apply 提交路径：`setDocument` 后显式 `notifyChange`。
   - replace/reset 提交路径：仅 `setDocument`，不 `notifyChange`。

4. 类型同步：
   - `types/instance/engine.ts`
   - `types/document/store.ts`

## 风险

1. 若外部代码依赖 `replace(..., { silent })` 类型，会有编译层 breaking（仓内无引用）。
2. 回调触发时序保持与现状一致（写入后立即可见），不额外改变行为。

## 验证

1. `pnpm -r lint`
2. `pnpm -r build`
3. 手工回归：
   - 普通写操作仍触发 `onDocumentChange`
   - `commands.doc.reset` 不触发 `onDocumentChange`
