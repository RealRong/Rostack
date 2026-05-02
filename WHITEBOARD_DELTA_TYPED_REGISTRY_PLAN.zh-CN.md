# Whiteboard Typed Mutation / Delta / Registry 最终方案

## 目标

把 whiteboard 的 mutation 协议收敛为一份 authored model。

最终要求：

- 一处定义，处处 typed 使用
- 不再手写 path 字符串表达 mutation / delta 协议
- 不再分别维护 `entities`、`registry`、`delta facade`
- projection 继续负责 derived delta，但 base mutation delta 必须自动生成
- 不保留兼容层、过渡层、双轨实现

---

## 最终结论

长期最优设计不是继续补：

- `whiteboardEntities`
- `whiteboardMutationRegistry`
- `editorStateRegistry`
- `mutationDeltaSchema`
- `createWhiteboardMutationDelta()`
- `createEditorStateMutationDelta()`

长期最优设计是：

**用一份 `MutationModel` 同时定义 family、access、members、changes、ordered、tree，然后自动生成 typed writer / typed reader / typed delta。**

也就是说：

- entity schema 在 model 里定义
- mutation writer 从 model 自动生成
- mutation reader 从 model 自动生成
- mutation delta 从 model 自动生成
- engine commit 直接携带 typed delta
- projection 只消费 typed base delta，再派生自己的 projection delta

---

## 统一命名

最终只保留以下命名层次：

- shared：`MutationModel`
- whiteboard document：`whiteboardMutationModel`
- editor state：`editorStateMutationModel`

不再新增 authored 名称：

- `*Entities`
- `*Registry`
- `*DeltaSchema`

编译产物统一叫：

- `compileMutationModel()`
- `CompiledMutationModel`

---

## 最终 API

### 1. Shared mutation model

```ts
const model = defineMutationModel<Document>()({
  document: singleton({
    access: {
      read: (doc) => ({ ... }),
      write: (doc, next) => ({ ...doc, ... }),
    },
    members: {
      name: record<string>(),
      order: record<readonly CanvasItemRef[]>(),
    },
    changes: ({ record }) => ({
      name: [record('name').deep()],
      order: [record('order').self()],
    }),
    ordered: {
      order: ordered<CanvasItemRef>()({
        read: (doc) => doc.order,
        write: (doc, items) => ({ ...doc, order: items }),
        identify: (item) => `${item.kind}\u0000${item.id}`,
        emits: 'order',
      }),
    },
  }),
})
```

共享层提供：

- `defineMutationModel`
- `compileMutationModel`
- `createMutationWriter`
- `createMutationReader`
- `createMutationDelta`
- `MutationWriter<TModel>`
- `MutationReader<TModel>`
- `MutationDeltaOf<TModel>`

### 2. Typed writer

```ts
writer.document.patch({ name: 'Next' })
writer.document.order().move(itemKey, { after: otherKey })
writer.node.patch(nodeId, { geometry: nextGeometryPatch })
writer.edge.route(edgeId).splice(...)
writer.mindmap.structure(id).replace(tree)
```

### 3. Typed reader

```ts
reader.document.get()
reader.document.order().items()
reader.node.get(nodeId)
reader.edge.route(edgeId).items()
reader.mindmap.structure(id).snapshot()
```

### 4. Typed delta

```ts
delta.document.order.changed()
delta.node.geometry.changed(nodeId)
delta.edge.route.changed(edgeId)
delta.mindmap.structure.changed(mindmapId)
delta.state.viewport.changed()
```

禁止再写：

- `delta.has('...')`
- `delta.changed('...', id)`
- `delta.paths(...)`
- path 字符串判定逻辑

原始 normalized delta 只作为底层数据保留在：

```ts
commit.delta.raw
```

---

## Whiteboard 文档最终形态

### 文档字段

强制统一为：

- `document.order`

强制删除：

- `document.canvas.order`
- `Document.meta`
- `document.meta`
- `DocumentPatch.meta`

### 文档 mutation 最终命名

- 字段：`document.order`
- writer：`writer.document.order()`
- reader：`reader.document.order()`
- delta：`delta.document.order.changed()`
- intent / operation：`document.order.move`
- footprint structure：`document.order`

### 文档 mutation 最终约束

- 不保留 `canvas` 壳层
- 不保留 `canvasOrder`
- 不保留 `canvas.order`
- 不保留 `delta.canvas.orderChanged()`
- 不保留 whiteboard 手写 delta adapter
- 不保留 whiteboard authored registry

---

## Editor State 最终形态

editor state 和 whiteboard document 使用同一套机制：

