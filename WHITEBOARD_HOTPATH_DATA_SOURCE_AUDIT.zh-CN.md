# WHITEBOARD_HOTPATH_DATA_SOURCE_AUDIT

## 范围

本文只做一件事：

- 盘点当前 whiteboard 里，哪些路径还没有切到真正的热路径数据源。
- 盘点哪些路径虽然已经接上了 `projection/spatial`，但内部仍然在做明显的大量扫描、重复扫描或读时重建。
- 给出长期最优的收敛方向，方便后续直接按优先级落地。

本文不讨论：

- 具体算法微调细节。
- 兼容期方案。
- 过渡实现。

原则固定为：

- 以长期最优为目标。
- 优先收敛 source authority。
- 不接受“表面已经切到 projection，但内部还是每次重新扫一遍”的假热路径。

## 现状结论

已经收敛到正确方向的部分：

- `CanvasScene` 已直接消费 `editor.read.items`。
- drag 启动拿 node / edge 已直接走 `projection.node.all()` / `projection.edge.all()`。
- marquee / edge rect query 已经优先走 `spatial.rect(...)`。
- `canvas.order` 已提升为 canonical source，不再在 read/query 层读时修复。

当前仍然明显值得继续优化的点，按优先级分为三层：

### P0：当前交互热路径里仍然会反复触发

1. pointer bridge 每次 pointer 事件都会刷新容器 rect，并走 DOM picking。
2. node snap query 仍然来自 committed document 派生，而不是 projection/runtime 热路径 source。
3. drag move 每帧 frame hover 解析仍会重复跑 frame query。
4. drag start 的 frame descendants 展开仍是重复扫描型实现。

### P1：不是每帧都触发，但在大文档下会明显放大

5. draw eraser 仍然在候选过滤阶段读 committed node。
6. `group.exactIds()` 仍然是全量扫所有 group。
7. engine facts 在每次 commit 时仍有按 group 重扫 scene 的构建路径。

### P2：一致性与清理项

8. live editor read 里仍保留若干 committed fallback。
9. `document.bounds` / `engine.query.bounds` / 若干 engine query 仍然是全量扫描型实现。

## 详细审计

### 1. Pointer Bridge 仍然在每次事件里刷新 rect 并做 DOM picking

相关文件：

- `whiteboard/packages/whiteboard-react/src/runtime/bridge/pointer.ts`
- `whiteboard/packages/whiteboard-react/src/dom/host/input.ts`
- `shared/dom/src/input.ts`

当前路径：

1. `createPointerBridge.resolveCanvasPointerInput(...)`
2. `refreshContainerRect(container)`
3. `container.getBoundingClientRect()`
4. `editor.actions.viewport.setRect(...)`
5. `resolvePointerInput(...)`
6. `resolvePoint(...)`
7. `elementsFromPointWithin(...)`

问题有三层：

- 每次 pointer 事件都 `getBoundingClientRect()`。
- `setRect()` 走的是 `editor.actions.viewport.setRect(...)`，这是 `atomic` action，即使 rect 没变，也会带一次 boundary/projection flush。
- 即使已经进入 capture 后的拖拽 session，pointer move 仍然会重新走 DOM picking。

这意味着现在 pointer move 的热路径里，还混着：

- layout read
- action flush
- DOM 栈扫描

这不是长期最优。

最终收敛建议：

1. container rect 不应在 pointer path 里刷新。
2. rect source 应只来自：
   - 初次 mount
   - resize observer
   - 必要的 scroll / viewport invalidation
3. pointer bridge 不应通过 `editor.actions.viewport.setRect(...)` 刷新 rect。
4. 应提供一个不走 boundary flush 的底层 rect 更新入口，或者直接让 viewport binding 负责维护。
5. active pointer session 应支持 pick policy：
   - `none`
   - `primary`
   - `full`
6. selection move / transform / draw 这类 capture 后 move，默认应跳过 `elementsFromPoint*`。

优先级判断：

- P0

---

### 2. Snap Query 仍然来自 committed document 派生

相关文件：

