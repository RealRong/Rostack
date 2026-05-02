# Whiteboard Reader / Query 收敛最终方案

## 目标

把 whiteboard 的读侧协议收敛到一套清晰边界：

- `MutationReader<typeof whiteboardMutationModel>` 是唯一基础 reader
- 派生领域查询统一放到 `query(reader)` 层
- compile 诊断能力单独放到 `ctx.expect` / `ctx.invalid`
- 删除 `DocumentReader` / `WhiteboardCompileReader` 这两套平行 reader 协议

最终要求：

- 不再并行维护多套 reader surface
- 不再把 convenience helper 混进基础 reader
- 不再让 compile diagnostics 绑在 reader 类型上
- 所有上层都从 typed mutation reader 出发

---

## 当前问题

当前 whiteboard 读侧存在三层混杂：

1. typed mutation reader  
   来源：`createMutationReader(whiteboardMutationModel, readDocument)`

2. `DocumentReader`  
   文件：`whiteboard/packages/whiteboard-core/src/document/reader.ts`

3. `WhiteboardCompileReader`  
   文件：`whiteboard/packages/whiteboard-core/src/mutation/compile/reader.ts`

其中：

- `DocumentReader` 同时承载基础 CRUD 和领域派生查询
- `WhiteboardCompileReader` 又在 typed mutation reader 和 `DocumentReader` 之上包了一层
- compile 侧的 `.require()` 为了诊断又把 reader surface 再分叉了一次

这会导致：

- 基础读协议重复
- 命名不统一
- 新增 family / 结构时要同步多套 reader
- compile / projection / editor 使用的读模型不一致

---

## 最终设计

## 1. 唯一基础 reader

唯一基础 reader 是：

```ts
type WhiteboardReader = MutationReader<typeof whiteboardMutationModel>
```

它只负责 model 自动生成的基础能力：

- `reader.document.get()`
- `reader.document.order().items()`
- `reader.node.get(id)`
- `reader.node.ids()`
- `reader.edge.get(id)`
- `reader.group.get(id)`
- `reader.mindmap.get(id)`
- ordered / tree 的基础读能力

它不负责：

- graph query
- mindmap 结构派生查询
- group / order 便利查询
- compile diagnostics

也就是说，基础 reader 不再继续膨胀。

---

## 2. query 层

在 typed mutation reader 之上定义：

```ts
const query = createWhiteboardQuery(reader)
```

注意：

- query 是领域查询层
- query 不是第二套 reader
- query 不重新导出 `get/list/ids`
- query 只提供 model 自动生成不了、但具有稳定领域语义的派生查询

### 推荐 API 形态

```ts
query.edge.connectedToNodes(nodeIds)

query.mindmap.tree(id)
query.mindmap.subtreeNodeIds(id, rootId?)

query.mindmap.byNode(nodeId)
query.mindmap.resolveId(value)
query.mindmap.isRoot(nodeId)

query.order.slot(ref)
query.group.refsInOrder(groupId)
```

说明：

- `query.edge.connectedToNodes()` 保留，因为它是明确的 graph query
- `query.mindmap.tree()` / `subtreeNodeIds()` 保留，因为它们是稳定的 mindmap 结构语义
- `byNode / resolveId / isRoot / slot / refsInOrder` 可以保留，但它们是 query helper，不是基础 reader 协议

---

## 3. compile diagnostics 层

compile 的“实体必须存在，否则上报 invalid”不应继续绑在 reader 上。

最终形态：

```ts
ctx.expect.node(id)
ctx.expect.edge(id)
ctx.expect.group(id)
ctx.expect.mindmap(id)
```

语义：

- 只做 entity existence check
- 找不到就调用 `ctx.invalid(...)`
- 返回 entity 或 `undefined`

不建议把 `path` 放进 `ctx.expect` 的主 API。

精细路径诊断仍然走：

```ts
ctx.invalid(message, { path: 'input.parentId' })
```

边界必须清楚：

- `query` 负责读语义
- `expect` 负责 compile 存在性断言
- `invalid` 负责精细 diagnostics

---

## 保留与删除

## 应保留的能力

### 基础 reader

- `reader.document.get()`
- `reader.document.order().items()`
- `reader.node.get/list/ids`
- `reader.edge.get/list/ids`
- `reader.group.get/list/ids`
- `reader.mindmap.get/list/ids`

### query

- `query.edge.connectedToNodes()`
- `query.mindmap.tree()`
- `query.mindmap.subtreeNodeIds()`
- `query.mindmap.byNode()`
- `query.mindmap.resolveId()`
- `query.mindmap.isRoot()`
- `query.order.slot()`
- `query.group.refsInOrder()`

### compile

- `ctx.expect.node()`
- `ctx.expect.edge()`
- `ctx.expect.group()`
- `ctx.expect.mindmap()`

---

## 应删除的协议

### 删除 `DocumentReader` 作为公共基础 reader 协议

不再保留：

- `documentApi.reader() -> DocumentReader`
- `DocumentReader.nodes/edges/groups/mindmaps/documentOrder` 这种并行基础 surface

如果短期内还需要兼容迁移，可先保留实现文件，但最终状态不再让上层依赖它。

### 删除 `WhiteboardCompileReader`

不再保留：

- `createCompileReader()`
- `WhiteboardCompileReader`
- reader 上的 `.require()`

compile 直接使用：

- typed mutation reader
- whiteboard query
- `ctx.expect`

---

## 命名统一

最终统一为三层命名：

### 基础层

- `reader`

### 派生查询层

- `query`

### compile 诊断层