- `editorStateMutationModel`
- `MutationWriter<typeof editorStateMutationModel>`
- `MutationReader<typeof editorStateMutationModel>`
- `MutationDeltaOf<typeof editorStateMutationModel>`

最终要求：

- 删除 `state-engine/entities.ts`
- 删除手写 base delta facade
- viewport watcher 直接读 `delta.state.viewport.changed()`
- commit flag 聚合直接消费 typed delta

---

## Engine / Commit / Projection 最终形态

### Engine

`MutationEngine` 直接接收 `model`：

```ts
new MutationEngine({
  document,
  normalize,
  model: whiteboardMutationModel,
  compile,
})
```

不再需要：

- `registry`
- `createReader`
- whiteboard 自己包一层 mutation ports

### Commit

`commit.delta` 直接是 typed delta facade：

```ts
type WhiteboardMutationDelta = MutationDeltaOf<typeof whiteboardMutationModel>
type EditorStateMutationDelta = MutationDeltaOf<typeof editorStateMutationModel>
```

### Projection

projection 继续维护自己的 derived delta，但输入必须是 typed base delta：

- whiteboard editor scene
- runtime facts
- invalidation / impact

projection 不再负责把 raw delta 包一层 adapter。

---

## 必须删除的概念

以下概念在最终方案里都不应该存在：

- `whiteboardMutationRegistry`
- `whiteboardEntities`
- `editorStateRegistry`
- `createWhiteboardMutationDelta`
- `createEditorStateMutationDelta`
- `mutationDeltaSchema`
- `Document.meta`
- `externalVersion`
- `external.version`
- 默认 event
- 默认 signal

如果将来真的需要 semantic signal，必须回到 model 层设计 typed `events/signals`，而不是让上层手塞 raw delta key。

whiteboard 当前没有这个需求，因此最终状态是：

- 没有 `externalVersion`
- 没有默认 `events`
- 没有默认 `signals`

---

## 已落地实施结果

### Phase 1：shared mutation model

已完成：

- shared mutation 新增 `MutationModel` 体系
- writer / reader / delta 可由 model 自动生成
- engine 支持直接传 `model`
- entity apply 支持 model access
- commit 类型支持 typed delta

### Phase 2：whiteboard document mutation

已完成：

- 新建 `whiteboardMutationModel`
- 删除 `whiteboard-core/src/mutation/entities.ts`
- 删除 `whiteboard-core/src/mutation/program.ts`
- 删除 `whiteboard-engine/src/mutation/delta.ts`
- `Document.canvas.order -> Document.order`
- `canvas.order.move -> document.order.move`
- `Document.meta` 删除
- whiteboard 文档侧 registry / handwritten delta 全部移除

### Phase 3：editor state mutation

已完成：

- 新建 `editorStateMutationModel`
- 删除 `whiteboard-editor/src/state-engine/entities.ts`
- `delta.ts` 改成消费 typed mutation delta
- runtime / viewport watcher / commit flag 聚合改成 typed delta

### Phase 4：engine commit typed 化

已完成：

- document engine commit 输出 `WhiteboardMutationDelta`
- editor state commit 输出 `EditorStateMutationDelta`
- projection / runtime / tests 不再自建 adapter

### Phase 5：projection / runtime / tests 全面切换

已完成：

- editor scene 直接消费 typed document delta
- invalidation / impact 改成 `order`
- tests 全部切换到新字段和新 delta 入口
- 不保留兼容别名

---

## 验收标准

最终代码必须满足：

1. 搜索层面不存在以下符号：
   - `whiteboardMutationRegistry`
   - `whiteboardEntities`
   - `editorStateRegistry`
   - `createWhiteboardMutationDelta`
   - `createEditorStateMutationDelta`
   - `Document.meta`
   - `document.meta`
   - `externalVersion`
   - `external.version`
   - `canvasOrder`
   - `document.canvas`

2. whiteboard 文档 API 统一为：
   - `document.order`
   - `writer.document.order()`
   - `reader.document.order()`
   - `delta.document.order.changed()`
   - `document.order.move`

3. editor state API 统一为：
   - `editorStateMutationModel`
   - typed writer / reader / delta

4. engine / scene / react / tests 全部通过类型检查

5. 不保留兼容层和双轨实现

---

## 最终判断

这次收敛后的最终结构是：

- 一份 shared mutation model 基础设施
- 一份 `whiteboardMutationModel`
- 一份 `editorStateMutationModel`
- 自动生成 typed writer / reader / delta
- projection 只负责 derived delta

这就是 whiteboard mutation / delta / registry 的长期最优形态。
