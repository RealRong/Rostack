# Group Roadmap

本文档只描述 `group/` 下一阶段的优先级，不讨论旧实现兼容。

## P0：继续收敛 foundation

### 1. read 收敛成更纯的 change-driven 模型

目标：

- 继续弱化 read 对 runtime 细节的耦合
- 让 read 更像 `invalidate(changes) + pull document/query`
- 保持 runtime cache 可替换，而不是把实现细节变成公共语义

当前已具备的基础：

- `engine.read.events.subscribe(listener)` 可以附带 `changes` summary
- `engine.read.record.* / field.* / view.* / search.* / index.*` facade 已落地
- table 与 kanban 已迁移到 facade；public surface 已进一步收敛到统一 `useTable()` / `useKanban()` resource facade
- React UI reconcile 已能直接消费这份 summary，避免无关变化触发全量 document normalize
- read 已经收敛到 `changes -> readRuntime.reconcile -> explicit facade pull result`
- `engine.read.query(...)` 已删除
- 下一阶段应继续压缩 kanban / table 内剩余局部组装层，并保持 facade 命名简短、资源边界清晰

### 2. `instance.document` 固定为内部 document store

目标：

- document store authority 继续稳定在 `instance.document`
- 避免把 apply / replace / fanout 逻辑重新塞回 store
- 保持 public document API 与 internal document store 边界清晰

当前已具备的基础：

- `instance.document` 已经只保留 `peekDocument()` / `installDocument()`
- `engine.document` 的 export / replace 语义已经改由 facade + commit runtime 统一组装
- replace 时重置 commit session（含 history）的策略已经收回 commit runtime
- `core` 内部大部分 pure read / write / history helper 已经直接改为消费 `GroupDocument`

### 3. 继续瘦身 engine API

目标：

- 只保留真正稳定的 facade
- 避免把 debug / optimization / transitional API 暴露成公共 surface
- 新能力优先经由 `read / write / history / document` 既有分组进入

当前已具备的基础：

- `./engine` 子入口不再公开 runtime commit/history helper utilities
- `engine.document` 已经只保留 public `export / replace` surface
- public API 已移除 `ports` / default ports 这类策略注入面
- public write API 已收敛到 `dispatch(command | command[])`

---

## P1：优化状态与数据流

### 4. 进一步优化 clone / immutable 策略

目标：

- 保持 document 语义清晰
- 在必要位置减少不必要 clone
- 为后续可能的 immutable store / Immer 路径保留空间

当前已具备的基础：

- public document export/query 与 internal runtime canonicalization 的语义边界已经拆开
- engine 内部 fanout 给 read runtime 时不再额外 clone document
- public query 结果已经与内部 runtime materialization 解耦，不再把缓存对象直接泄露给外部

### 5. 完善 `changes` 的使用方式

目标：

- 继续坚持 `changes` 是唯一正式 change protocol
- 不新增并列 dirty tag / event 协议
- 让 read / UI / 外部调用方都围绕同一套 change summary 工作

当前已具备的基础：

- engine -> UI reconcile 已经走 `changes` summary
- read runtime 也已经只围绕同一份 `changes` summary 做 reconcile
- 后续重点是继续把更多外部调用模式收得更纯

### 6. 继续稳定 ordering 模型

目标：

- 坚持 `view.ordering + placements + derived order`
- 明确 sort 是 display overlay，不能与 manual row reorder 同时主导最终顺序
- 不回到 `valueIndex` / `record.move`
- 保持 source document 与 projection order 的职责分离
- manual row reorder 继续收敛到原子 command；单行用 `view.placeRecord`，多行 block reorder 用 `view.placeRecords`

---

## P2：把 React UI state 做稳

### 7. 继续明确 UI 状态的持久化边界

目标：

- 只持久化真正跨会话、跨 UI 仍成立的状态
- 把 DOM / React / 单 view 临时交互态留在 UI 层
- React hooks 作为 UI 状态载体时也遵守同一套边界

### 8. 强化 reconcile 规则

目标：

- document 变化后，UI state 能稳定 reconcile
- 不让 selection / focus 挂到失效 record 上
- 保持不同 view 能共享 document truth
- reconcile 规则应可复用到 React UI 状态

### 8.1 稳定 kanban 的 view-local 协议

目标：

- 保持 kanban 的 bucket 内容继续 derived
- 把 bucket catalog / 顺序 / 显隐 / 元数据稳定在 `view.options.kanban`
- 收敛跨列拖拽、快速新建、局部 drag state 的 React 边界

当前已具备的基础：

- `react` 子入口已经提供 `GroupKanbanView`
- kanban 已沿用 `groupBy + ordering.scope='bucket' + placements`
- kanban options schema 已收敛到 `core`，可以稳定复用 normalize / patch helper
- kanban toolbar 已能直接驱动 `search / filter / sort / groupBy`
- demo 已能同时验证 table / kanban 两个 view

---

## P3：仓库化与发布化

### 9. 让 `group/` 真正独立可运行

目标：

- 清理对上层仓库的路径依赖
- 本仓库本地安装和运行 `typecheck / demo`
- 补充 CI、metadata、版本策略

### 10. 文档本地化

目标：

- 把真正必要的设计文档下沉到 `group/`
- 让新仓库本身就能说明白架构与约束
- 降低对主仓根目录文档的依赖

---

## 暂缓项

当前不优先：

- 新 view 大量扩张
- plugin / hook 系统
- 过早拆成复杂多包 monorepo
- 围绕旧 group 做兼容桥

## 一句话优先级

先把：

```txt
engine -> read -> react(ui) -> repo extraction
```

这条基础链路做干净，再去扩更多 view 和生态层。
