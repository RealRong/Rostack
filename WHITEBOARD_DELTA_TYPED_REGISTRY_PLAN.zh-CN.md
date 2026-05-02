# Whiteboard Mutation Model 最终设计

## 结论

长期最优、同时也最简单的设计是：

- 不再分别维护 `entities`、`mutation registry`、`delta facade`
- 改为 **一份 authored source of truth**：`MutationModel`
- 从这一个 model 自动生成：
  - typed writer
  - typed document reader
  - typed mutation delta reader
  - mutation engine apply / delta compile / footprint compile 所需的内部元数据

也就是说，最终不应该再有下面这种分裂：

- `whiteboardEntities`
- `whiteboardMutationRegistry`
- `editorStateRegistry`
- `createWhiteboardMutationDelta()`
- `createEditorStateMutationDelta()`

而应该统一成：

- `whiteboardMutationModel`
- `editorStateMutationModel`

所有 typed API 都从 model 派生，不再手写第二份协议。

---

## 设计目标

最终设计必须满足这四点：

1. **一处定义**
   - mutation family、结构、change aspect 只定义一次

2. **上层不写 path 字符串**
   - compile、runtime、projection 不再写 `node.geometry`、`state.viewport`、`overlay.preview`
   - 也不再写 `'position.x'`、`'data.title'` 这种 patch path

3. **typed writer / typed reader / typed delta**
   - writer 写入是 typed 的
   - document access 是 typed 的
   - delta 消费也是 typed 的

4. **命名统一**
   - 统一叫 `MutationModel`
   - 不再混用 `Entities` / `Registry` / `Delta` 三种 authored 名称

---

## 最终抽象

最终只保留一个核心 authored API：

```ts
const model = defineMutationModel<Doc>()(...)
```

它是 mutation 系统唯一需要人工维护的声明。

由它自动生成：

```ts
type Writer = MutationWriter<typeof model>
type Reader = MutationReader<typeof model>
type Delta = MutationDeltaOf<typeof model>
```

并且 engine 直接吃这个 model：

```ts
const engine = new MutationEngine({
  model,
  document,
  normalize,
  compile,
})
```

---

## 最终 API 设计

### 1. 顶层 API

```ts
import {
  defineMutationModel,
  singleton,
  mapFamily,
  tableFamily,
  value,
  record,
  ordered,
  tree,
  unset,
  type MutationWriter,
  type MutationReader,
  type MutationDeltaOf,
} from '@shared/mutation'
```

### 2. Family 定义

每个 family 同时定义：

- 文档访问方式
- typed member
- change aspect
- 可选 ordered / tree structure

形状如下：

```ts
const example = mapFamily<Id, Entity>()({
  access: {
    read: (doc) => doc.entities,
    write: (doc, next) => ({ ...doc, entities: next }),
  },
  members: {
    title: value<string>(),
    data: record<Record<string, unknown>>(),
  },
  changes: ({ value, record }) => ({
    content: [
      value('title'),
      record('data').deep(),
    ],
  }),
  ordered: {
    tags: ordered<Tag>()({
      read: (doc, id) => doc.entities[id].tags,
      write: (doc, id, items) => ...,
      identify: (item) => item.id,
      emits: 'content',
    }),
  },
})
```

这里有几个关键点：

- `members` 是 typed 的，不再是裸字符串 map
- `changes` 用 builder 引用 member，不再直接写自由 path selector
- ordered / tree 结构挂在 family 下面，不再和 entity schema 分裂
- `emits` 引用 family 本地的 change aspect，不再手写第二份 delta key

### 3. Model 输出的 typed surface

#### Writer

```ts
type WhiteboardWriter = MutationWriter<typeof whiteboardMutationModel>
```

示例：

