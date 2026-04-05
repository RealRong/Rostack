# WHITEBOARD_COLLAB_PRESENCE_INTERNALIZATION_PLAN.zh-CN

## 目标

把当前 `apps/whiteboard` 里与协作同步、presence 发布、远端光标/选区渲染相关的运行时逻辑，内收进 `@whiteboard/react` 的内部组件与 lifecycle。

目标不是单纯“挪文件”，而是解决两类长期问题：

- demo 层持有 runtime 级状态，导致输入链路被外部 rerender 干扰
- React 输入 hook 依赖过宽，任意 context identity 波动都会中断 pointer session

长期最优结果应当是：

- demo 只负责提供 transport / binding，不负责驱动白板内部交互状态同步
- `@whiteboard/react` 内部自行管理协作文档生命周期、presence 发布、presence 渲染
- `usePointer`、`useKeyboard` 这类输入 hook 只依赖稳定 bridge，不再被 config 或外层 view state 波动打断

---

## 这次问题的根因

本次“左键点击没效果、无法选中也无法拖拽”的直接根因，不在 `viewport`，也不在 hit test。

日志已经证明：

- `pointerdown` 命中了 node
- selection press 正常解析
- 但在 `down:editor-result` 之后，交互 session 立刻被 `interaction.cancel()` 取消

实际触发链路如下：

1. `apps/whiteboard/src/App.tsx` 的 `onPointerDownCapture` 里先执行 `publishPointer(...)`
2. `publishPointer(...)` 调 `syncPresence(...)`
3. `syncPresence(...)` 调 awareness 本地状态更新
4. awareness 订阅回调触发 `setAwarenessVersion(...)`
5. `App` 重新 render
6. `<Whiteboard />` 收到新的内联 `options` 对象
7. `whiteboard-react` runtime context value 因 `resolvedConfig` 变化而换引用
8. `usePointer()` effect cleanup 被触发
9. cleanup 中调用 `whiteboard.pointer.cancel()`
10. 当前 press session 立即被 `interaction.cancel()` 清掉

因此：

- `pointerdown` 能进
- `pointerup`、`move threshold`、`move session` 都进不去
- 用户体感就是“左键完全没效果”

这说明问题本质上是：

- **presence 发布放在 demo 外层，破坏了白板输入 session 的连续性**
- **输入 hook 对 runtime identity 的依赖粒度过粗**

---

## 当前结构的问题

### 1. demo 持有 runtime 级协作逻辑

当前 `apps/whiteboard/src/App.tsx` 里同时承担了这些职责：

- collab binding 创建与销毁
- awareness 订阅
- 本地 pointer / selection / tool / activity 发布
- blur / visibility clear
- viewport 订阅
- remote cursor / remote selection overlay 渲染

这些都不是 demo 页面该负责的事情。

demo 只应该负责：

- 场景文档选择
- demo transport 实例化
- user / room 的 demo 配置

不应该直接介入白板输入会话。

### 2. presence 发布与 pointerdown 同步耦合

当前 `publishPointer()` 在 `pointerdown capture` 当下就同步触发外层 React state 更新。

这有两个问题：

- 它与真实输入处理处于同一事件帧
- 它通过 demo 自己的 React state 驱动 rerender，而不是走白板内部稳定 runtime

只要 rerender 影响到 `Whiteboard` 的 props / context identity，就可能中断 session。

### 3. remote presence 渲染放在 demo 根组件

`RemotePresenceLayer` 依赖：

- `awarenessVersion`
- `viewportVersion`
- `instance`
- `doc.id`

这意味着每次远端 presence 更新、viewport 变化，都会把 demo 根组件也卷进去。

这会产生两个副作用：

- 无关 rerender 扩散到白板宿主层
- 协作显示层和输入层共享同一父级更新边界

长期看，这种结构非常脆弱。

### 4. `usePointer()` 依赖整个 `whiteboard` context value

当前 `usePointer()`：

- 通过 `useWhiteboard()` 读取整个 runtime 对象
- effect 依赖 `[containerRef, panEnabled, whiteboard]`
- cleanup 无条件调用 `whiteboard.pointer.cancel()`