- `whiteboard/packages/whiteboard-editor/src/input/runtime.ts`
- `whiteboard/packages/whiteboard-editor/src/input/core/snap.ts`
- `whiteboard/packages/whiteboard-editor/src/document/read.ts`

当前路径：

1. `ctx.snap.node.move(...)`
2. `document.index.snap.inRect(rect)`
3. `store.read(nodeList).flatMap(...)`
4. `store.read(nodeCommitted, nodeId)`
5. `buildNodeItem(...)`

也就是说，当前 snap 候选虽然服务于交互热路径，但数据源仍是：

- `documentStore`
- `nodeCommitted` keyed derived

而不是：

- projection graph family
- runtime spatial / geometry

`drag2.json` 里看到的 `ensureFresh`，本质就是这条 committed derived read 被热路径读到了。

问题本质：

- 每次 query 都要扫全量 `nodeList`。
- 每个候选都可能触发 `nodeCommitted` 的 derived 读取。
- 这不是 delta 驱动的 hot source，而是 read-time rebuild。

最终收敛建议：

1. 新增真正的 `SnapQuery`，source of truth 直接来自 projection graph family。
2. `SnapQuery.rect(rect)` 应直接消费当前 graph node geometry，而不是 `document.node.committed`。
3. 若需要持久化辅助结构，应是：
   - snap candidate cache
   - 或增量更新的 snap index
4. 不应继续把 `document.index.snap.inRect` 作为交互热路径入口。
5. `filterCandidates(...)` 这层也应避免每次 move 复制整份 candidate array。

优先级判断：

- P0

---

### 3. Drag Move 每帧的 Frame Hover 仍然会重复扫描

相关文件：

- `whiteboard/packages/whiteboard-editor/src/input/features/selection/move.ts`
- `whiteboard/packages/whiteboard-editor/src/read/frame.ts`

当前路径：

1. drag move 每次 `project(...)`
2. `resolveFrameHoverId(...)`
3. `projection.frame.at(pointerWorld)`
4. 若命中的 frame 正在移动，再循环 `projection.frame.parent(frameId)`

而 `FrameRead` 当前实现里：

- `at(point)` 会先 `spatial.point(...)`
- 然后 `scanFrames(...)`
- 然后逐个 `readFrameRect(...)`

`parent(nodeId)` 也会：

- `spatial.rect(rect)`
- `scanFrames(...)`
- 再逐个判断包含关系

问题在于：

- `at(...)` 与 `parent(...)` 在同一帧内重复做候选收缩。
- `while (movingIds.has(frameId)) frameId = parent(frameId)` 会再次重复扫描。
- `scanFrames(...)` 还会创建中间数组。

这条链已经不再是 committed read，但仍然不是最优热路径实现。

最终收敛建议：

1. `FrameQuery` 应增加直接面向 hover 的入口：
   - `pick(point, options)`
   - 或 `at(point, { excludeIds })`
2. 让“命中点查 frame + 排除 movingIds + 选最合适 frame”在一次扫描里完成。
3. `scanFrames(...)` 不应先 materialize frame array，再二次循环。
4. `FrameQuery` 内部应尽量减少：
   - `spatial.* -> array`
   - `array -> filter frame`
   - `frame -> read graph`
   这种多段式成本。
5. 如果需要 frame-only 快速判定，应该补的是轻量 filter 信息，而不是新的持久化 frame index。

优先级判断：

- P0

---

### 4. Drag Start 的 Frame Descendants 展开仍然是重复扫描型实现

相关文件：

- `whiteboard/packages/whiteboard-core/src/node/move.ts`
- `whiteboard/packages/whiteboard-core/src/node/frame.ts`
- `whiteboard/packages/whiteboard-core/src/document/slice.ts`

当前路径：

1. drag start
2. `buildMoveSet(...)`
3. `createFrameQuery(...).descendants(nodeId)`
4. `descendants(...)`
5. `children(...)`
6. `parent(candidateId)`
7. `scanFrames(...)`

问题本质：

- `children(frameId)` 里为了判断 direct child，又会对每个 candidate 重新调用一次 `parent(candidateId)`。
- `parent(...)` 内部再次扫 frame candidate。
- `descendants(...)` 递归向下时，整个模式会重复出现。

