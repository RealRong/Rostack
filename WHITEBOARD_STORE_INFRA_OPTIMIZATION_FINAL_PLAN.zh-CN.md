# Whiteboard Store / Infra 收敛最终方案

## 结论

whiteboard 里还有一批明显可以继续通过底层设施收敛的点，而且收益不小。

它们主要不是“业务规则复杂”，而是以下三类模式在不同文件里重复出现：

- 手动失效的 keyed projection / tracked read store
- 命令型本地 value state
- 手工 `get/subscribe` selector facade

长期最优不是继续增加业务 helper，而是把这些重复模式收到底层，让业务层只保留领域语义。

## 优先级排序

### 第一优先级

- `whiteboard-engine` 的 keyed projection / tracked store 基础设施

### 第二优先级

- `whiteboard-editor` 的命令型本地 state 模式

### 第三优先级

- `editor.select` / react 侧 selector facade

### 第四优先级

- overlay map merge / patch merge 的小型重复 helper

## 一、最值得先收的：engine keyed projection 基础设施

## 1.1 当前问题

现在以下文件都在做高度相似的事情：

- [node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/node.ts)
- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/edge.ts)
- [mindmap.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/mindmap.ts)

它们虽然细节不同，但核心结构很像：

- 维护 `list`
- 维护 `cacheById`
- 对外提供 keyed `item`
- 按 impact 决定哪些 id 需要同步
- 对 tracked subscribers 只同步被订阅的 id
- entry 消失时执行 delete

目前这套模式只抽出了一个很薄的：

- [tracked.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/tracked.ts)

但它只解决了“tracked keyed subscriber cache”问题，没有解决 projection runtime 的整体重复。

## 1.2 长期最优方向

whiteboard-engine 内部应该新增一个统一的 projection store runtime。

它不是 shared/core 级别的通用设施，因为它强依赖：

- impact 驱动同步
- keyed projection cache
- list + item 联动
- on-demand tracked item materialization

更合适的定位是：

- `whiteboard-engine/src/read/store/projection.ts`

## 1.3 建议的最终 API

建议抽成类似下面的能力：

```ts
createKeyedProjection({
  initialList,
  emptyValue,
  read,
  sync
})
```

或者更明确一点：

```ts
createProjectionRuntime<Key, Value>({
  initialList: readonly Key[],
  emptyValue: Value,
  read: (key: Key) => Value,
  applyChange: (input) => {
    listChanged: boolean
    nextList?: readonly Key[]
    changedKeys: Iterable<Key>
  }
})
```

最终输出应至少包含：

```ts
{
  list: ReadStore<readonly Key[]>
  item: KeyedReadStore<Key, Value>
  sync: (keys: Iterable<Key>) => void
  setList: (next: readonly Key[]) => void
}
```

如果进一步收完整，也可以让 projection runtime 自己负责：

- tracked subscribe cache
- changed key sync
- removed key cleanup

## 1.4 为什么这块最该先做

因为这块目前已经是白板引擎 read 层最明显的重复源，而且高度稳定：

- node projection 一定需要
- edge projection 一定需要
- mindmap projection 一定需要

一旦收掉，这几类 projection 文件会明显变薄。

## 二、第二优先级：editor 命令型本地 state

## 2.1 当前问题

以下文件都在重复同一种模式：

- [selection.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/selection.ts)
- [edit.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/edit.ts)
- [draw.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/draw.ts)
- [viewport.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/viewport.ts)

核心模式是：

- `createValueStore(...)`
- 暴露一组 `mutate` / `commands`
- 内部先读当前值
- normalize
- compare
- unchanged 就 return current
- changed 再 `set` / `update`

这已经不是一次性的业务逻辑，而是一种固定状态模型。

## 2.2 长期最优方向

这类能力不一定适合放进 `shared/core`，但很适合收成 whiteboard-editor 自己的底层 runtime state helper。

建议新增一层很薄的内部设施，例如：

- `runtime/state/store.ts`
- `runtime/state/controller.ts`

## 2.3 建议的最终 API

目标不是搞重型 reducer，而是一个非常薄的 command-style store helper。

例如：

```ts
createCommandState({
  initial,
  isEqual,
  normalize
})
```

返回：

```ts
{
  store: ValueStore<T>
  read: () => T
  set: (next: T) => void
  update: (recipe: (current: T) => T) => void
}
```

或者更薄：

```ts
updateIfChanged(store, recipe, isEqual)
setIfChanged(store, next, isEqual)
```

对 `selection` / `edit` / `draw` 的收益是：

- 少写重复的 current read
- 少写重复的 no-op guard
- 少写重复的 normalize + equal 判定

## 2.4 哪些适合收，哪些不适合

适合收：

- `selection` 的 replace/add/remove/toggle/clear
- `edit` 的 input/caret/measure/status
- `draw` 的 set/slot/patch

不建议现在抽太高的：

- `viewport`

`viewport` 虽然也有 `ValueStore` 命令模型，但它还绑定：

- `rect`
- `limits`
- world/screen geometry

它可以后续继续收，但优先级低于前面三类纯本地 state。

## 三、第三优先级：editor.select / react selector facade

## 3.1 当前问题

现在 editor 对外暴露的 select API 仍然有很重的手工包装痕迹，见：

- [createEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/editor/createEditor.ts)
- [types/editor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/editor.ts)
- [useEditor.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/runtime/hooks/useEditor.ts)

当前大量 API 实际只是为了适配：

- `get`
- `subscribe`
- `() => store`
- `() => read.xxx`

