# Whiteboard Editor 参数收敛方案

## 目标

这份方案专门回答一个问题：

`whiteboard-editor` 里哪些地方可以通过“更合理的参数建模”来减少复杂度，以及应该怎么做，才能真正降低心智负担，而不是单纯把多个参数改成一个大对象。

这里的“参数收敛”不是机械地把所有函数都改成 `fn({ ... })`，而是遵守下面这条原则：

- 同一语义来源的字段，应该尽量作为同一个 state / snapshot / operation object 传递。
- 不同语义层的依赖，不应该为了少几个参数名而被硬塞进一个“大杂烩对象”。
- core 纯算法应当吃 core 自己拥有的输入快照类型，不应反向依赖 editor/runtime 层的 state 类型。
- editor/runtime 边界函数可以吃 `ctx/session/input` 这种 operation object，但不能无限扩大成“整个 editor”。

## 总体结论

当前 `whiteboard-editor` 里，参数复杂度最高、最值得收敛的区域是：

1. `interactions/transform`
2. `interactions/edge`
3. `interactions/selection`
4. `runtime/commands/insert`
5. `runtime/commands/mindmap`
6. `runtime/query` 和 `runtime/read` 的少量桥接函数

相对不需要强行动的区域是：

1. `interactions/mindmap`
2. `interactions/draw`
3. `runtime/viewport`
4. `runtime/interaction/runtime`
5. `runtime/write/index`

原因很简单：

- 前一组的问题是“参数已经在表达同一个 domain state，却仍被拆成很多散字段”
- 后一组更多是“有少量参数”，或者“虽然用了对象参数，但已经贴近真实边界”

## 参数收敛的统一规则

### 规则 1：同源字段优先收成 state / snapshot

如果一个函数吃进去的 4 个以上字段，本质上都来自同一个状态对象，那就不应该继续拆散。

典型例子：

- resize 拖拽的 `handle/startScreen/startCenter/startRotation/startSize/startAspect`
- rotate 拖拽的 `center/startAngle/startRotation`
- edge route 拖拽的 `edgeId/index/start/origin/point`

目标形态：

- `computeResizeRect(resizeGestureSnapshot)`
- `computeNextRotation(rotateGestureSnapshot)`
- `projectRouteDrag({ session, pointer, ... })`

而不是：

- `computeResizeRect({ handle, startScreen, startCenter, startRotation, startSize, startAspect, ... })`

### 规则 2：editor 层不要把 core 算法绑死到 editor 类型

例如 `packages/whiteboard-editor/src/interactions/transform/project.ts` 里，表面上看 `computeResizeRect` 很适合直接吃 `ResizeDragState`，但当前 `ResizeDragState` 是 editor 层类型，定义在：

- `packages/whiteboard-editor/src/interactions/transform/types.ts`

如果让 core 直接吃它，会形成方向错误的依赖：

- core 反向依赖 editor

正确做法是：

1. 在 core 定义自己的 `ResizeGestureSnapshot` / `RotateGestureSnapshot`
2. editor 侧的 `ResizeDragState` / `RotateDragState` 对齐到这个形状
3. editor 调 core 时直接透传对应 snapshot

也就是说：

- 正确方向是“让 editor state 复用 core snapshot 形状”
- 不是“让 core 直接吃 editor state”

### 规则 3：边界函数优先用 operation object

如果一个 helper 同时依赖：

- 运行环境 `ctx`
- 当前状态 `session/state`
- 当前输入 `input/pointer`

优先写成：

```ts
fn({
  ctx,
  session,
  input
})
```

而不是：

```ts
fn(ctx, session, input)
```

理由：

- 更容易统一签名
- 更方便后续增减字段
- 更不容易出现参数顺序漂移

适用范围：

- interaction 投影 / commit / preview helper
- runtime command 内的桥接 helper

不适用范围：

- 只有 1 到 2 个参数、语义很清楚的小函数

