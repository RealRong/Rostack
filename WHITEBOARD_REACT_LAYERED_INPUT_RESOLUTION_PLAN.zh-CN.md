# Whiteboard React 分层输入解析方案

## 背景

当前 `whiteboard/packages/whiteboard-react/src/canvas/usePointer.ts` 只是把 DOM `pointer` 事件转发给 runtime pointer bridge，本身不是瓶颈。

真正的热点在这条链路：

1. `usePointer.ts`
2. `runtime/bridge/pointer.ts`
3. `dom/host/input.ts -> resolvePointerInput() -> resolvePoint()`
4. `editor.input.pointerMove()`

在原始实现里，`resolvePoint()` 会在几乎每次 `pointermove` 上先调用 `document.elementsFromPoint()`，再用 DOM 栈推导：

- 当前 `pick`
- `editable`
- `ignoreInput`
- `ignoreSelection`
- `ignoreContextMenu`

这在 DOM 节点非常多时会产生明显卡顿，尤其是白板场景下 pointer move 频率高、overlay/chrome 元素也多。

## 现状判断

### 不是所有 move 都需要完整 DOM 栈

当前完整 DOM 栈主要服务于一个特殊需求：

- selection frame 命中时，需要“透传”到其下方已选中的 node/edge

对应位置：

- `whiteboard/packages/whiteboard-react/src/dom/host/input.ts`
- `whiteboard/packages/whiteboard-react/src/features/node/components/NodeOverlayLayer.tsx`

除此之外，大多数 pointer move 只需要 top-most 命中，甚至只需要 world/client/modifiers。

### 不能简单彻底禁掉 DOM hit-test

当前输入语义里，仍有一批能力依赖 DOM 层事实：

- `contenteditable` / 文本编辑态
- `data-input-ignore`
- `data-selection-ignore`
- `data-context-menu-ignore`
- edge label DOM 命中
- transform handle / connect handle 等 overlay 命中

因此“完全不做 DOM hit-test”会直接改语义，不是安全优化。

### 当前 spatial index 不能直接替换 DOM pick

当前 `whiteboard-editor-graph` 的 spatial index 只提供 scene item 级别的记录：

- `kind`
- `id`
- `bounds`
- `order`

它适合：

- 做候选过滤
- 做 point/rect 级粗筛
- 支撑 frame/node/edge 的图模型命中

它不适合直接替代：

- DOM overlay 命中
- 编辑态 ignore 规则
- edge label / handle 这类细粒度 DOM 部件命中

所以 spatial index 更适合做第二层，而不是唯一事实源。

## 目标

分层输入解析的目标不是“把 DOM 命中删掉”，而是把不同代价、不同精度的解析路径拆开：

1. 只有真的需要 DOM 语义时，才走 DOM hit-test
2. 只有真的需要完整 DOM 栈时，才走 `elementsFromPoint`
3. active session 的连续 move 尽量退化为 point-only 或 spatial-assisted
4. 保持现有交互语义稳定，尤其是 selection、text edit、edge label、transform handle

## 方案总览

建议把输入解析拆成三层：

### 第 1 层：Point-only

只解析：

- `client`
- `screen`
- `world`
- `modifiers`
- `pointerId`
- `button/buttons/detail`
- `samples`

不解析：

- `pick`
- `editable`
- `ignoreInput`
- `ignoreSelection`
- `ignoreContextMenu`

适用场景：

- 已经进入 active interaction session 的连续 move
- session 内只依赖 world/client 的拖拽与预览
- autopan frame 回调

### 第 2 层：Top-most DOM resolve

只取 top-most element：

- `elementFromPoint`
- 或 event target fallback

解析：

- `pick`
- `editable`
- `ignore*`

但不拿完整 DOM 栈。

适用场景：

- 普通 hover
- 普通 pointer down
- 大多数 context menu 前置命中
- 非 selection-box 的绝大多数场景

### 第 3 层：Full-stack DOM resolve

使用 `elementsFromPoint` 获取整条 DOM 栈，仅用于少数必须透传或需要下层命中的场景。

当前已知必须场景：

- `selection-box/body` 命中后，向下寻找已选 node/edge

后续如果没有新的硬需求，应该严格控制这层的调用面。

## 推荐的 API 拆分

建议在 `whiteboard/packages/whiteboard-react/src/dom/host/input.ts` 内拆出更明确的解析接口。

### 1. `resolvePointerPoint()`

返回 point 级输入：

- `client`
- `screen`
- `world`
- `samples`
- `modifiers`
- 原始 pointer 元信息

### 2. `resolvePointerTarget()`

基于 top-most element 解析：

- `pick`
- `editable`
- `ignoreInput`
- `ignoreSelection`
- `ignoreContextMenu`

默认不触发 `elementsFromPoint`

### 3. `resolvePointerTargetWithStack()`

只给极少数调用点使用：

- 先解析 top-most
- 在满足明确条件时再退化到 full-stack

当前条件建议仅保留：

- `primaryPick.kind === 'selection-box' && primaryPick.part === 'body'`

### 4. `resolvePointerInputByMode()`

由 bridge 按 mode/session 决定需要哪一层：

- `point-only`
- `top-most`
- `full-stack`

## Pointer Bridge 的分层策略

建议把 `runtime/bridge/pointer.ts` 中的 move 分成两类。

### Idle move

即当前没有 active session，仍处于 hover 态。

要求：

- 需要 hover target
- 需要 edge hover guide
- 需要编辑态和 ignore 规则

