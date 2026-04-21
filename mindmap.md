# Mindmap 编辑态宽度不跟随 —— 根因分析

## 结论（一句话）

`projectNodeGeometryItem` 里 `applyTextDraft`（改 rect.width）发生在 `applyMindmapGeometry`（用 projected mindmap rect 覆盖一遍）**之前**，导致 draft size 被无条件覆盖掉，mindmap root/topic 的宽度永远回落到 committed mindmap layout 的结果。

---

## 完整调用链

```
TextSlot.onInput(text)
  → actions.edit.input(text)
  → session.edit = { kind:'node', nodeId, draft.text }   ← EditSession

layout/runtime.ts: edit.node (KeyedDerivedStore)
  get(nodeId) {
    committed = readLayoutNodeItem(nodeId, { mindmapRect: 'committed' })
    return measureDraftNodeLayout({ committed, text: session.draft.text })
  }
  → measureDraftNodeLayout
      kind = readLayoutKind(registry, committed.node)   // 'size' (type='text')
      buildLayoutRequest(...)                           // type==='text' ✓
      backend.measure(request)
      → returns { size: { width, height } }
  → EditorDraftNodeLayout { size, wrapWidth }

query/edit/read.ts: createEditRead
  NodeEditView { field, text, caret, size: draftLayout?.size }
                                      ^^^^^^^^^^^^^^^^^^^^^^
                                      正确地把 draft size 放进 edit view

query/node/read.ts: projectNodeGeometryItem()
  step 1: applyTextPreview(item, feedback.text)
  step 2: applyTextDraft(result, readNodeTextDraft(item, edit))
            ↑ 这里把 draft.size 写进 item.rect.width/height   ✓ 对普通 text 正确
  step 3: applyGeometryPatch(result, feedback.patch)
  step 4: applyMindmapGeometry(result, mindmap)
            ↑ 对 mindmap owned node，把 projected mindmap layout 的 rect 整体覆盖
              width/height 全被替换为 mindmap layout computed.node[nodeId]
  step 5: applyGeometryPatch(result, readTextGeometryPatch(feedback))
```

---

## 核心 bug：两步覆盖顺序错误

```ts
// query/node/read.ts L365-382
const projectNodeGeometryItem = (
  item, feedback, mindmap, edit
): NodeItem => nodeApi.projection.applyGeometryPatch(
  applyMindmapGeometry(                          // step 4: 用 mindmap committed 覆盖
    nodeApi.projection.applyGeometryPatch(
      nodeApi.projection.applyTextDraft(         // step 2: 写入 draft size
        nodeApi.projection.applyTextPreview(item, feedback.text),
        readNodeTextDraft(item, edit)
      ),
      feedback.patch
    ),
    mindmap                                      // ← MindmapNodeLayoutItem，来自 projected mindmap
  ),
  readTextGeometryPatch(feedback)
)
```

问题出在 step 2 和 step 4 的嵌套关系：

- Step 2 `applyTextDraft`：把 `edit.size`（= `EditorDraftNodeLayout.size`，即 draft 测量的宽高）写进 `item.rect`
- Step 4 `applyMindmapGeometry`：无条件用 `mindmap.rect.width/height` **再覆盖一遍** `item.rect`

`applyMindmapGeometry` 调用的是：

```ts
// query/node/read.ts L345-363
const applyMindmapGeometry = (item, mindmap) => {
  if (!mindmap) return item
  return nodeApi.projection.applyGeometryPatch(item, {
    position: { x: mindmap.rect.x, y: mindmap.rect.y },
    size: { width: mindmap.rect.width, height: mindmap.rect.height }  // 整体覆盖 size
  })
}
```

`mindmap.rect` 来自 `MindmapLayoutRead.node`，而 `MindmapLayoutRead.node` 来自 `createMindmapLayoutRead`——它的 `liveEdit` 逻辑：

```ts
// layout/mindmap.ts L345-381
const liveEdit = store.createKeyedDerivedStore<NodeId, MindmapLiveEdit | undefined>({
  get: (treeId) => {
    ...
    const size = store.read(draft, session.nodeId)?.size   // draft = edit.node
    return size ? { nodeId: session.nodeId, size } : undefined
  }
})
```

乍看 mindmap layoutRead 也在读 `draft.size`，但 `liveEdit` 是按 `treeId`（mindmapId）读取的，最终由 `readProjectedMindmapItem` 用来重新 `mindmapApi.layout.compute(...)` 并输出整棵树的 `computed.node[nodeId]`。