### 规则 4：只要参数没被使用，先删掉

这条优先级高于一切风格统一。

如果一个 helper 还在传一个完全没被使用的参数，先删掉这个参数，再讨论要不要对象化。

### 规则 5：不要把 `ctx` 滥用成万能参数

可以通过参数收敛减少复杂度，但不能走向另一个极端：

- 什么都不传，所有 helper 都直接吃大 `ctx`

这样会让函数真实依赖被隐藏，反而更难维护。

好的边界是：

- 纯算法：只吃 state / snapshot / primitive
- 边界 helper：吃 `ctx + state + input` 的 operation object
- 绝不把整个 `Editor` / `InteractionCtx` 当万能依赖包随便传

## 全量模块收敛建议

下面按模块列出建议，分为：

- `应改`
- `可改`
- `不建议改`

---

## 一、Interactions

### 1. `interactions/transform`

涉及文件：

- `packages/whiteboard-editor/src/interactions/transform/project.ts`
- `packages/whiteboard-editor/src/interactions/transform/start.ts`
- `packages/whiteboard-editor/src/interactions/transform/types.ts`

#### 应改

`project.ts` 是当前最典型的参数拆散过度区域。

当前问题：

- `computeResizeProjection(ctx, session, drag, input)` 里 `drag` 已经是一份 resize state，但继续把它拆成一长串字段喂给 `computeResizeRect`
- `computeRotateProjection(session, drag, input)` 也同样在手工拆 rotate state
- `getResizeStartRect(drag)` 的存在也说明 resize 的“起始几何快照”已经是一个稳定概念，但还没有被提升为一等模型

当前代码位置：

- `packages/whiteboard-editor/src/interactions/transform/project.ts:36`
- `packages/whiteboard-editor/src/interactions/transform/project.ts:79`

建议目标：

1. 在 core 定义 `ResizeGestureSnapshot`
2. 在 core 定义 `RotateGestureSnapshot`
3. `ResizeDragState` / `RotateDragState` 与这两个 snapshot 对齐
4. 将 core 算法改成吃 snapshot，而不是一堆拆散字段

推荐形态：

```ts
computeResizeRect({
  drag,
  currentScreen: input.screen,
  modifiers: input.modifiers,
  zoom,
  minSize
})
```

或进一步：

```ts
computeResizeRect(resizeGestureInput)
```

其中 `resizeGestureInput` 是 core 自己拥有的类型。

对 `computeNextRotation` 同理：

```ts
computeNextRotation({
  drag,
  currentPoint: input.world,
  shiftKey: input.modifiers.shift
})
```

#### 可改

`start.ts` 中的 `createResizeDrag` / `createRotateDrag` 已经是对象参数，但还可以再收：

- `createResizeDrag({ pointerId, handle, rect, rotation, startScreen })`
- `createRotateDrag({ pointerId, rect, rotation, start })`

建议把这里生成的 drag state 直接对齐 core 的 gesture snapshot 形状，避免 `project.ts` 再做额外转换。

当前代码位置：

- `packages/whiteboard-editor/src/interactions/transform/start.ts:15`
- `packages/whiteboard-editor/src/interactions/transform/start.ts:38`

#### 不建议改

`startTransformSession(ctx, input)` 的边界已经比较合理：

- `ctx` 是环境
- `input` 是输入
- 输出是 `TransformSession`

这里不需要为了“统一”继续包更多对象。

---

### 2. `interactions/edge/connect`

涉及文件：

- `packages/whiteboard-editor/src/interactions/edge/connect.ts`

#### 应改

`createReconnectState(ctx, edgeId, end, pointerId, world)` 参数过散。

当前代码位置：

- `packages/whiteboard-editor/src/interactions/edge/connect.ts:105`

这 4 个非 `ctx` 参数里，`pointerId/world` 来自同一个 pointer 输入，`edgeId/end` 来自同一个 pick 目标。

建议改成：