- `ctx.expect`
- `ctx.invalid`

不再使用以下名称：

- `DocumentReader`
- `WhiteboardCompileReader`
- `createCompileReader`
- `reader.require(...)`
- `documentOrder` 作为独立 reader namespace

其中：

- `document.order()` 是基础 ordered 结构
- `query.order.slot()` 是基于 `document.order().items()` 的派生查询

---

## 最终 API 草案

## 基础层

```ts
const reader = createMutationReader(
  whiteboardMutationModel,
  readDocument
)
```

## 查询层

```ts
const query = createWhiteboardQuery(reader)

query.edge.connectedToNodes(new Set(nodeIds))
query.mindmap.tree(mindmapId)
query.mindmap.subtreeNodeIds(mindmapId, rootId)
query.mindmap.byNode(nodeId)
query.mindmap.resolveId(value)
query.mindmap.isRoot(nodeId)
query.order.slot(ref)
query.group.refsInOrder(groupId)
```

## compile 层

```ts
const edge = ctx.expect.edge(ctx.intent.edgeId)
if (!edge) {
  return
}

const nodeIds = query.mindmap.subtreeNodeIds(id, rootId)
const edges = query.edge.connectedToNodes(new Set(nodeIds))
```

---

## 迁移方案

## Phase 1：引入 query 层

新增：

- `whiteboard/packages/whiteboard-core/src/query/index.ts`
- `createWhiteboardQuery(reader)`

初始只迁移当前真正有复用的能力：

- `edge.connectedToNodes`
- `mindmap.tree`
- `mindmap.subtreeNodeIds`
- `mindmap.byNode`
- `mindmap.resolveId`
- `mindmap.isRoot`
- `order.slot`
- `group.refsInOrder`

要求：

- query 只能依赖 typed mutation reader
- query 不得重新导出基础 CRUD

---

## Phase 2：compile 侧去掉 `WhiteboardCompileReader`

修改：

- `whiteboard/packages/whiteboard-core/src/mutation/compile/reader.ts`
- `whiteboard/packages/whiteboard-core/src/mutation/compile/index.ts`
- compile handler context

做法：

1. compile context 直接拿 typed mutation reader
2. compile context 同时暴露 `query`
3. 新增：
   - `ctx.expect.node`
   - `ctx.expect.edge`
   - `ctx.expect.group`
   - `ctx.expect.mindmap`
4. 把现有 `.require()` 调用全部替换成 `ctx.expect.*()`

替换示例：

```ts
const edge = ctx.reader.edge.require(ctx.intent.edgeId)
```

改为：

```ts
const edge = ctx.expect.edge(ctx.intent.edgeId)
```

同时：

- `ctx.reader.edge.connectedToNodes(...)` 改为 `ctx.query.edge.connectedToNodes(...)`
- `ctx.reader.mindmap.subtreeNodeIds(...)` 改为 `ctx.query.mindmap.subtreeNodeIds(...)`
- `ctx.reader.mindmap.isRoot(...)` 改为 `ctx.query.mindmap.isRoot(...)`

完成后删除：

- `WhiteboardCompileReader`
- `createCompileReader`

---

## Phase 3：projection / editor / support 迁移到 query

修改使用点：

- `whiteboard-editor-scene/src/projection/query/index.ts`
- `whiteboard-editor/src/write/orderStep.ts`
- `whiteboard-core/src/mutation/support.ts`
- `whiteboard-core/src/mutation/lock.ts`

做法：

1. 这些模块直接创建 typed mutation reader
2. 在其上创建 `query(reader)`
3. 所有派生读取走 query

替换目标：

- `reader.documentOrder.slot(...)` -> `query.order.slot(...)`
- `reader.documentOrder.groupRefs(...)` -> `query.group.refsInOrder(...)`
- `reader.edges.connectedToNodes(...)` -> `query.edge.connectedToNodes(...)`
- `reader.mindmaps.tree(...)` -> `query.mindmap.tree(...)`
- `reader.mindmaps.subtreeNodeIds(...)` -> `query.mindmap.subtreeNodeIds(...)`
- `reader.mindmaps.byNode(...)` -> `query.mindmap.byNode(...)`
- `reader.mindmaps.resolveId(...)` -> `query.mindmap.resolveId(...)`
- `reader.mindmaps.isRoot(...)` -> `query.mindmap.isRoot(...)`

---

## Phase 4：删除 `DocumentReader` 公共协议

在所有调用点迁移完成后：

1. 停止从 `document/index.ts` 导出 `reader`
2. 删除 `DocumentReader` 类型导出
3. 删除 `document/reader.ts`

注意：

- 如果某些 query 实现里还复用到旧 helper，先内移到 query 层
- 删除前确保上层没有任何 `documentApi.reader(...)` 调用残留

---

## Phase 5：验收

最终必须满足：

1. 基础读接口只有 typed mutation reader
2. 派生读接口只有 `query(reader)`
3. compile 不再有独立 reader 协议
4. compile existence check 只走 `ctx.expect.*()`
5. 搜索结果中不再出现：
   - `DocumentReader`
   - `WhiteboardCompileReader`
   - `createCompileReader`
   - `.require(`
   - `documentOrder`

---

## 最终判断

whiteboard 读侧长期最优形态不是：

- `DocumentReader`
- `CompileReader`
- 又一套 typed mutation reader

三套并存。

长期最优形态是：

1. 一套 model 自动生成的 typed mutation reader
2. 一套显式的 domain query layer
3. 一套 compile diagnostics API

也就是：

**`reader + query + expect/invalid`**

这就是最终应该收敛到的结构。