这意味着只要 `whiteboard` 对象换引用，即使 pointer bridge 没变，也会：

- 移除事件监听
- 取消当前 pointer session

这是本次回归真正被触发的技术点。

### 5. runtime services 与 config 共用一个 context value

当前 `useWhiteboardRuntime()` 返回的 `whiteboard` 对象包含：

- 稳定服务：`editor / engine / pointer / clipboard / insert / registry`
- 易变数据：`config`

然后 `WhiteboardProvider` 直接把整个对象下发。

结果是：

- config 变化
- runtime value 换引用
- 所有依赖 `useWhiteboard()` 的 hook 一起感知“runtime changed”

这会把本来只应影响渲染配置的变化，扩散到输入层。

---

## 长期最优架构

## 一. 协作同步内收为白板内部能力

长期最优方案不是把 demo 里的逻辑“拆成几个 hook 继续放 demo”，而是：

- `@whiteboard/react` 内部提供 presence lifecycle 与 presence overlay
- demo 只提供 transport / awareness binding

### 建议新增的内部能力

建议在 `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/` 和 `features/collab/` 下增加：

- `PresenceLifecycle.tsx`
- `PresenceLayer.tsx`
- `presence/types.ts`
- `presence/project.ts`
- `presence/activity.ts`

职责拆分如下。

### `PresenceLifecycle`

负责：

- 订阅 editor 的 selection / tool / edit / viewport pointer
- 把本地状态同步到 presence binding
- 处理 blur / visibility clear
- 统一节流 pointer publish
- 把“activity”从 editor 当前状态中推导出来

这一层必须在白板内部执行，不能依赖 demo 根组件 rerender。

### `PresenceLayer`

负责：

- 订阅远端 presence store
- 订阅 viewport
- 把远端 world selection / cursor 投影到屏幕
- 渲染 remote cursor / remote selection chrome

这一层应该作为白板 chrome 的一部分存在，而不是由 demo 额外包一层 overlay。

### demo 保留的内容

demo 仍然可以保留：

- `createBroadcastChannelCollab()`
- `createDemoUser()`
- `readRoomIdFromUrl()`

但这些只用于构造 transport / binding，不再负责输入监听与渲染。

---

## 二. 为 collab 扩展一个明确的 presence binding API

现在 `WhiteboardCollabOptions` 只有：

- `doc`
- `provider`
- `bootstrap`
- `autoConnect`
- `onSession`
- `onStatusChange`

它只覆盖了文档同步，没有覆盖 presence。

长期最优应当在 `WhiteboardCollabOptions` 中显式增加一个 presence 扩展位，而不是继续让 demo 在外面自己拼。

### 建议的数据模型

建议引入 whiteboard 内部标准 presence state，而不是直接暴露 transport 私有结构：

```ts
type WhiteboardPresenceUser = {
  id: string
  name: string
  color: string
}

type WhiteboardPresenceState = {
  user: WhiteboardPresenceUser
  pointer?: {
    world: { x: number; y: number }
    timestamp: number
  }
  selection?: {
    nodeIds: readonly string[]
    edgeIds: readonly string[]
  }
  tool?: {
    type: Tool['type']
    value?: string
  }
  activity?: 'idle' | 'pointing' | 'dragging' | 'editing'
  updatedAt: number
}

type WhiteboardPresenceBinding = {
  clientId: string
  getLocalState: () => WhiteboardPresenceState | null
  getStates: () => ReadonlyMap<string, WhiteboardPresenceState>
  setLocalState: (state: WhiteboardPresenceState | null) => void
  updateLocalState: (
    recipe: (prev: WhiteboardPresenceState | null) => WhiteboardPresenceState | null
  ) => void
  subscribe: (listener: () => void) => () => void
}
```

### 建议的 API 扩展

```ts
type WhiteboardCollabOptions = {
  doc: Y.Doc
  provider?: CollabProvider
  bootstrap?: CollabBootstrapMode
  autoConnect?: boolean
  onSession?: (session: CollabSession | null) => void
  onStatusChange?: (status: CollabStatus) => void
  presence?: {
    binding: WhiteboardPresenceBinding
    pointerThrottleMs?: number
    renderRemoteCursors?: boolean
    renderRemoteSelections?: boolean
  }
}
```