```ts
writer.node.create(node)

writer.node.patch(nodeId, {
  position: { x: 120, y: 80 },
  data: {
    meta: {
      title: 'Next'
    }
  }
})

writer.node.patch(nodeId, {
  owner: unset(),
})

writer.edge.labels(edgeId).insert(label, { after: otherLabelId })
writer.edge.route(edgeId).move(pointId, { before: otherPointId })
writer.document.order().move(itemKey, { after: otherItemKey })
writer.mindmap.structure(mindmapId).move(nodeId, parentId, index)
```

要求：

- 上层不再传 `Record<string, unknown>` 的 path patch
- `patch()` 输入是 typed patch object
- 删除 optional 字段通过 `unset()`
- ordered / tree 结构也走 typed port

#### Reader

```ts
type WhiteboardReader = MutationReader<typeof whiteboardMutationModel>
```

示例：

```ts
reader.node.get(nodeId)
reader.node.require(nodeId)
reader.edge.labels(edgeId).items()
reader.edge.route(edgeId).items()
reader.document.order().items()
reader.mindmap.structure(mindmapId).snapshot()
```

说明：

- 这是 **mutation model 生成的 document access reader**
- 它的职责是给 compile / apply / mutation helper 提供统一 typed 访问
- 领域级 computed reader 可以继续单独存在，但 mutation 基础访问不再分散

#### Delta

```ts
type WhiteboardDelta = MutationDeltaOf<typeof whiteboardMutationModel>
```

示例：

```ts
delta.document.background.changed()
delta.document.order.changed()

delta.node.create.changed(nodeId)
delta.node.delete.changed(nodeId)
delta.node.geometry.changed(nodeId)
delta.node.geometry.touchedIds()
delta.node.touchedIds()

delta.edge.route.changed(edgeId)
delta.edge.labels.touchedIds()

delta.mindmap.structure.changed(mindmapId)
delta.group.value.changed(groupId)
```

要求：

- 不再手写 `createWhiteboardMutationDelta()`
- 不再手写 `createEditorStateMutationDelta()`
- delta facade 由 model 自动生成
- family 聚合能力也由 model 自动生成

---

## Whiteboard 最终定义形状

最终 whiteboard 不再拆成 `entities.ts + targets.ts + mutation/delta.ts` 三份 authored 协议，而是收成一份：

