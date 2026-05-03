# Shared Mutation 最终 API 设计与实施方案

## 目标

`shared/mutation` 最终只保留一套基于 `schema` 的 mutation 模型，并满足以下约束：

- schema 是唯一真实定义源
- schema 作者写的是数据形态，不是 mutation 内核配置
- reader / writer / delta / query 全部从同一份 schema 自动生成
- 业务层不再接触 path 字符串
- 业务层不再接触 structure key 字符串
- 业务层不再接触 handle / registry / compiled spec
- 业务层不再接触 program / step / operation
- runtime 只负责执行
- 不保留兼容层，不保留第二套实现

核心原则：

**schema 必须是 shape-first。**

也就是：

- 先定义数据长什么样
- 再由 engine 自动推导 mutation 能力

而不是：

- 先定义 entities / structures / registry
- 再让作者把业务模型翻译成 mutation 内核配置

---

## 最终对外 API

`@shared/mutation` 根入口只保留：

```ts
export {
  schema,
  field,
  object,
  dictionary,
  table,
  map,
  singleton,
  sequence,
  tree,
  createMutationEngine,
  createMutationReader,
  createMutationWriter,
  createMutationDelta,
  createMutationQuery,
  mergeMutationDeltas,
}

export type {
  MutationCompile,
  MutationSchema,
  MutationReader,
  MutationWriter,
  MutationDelta,
  MutationQuery,
  MutationResult,
  MutationCommit,
  MutationIssue,
}
```

不再对业务层公开：

- `MutationProgram`
- `MutationProgramStep`
- `MutationCompileHandlerTable`
- `MutationCompileHandlerContext`
- `MutationCompileControl`
- `MutationExecuteResultOfInput`
- `CompiledEntitySpec`
- `CompiledOrderedSpec`
- `CompiledTreeSpec`
- `contracts` / `engine` / `write` 子路径
- 任意 internal handle 类型

业务层唯一入口就是根入口。

---

## 最终 schema 形态

### 1. 顶层直接描述 document shape

最终 schema 必须像定义数据形态一样书写：

```ts
const mutationSchema = schema({
  order: sequence<CanvasItemRef>(),

  views: table<ViewId>({
    name: field<string>(),
    query: field<Query>(),
    fields: sequence<FieldId>(),
  }),

  records: table<RecordId>({
    title: field<string>(),
    parentId: field<RecordId | undefined>(),
    values: dictionary<FieldId, FieldValue>(),
  }),

  mindmaps: table<MindmapId>({
    name: field<string>(),
    tree: tree<MindmapNodeId, MindmapNodeValue>(),
  }),
})
```

作者看到的 schema 就应该接近 document 实际 shape，而不是额外包一层 mutation 术语。

### 2. 作者 API 不再区分 roots / entities / structures

删除这些作者视角概念：

- `roots`
- `entities`
- `structures`
- `fields`
- `ordered`
- `tree` registry

这些概念可以在内核里存在，但不能出现在作者 API 里。

对作者来说，只有“shape 成员”：

- `field`
- `object`
- `dictionary`
- `table`
- `map`
- `singleton`
- `sequence`
- `tree`

### 3. 默认自动推导读写路径

作者默认不再写：

- `access.read`
- `access.write`

因为 shape 已经足够表达标准存储结构。

比如：

```ts
records: table<RecordId>({
  title: field<string>(),
  values: dictionary<FieldId, FieldValue>(),
})
```

就足够让 engine 自动知道：

- `records` 是 keyed collection
- `records[recordId]` 是一个 record
- `values` 是 record 下的 dictionary

### 4. 只保留极少数 override escape hatch

如果某个节点的实际存储结构不符合标准 shape，再允许显式 override：

```ts
const mutationSchema = schema({
  views: table<ViewId>({
    name: field<string>(),
    fields: sequence<FieldId>(),
  }).from({
    read: (doc) => doc.viewState.byId,
    write: (doc, byId) => ({ ...doc, viewState: { ...doc.viewState, byId } }),
  }),
})
```

约束：

- `.from(...)` 是例外能力
- 不是默认必填项
- 只有标准 shape 无法表达时才允许使用

---

## 最终 schema 节点类型

### 1. 标量字段

```ts
field<T>()
```

用于：

- `name`
- `title`
- `parentId`
- `query`

### 2. 对象字段

```ts
object<T extends object>({
  ...
})
```

用于：

- 嵌套对象
- 需要按子属性追踪变化的对象

### 3. 字典

```ts
dictionary<TKey extends string, TValue>()
```

用于：

- `record.values`
- `field.optionsById`

### 4. table

```ts
table<TId extends string>({
  ...
})
```

