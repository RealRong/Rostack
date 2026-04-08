# Whiteboard Runtime Host Simplification

## 结论

长期最优方案是：

- 保留一个纯工厂：`createWhiteboardServices(...)`
- 删除 `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/runtime.ts`
- 不再保留 `useWhiteboardRuntime()`
- 直接把实例托管逻辑内联到 `whiteboard/packages/whiteboard-react/src/Whiteboard.tsx`
- 删除 `whiteboard/packages/whiteboard-react/src/runtime/editor.ts`
- `whiteboard-react` 直接依赖 `@whiteboard/editor` 的 `createEditor`

这里的关键不是“少一个 hook”，而是把职责重新压平：

- 工厂负责创建 runtime objects
- `Whiteboard.tsx` 负责 React 生命周期托管
- lifecycle 组件负责外部同步
- `react/runtime` 不再额外悬挂一层无意义中转

---

## 当前问题

### 1. `useWhiteboardRuntime()` 不是真正的语义 hook

`whiteboard/packages/whiteboard-react/src/runtime/whiteboard/runtime.ts`
现在表面上是 hook，本质上却在做 runtime bootstrap：

- `normalizeDocument(...)`
- `createEngine(...)`
- `createEditor(...)`
- `createInsertBridge(...)`
- `createPointerBridge(...)`
- `createClipboardBridge(...)`
- 组织 `services`
- 维护 `lastOutboundDocumentRef / onDocumentChangeRef`

这不是一个“读取 React 状态”的 hook，而是一个“在 hook 壳子里做 imperative object graph 创建”的初始化器。

这类逻辑继续挂在独立 hook 文件里，长期会有几个问题：

- 它会让 runtime 创建逻辑继续依附 React，而不是独立成可复用工厂
- 它会把 `react/runtime` 继续养成一个第二 runtime 中心
- 它会鼓励后续把更多 bridge、policy、sync 继续堆进这个 hook
- 它让 `Whiteboard.tsx` 这个真正的宿主组件失去主控地位

### 2. `runtime/editor.ts` 是纯转发层

`whiteboard/packages/whiteboard-react/src/runtime/editor.ts`
现在只是：

- 从 `@whiteboard/editor` import `createEditor`
- 改一下输入类型
- cast 成 `WhiteboardRuntime`

这层没有：

- 行为
- 策略
- 资源管理
- React 适配
- 生命周期

所以这层不是 abstraction，而是 noise。

继续保留它的坏处是：

- 模糊真实边界，让人误以为 react 包有自己的 editor runtime
- 给后续越界逻辑留入口
- 增加一次无意义的类型包裹和 cast

---

## 最终结构

## 一、保留纯工厂：`createWhiteboardServices(...)`

建议新增一个纯函数工厂，负责创建 whiteboard host 所需的所有 runtime services。

推荐落点：

- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/services.ts`

它的职责是：

- 接收已经解析好的输入
- 创建 engine
- 创建 editor
- 创建 insert / pointer / clipboard bridge
- 返回稳定的 services 对象

推荐输出：

```ts
type WhiteboardServices = {
  editor: Editor
  engine: EngineInstance
  registry: NodeRegistry
  pointer: PointerBridge
  clipboard: ClipboardBridge
  insert: InsertBridge
}
```

这个工厂必须是纯 imperative factory，而不是 hook。

也就是说：

- 不读 React context
- 不用 `useMemo`
- 不用 `useRef`
- 不直接处理 props 变化
- 不做组件生命周期同步

它只做一件事：

- 把 runtime object graph 创建出来

---

## 二、删除 `useWhiteboardRuntime()`，直接内联到 `Whiteboard.tsx`

有了 `createWhiteboardServices(...)` 之后，`useWhiteboardRuntime()` 就没有继续存在的必要了。

原因很简单：

- 它不再承载真正独立的复用逻辑
- 它只剩“在 React 里用 ref 托管实例”这件宿主行为
- 这类宿主行为本来就该留在 `Whiteboard.tsx`

长期更好的结构是：

- `Whiteboard.tsx` 自己负责 `useMemo / useRef`
- `Whiteboard.tsx` 在首次渲染时创建 services
- `Whiteboard.tsx` 持有 `inputDocument`
- `Whiteboard.tsx` 持有 `onDocumentChangeRef`
- `Whiteboard.tsx` 持有 `lastOutboundDocumentRef`
- `Whiteboard.tsx` 把 `editor / engine / services` 直接传给 lifecycle 和 providers

也就是说，最终宿主关系应该非常直接：

- `Whiteboard.tsx` 是唯一 React host root
- factory 只是被它调用
- 不再夹一个 `useWhiteboardRuntime()`

这样更合理，因为 `Whiteboard.tsx` 本来就是：

- provider 装配点
- lifecycle 装配点
- surface 装配点
- imperative ref 暴露点

runtime 托管逻辑内联在这里，是符合宿主边界的，不是污染。

---

## 三、删除 `runtime/editor.ts`

`whiteboard/packages/whiteboard-react/src/runtime/editor.ts`
应直接删除。

最终做法：

- `whiteboard-react` 需要创建 editor 的地方，直接 import `createEditor` from `@whiteboard/editor`
- 不再通过 react 本地封装再转一次

原因：

- 真实提供者就是 `@whiteboard/editor`
- 这里没有额外语义
- 这里没有 react-specific 逻辑
- 这里没有必要隐藏依赖来源

如果 `react` 这边传入的 `NodeRegistry` 比 `editor` 的基础类型更宽，也不需要额外 wrapper。

因为这是正常的结构类型兼容，不值得为了这个再保留一层 facade。

---

## 设计原则

### 1. 工厂和宿主必须分开

不要再出现“hook 里偷偷创建 runtime graph”的设计。

应该明确区分：

- `createWhiteboardServices(...)`
- `Whiteboard.tsx`

前者是 factory，后者是 host。

### 2. React 层只保留真正需要 React 的东西

只有这些内容值得保留在 React 组件里：

- `useMemo`
- `useRef`
- `useImperativeHandle`
- Provider 装配
- lifecycle 组件装配

而不是把“创建 engine/editor/bridge”这件事包装成一个额外 hook。

### 3. 不保留空转发层

没有额外语义的转发层都应该删除。

判断标准很简单：

- 是否增加了真实能力
- 是否增加了真实约束
- 是否承担了真实宿主职责

如果都没有，就不该存在。

`runtime/editor.ts` 属于这种应直接删除的空层。

---

## 推荐文件结构

最终建议结构：

- `whiteboard/packages/whiteboard-react/src/Whiteboard.tsx`
  负责 React host、refs、providers、lifecycles、imperative handle
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/services.ts`
  负责 `createWhiteboardServices(...)`
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/DocumentSync.tsx`
  负责 document 同步
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/EditorLifecycle.tsx`
  负责 editor lifecycle
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/CollabLifecycle.tsx`
  负责 collab lifecycle
- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/PresenceLifecycle.tsx`
  负责 presence lifecycle

删除：

- `whiteboard/packages/whiteboard-react/src/runtime/whiteboard/runtime.ts`
- `whiteboard/packages/whiteboard-react/src/runtime/editor.ts`

---

## 为什么不保留 `useWhiteboardRuntime()`

可能会有人觉得：

- “它至少把初始化逻辑收起来了”

但这不是足够理由。

因为把宿主初始化藏进 hook，代价是：

- 边界变模糊
- 文件跳转变长
- Whiteboard host 入口不完整
- runtime bootstrap 继续被包装成 React 语义

而 `Whiteboard.tsx` 本来就是唯一 host root。

既然最终所有 runtime services 都只在这里被创建和装配，那么把这段托管逻辑直接放在 `Whiteboard.tsx`，结构反而最清楚。

简化后的 mental model 会更直接：

1. `Whiteboard.tsx` 解析配置
2. `Whiteboard.tsx` 首次创建 services
3. `Whiteboard.tsx` 提供 context
4. lifecycle 组件各自处理同步
5. `Surface` 只负责 UI surface

这比：

1. `Whiteboard.tsx`
2. `useWhiteboardRuntime()`
3. `runtime/editor.ts`
4. `@whiteboard/editor`

这种跳转链条要好得多。

---

## 最终判断

如果只给一句结论：

- `createWhiteboardServices(...)` 应存在
- `useWhiteboardRuntime()` 不应保留，直接内联到 `Whiteboard.tsx`
- `runtime/editor.ts` 应删除

这才是这条 runtime host 线按长期最优收口后的最简结构。