这种 selector 形状而存在。

结果是：

- `createEditor.ts` 里要手工拼一堆 `doc/tool/viewport/selection/node/edge/mindmap`
- `types/editor.ts` 里有大量和真实业务语义关系不大的 facade type
- react 侧 `useEditorSelect` 还只能接受“返回 get/subscribe 的对象”

## 3.2 长期最优方向

最终应让：

- editor 内部暴露标准 `ReadStore`
- react 侧统一消费 `ReadStore`

而不是让 editor 再手工包装一层“伪 selector object”。

## 3.3 建议的最终 API

更好的长期形态是：

```ts
editor.store.tool
editor.store.selection
editor.store.edit
editor.store.interaction
editor.store.viewport
```

以及：

```ts
editor.read.selection.overlay
editor.read.selection.nodeToolbar
editor.read.edge.toolbar
editor.read.history
```

react 侧直接：

```ts
useStoreValue(editor.store.selection)
useStoreValue(editor.read.edge.toolbar)
```

如果确实还要保留 selector facade，也应该极薄，例如：

```ts
editor.select.selection = editor.store.selection
editor.select.edgeToolbar = editor.read.edge.toolbar
```

而不是继续保留很多：

- `() => store`
- `() => readStore`
- `bounds: read.node.bounds.get`

这种混合形状。

## 3.4 为什么这块要排第三

因为它确实能明显降低 editor/react 间的胶水复杂度，但它依赖前两块先更稳定：

- runtime state 先收平
- read/projection 基础先收平

之后再做 select facade 收口，风险更低。

## 四、第四优先级：overlay map merge helper

## 4.1 当前问题

overlay 这层有一类重复模式：

- 多来源 patch / preview / interaction entry
- 按 id merge
- 空结果返回共享 EMPTY_MAP

代表文件：

- [node.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/overlay/node.ts)
- [edge.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/overlay/edge.ts)

虽然业务细节不完全一样，但结构相当接近。

## 4.2 长期最优方向

这里不需要搞大的抽象，只需要一个很薄的 map merge helper。

例如：

```ts
mergeEntriesById({
  sources,
  empty,
  merge
})
```

或者：

```ts
writeMergedEntry(map, entry, merge)
```

目标是：

- 把重复的 map 构建/merge 模式收掉
- 保留 node/edge 各自的领域 patch 语义

这块收益不如前三项大，但很稳。

## 五、哪些适合下沉到 shared/core，哪些不适合

## 5.1 适合下沉到 shared/core 的

### 1. 命令型 value store 的极薄辅助能力

例如：

- `setIfChanged`
- `updateIfChanged`
- normalize + equality helper

这类是跨产品都通用的。

### 2. selector facade 消费 `ReadStore` 的 react helper

react 侧如果需要更统一地消费：

- `ReadStore`
- `KeyedReadStore`

这类 hook/selector helper 适合继续放在 `shared/react`。

## 5.2 不适合下沉到 shared/core 的

### 1. engine projection runtime

它太白板引擎专用了，和：

- impact
- projection cache
- keyed materialization

强绑定，不适合上 shared。

### 2. viewport runtime

它和几何、交互输入、容器 rect 紧耦合，也不适合共享层。

### 3. overlay patch merge

这是 whiteboard editor 自己的数据形状，不值得上 shared。

## 六、当前还有哪些明显复杂点，但不建议先动

### 1. `read/store/index.ts`

见 [index.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/index.ts)。

它现在职责偏多：

- projection wiring
- semantic readers
- bounds aggregation
- impact orchestration

长期可以继续拆，但不是第一刀。  
更合理的顺序是先把 projection runtime 抽好，再反过来收这个入口文件。

### 2. `createReadModel(...)`

见 [model.ts](/Users/realrong/Rostack/whiteboard/packages/whiteboard-engine/src/read/store/model.ts)。

这里更多是 engine 数据布局和 memoization 问题，不是当前最主要的 infra 重复源。

## 七、最终实施顺序

### 阶段 1：抽 engine projection runtime

目标：

- node/edge/mindmap 的 tracked keyed projection 模式统一

涉及：

- `whiteboard-engine/src/read/store/tracked.ts`
- 新的 projection runtime 文件
- `node.ts`
- `edge.ts`
- `mindmap.ts`

### 阶段 2：抽 editor command state helper

目标：

- `selection/edit/draw` 的 `ValueStore + mutate` 模式统一

涉及：

- `runtime/state/selection.ts`
- `runtime/state/edit.ts`
- `runtime/state/draw.ts`

### 阶段 3：收 editor.select facade

目标：

- editor 对外尽量直接暴露 `ReadStore`
- react 侧直接消费 `ReadStore`

涉及：

- `runtime/editor/createEditor.ts`
- `types/editor.ts`
- `whiteboard-react/src/runtime/hooks/useEditor.ts`

### 阶段 4：补 overlay merge helper

目标：

- node/edge overlay map merge 统一

涉及：

- `runtime/overlay/node.ts`
- `runtime/overlay/edge.ts`

## 八、最终判断

whiteboard 现在最值得继续通过底层设施优化的，不是继续扩业务 helper，而是把以下三类重复模式收掉：

- 手动失效的 keyed projection store
- 命令型本地 value state
- 手工 selector facade

这三刀做完之后：

- engine read 层会更薄
- editor runtime state 会更稳
- react/editor 边界会更清晰

并且不会破坏当前已经确定的那条长期方向：

- 领域 read API 维持单一语义面
- tracking 协议不重新泄漏到业务层