用于：

- 顶层 `views`
- 顶层 `records`
- 顶层 `mindmaps`

语义是：

- `ids/byId` 型 keyed collection
- 元素有稳定 id
- 支持 create / patch / remove

### 5. map

```ts
map<TKey extends string, TValue>()
```

用于：

- 简单 keyed collection
- 不需要 table 那种实体语义时

### 6. singleton

```ts
singleton({
  ...
})
```

用于：

- 需要明确表达为单例对象，但又要给它挂 mutation shape 的场景

### 7. sequence

```ts
sequence<TId>()
```

用于：

- `order`
- `view.fields`
- 任意有序 id 列表

### 8. tree

```ts
tree<TNodeId extends string, TValue>()
```

用于：

- `mindmap.tree`
- 任意树状结构

---

## 最终 schema 约束

### 1. sequence / tree 必须是一等概念

不能为了 API 简洁把它们降级成普通 field。

因为 engine 需要从它们自动推导：

- insert / move / remove
- order delta
- tree structure delta
- inverse
- history

### 2. table / dictionary / field 必须显式

不能退化成纯 TS object shape。

因为 engine 需要知道：

- 是否是 keyed collection
- 是否按 id 变化
- 是否允许逐项 patch
- delta 粒度怎么推导

### 3. 默认能力全部自动推导

schema 节点一旦声明完成，以下能力必须自动生成：

- reader
- writer
- delta
- query
- inverse
- history payload

作者不再额外手写这几层协议。

---

## 最终自动生成的业务 API

schema 定义完成后，最终业务 API 必须长成业务导航形式，而不是 handle 传递形式。

### reader

```ts
reader.view(viewId).name()
reader.view(viewId).query()
reader.view(viewId).fields.ids()
reader.view(viewId).fields.contains(fieldId)
reader.view(viewId).fields.indexOf(fieldId)

reader.record(recordId).title()
reader.record(recordId).parentId()
reader.record(recordId).values.get(fieldId)

reader.mindmap(mindmapId).tree.node(nodeId)
reader.mindmap(mindmapId).tree.parent(nodeId)
reader.mindmap(mindmapId).tree.children(nodeId)
reader.mindmap(mindmapId).tree.isRoot(nodeId)

reader.document.order.ids()
reader.document.order.contains(itemId)
```

### writer

```ts
writer.view(viewId).patch({
  name: 'Table',
})
writer.view(viewId).fields.insert(fieldId, { after: prevId })
writer.view(viewId).fields.move(fieldId, { before: nextId })
writer.view(viewId).fields.remove(fieldId)
writer.view(viewId).fields.replace(ids)

writer.record(recordId).patch({
  title: 'Next',
})
writer.record(recordId).values.set(fieldId, value)
writer.record(recordId).values.delete(fieldId)

writer.mindmap(mindmapId).tree.insert(nodeId, {
  parentId,
  index,
  value,
})
writer.mindmap(mindmapId).tree.move(nodeId, {
  parentId,
  index,
})
writer.mindmap(mindmapId).tree.remove(nodeId)
writer.mindmap(mindmapId).tree.patch(nodeId, patch)

writer.document.order.insert(itemId, { after: prevId })
writer.document.order.move(itemId, { before: nextId })
writer.document.order.remove(itemId)
writer.document.order.replace(ids)
```

### delta

```ts
delta.view(viewId).changed()
delta.view(viewId).name.changed()
delta.view(viewId).query.changed()
delta.view(viewId).fields.changed()
delta.view(viewId).fields.orderChanged()
delta.view(viewId).fields.contains(fieldId)

delta.record(recordId).changed()
delta.record(recordId).title.changed()
delta.record(recordId).parentId.changed()
delta.record(recordId).values.changed(fieldId)
delta.record(recordId).values.anyChanged()

delta.mindmap(mindmapId).tree.changed()
delta.mindmap(mindmapId).tree.nodeChanged(nodeId)
delta.mindmap(mindmapId).tree.structureChanged()

delta.document.order.changed()
delta.document.order.orderChanged()
delta.document.order.contains(itemId)
```

### query

```ts
query.view(viewId).fields.contains(fieldId)
query.view(viewId).fields.before(fieldId)
query.view(viewId).fields.after(fieldId)

query.record(recordId).values.has(fieldId)

query.mindmap(mindmapId).tree.subtree(nodeId)
query.mindmap(mindmapId).tree.isDescendant(nodeId, parentId)

query.document.order.contains(itemId)
query.document.order.slot(itemId)
```

删除所有这类 API：

```ts
reader.entity(handle).get(id)
writer.structure(handle).replace(key, ids)
delta.changed(handle, key)
query.structure(handle).contains(key, id)
```