**这条路链路是正确可以工作的**——但前提是 `draft.size` 非空时，重新 compute 出的 `mindmap.rect` 就是 draft 驱动的新尺寸。

---

## 真正的问题所在：`edit.node` 读取时用的是 `mindmapRect: 'committed'`

```ts
// layout/runtime.ts L480-511
const edit = {
  node: store.createKeyedDerivedStore<NodeId, EditorDraftNodeLayout | undefined>({
    get: (nodeId) => {
      return measureDraftNodeLayout({
        committed: readLayoutNodeItem(nodeId, {
          mindmapRect: 'committed'    // ← 用 committed mindmap rect 作为测量基准
        }),
        ...
      })
    }
  })
}
```

而 `readLayoutNodeItem` 加了这段逻辑：

```ts
// runtime.ts L446-478
const readLayoutNodeItem = (nodeId, options) => {
  const committed = store.read(read.node.committed, nodeId)
  ...
  const mindmapId = committed.node.owner?.kind === 'mindmap' ? committed.node.owner.id : undefined
  if (!mindmapId) return committed

  const rect = options?.mindmapRect === 'projected'
    ? mindmap ? store.read(mindmap.node, nodeId)?.rect : undefined
    : store.read(read.mindmap.committed, mindmapId)?.computed.node[nodeId]  // committed
  ...
}
```

`edit.node` 使用 `mindmapRect: 'committed'`，这保证了 measure 时不会循环依赖（draft → projected → draft），是故意的设计。

所以 `measureDraftNodeLayout` 的 `rect`（committed rect）作为基准是对的，但 **measure 结果里自带了正确的 size**，问题不在测量这一侧。

---

## 真正的 bug 定位：node.data 里没有 `widthMode` 时，`buildLayoutRequest` 返回 undefined

回到 `buildLayoutRequest`（runtime.ts L153-220）：

```ts
if (kind === 'size' && node.type === 'text') {
  const input = nodeApi.text.layoutInput(node, { width: rect.width, height: rect.height })
  if (!input) {
    return undefined   // ← 如果 layoutInput 返回 undefined，整条链断掉
  }
  ...
}
```

`readTextLayoutInput`（text.ts L293-338）：

```ts
export const readTextLayoutInput = (node, fallback) => {
  if (node.type !== 'text') return undefined   // type 守卫
  
  const widthMode = readTextWidthMode(node)    // 'auto' | 'wrap'
  const computedSize = readTextComputedSize(node, fallback)
  ...
  return { nodeId, text, widthMode, wrapWidth, fontSize, frame, ... }
}
```

这里**不会返回 undefined**（只要 type === 'text'），所以 `buildLayoutRequest` 对 mindmap 的 `type='text'` 节点也能生成正确的 request。

---

## 真正的 bug：`readNodeTextDraft` 里的条件判断过滤掉了 mindmap node 的 size

```ts
// query/node/read.ts L314-332
const readNodeTextDraft = (item, edit) => {
  if (!edit) return undefined
  return {
    field: edit.field,
    value: edit.text,
    size: edit.field === 'text' && item.node.type === 'text'
      ? edit.size       // ← 普通 text 节点：带 size
      : undefined,
    fontSize: edit.field === 'text' && item.node.type === 'sticky'
      ? edit.fontSize
      : undefined
  }
}
```

mindmap root/topic 的 `item.node.type` 也是 `'text'`（确认自 `mindmap/query.ts:235` 和 `template.ts:169`），所以这里**会**传入 `edit.size`。

但是接着看 `applyNodeTextDraft`：

```ts
// projection.ts L145-187
const nextRect = draft.size && !geometryApi.equal.size(draft.size, item.rect)
  ? { ...item.rect, width: draft.size.width, height: draft.size.height }
  : item.rect
```

只要 `draft.size != item.rect.size`，就会修改 `item.rect`。

---

## 最终定论：两条路径同时存在，互相覆盖（两套几何真相问题）

`projectNodeGeometryItem` 里有两套给 mindmap node 设置 size 的路径：

| 步骤 | 操作 | size 来源 |
|------|------|-----------|
| step 2 | `applyTextDraft` | `EditorDraftNodeLayout.size`（测量出的 draft size） |
| step 4 | `applyMindmapGeometry` | `mindmap.rect`（projected mindmap layout 给的 rect） |