```ts
createReconnectState(ctx, {
  edgeId,
  end,
  pointerId,
  world
})
```

更进一步，可以由调用侧直接传 pointer down 派生对象：

```ts
createReconnectState(ctx, reconnectStart)
```

其中 `reconnectStart` 形状类似：

```ts
type EdgeReconnectStart = {
  edgeId: EdgeId
  end: 'source' | 'target'
  pointerId: number
  world: Point
}
```

#### 可改

`updateConnectState(ctx, state, { pointerId, world })` 已经用了对象参数，但语义名字偏弱。

建议收敛成：

```ts
updateConnectState({
  ctx,
  session: state,
  pointer
})
```

这样能与 `route.ts`、`transform/project.ts` 的风格统一。

当前代码位置：

- `packages/whiteboard-editor/src/interactions/edge/connect.ts:139`

#### 不建议改

`writeConnectPreview(ctx, state)` 现在已经很接近合理边界：

- 环境 `ctx`
- 当前 session state

它主要承担的是 preview projection，而不是参数炸裂问题。

---

### 3. `interactions/edge/route`

涉及文件：

- `packages/whiteboard-editor/src/interactions/edge/route.ts`

#### 应改

这一组函数最明显的问题不是单个函数参数多，而是同一批依赖以不同顺序重复出现：

- `projectBodyMove(ctx, session, input)`
- `writeBodyMovePreview(ctx, edgeId, patch)`
- `commitBodyMove(ctx, session)`
- `projectRouteDrag(ctx, session, input)`
- `writeRouteDragPreview(ctx, session, patch)`
- `commitRouteDrag(ctx, session)`

当前代码位置：

- `packages/whiteboard-editor/src/interactions/edge/route.ts:125`
- `packages/whiteboard-editor/src/interactions/edge/route.ts:160`
- `packages/whiteboard-editor/src/interactions/edge/route.ts:171`
- `packages/whiteboard-editor/src/interactions/edge/route.ts:242`
- `packages/whiteboard-editor/src/interactions/edge/route.ts:277`
- `packages/whiteboard-editor/src/interactions/edge/route.ts:289`

建议统一成 operation object 风格：

```ts
projectBodyMove({
  ctx,
  session,
  pointer
})

writeBodyMovePreview({
  ctx,
  session,
  patch
})

commitBodyMove({
  ctx,
  session
})
```

这样做的收益：

- 统一签名
- 减少参数顺序记忆
- 后续新增字段时不用改多处位置参数

#### 可改

`resolveRouteState(ctx, input)` 本身还好，但它返回的 `RouteState` 可以进一步作为 route 相关 helper 的统一输入来源，减少后面手工拆字段。

#### 不建议改

`createBodyMoveSession(ctx, initial, control)` / `createRouteDragSession(ctx, initial, control)` 这两个 session 构造边界目前是清晰的：

- `ctx` 环境
- `initial` 初始 session state
- `control` runtime 控制通道

这里不需要为了统一硬改成更大的对象。

---

### 4. `interactions/selection/press`

涉及文件：

- `packages/whiteboard-editor/src/interactions/selection/press.ts`

#### 应改

这里最先要处理的不是“对象化”，而是参数漂移。

当前代码：

- `createDragSession(ctx, start, drag, pointer)`

但 `pointer` 实际没有被使用。

当前代码位置：

- `packages/whiteboard-editor/src/interactions/selection/press.ts:174`

建议先直接删掉无效参数：

```ts
createDragSession(ctx, start, drag)
```

#### 可改

`createDragSession` 和 `createHoldSession` 其实都属于：

- 从 press decision 派生 follow-up session

所以可以进一步统一成：

```ts
createFollowupSession({
  ctx,
  start,
  decision
})
```

其中 `decision` 可以是：

- `SelectionDragDecision`
- `SelectionMarqueeDecision`

收益：

- 少两个功能重叠 helper
- press 的编排逻辑更清晰