业务层不再传 handle，不再访问 registry 风格接口。

---

## 最终 change 设计

### 1. 基础 changes 默认自动生成

shape 一旦定义完成，engine 自动生成基础变化语义，例如：

- `view.name`
- `view.query`
- `view.fields`
- `record.title`
- `record.values`
- `mindmap.tree`
- `document.order`

这些基础变化不需要作者手写配置。

### 2. 只为聚合变化提供轻量扩展

如果业务需要更高层的逻辑变化，再额外声明聚合变化：

```ts
const mutationSchema = schema({
  records: table<RecordId>({
    title: field<string>(),
    values: dictionary<FieldId, FieldValue>(),
  }),
}).changes({
  recordContent: ({ records }) => [
    records.title,
    records.values,
  ],
})
```

约束：

- `.changes(...)` 只用于聚合变化
- 不是基础变化的主配置方式
- 不允许重新引入 path 字符串协议

### 3. 最终不再保留 mutationDeltaSchema

删除：

- `mutationDeltaSchema`
- 手写 path-based delta schema
- 业务层 hand-written delta adapter
- `input.query.delta.recordSetChanged(input.delta)` 这类外围包装

delta 一律由 schema 自动推导。

---

## 最终 compile API

compile context 只保留：

```ts
type MutationCompileContext<Schema, Intent, Services> = {
  intent: Intent
  document: SchemaDocument<Schema>
  read: MutationReader<Schema>
  write: MutationWriter<Schema>
  query: MutationQuery<Schema>
  change: MutationDelta<Schema>
  issue: {
    add(issue: MutationIssue): void
    all(): readonly MutationIssue[]
    hasErrors(): boolean
  }
  services: Services
}
```

最终 compile handler：

```ts
const compile = {
  handlers: {
    'view.field.insert': (ctx) => {
      ctx.write.view(ctx.intent.viewId).fields.insert(
        ctx.intent.fieldId,
        { after: ctx.intent.after }
      )
    },

    'record.title.set': (ctx) => {
      ctx.write.record(ctx.intent.recordId).patch({
        title: ctx.intent.title,
      })
    },
  },
}
```

最终删除：

- `ctx.reader`
- `ctx.writer`
- `ctx.delta(...)`
- `ctx.footprint(...)`
- `ctx.expect.*(...)`
- `ctx.invalid(..., path)`
- issue path 参数
- handler output 类型体操

最终 compile 只使用：

- `ctx.read`
- `ctx.write`
- `ctx.query`
- `ctx.change`
- `ctx.issue`
- `ctx.services`

并且：

- mutation delta 默认由 writer + schema 自动推导
- projection delta 只由 projection 自己负责
- `ctx.change` 直接表示当前 handler 已经产出的 typed change facade
- compile context 不再提供 `ctx.change.current()` / `ctx.change.changes(...)`
- 如果需要把某个外部 source 转成 typed change，只允许走 `query.changes(source)` 或更上层的 `frame.changes`

这里明确排除：

- 本轮不在 `shared/mutation` 内设计或实现通用 `footprint` 系统
- collab 需要的冲突范围能力，留到 mutation 主体全部收敛之后再单独设计

---

## 最终 engine API

最终只保留工厂形式：

```ts
const mutation = createMutationEngine({
  schema: mutationSchema,
  document,
  normalize,
  compile,
  services,
  history,
})
```

实例 API：

```ts
mutation.document()
mutation.reader()
mutation.execute(intent | intents, options?)
mutation.apply(writes, options?)
mutation.replace(document, options?)
mutation.subscribe(listener)
mutation.watch(listener)
mutation.history.undo()
mutation.history.redo()
mutation.history.clear()
```

约束：

- `reader()` 返回 schema reader
- `execute()` 输入 intent，输出 typed result
- `apply()` 输入 writer 产出的 internal writes
- `replace()` 只做整文档替换

删除：

- `MutationRuntime`
- `MutationEngine` / `MutationRuntime` 双层包装
- `createReader`
- `createWriter`
- 所有公开 runtime 泛型桥

最终只有一个公开 runtime 对象。

---

## 最终 history API

history 只围绕 commit。

```ts
mutation.history.canUndo()
mutation.history.canRedo()
mutation.history.undo()
mutation.history.redo()
mutation.history.clear()
```

commit 只保留：

```ts
type MutationCommit<Schema> =
  | MutationApplyCommit<Schema>
  | MutationReplaceCommit<Schema>
```

删除：

- `extra`
- metadata 壳
- program 兼容层附着信息

---

## 最终内部实现分层

最终 `shared/mutation` 内部只保留：