```ts
export const whiteboardMutationModel = defineMutationModel<Document>()({
  document: singleton({
    access: {
      read: (doc) => doc,
      write: (_doc, next) => next,
    },
    members: {
      id: value<string>(),
      name: value<string>(),
      background: value<Document['background'] | undefined>(),
      order: record<readonly CanvasItemRef[]>(),
    },
    changes: ({ value, record }) => ({
      value: [value('id'), value('name')],
      background: [value('background')],
      order: [record('order').self()],
    }),
    ordered: {
      order: ordered<CanvasItemRef>()({
        read: (doc) => doc.order,
        write: (doc, _key, items) => ({
          ...doc,
          order: items,
        }),
        identify: canvasRefKey,
        emits: 'order',
      }),
    },
  }),

  node: mapFamily<NodeId, Node>()({
    access: {
      read: (doc) => doc.nodes,
      write: (doc, next) => ({ ...doc, nodes: next }),
    },
    members: {
      type: value<Node['type']>(),
      position: value<Node['position']>(),
      size: value<Node['size']>(),
      rotation: value<Node['rotation']>(),
      groupId: value<Node['groupId']>(),
      owner: value<Node['owner']>(),
      locked: value<Node['locked']>(),
      data: record<Node['data']>(),
      style: record<Node['style']>(),
    },
    changes: ({ value, record }) => ({
      geometry: [
        value('position'),
        value('size'),
        value('rotation'),
      ],
      owner: [
        value('groupId'),
        value('owner'),
      ],
      content: [
        value('type'),
        value('locked'),
        record('data').deep(),
        record('style').deep(),
      ],
    }),
  }),

  edge: mapFamily<EdgeId, Edge>()({
    access: {
      read: (doc) => doc.edges,
      write: (doc, next) => ({ ...doc, edges: next }),
    },
    members: {
      source: value<Edge['source']>(),
      target: value<Edge['target']>(),
      type: value<Edge['type']>(),
      locked: value<Edge['locked']>(),
      groupId: value<Edge['groupId']>(),
      textMode: value<Edge['textMode']>(),
      route: record<Edge['route']>(),
      style: record<Edge['style']>(),
      labels: record<Edge['labels']>(),
      data: record<Edge['data']>(),
    },
    changes: ({ value, record }) => ({
      endpoints: [
        value('source'),
        value('target'),
        value('type'),
        value('locked'),
        value('groupId'),
        value('textMode'),
      ],
      route: [record('route').deep()],
      style: [record('style').deep()],
      labels: [record('labels').deep()],
      data: [record('data').deep()],
    }),
    ordered: {
      labels: ordered<EdgeLabel>()({
        read: (doc, edgeId) => getLabels(doc.edges[edgeId]),
        write: (doc, edgeId, items) => writeEdgeLabels(doc, edgeId, items),
        identify: (label) => label.id,
        emits: 'labels',
      }),
      route: ordered<EdgeRoutePoint>()({
        read: (doc, edgeId) => getManualRoutePoints(doc.edges[edgeId]),
        write: (doc, edgeId, items) => writeEdgeRoute(doc, edgeId, items),
        identify: (point) => point.id,
        emits: 'route',
      }),
    },
  }),

  mindmap: mapFamily<MindmapId, MindmapRecord>()({
    access: {
      read: (doc) => doc.mindmaps,
      write: (doc, next) => ({ ...doc, mindmaps: next }),
    },
    members: {
      root: value<MindmapRecord['root']>(),
      members: record<MindmapRecord['members']>(),
      children: record<MindmapRecord['children']>(),
      layout: record<MindmapRecord['layout']>(),
    },
    changes: ({ value, record }) => ({
      structure: [
        value('root'),
        record('members').deep(),
        record('children').deep(),
      ],
      layout: [
        record('layout').deep(),
      ],
    }),
    tree: {
      structure: tree<WhiteboardMindmapTreeValue>()({
        read: (doc, mindmapId) => createMindmapTreeSnapshot(doc.mindmaps[mindmapId]),
        write: (doc, mindmapId, snapshot) => writeMindmapTreeSnapshot(doc, mindmapId, snapshot),
        emits: 'structure',
      }),
    },
  }),

  group: mapFamily<GroupId, Group>()({
    access: {
      read: (doc) => doc.groups,
      write: (doc, next) => ({ ...doc, groups: next }),
    },
    members: {
      locked: value<Group['locked']>(),
      name: value<Group['name']>(),
    },
    changes: ({ value }) => ({
      value: [
        value('locked'),
        value('name'),
      ],
    }),
  }),
})
```

### 这份定义取代什么

它直接取代：

- `whiteboard/packages/whiteboard-core/src/mutation/entities.ts`
- `whiteboard/packages/whiteboard-core/src/mutation/targets.ts`
- `whiteboard/packages/whiteboard-engine/src/mutation/delta.ts`

其中：

- 原 `entities.ts` 的 change 分类并入 family `changes`
- 原 `targets.ts` 的 ordered/tree read/write/identify 并入 family `ordered` / `tree`
- 原 `delta.ts` 的 semantic facade 全部自动生成

---

## Editor State 最终定义形状

editor state 也走同一套模型，不再单独叫 registry。

```ts
export const editorStateMutationModel = defineMutationModel<EditorStateDocument>()({
  state: singleton({
    access: {
      read: (doc) => doc.state,
      write: (doc, next) => ({ ...doc, state: next }),
    },
    members: {
      tool: record<Tool>(),
      draw: record<DrawState>(),
      selection: record<SelectionTarget>(),
      edit: record<EditSession>(),
      interaction: record<EditorStableInteractionState>(),
      viewport: record<Viewport>(),
    },
    changes: ({ record }) => ({
      tool: [record('tool').deep()],
      draw: [record('draw').deep()],
      selection: [record('selection').deep()],
      edit: [record('edit').deep()],
      interaction: [record('interaction').deep()],
      viewport: [record('viewport').deep()],
    }),
  }),

  overlay: singleton({
    access: {
      read: (doc) => doc.overlay,
      write: (doc, next) => ({ ...doc, overlay: next }),
    },
    members: {
      hover: record<HoverState>(),
      preview: record<PreviewInput>(),
    },
    changes: ({ record }) => ({
      hover: [record('hover').deep()],
      preview: [record('preview').deep()],
    }),
  }),
})
```