这样分层更稳定：

- 文档同步仍然归 `CollabLifecycle`
- presence 发布与渲染归内部 `PresenceLifecycle + PresenceLayer`
- demo transport 只需实现 `binding`

---

## 三. 把 `Whiteboard` runtime context 拆成“稳定服务”和“配置”

这是解决本次回归的长期关键。

### 当前不合理点

当前 `whiteboard` context 同时承载：

- 稳定 bridge / runtime services
- 每次 `options` 变化都会变的 `config`

这导致：

- `useWhiteboard()` 返回值经常换引用
- 输入 hook 的 effect 被动重绑

### 长期最优目标

拆成两个读取层：

#### 1. 稳定 services context

只放这些“一旦创建就不应频繁换引用”的对象：

- `editor`
- `engine`
- `registry`
- `pointer`
- `clipboard`
- `insert`

#### 2. config context 或 config store

单独放：

- `resolvedConfig`

并让只关心配置的 hook 单独读取它，例如：

- `useResolvedConfig()`

而 `usePointer()`、`useKeyboard()`、`useClipboard()` 等输入 hook 不再订阅 config context。

### 为什么这是长期最优

因为这不只是修这一次 bug，而是把白板 runtime 的“稳定能力”和“可变配置”从语义上拆开。

一旦拆开，后续这些变化：

- tool palette 状态
- collab presence 变化
- viewport chrome 变化
- config patch

都不会再误伤 pointer session。

---

## 四. `usePointer()` 的长期修法

`usePointer()` 的长期最优修法，不应该只是“把依赖数组改小”。

正确做法应当是：

### 1. 只依赖稳定的 pointer bridge

`usePointer()` 不应该依赖整个 `whiteboard` 对象。

它只需要：

- `pointerBridge`
- `panEnabled`
- `containerRef`

建议改成类似：

```ts
const { pointer } = useWhiteboardServices()
```

effect 只依赖：

- `containerRef`
- `pointer`

而 `panEnabled` 通过 ref 读取最新值。

### 2. 事件处理函数读取最新 `panEnabled`

不要因为 `panEnabled` 改变而重绑 DOM 事件。

建议使用 ref：

```ts
const panEnabledRef = useRef(panEnabled)
panEnabledRef.current = panEnabled
```

在 `onPointerDown` 里读取：

```ts
pointer.down({
  container,
  event,
  panEnabled: panEnabledRef.current
})
```

这样：

- 行为可更新
- 监听器不需要销毁重绑

### 3. cleanup 只在真正卸载或 bridge 更换时 cancel

当前 cleanup 里的 `pointer.cancel()` 语义本身没错。

错的是：cleanup 被太容易触发。

长期目标应该是：

- 普通 rerender 不触发 cleanup
- 只有真正卸载或 pointer bridge 更换时才 cancel

也就是说，修复重点不在“删掉 cancel”，而在“确保 effect 不因无关引用变化被 teardown”。

---

## 五. demo 层改造成什么样

改造完成后，`apps/whiteboard/src/App.tsx` 应只保留：

- 场景文档切换
- demo room / user 创建
- collab transport / presence binding 创建
- 把它们传给 `<Whiteboard />`

理想形态类似：

```tsx
const collab = useMemo(() => ({
  doc: collabBinding.doc,
  provider: collabBinding.provider,
  bootstrap: 'auto',
  autoConnect: true,
  presence: {
    binding: collabBinding.awareness
  }
}), [collabBinding])

const options = useMemo(() => ({
  style: { width: '100%', height: '100%' },
  initialTool: { type: 'select' },
  mindmapLayout: { mode: 'simple' }
}), [])
```

然后直接：

```tsx
<Whiteboard
  document={doc}
  onDocumentChange={setDoc}
  collab={collab}
  options={options}
/>
```

App 不再持有：