建议：

- 走 top-most resolve
- 默认不走 full-stack
- 只有 selection-box body 时按需退化到 full-stack

### Session move

即 `releaseSession` 已存在，move 由 pointer capture 期间的 session 处理。

当前大量 session move 其实只消费：

- `world`
- `client`
- `modifiers`
- `pointerId`

例如：

- selection move
- transform
- edge connect
- edge label drag
- draw
- edge route
- mindmap drag

这些 session 的连续 move 一般不需要重新解析 DOM `pick`。

建议：

- session move 默认走 point-only
- 只有某类 session 明确声明依赖实时 target 时，才升级到 top-most/full-stack

## Session 能力分级

建议给 interaction session 增加一个输入分辨率声明。

示意：

```ts
type PointerResolutionMode =
  | 'point-only'
  | 'top-most'
  | 'full-stack'
```

session 或 binding 可以声明：

```ts
type InteractionSession = {
  mode: Exclude<InteractionMode, 'idle'>
  pointerResolution?: PointerResolutionMode
  ...
}
```

默认策略建议：

- idle: `top-most`
- press: `top-most`
- drag session: `point-only`

如果后续发现某个 session move 需要实时 target，再单独提级。

## Spatial Index 的正确切入点

spatial index 不应该直接替换 DOM overlay pick，但很适合承担“图模型候选筛选”。

推荐两种用法。

### 1. 替换 point 命中下的图模型候选集获取

对 node/edge/frame 这类图元素：

- 先用 spatial point 查询取候选
- 再用精确 geometry hit-test 做二次判断

适用方向：

- frame hover
- scene item top-level pick 的粗筛
- edge/body 和 node/body 的几何命中优化

### 2. 作为 DOM 命中失败时的图模型 fallback

当：

- top-most DOM 没有 pick
- 且 target 也不在编辑态或 ignore 区域

可以考虑用 spatial 做 scene-level fallback。

但这一层必须谨慎，避免 DOM overlay 明明盖在上面，却被图模型抢命中。

## 近期实施建议

### Phase 0

已完成的低风险优化：

- 普通命中只取 top-most element
- 只有 selection-box body 才退回 `elementsFromPoint`

这是最小收益版本，已经显著缩小了 `elementsFromPoint` 的调用面。

### Phase 1

把 pointer resolve API 拆层，但先不改 editor session 协议：

- `resolvePointerPoint`
- `resolvePointerTarget`
- `resolvePointerInputTopMost`
- `resolvePointerInputFullStack`

收益：

- 调用点意图更清楚
- 后续迁移 session move 到 point-only 更容易

### Phase 2

给 active session 增加 `pointerResolution` 声明，把连续 move 默认降级为 `point-only`。

优先迁移：

1. selection move
2. transform
3. edge label drag
4. draw
5. edge route
6. edge connect
7. mindmap drag

这些是高频 move，收益最大。

### Phase 3

补 spatial-assisted scene pick：

- top-most DOM 没有 pick 时
- 用 spatial 取 scene candidate
- 用 geometry 精确判定 node/edge/frame

这一阶段要严格控制行为差异，不能影响 text edit、overlay、ignore flags。

## 风险点

### 风险 1：编辑态误穿透

如果 point-only 或 spatial fallback 用得太激进，可能会在文本编辑、label 编辑时把命中穿透到下层 scene item。

约束：

- edit session 周边仍需优先遵守 DOM editable 语义

### 风险 2：overlay 与 scene 命中优先级变化

transform handle、connect handle、selection frame、edge control point 都是 DOM overlay。

如果改成先 spatial 再 DOM，优先级会错。

约束：

- 命中优先级必须始终是 DOM overlay > scene graph fallback

### 风险 3：session move 的隐式依赖

虽然大多数 drag session 现在只看 world/client，但不能只靠直觉，需要逐个确认是否在 `move/up` 阶段还读取 `pick` 或 `ignore*`。

约束：

- 每迁移一个 session，就补一类回归测试

## 测试建议

至少覆盖以下回归：

1. 普通 node hover 不触发 full-stack DOM resolve
2. selection-box body 仍能透传到底下已选 node/edge
3. 文本编辑态点击/拖动不穿透到底图形
4. edge label 命中优先于 edge body
5. transform handle 命中优先于 node body
6. connect handle 命中优先于 node body
7. active drag session 在 point-only 模式下行为不变

## 推荐落地顺序

推荐按以下顺序推进，而不是一次性重写输入系统：

1. 保留 DOM 为最高优先级事实源
2. 缩小 `elementsFromPoint` 调用面
3. 把解析 API 分层
4. 让 active session move 默认改走 point-only
5. 最后再引入 spatial-assisted fallback

这个顺序的好处是：

- 每步都能独立验证
- 每步都能单独带来性能收益
- 不会一次性把 DOM 语义、overlay 语义和图模型命中逻辑打散

## 最终结论

这类卡顿的核心问题不是“是否监听 pointermove”，而是“pointermove 上默认执行了最高成本的命中解析路径”。

因此正确方向不是彻底禁掉命中解析，而是：

- 把输入解析分层
- 把 full-stack DOM resolve 限制在极少数必要场景
- 把 active session 的连续 move 尽量降到 point-only
- 在需要图模型候选时再引入 spatial index 辅助

这样可以在不破坏现有交互语义的前提下，把高频 move 的成本从“每帧完整 DOM 栈命中”降到“按需 top-most 或 point-only”。