它直接取代：

- `whiteboard/packages/whiteboard-editor/src/state-engine/entities.ts`
- `whiteboard/packages/whiteboard-editor/src/state-engine/delta.ts`

最终上层统一消费：

```ts
delta.state.viewport.changed()
delta.overlay.preview.changed()
```

不再出现：

- `Object.keys(delta.changes).some(key => key.startsWith('state.viewport.'))`

---

## Engine / Program / Delta 的最终职责

### `defineMutationModel`

职责：

- 描述 family
- 描述 member
- 描述 change aspect
- 描述 ordered/tree structure
- 描述 typed patch / read / delta surface 所需信息

### `compileMutationModel(model)`

内部编译产物，不手写。

职责：

- 编译 access
- 编译 patch lowerer
- 编译 change selector
- 编译 delta aspect metadata
- 编译 writer / reader / delta facade 元数据

### `MutationEngine`

直接接收 `model`，不再接收 `registry`。

```ts
new MutationEngine({
  model: whiteboardMutationModel,
  document,
  normalize,
  compile,
})
```

职责：

- apply typed mutation steps
- 从 model 编译 entity/ordered/tree effect
- 产出 **canonical base mutation delta**

### `MutationWriter`

compile handler 只拿 typed writer，不拿 string path writer。

```ts
type Program = MutationWriter<typeof whiteboardMutationModel>
```

### `MutationReader`

compile / helper 层如果需要基础结构访问，拿 typed reader。

```ts
type Reader = MutationReader<typeof whiteboardMutationModel>
```

### `MutationDeltaOf`

engine commit 返回 typed delta，不再需要手写 adapter。

```ts
type Delta = MutationDeltaOf<typeof whiteboardMutationModel>
```

commit 里的 delta 形状应为：

```ts
{
  raw: RawMutationDelta
  document: ...
  node: ...
  edge: ...
  ...
}
```

其中：

- `raw` 保留底层 normalized 结构，供 merge / persistence / debug 使用
- 上层正常只用 typed delta facade

---

## Projection 的最终关系

projection 不负责 mutation base delta 的定义，只负责 derived delta。

关系应该是：

```ts
typed mutation model
  -> typed writer
  -> engine commit
  -> typed base mutation delta
  -> projection derives projection delta
```

因此：

- `document.order`、`node.geometry`、`edge.route`、`state.viewport` 属于 mutation model
- `GraphPhaseDelta`、`RenderPhaseDelta`、`ProjectionFamilyChange` 属于 projection

projection 只消费：

```ts
delta.node.geometry.touchedIds()
delta.edge.labels.changed(edgeId)
delta.state.viewport.changed()
```

不再消费 path 字符串，也不再自己猜 mutation 协议。

---

## 命名统一规则

只保留这套命名：

- `whiteboardMutationModel`
- `editorStateMutationModel`
- `MutationWriter<TModel>`
- `MutationReader<TModel>`
- `MutationDeltaOf<TModel>`

不再新增 authored 名称：

- `*Entities`
- `*Registry`
- `*DeltaSchema`

内部如果需要编译结果，统一叫：

- `compileMutationModel()`
- `CompiledMutationModel`

---

## 对 `signal(delta)` 的处理

长期方案里，裸 `signal(delta)` 应该废弃。

如果某个领域将来确实需要非结构性 semantic change，应该放进 model 的 typed `events` 或 `signals`。