#### 不建议改

`resolveSelectionPressState(ctx, input)` 的整体边界是合理的，不建议强行把内部一堆判断拆得更碎。

---

### 5. `interactions/selection/move`

涉及文件：

- `packages/whiteboard-editor/src/interactions/selection/move.ts`

#### 可改

当前 `createMoveInteraction(ctx, { start, target, prepareSelection })` 已经是对象参数风格，方向基本正确。

还能优化的点是 `project(world, nextAllowCross)`：

- 这里的 `world` 和 `nextAllowCross` 本质上来自一次 pointer 输入

建议统一成：

```ts
project({
  world,
  allowCross
})
```

收益中等，不是最高优先级。

#### 不建议改

`MoveInteractionInput` 这个对象本身保留是对的，不要再拆回位置参数。

---

### 6. `interactions/selection/marquee`

涉及文件：

- `packages/whiteboard-editor/src/interactions/selection/marquee.ts`

#### 可改

当前 `step(pointer)` 已经吃对象了，这里整体比较健康。

能继续优化的点是：

- `readMatchedItems(ctx, rect, match)`
- `writeMatchedSelection(ctx, action, items)`

这两个 helper 可以统一成更一致的 operation object 风格：

```ts
readMatchedItems({
  ctx,
  rect,
  match
})

writeMatchedSelection({
  ctx,
  action,
  items
})
```

收益一般，更偏风格统一。

---

### 7. `interactions/mindmap`

涉及文件：

- `packages/whiteboard-editor/src/interactions/mindmap.ts`

#### 可改

这里的参数模型整体已经比其他 interaction 更健康。

唯一值得进一步优化的是：

- `projectMindmapSession(ctx, state, world)`

如果要和其他 interaction 风格统一，可以改为：

```ts
projectMindmapSession({
  ctx,
  session: state,
  world
})
```

但收益不高。

#### 不建议改

不要把这里为了统一而硬改成吃更大的对象。

原因：

- `state` 就是 domain session
- `world` 就是当前增量输入
- `ctx` 就是环境

这已经是接近最优的边界。

---

### 8. `interactions/draw`

涉及文件：

- `packages/whiteboard-editor/src/interactions/draw/index.ts`
- `packages/whiteboard-editor/src/interactions/draw/draw.ts`
- `packages/whiteboard-editor/src/interactions/draw/erase.ts`

#### 可改

`stepDrawSession(ctx, session, input, force = false)` 这种签名还可以接受，但如果要统一风格，可以改成：

```ts
stepDrawSession({
  ctx,
  session,
  input,
  force
})
```

但这类收益不高。

#### 不建议改

draw 这里真正复杂度不在参数模型，而在：

- stroke / erase 双分支
- preview / commit 的差异化流程

不要把主要精力花在这里的参数对象化上。

---

### 9. `interactions/viewport`

涉及文件：

- `packages/whiteboard-editor/src/interactions/viewport.ts`

#### 不建议改

当前参数规模很小，主要逻辑也简单：

- `updatePan(ctx, state, input)`

没有明显的参数收敛收益。

---

### 10. `interactions/insert`

涉及文件：

- `packages/whiteboard-editor/src/interactions/insert.ts`

#### 不建议改

这里只是触发 insert preset，参数规模很小，没有必要继续做对象化优化。

---

## 二、Runtime Commands / Write

### 11. `runtime/commands/insert`

涉及文件：

- `packages/whiteboard-editor/src/runtime/commands/insert.ts`

#### 应改

这块已经采用了部分对象参数，但还不彻底，存在同一语义分散在多个 helper 的问题。

当前问题点：

- `insertNodePreset(editor, preset, world, ownerId)`
- `insertMindmapPreset(editor, preset, world)`
- `runInsertPreset({ editor, preset, world, ownerId })`

`runInsertPreset` 已经是 object 形态，但底层两个 helper 还是位置参数风格，导致模型不统一。