所以现在 drag start 的 frame member expansion 仍然接近：

- 候选节点数 * frame 候选数
- 再叠加递归层级

这就是 `drag3.json` 里 `frameParent / scanFrames` 还会很显著的原因。

最终收敛建议：

1. 给 move/slice 单独提供 one-shot 展开能力，例如：
   - `expandFrameMembers(rootIds)`
   - `descendantsMany(rootIds)`
2. 这类 API 的目标是：
   - 单次扫描
   - 一次构造 parent map / child map
   - 本次调用内复用
3. 不应继续用通用的 `children() -> parent()` 递归拼出 drag start 的成员展开。

优先级判断：

- P0

---

### 5. Draw Eraser 的候选过滤仍然会读 committed node

相关文件：

- `whiteboard/packages/whiteboard-editor/src/input/features/draw.ts`

当前路径：

1. `projection.node.idsInRect(...)`
2. 对命中 nodeId 再执行
3. `document.node.committed.get(nodeId)?.node.type === 'draw'`

问题本质：

- 空间收缩已经来自 projection/spatial。
- 但最后一步类型过滤仍然回到了 committed derived。

这会导致：

- 擦除路径仍可能触发 committed keyed derived read
- 类型判断无法完全停留在热路径 source

最终收敛建议：

1. node rect query 应支持更细粒度过滤，例如：
   - `types`
   - `predicate`
2. 或提供 projection node type keyed field。
3. draw eraser 不应再通过 `document.node.committed` 判定类型。

优先级判断：

- P1

---

### 6. `group.exactIds()` 仍然是全量扫 group

相关文件：

- `whiteboard/packages/whiteboard-editor/src/document/read.ts`
- `whiteboard/packages/whiteboard-react/src/features/selection/capability.ts`
- `whiteboard/packages/whiteboard-react/src/features/selection/chrome/panels/SelectionActionMenu.tsx`
- `whiteboard/packages/whiteboard-editor/src/action/selection.ts`

当前实现：

- `exactIds(target)` 会 `Object.keys(groups).filter(...)`
- 对每个 group 都重新构造一次 normalized selection target
- 再与传入 target 做 compare

问题本质：

- 这是典型的按查询全量扫 owner 集合。
- 它不只在 action 里调用，React render 期间也会调用。

这类路径在 group 数量上来后会持续放大。

最终收敛建议：

1. 为 group selection membership 提供稳定 signature。
2. 建立：
   - `groupId -> signature`
   - `signature -> groupIds`
   的只读映射。
3. `exactIds(target)` 退化为：
   - `normalize(target)`
   - `read signature`
   - `map lookup`

优先级判断：

- P1

---

### 7. Engine Facts 在每次 Commit 时仍有按 Group 重扫 Scene 的路径

相关文件：

- `whiteboard/packages/whiteboard-engine/src/runtime/engine.ts`
- `whiteboard/packages/whiteboard-engine/src/facts/build.ts`
- `whiteboard/packages/whiteboard-engine/src/facts/relations.ts`

当前事实：

- 每次 engine commit 都会 `buildFacts(nextDocument)`。
- `buildRelations(...)` 内部：
  - `ownerNodes.groups` 通过 `groupNodeIds(document, groupId)` 构造
  - `groupItems` 通过 `groupCanvasRefs(document, groupId)` 构造

而 `groupCanvasRefs(...)` 的底层是：

- 每个 group 扫一遍 `canvas.order`

这意味着 commit 侧会出现：

- `groupCount * sceneSize`

级别的重复工作。

问题本质：

- 这不是交互每帧路径。
- 但它是写入频繁场景下的结构性放大器。

最终收敛建议：

1. `buildRelations(...)` 应改成单次聚合：
   - 一次扫 `nodes`
   - 一次扫 `edges`
   - 一次扫 `canvas.order`
2. 在单次扫描中构建：
   - `group -> nodeIds`
   - `group -> edgeIds`
   - `group -> canvasRefs`
3. 不应继续对每个 group 重新调用 query helper。

优先级判断：

- P1

---

### 8. Live Editor Read 里仍有若干 Committed Fallback

相关文件：