### 1. schema

- shape-first schema builder
- node kind 定义
- internal handles
- facade 自动生成

### 2. compile

- intent -> writer
- issue

### 3. runtime

- execute / apply / replace
- normalize
- history
- commit 分发

### 4. internal writes

- writer 产出的内部执行表示
- apply / inverse / merge / delta 推导

业务层完全不感知 internal writes 结构。

删除整类概念：

- reducer
- operation
- canonical operation
- mutation registry
- mutation delta schema
- 独立 reader 体系
- program 作为业务 API
- path string protocol
- structure handle 业务暴露
- emits string protocol
- contracts 子路径分发
- re-export barrel 层

---

## 最终目录形态

建议最终收敛为：

```ts
shared/mutation/src/
  index.ts
  schema/
    schema.ts
    field.ts
    object.ts
    dictionary.ts
    table.ts
    map.ts
    singleton.ts
    sequence.ts
    tree.ts
    changes.ts
    handles.ts
    facade.ts
  reader/
    createReader.ts
  writer/
    createWriter.ts
    writes.ts
  delta/
    createDelta.ts
    merge.ts
    facade.ts
  query/
    createQuery.ts
  compile/
    types.ts
  runtime/
    createEngine.ts
    history.ts
    commit.ts
  internal/
    apply.ts
    inverse.ts
```

不再保留：

- `engine/` 这个宽泛目录作为公共心智模型
- `contracts.ts` 超大聚合文件
- `model.ts` 超大聚合文件

必须按职责拆开。

---

## 实施方案

已完成阶段不再重复记录，这里只保留剩余工作。

### 1. 业务侧全面切换到新主体

`shared/mutation` 主体已经基本收敛，剩余大头在调用方。

需要继续做：

1. dataview 全面切到新的 `read / write / delta / query / change` 使用方式
2. whiteboard 全面切到新的 `read / write / delta / query / change` 使用方式
3. 删除业务内 compile helper、reader helper、delta helper、query helper 的历史协议
4. 删除 projection / active pipeline 中所有 path 字符串消费
5. 删除所有 schema handle / registry 风格暴露点
6. 不保留任何兼容层或双轨适配

完成标准：

- dataview / whiteboard 只依赖新的 root API
- 调用方不再感知 legacy schema、legacy delta、legacy reader/writer 协议

### 2. 最后一轮出口与残留清理

在调用方切完之后，再做一次包级清扫，防止旧概念回流。

需要继续做：

1. 复查根入口导出，继续删除不必要的公开类型
2. 复查目录下是否还有可以内联或下沉为 internal 的 helper / type
3. 复查是否还有历史命名残留，例如旧 delta / old reader / registry 心智
4. 逐项对照本文“最终约束”，确认没有遗漏项

完成标准：

- `@shared/mutation` 根入口是唯一公开入口
- 包内不存在旧心智残留
- 最终约束逐项满足

### 3. mutation 完成后的 collab conflict scope 设计

这一轮明确不做。

前置条件：

1. `shared/mutation` 主体已经完全收敛
2. dataview / whiteboard 已经全面切到新的 `read / write / delta / query / change`
3. 业务内不再依赖 legacy delta / legacy reader / legacy registry

完成这些前置条件之后，再单独设计 collab 的冲突范围模型。

方向约束：

1. 不把它放回 `shared/mutation`
2. 不恢复 `MutationFootprint` 这类通用 mutation 概念
3. 不允许 compile handler 手写 `ctx.footprint(...)`
4. 优先从 typed `change` 推导冲突范围
5. 只有纯 `change` 不能表达的冲突规则，才允许少量业务补充规则

建议形态：

- 把它定义为 collab/history 领域概念，例如 `ConflictScope` / `HistoryScope`
- 由 collab 层消费，而不是由 mutation core 暴露
- 用于 remote invalidation / local history conflict detection
- 序列化协议也归 collab，而不是归 mutation

---

## 最终约束

落地完成后，必须满足：

1. schema 顶层直接描述 document shape
2. schema 作者不再显式区分 roots / entities / structures
3. schema 默认不再要求手写 access.read / access.write
4. 业务层不再使用 path 字符串描述 mutation 变化
5. 业务层不再使用结构 key 字符串
6. 业务层不再传递 schema handle
7. 业务层不再接触 internal program / step
8. reader / writer / delta / query 全部从同一份 schema 自动生成
9. reader / writer / delta / query 全部使用业务导航 API
10. compile context 只剩 `read / write / query / change / issue / services`
11. history 只基于 commit
12. `@shared/mutation` 根入口是唯一公开入口
13. 不保留兼容 API
14. 不保留第二套实现