当前代码位置：

- `packages/whiteboard-editor/src/runtime/commands/insert.ts:56`
- `packages/whiteboard-editor/src/runtime/commands/insert.ts:79`
- `packages/whiteboard-editor/src/runtime/commands/insert.ts:119`

建议：

统一改为：

```ts
insertNodePreset({
  editor,
  preset,
  world,
  ownerId
})

insertMindmapPreset({
  editor,
  preset,
  world
})
```

#### 可改

`placeNodeInput(world, input, placement)` 也可以对象化：

```ts
placeNodeInput({
  world,
  input,
  placement
})
```

这个收益是风格统一，不是结构性必改。

#### 不建议改

`insertPresetByKey(presetKey, options)` 不一定要改，因为它是很明确的 public API 适配层。

---

### 12. `runtime/commands/mindmap`

涉及文件：

- `packages/whiteboard-editor/src/runtime/commands/mindmap.ts`

#### 应改

这块表面上已经用了 object 参数，但还有两个可以继续收敛的点。

第一类问题是 `createLayoutHint(anchorId, nodeSize, layout)`：

- 这三个参数永远一起出现
- 它们本质上都属于“layout context”

当前代码位置：

- `packages/whiteboard-editor/src/runtime/commands/mindmap.ts:36`

建议收成：

```ts
createLayoutHint({
  anchorId,
  nodeSize,
  layout
})
```

第二类问题是 `moveMindmapRoot({ editor, nodeId, position, origin, threshold })`

- `origin` 和 `threshold` 是判断策略的一部分
- `nodeId` / `position` 是动作目标

如果要更清楚，可以把它拆成：

- `move` 目标
- `policy` 策略

但这属于中优先级。

#### 可改

`readNodePosition(editor, nodeId)` 可以改成：

```ts
readNodePosition({
  editor,
  nodeId
})
```

不过收益不大，更像一致性修正。

#### 不建议改

`insertMindmapByPlacement` / `moveMindmapByDrop` / `moveMindmapRoot` 的顶层 public API 目前已经是对象参数，不需要再进一步合并成更大的 host object。

---

### 13. `runtime/commands/node/text`

涉及文件：

- `packages/whiteboard-editor/src/runtime/commands/node/text.ts`

#### 可改

这里的问题不是参数过多，而是 host 依赖稍微偏散：

- `read`
- `committedNode`
- `preview`
- `session`
- `deleteCascade`
- `document`
- `appearance`

当前代码位置：

- `packages/whiteboard-editor/src/runtime/commands/node/text.ts:26`

建议不是把它们并成“大 ctx”，而是做更窄的 host：

```ts
type NodeTextHost = {
  read: ...
  preview: ...
  session: ...
  document: ...
  appearance: ...
  deleteCascade: ...
  committedNode: ...
}
```

然后 `createNodeTextCommands(host)`。

这能减少装配噪音，但不应再往上扩大成整个 editor。

#### 不建议改

`commit({ nodeId, field, value, size })` 作为 public command 输入已经很合理，不要继续合并。

---

### 14. `runtime/write/session`

涉及文件：

- `packages/whiteboard-editor/src/runtime/write/session.ts`

#### 可改

这里已经把 `tool` / `selection` 的逻辑直接内联进 writer 了，方向是对的。

还能继续优化的是，把 `writeSelection(next, write)` 这个 helper 的签名改成 operation object，统一风格：

```ts
writeSelection({
  next,
  apply
})
```

收益一般。

#### 不建议改

不要把整个 `runtime.state` 继续包装成更大的 session host 再层层传递。当前直接读 `runtime.state.*` 已经是比较明确的写时边界。

---

### 15. `runtime/write/view`

涉及文件：

- `packages/whiteboard-editor/src/runtime/write/view.ts`

#### 可改

当前 `draw.slot(slot)` / `draw.patch(patch)` 里对 `runtime.state.tool` 与 `runtime.state.drawPreferences` 的访问是合理的。