- `whiteboard/packages/whiteboard-editor/src/read/public.ts`
- `whiteboard/packages/whiteboard-editor/src/read/edge.ts`
- `whiteboard/packages/whiteboard-editor/src/editor/events.ts`
- `whiteboard/packages/whiteboard-editor/src/input/helpers.ts`

典型模式：

- 先读 `graph.*`
- miss 时 fallback 到 `document.node.committed` / `document.edge.item`

这些 fallback 当前分布在：

- `readNodeLocked`
- `readNodeRect`
- edge capability 里的 node locked read
- session reconcile / edit start / helper lookup

问题本质：

- 在 live editor session 中，graph 已经是更接近热路径的 authoritative source。
- 大量 fallback 会让调用方不清楚自己到底在消费哪条 source。
- 一旦这些 fallback 被交互路径碰到，就会把 committed derived 一起带进来。

最终收敛建议：

1. 明确区分：
   - live session read
   - committed/boundary read
2. live editor 侧优先只读 graph/base family。
3. committed read 只保留给：
   - import / export
   - boundary / procedure
   - 写入校验
4. 如果只是做 existence / locked / type / rect 读取，应提供更轻的 projection field store，而不是 fallback 到 committed whole item。

优先级判断：

- P2

---

### 9. `document.bounds` / `engine.query.bounds` 等仍然是全量扫描型读取

相关文件：

- `whiteboard/packages/whiteboard-editor/src/document/read.ts`
- `whiteboard/packages/whiteboard-engine/src/runtime/query.ts`

当前实现：

- 按 scene 全量遍历
- node 读 bounds
- edge 重算 committed edge view/path bounds
- mindmap 读 layout bbox

这类路径目前不在最核心交互热循环内，但它们仍然是：

- read-time full scan
- 非增量

最终收敛建议：

1. 如果这些读取开始进入高频消费，应引入增量维护的 document/world bounds。
2. 若仍然只是低频命令使用，可以先保留，但应明确标记为 non-hot API。

优先级判断：

- P2

---

### 10. Engine Query 仍保留若干全量扫描 helper

相关文件：

- `whiteboard/packages/whiteboard-engine/src/runtime/query.ts`

当前仍然明显是全量扫描的接口包括：

- `bounds()`
- `groupExactIds()`
- `relatedEdges()`
- `edgeIdsInRect()`

这些接口的主要问题不是“现在一定卡”，而是：

- 它们仍然保留旧的 full-scan 读模型
- 会持续给新调用方错误暗示

最终收敛建议：

1. 要么明确标注 non-hot。
2. 要么继续向 editor/projection 那套最终模型靠齐。
3. 不应再把 engine query 当作 editor interaction 的默认读侧。

优先级判断：

- P2

## 建议的实施顺序

### 第一批：直接影响 pointer / drag

1. 去掉 pointer bridge 每事件 `setRect + flush`。
2. 给 active pointer session 增加 pick bypass / pick policy。
3. 用 projection source 重做 snap query。
4. 把 frame hover 改成单次扫描版。
5. 把 drag start 的 frame member expansion 改成 one-shot 展开。

### 第二批：中频路径与写入路径

6. 给 draw eraser 补类型过滤热路径。
7. 给 `group.exactIds()` 建 signature lookup。
8. 重写 engine facts 的 group relations 构建，改单次聚合。

### 第三批：一致性清理

9. 逐步移除 live read 中的 committed fallback。
10. 给 non-hot full scan API 做明确边界，必要时再增量化。

## 最终判断

当前 whiteboard 的问题已经不再是“完全没有热路径 source”，而是进入了第二阶段：

- 关键主链已经开始接上 projection / spatial。
- 但仍有几条真正影响性能的路径，没有彻底切断 committed derived、DOM picking、或重复扫描。

最值得优先处理的不是更多 `equal`，也不是更多 React memo，而是：

1. pointer path 去掉 `setRect + flush + elementsFromPoint` 的结构性开销。
2. snap query 改为真正的 projection/runtime 热路径 source。
3. frame query 改为单次扫描而不是递归重扫。

这三块做完，drag / pointer 的主要结构性瓶颈才算真正切干净。