- `instance`
- `awarenessVersion`
- `viewportVersion`
- `syncPresence()`
- `publishPointer()`
- `RemotePresenceLayer`
- `onPointerDownCapture` 里的 presence 行为

---

## 推荐落点

### 推荐新增文件

- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/PresenceLifecycle.tsx`
- `whiteboard/packages/whiteboard-react/src/features/collab/PresenceLayer.tsx`
- `whiteboard/packages/whiteboard-react/src/features/collab/presenceProject.ts`
- `whiteboard/packages/whiteboard-react/src/features/collab/presenceActivity.ts`
- `whiteboard/packages/whiteboard-react/src/types/common/presence.ts`

### 推荐调整文件

- `whiteboard/packages/whiteboard-react/src/types/common/collab.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/CollabLifecycle.tsx`
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/runtime.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/hooks/useWhiteboard.ts`
- `whiteboard/packages/whiteboard-react/src/canvas/usePointer.ts`
- `whiteboard/packages/whiteboard-react/src/canvas/Chrome.tsx`
- `apps/whiteboard/src/App.tsx`

### 推荐删除或下沉的 demo 逻辑

- `App.tsx` 中的 `RemotePresenceLayer`
- `App.tsx` 中的 `syncPresence`
- `App.tsx` 中的 pointer publish 与 clearPresence
- `App.tsx` 中的 `awarenessVersion` / `viewportVersion`

`apps/whiteboard/src/collab.ts` 可保留，但只作为 demo transport / awareness binding 工厂。

---

## 分阶段实施建议

## Phase 1: 先修输入稳定性

目标：

- 消除“普通 rerender 导致 pointer session cancel”

动作：

- 拆分 stable services context 与 config context
- `usePointer()` 改为只依赖稳定 `pointer` bridge
- `panEnabled` 改为 ref 读取
- `options` 在 demo 中先显式 `useMemo`

这是最小风险、收益最大的第一步。

## Phase 2: 内收 presence lifecycle

目标：

- 把本地 presence 发布从 demo 移出

动作：

- 增加 `collab.presence.binding`
- 引入 `PresenceLifecycle`
- 把 selection / tool / edit / pointer publish 收进白板内部
- 把 blur / visibility clear 收进白板内部

## Phase 3: 内收 presence 渲染

目标：

- 把 remote cursor / remote selection overlay 从 demo 根组件移出

动作：

- 增加 `PresenceLayer`
- 让它成为白板 chrome 的一部分
- 用内部 store 订阅替代 demo 外层 `setState`

## Phase 4: 清理 demo API

目标：

- 让 demo 回到“场景壳子”的定位

动作：

- 删除 `App.tsx` 中的 runtime presence 逻辑
- 保留 transport / room / scenario
- 补齐新的 collab presence demo wiring

---

## 为什么这是长期最优

因为它同时解决了三个层面的结构问题：

### 1. 修当前 bug

pointer session 不再因为 demo rerender 被取消。

### 2. 修分层

sync / presence 从 demo 页面逻辑，回到 whiteboard runtime 内部。

### 3. 修未来扩展性

以后无论接入：

- Yjs awareness
- BroadcastChannel awareness
- WebSocket presence
- 自定义多人协作 transport

都只需要实现 `WhiteboardPresenceBinding`，不需要再去复制一套 App 层 pointer/selection/tool 同步逻辑。

这比“继续把 demo hook 拆小一点”更稳定，也更符合 `@whiteboard/react` 作为运行时封装层的边界。

---

## 结论

这次问题不应被当成单点 bug 来修。

长期最优解应当是两件事一起做：

- **把 presence sync / render 从 demo 外层内收为 whiteboard 内部组件**
- **把输入 hook 改成只依赖稳定 bridge，并拆分 runtime services 与 config 的 context**

如果只做其中一半：

- 只内收 sync，不修 `usePointer` 依赖粒度，后面仍可能被别的 runtime identity 变化打断
- 只修 `usePointer`，不内收 sync，demo 仍会继续承载 runtime 级逻辑，后续还会反复出现类似耦合问题

因此建议按 Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 顺序推进。