唯一可以调整的是 `mergeInputPolicy(current, patch)` 这种辅助函数，如果想统一风格，可以对象化：

```ts
mergeInputPolicy({
  current,
  patch
})
```

但收益较低。

#### 不建议改

不要为了统一把 `pointer.set(sample)`、`space.set(value)` 这类单参数动作继续包装。

---

### 16. `runtime/editor/createEditor`

涉及文件：

- `packages/whiteboard-editor/src/runtime/editor/createEditor.ts`

#### 可改

这里最适合优化的不是 public API，而是内部装配 helper。

例如 `writePointer(input)` 现在吃的是一个匿名对象结构，这已经不错；如果继续做参数收敛，可以把 editor 装配内部的临时 host 再抽一层，但收益有限。

#### 不建议改

这里不要再构造新的“大 editor host”对象去喂给 interaction/runtime，容易重新放大依赖面。

---

## 三、Runtime Read / Query / Clipboard / Interaction Base

### 17. `runtime/query/targetBounds`

涉及文件：

- `packages/whiteboard-editor/src/runtime/query/targetBounds.ts`

#### 应改

这块是一个容易漏掉的参数优化点。

当前内部有：

- `readNodeBounds(readItem, nodeId)`
- `readResolvedEdgeBounds(readResolved, edgeId)`

当前代码位置：

- `packages/whiteboard-editor/src/runtime/query/targetBounds.ts:26`
- `packages/whiteboard-editor/src/runtime/query/targetBounds.ts:35`

这类函数的参数关系是：

- 一个 reader 函数
- 一个 id

它们本质上是同一操作的上下文对象。

建议改成：

```ts
readNodeBounds({
  readItem,
  nodeId
})

readResolvedEdgeBounds({
  readResolved,
  edgeId
})
```

更进一步，可以直接收成：

```ts
readNodeBounds(reader, nodeId)
```

如果确定不会扩展，也可以保持现状。这里更大的建议是：

- 统一 `get/track` 两个路径使用的 reader operation 形状
- 不要在一个 query 模块里同时出现多种 reader 签名风格

---

### 18. `runtime/clipboard`

涉及文件：

- `packages/whiteboard-editor/src/runtime/clipboard.ts`

#### 应改

`applyInsertedRoots(editor, inserted)` 这类函数已经是对象风格，问题不大。

更值得收的是：

- `resolveClipboardTarget(editor, target)`
- `readClipboardPacket(editor, target)`

这两个 helper 的 `editor + target` 会在多处重复出现，可以统一为：

```ts
resolveClipboardTarget({
  editor,
  target
})

readClipboardPacket({
  editor,
  target
})
```

当前代码位置：

- `packages/whiteboard-editor/src/runtime/clipboard.ts:50`
- `packages/whiteboard-editor/src/runtime/clipboard.ts:58`

#### 可改

`cut(target)` 内部也适合构造一次 `resolvedTarget` operation object，避免之后 `edgeIds/nodeIds` 的分支逻辑持续读散字段。

#### 不建议改

`insert(packet, options?)` 作为 public API 已经很合理，不用动。

---

### 19. `runtime/read/node`

涉及文件：

- `packages/whiteboard-editor/src/runtime/read/node.ts`

#### 可改

这块主要是一些小 helper 的参数风格不一致。

例如：

- `readNodeType(node)`
- `readNodeRotation(node)`
- `readNodeItemOutline(item)`

这些单参数函数没问题。

但：

- `createNodeItemStore({ read, overlay })`
- `createNodeStateStore({ overlay })`
- `createNodeCapabilityResolver(registry)`

整体已经是比较合理的构造风格。

这里唯一值得优化的点，是 `getNodeItemBounds(item)` 与 `readNodeItemOutline(item)` 这种“吃 item，内部自己 resolve rotation/type”的风格应当作为全域标准。也就是说：