**`mindmap.rect` 的来源**（layout/mindmap.ts 的 `liveEdit` 路径）：
- 当 `draft.size` 存在时，`liveEdit = { nodeId, size: draft.size }`
- `readProjectedMindmapItem` 用 `liveEdit.size` 重新 compute 整棵 mindmap tree
- computed 结果中 `computed.node[nodeId].width = liveEdit.size.width`
- 因此 step 4 叠上来的 `mindmap.rect` **理论上就等于 step 2 算的 draft size**

所以理论上两步叠加后 size 应该一致。

**但实际问题出在响应式依赖关系上：**

`edit.node`（draft layout store）和 `mindmap.node`（projected mindmap layout store）是**两个独立的 KeyedDerivedStore**。`projectNodeGeometryItem` 同时读了这两个 store（通过 `edit.node` 和 `mindmap`），但这两个 store 的更新时机可能不同步：

1. 用户输入 → `session.edit` 更新
2. `edit.node[nodeId]` 重算 → `EditorDraftNodeLayout { size }`     ← 立即生效
3. `liveEdit[treeId]` 重算 → 依赖 `edit` session + `draft(= edit.node)` ← 需要等 `edit.node` settle
4. `mindmap.item[treeId]` 重算 → 依赖 `liveEdit` ← 再晚一拍
5. `mindmap.node` 重算 → 全局 flatmap ← 最晚

在同一个 tick 里，`geometry` store 读取时：
- `edit.node` 是新的（有 draft size）
- `mindmap.node` 可能还是旧的（上一次的 committed layout）

Step 4 `applyMindmapGeometry` 用旧的 `mindmap.node` 覆盖了 step 2 写进去的正确 draft size。

**结果：编辑中的宽度一直显示旧的 committed 宽度，直到退出编辑后 mindmap layout commit，两边才再次对齐。**

---

## 为什么普通 text 没问题

普通 `text` 节点（非 mindmap owned）走的路径：

```ts
projectNodeGeometryItem(item, feedback, mindmap=undefined, edit)
```

`mindmap` 为 `undefined`，`applyMindmapGeometry` 直接 `return item`，step 4 什么都不做。

Step 2 的 `applyTextDraft` 写的 draft size 完整保留到最终 `item.rect`。

---

## 修复方向

根据 `WHITEBOARD_MINDMAP_EDIT_LAYOUT.zh-CN.md` 的设计，正确的做法是：

**方案 A（最小改动，治标）：在 `applyMindmapGeometry` 里，如果当前有 edit（即 draft 存在），则跳过 size 覆盖，只更新 position。**

```ts
const applyMindmapGeometry = (item, mindmap, hasDraftSize) => {
  if (!mindmap) return item
  return nodeApi.projection.applyGeometryPatch(item, {
    position: { x: mindmap.rect.x, y: mindmap.rect.y },
    size: hasDraftSize ? undefined : { width: mindmap.rect.width, height: mindmap.rect.height }
  })
}
```

这样 position 还是由 mindmap 控制，但 size 在编辑态保留 draft 的结果。

**方案 B（长期正确，治本）：遵循文档第6条规则，让 `mindmap.node` 的 projected layout 在编辑态就已经携带了 draft size，彻底消除两套几何来源。**

即确保 `mindmap.node`（projected layout）在被 `geometry` store 读取时，已经稳定地把 `liveEdit.size` compute 进去了——这要求 `mindmap.node` 的更新必须在 `geometry` 消费之前 settle。

文档里的管线（5.1）说的正是这个：
```
draft.layout.node[nodeId] = measure(...)
→ projected.mindmap = project(committed tree, draft.layout, gesture preview)
→ node.render(rect) 读取 projected.mindmap.nodeRect(nodeId)
```
只让 `node.render` 读 projected mindmap，不再同时读 `edit.node` 的 size，就能消除两套几何真相的竞争条件。

---

## 总结

| 项目 | 内容 |
|------|------|
| **现象** | 编辑时 root/topic 宽度固定，退出编辑才变正确 |
| **根因** | `projectNodeGeometryItem` 先用 `applyTextDraft` 写入 draft size，又立即被 `applyMindmapGeometry` 用旧的 committed mindmap rect 覆盖 |
| **时序原因** | `edit.node`（draft layout）和 `mindmap.node`（projected mindmap）是两个独立派生 store，同一个 tick 里后者还没更新到最新 |
| **普通 text 正确的原因** | 无 mindmap，step 4 是 no-op，draft size 不被覆盖 |
| **最小修复** | `applyMindmapGeometry` 在有 draft size 时不覆盖 size，只同步 position |
| **长期修复** | 按文档架构：`node.render` 只读 `projected.mindmap`，彻底消除双来源 |