但 whiteboard 当前不应该预置任何这类事件。

尤其不应该引入 `externalVersion` 这类与 whiteboard 域无关、只是在其他系统里存在过的概念。

原则很简单：

- 没有真实 domain 需求，就不要有 event
- 不要再让上层直接塞 raw delta key

---

## 实施方案

### Phase 1：引入 `MutationModel`

修改 shared mutation 基础设施，新增：

- `defineMutationModel`
- `compileMutationModel`
- `MutationWriter<TModel>`
- `MutationReader<TModel>`
- `MutationDeltaOf<TModel>`
- typed patch lowering

同时保留一段时间兼容层：

- `defineMutationRegistry`
- `createMutationPorts`

但它们只作为过渡，不再继续扩展。

### Phase 2：重写 Whiteboard 文档 mutation

落地：

- 新建 `whiteboard/packages/whiteboard-core/src/mutation/model.ts`
- **强制把 `Document.canvas.order` 重构为 `Document.order`，不保留 `canvas` 壳层**
- **强制删除 `Document.meta`，不保留 `createdAt` / `updatedAt` 这种当前零使用字段**
- **强制把所有 `canvas.order` 的类型、reader、writer、intent、compile、delta、projection、scene、editor、test 全部替换为 `order`**
- **强制把所有 `Document.meta`、`document.meta`、`DocumentPatch.meta` 相关类型和使用点全部删除**
- **不提供兼容别名，不保留 `canvasOrder`、`canvas.order`、`delta.canvas.orderChanged()` 这类旧 API**
- **不引入任何 `externalVersion` / `external.version` / 默认 event 概念**
- 把 `entities.ts` 和 `targets.ts` 合并进 `whiteboardMutationModel`
- 让 `createWhiteboardMutationPorts` 消失，直接用 `MutationWriter<typeof whiteboardMutationModel>`
- 让 `whiteboard-engine/src/mutation/delta.ts` 消失，直接用 `MutationDeltaOf<typeof whiteboardMutationModel>`

这一步完成后，whiteboard 文档相关命名必须统一为：

- 文档字段：`document.order`
- writer：`writer.document.order()`
- reader：`reader.document.order()`
- delta：`delta.document.order.changed()`
- intent / operation：`document.order.move`

同时 whiteboard 文档层必须明确满足：

- 没有 `document.meta`
- 没有 `externalVersion`
- 没有默认 `events`

### Phase 3：重写 Editor State mutation

落地：

- 新建 `whiteboard/packages/whiteboard-editor/src/state-engine/model.ts`
- 删除 `entities.ts`
- 删除 `delta.ts` 里手写 facade
- viewport watcher、commit flags 等都改成消费 `MutationDeltaOf<typeof editorStateMutationModel>`

### Phase 4：Engine commit typed 化

修改 mutation engine 的 commit 类型：

- `commit.delta` 直接变成 typed delta facade
- `commit.delta.raw` 暴露 normalized raw delta

这样 projection / runtime / tests 不需要再自己包一层 adapter。

### Phase 5：Projection 全面切换到 typed base delta

projection 保持自己的 derived delta 不变，但输入统一改为 typed base delta：

- whiteboard editor scene
- active/runtime facts
- runtime invalidation

要求：

- 不再读 `delta.has('...')`
- 不再读 `delta.changed('...', id)`
- 不再读 `delta.paths(...)`
- 上层一律读 typed surface

---

## 最终判断

长期最优设计不是：

- 再补一份 `mutationDeltaSchema`
- 继续维护 `entities + registry + delta facade`

长期最优设计是：

**用一份 `MutationModel` 同时定义 family、structure、change aspect，所有 typed writer / reader / delta 都从它自动生成。**

这套设计的结果是：

1. 只有一份 authored mutation 协议
2. 上层不再写 path 字符串
3. mutation delta 自动生成
4. projection 只负责 derived delta
5. whiteboard / editor state 命名和机制完全统一

这就是最终应该收敛到的形态。