- 优先直接吃 `NodeItem`
- 不要再回到传 `node + rect + rotation` 三散件

这是一个设计原则，不一定要在本文件改代码。

---

### 20. `runtime/read/edge`

涉及文件：

- `packages/whiteboard-editor/src/runtime/read/edge.ts`

#### 应改

`toNodeCanvas(item)` 是一个很好的方向：直接吃 `NodeItem`，而不是 `node/rect/rotation` 散件。

这说明 edge/view 相关算法的推荐方向应该是：

- 如果几何和节点展示语义总是成套出现，就直接传 `NodeItem` 或核心层自己的 `NodeCanvasSnapshot`

当前最值得继续收的地方是：

- `createEdgeResolvedStore({ item, nodeItem })` 内部，`resolveEdgeView` 还需要手工把 source/target 转成 `{ node, rect, rotation }`

建议未来在 core 层把这个结构命名化，例如：

- `NodeCanvasSnapshot`

然后 editor 直接传 snapshot，不再临时拼对象。

#### 可改

`createEdgeRead({ read, nodeItem, overlay, capability })` 已经是对象参数；后续如果继续收敛，可把 `capability` 也替换成更稳定的 `nodeCapability` host 命名，但收益不高。

---

### 21. `runtime/read/selection`

涉及文件：

- `packages/whiteboard-editor/src/runtime/read/selection.ts`

#### 可改

`readRuntimeNodes(node, readStore)` 可以进一步对象化：

```ts
readRuntimeNodes({
  node,
  readStore
})
```

更重要的不是对象化本身，而是这里体现出一个标准：

- 任何 `track/readStore` 风格 helper，都应该统一成 reader operation object，而不是有的用 `(readStore, id)`，有的用 `(store, id)`，有的用 `(node, readStore)`

#### 不建议改

`createSelectionRead({ source, node, edge, targetBounds })` 已经很合理，不要动。

---

### 22. `runtime/interaction/snap`

涉及文件：

- `packages/whiteboard-editor/src/runtime/interaction/snap.ts`

#### 应改

这里已经用了对象参数，但还有一个更深层的收敛方向：

- `MoveSnapInput`
- `ResizeSnapInput`

这两个类型是好的，因为它们已经把 move/resize 的输入提升成了一等模型。

问题在于 transform / selection / edge 那些交互模块里，并没有系统性地围绕这两个输入模型去组织自己的 session state。

建议把这两个 input type 当作“全域参数收敛样板”：

- move 相关 helper 尽量直接产出 `MoveSnapInput`
- resize 相关 helper 尽量直接产出 `ResizeSnapInput`

而不是先拼自己的局部散字段，再在调用 `snap` 时临时组装。

#### 不建议改

`createSnapRuntime({ readZoom, node, edge })` 顶层装配已经很合理。

---

### 23. `runtime/interaction/autoPan`

涉及文件：

- `packages/whiteboard-editor/src/runtime/interaction/autoPan.ts`

#### 可改

`resolvePanVector({ point, size, threshold, maxSpeed })` 已经是对象参数，方向正确。

能继续优化的是 `ActiveAutoPan`：

- `pointer`
- `frame`
- `threshold`
- `maxSpeed`

这本身就是一份 `AutoPanSessionState`，可以显式命名，而不是匿名局部结构。

收益不高，但有助于统一 interaction runtime 的“session-like internal state”表达。

#### 不建议改

不要为了统一而把 `resolveAxisSpeed(point, size, threshold, maxSpeed)` 这种纯数学 helper 强行对象化，单纯标量函数保留即可。

---

### 24. `runtime/viewport`

涉及文件：

- `packages/whiteboard-editor/src/runtime/viewport.ts`

#### 可改

`setViewport(next)`、`copyRect(rect)` 这类都很小，不需要处理。

如果要追求风格统一，只推荐把 `wheel(input, wheelSensitivity)` 继续保持为 public 边界，内部不再拆更多层。

#### 不建议改

viewport 这里不是参数复杂度瓶颈，不要浪费重构预算。

---

### 25. `runtime/read/index` 与 `interaction/ctx`

涉及文件：

- `packages/whiteboard-editor/src/runtime/read/index.ts`
- `packages/whiteboard-editor/src/runtime/interaction/ctx.ts`

#### 不建议改

`createRead({ engineRead, registry, history, runtime, overlay, viewport })` 已经是标准装配式对象参数。

`InteractionCtx = { read, write, config, snap }` 也是当前 editor interaction 的正确边界。

这里不要再继续收更多字段进去，否则会重新走向“大 ctx 包打天下”。

---

## 四、哪些点应该明确“不优化”

为了避免后面施工时走偏，下面这些点应明确标记为“不因为参数统一而改”。

### 1. 不把 core 函数改成直接吃 editor 类型

尤其是：

- `ResizeDragState`
- `RotateDragState`
- `TransformSession`
- `InteractionCtx`

这些都不应该直接进入 core。

### 2. 不把所有函数都改成单参数对象

以下情况保留简单参数更好：

- 纯数学 helper
- 1 到 2 个参数的小函数
- public API 已经稳定、语义很清楚的命令接口

### 3. 不把整个 editor / runtime.state 当万能 host

可以有：

- `InsertWriterHost`
- `MindmapWriteHost`
- `NodeTextHost`

但这些 host 应该是窄的、域内的。

不应该有：

- `EditorHost`
- `InteractionHost`
- `RuntimeHost`

这种什么都塞进去的对象。

### 4. 不为了参数收敛破坏 read/write 边界

参数少不是最高目标。

更高目标是：

- 纯算法边界清晰
- read/write 权限清晰
- session state 清晰

---

## 五、推荐落地顺序

### P0：Transform 手势快照标准化

范围：

- `interactions/transform/project.ts`
- `interactions/transform/start.ts`
- 对应 core 几何 / transform 算法

目标：

- 建立 `ResizeGestureSnapshot` / `RotateGestureSnapshot`
- editor drag state 与 core snapshot 对齐

这是全局示范样板，完成后能指导其他模块怎么收。

### P1：Edge operation object 统一

范围：

- `interactions/edge/connect.ts`
- `interactions/edge/route.ts`

目标：

- 所有 `project/commit/writePreview` helper 签名统一成 operation object
- 清掉同一语义参数反复换顺序传递的问题

### P2：Selection follow-up session 收敛

范围：

- `interactions/selection/press.ts`
- `interactions/selection/move.ts`
- `interactions/selection/marquee.ts`

目标：

- 先删未使用参数
- 再统一 follow-up session 创建模型

### P3：Commands / Query / Clipboard 风格统一

范围：

- `runtime/commands/insert.ts`
- `runtime/commands/mindmap.ts`
- `runtime/commands/node/text.ts`
- `runtime/query/targetBounds.ts`
- `runtime/clipboard.ts`

目标：

- 统一 object 参数风格
- 保持 command host 为窄边界

### P4：Read / Infra 只做少量一致性修正

范围：

- `runtime/read/*`
- `runtime/interaction/snap.ts`
- `runtime/interaction/autoPan.ts`
- `runtime/viewport.ts`

目标：

- 只补风格一致性
- 不做大面积改动

---

## 六、最终目标形态

如果这轮参数收敛做对了，`whiteboard-editor` 最终会形成三条清晰规则：

1. core 算法吃 core snapshot / input model
2. interaction helper 吃 `ctx + session + input` 的 operation object
3. command/write 层只保留窄 host，不传大 editor

最终效果不是“参数都变少”，而是：

- session state 成为一等概念
- 手势快照成为一等概念
- operation object 成为边界层标准
- 位置参数只保留给真正简单的小函数

这才是真正能降低复杂度的收敛方向。

