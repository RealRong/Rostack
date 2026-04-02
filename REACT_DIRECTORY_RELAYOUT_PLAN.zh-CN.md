# dataview `src/react` 文件重排与类型迁移方案

## 落地状态（2026-04-03）

本方案已按当前结论完成第一轮全面落地，`dataview/src/react` 现状如下：

```text
react/
  currentView/
    commands.ts
    index.ts
    selection.ts
    store.ts
    types.ts
  dom/
  editor/
  field/
    navigation.ts
  interaction/
    autoPan.ts
    coordinator.ts
    events.ts
    index.ts
    useMarquee.ts
    usePointerDragSession.ts
  page/
    valueEditor/
      host.tsx
      index.ts
      types.ts
  properties/
  store/
  views/
```

同时有一部分 field helper 已经下沉到 engine：

- [dataview/src/engine/projection/view/field.ts](/Users/realrong/Rostack/dataview/src/engine/projection/view/field.ts) 现在承载 `fieldId`、`fieldOf`、`sameField`、`sameViewField`、`replaceFieldProperty`、`toRecordField`
- [dataview/src/react/field/navigation.ts](/Users/realrong/Rostack/dataview/src/react/field/navigation.ts) 现在承载 `stepField`、`stepFieldByIntent`、`stepViewFieldByIntent` 和 `FieldScope`

已经删除的旧目录：

- `dataview/src/react/runtime`
- `dataview/src/react/view`
- `dataview/src/react/propertyEdit`
- `dataview/src/react/page/interaction`

说明：

- 下文保留了迁移前的分析与取舍过程，因此会提到旧路径，它们应视为“迁移前状态”
- 原先草案中的 `currentView/contracts.ts` 最终没有单独新增；当前边界下继续保留 [dataview/src/react/currentView/types.ts](/Users/realrong/Rostack/dataview/src/react/currentView/types.ts) 更直接
- `PropertyValueEditorHost` 已迁到 [dataview/src/react/page/valueEditor/host.tsx](/Users/realrong/Rostack/dataview/src/react/page/valueEditor/host.tsx)，`propertyEdit` 类型入口已并到 [dataview/src/react/page/valueEditor/index.ts](/Users/realrong/Rostack/dataview/src/react/page/valueEditor/index.ts)

## 目标

重排 `dataview/src/react`，让目录表达的是真实职责，而不是历史堆叠结果。

本方案重点回答四个问题：

1. `react/view` 是否应该整体移到 `react/runtime`
2. `react/runtime/marquee.ts` 是否放错了位置
3. 是否应该补一个集中的 `types` 目录
4. `react` 下现有目录如何按职责重排

结论先说：

- 不建议把 `react/view` 整体移到 `react/runtime`
- 建议逐步消解 `react/runtime` 这个过于宽泛的目录
- 不建议创建一个全局、兜底式的 `react/types`
- 建议按“状态域 / 交互域 / field 域 / feature 域”来重排，并只在局部建立 `contracts.ts` 或 `types.ts`

## 现状判断

### 1. `react/view` 不是 runtime，它现在是三种职责混在一起

当前 `react/view` 包含：

- [dataview/src/react/view/currentViewStore.ts](/Users/realrong/Rostack/dataview/src/react/view/currentViewStore.ts)
- [dataview/src/react/view/commands.ts](/Users/realrong/Rostack/dataview/src/react/view/commands.ts)
- [dataview/src/react/view/selection.ts](/Users/realrong/Rostack/dataview/src/react/view/selection.ts)
- [dataview/src/react/view/field.ts](/Users/realrong/Rostack/dataview/src/react/view/field.ts)
- [dataview/src/react/view/types.ts](/Users/realrong/Rostack/dataview/src/react/view/types.ts)

这里面实际混了三层：

- `currentViewStore.ts`: editor/provider 层的状态拼装
- `commands.ts` + `selection.ts`: 视图状态域逻辑
- `field.ts`: projection field ref 适配与编辑器 field 导航工具

它们都不属于“runtime”。

更准确地说：

- `currentViewStore.ts` 更接近 editor state assembly
- `commands.ts` / `selection.ts` 更接近 current-view state domain
- `field.ts` 里面有一部分更接近 engine projection helper，另一部分更接近 React editor navigation

所以问题不是“view 要不要进 runtime”，而是“view 这个桶装得太杂，需要拆”。

### 2. `react/runtime` 现在也不是一个稳定职责目录

当前 `react/runtime` 包含：

- [dataview/src/react/runtime/store/index.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/index.ts)
- [dataview/src/react/runtime/store/useExternalValue.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/useExternalValue.ts)
- [dataview/src/react/runtime/store/useLazySelectorValue.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/useLazySelectorValue.ts)
- [dataview/src/react/runtime/store/useStoreValue.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/useStoreValue.ts)
- [dataview/src/react/runtime/interaction/autoPan.ts](/Users/realrong/Rostack/dataview/src/react/runtime/interaction/autoPan.ts)
- [dataview/src/react/runtime/interaction/usePointerDragSession.ts](/Users/realrong/Rostack/dataview/src/react/runtime/interaction/usePointerDragSession.ts)
- [dataview/src/react/runtime/marquee.ts](/Users/realrong/Rostack/dataview/src/react/runtime/marquee.ts)

这里至少混了两类东西：

- store 订阅 hook
- pointer / drag / marquee 交互 hook

这两类能力都不适合用一个“runtime”大词兜住。

`runtime/store` 实际上是 React store hooks，不是 runtime substrate。

`runtime/interaction` 和 `runtime/marquee.ts` 实际上是交互手势与拖拽机制，不是 runtime substrate。

所以更合理的方向不是“把 `view` 挪进 `runtime`”，而是“把 `runtime` 拆成更明确的 `store` 和 `interaction`”。

### 3. `runtime/marquee.ts` 放在 `runtime` 下确实不对

[dataview/src/react/runtime/marquee.ts](/Users/realrong/Rostack/dataview/src/react/runtime/marquee.ts) 做的是：

- pointer down 开始框选
- 计算 box
- auto-pan
- 滚动监听
- `disableUserSelect`

这明显是“交互手势 hook”，不是 runtime。

它当前被：

- gallery marquee 选择
- kanban marquee 选择
- table row marquee

共同使用。

这更像一个共享交互原语，应放在：

- `react/interaction/useMarquee.ts`

或者：

- `react/interaction/marquee/useMarquee.ts`

而不是 `react/runtime/marquee.ts`。

### 4. `page/interaction` 名字也有偏差

当前：

- [dataview/src/react/page/interaction/events.ts](/Users/realrong/Rostack/dataview/src/react/page/interaction/events.ts)
- [dataview/src/react/page/interaction/coordinator.ts](/Users/realrong/Rostack/dataview/src/react/page/interaction/coordinator.ts)

这里承载的是：

- 键盘/指针交互事件协议
- 交互状态协调器
- `PropertyEditIntent`

这些被 table/controller、value editor、keyboard host 直接消费，不是 page chrome 私有逻辑。

所以它更像：

- `react/interaction/events.ts`
- `react/interaction/coordinator.ts`

而不是 `page/interaction/*`。

### 5. `propertyEdit` 已经被压缩到只剩类型壳

当前 [dataview/src/react/propertyEdit/index.ts](/Users/realrong/Rostack/dataview/src/react/propertyEdit/index.ts) 只转出 [dataview/src/react/propertyEdit/types.ts](/Users/realrong/Rostack/dataview/src/react/propertyEdit/types.ts)。

而这些类型实际描述的是：

- value editor session
- value editor open/close API
- value editor anchor

它们不再对应一个真实的 `propertyEdit` 模块。

所以这个目录已经不应该继续保留，应该并到一个真正承载它的边界：

- `react/page/valueEditor/types.ts`

或者：

- `react/editor/valueEditor/types.ts`

从当前使用关系看，更偏 `page/valueEditor/types.ts`，因为 host 在 page 下，session 是围绕 page lock 与 overlay 存在的。

### 6. 没有全局 `types/` 目录，不是问题本身

现在的问题不是“缺一个 `types/` 目录”，而是“类型跟职责边界没有对齐”。

如果新建一个全局 `react/types/`，大概率会变成：

- `Props` 倾倒处
- 跨域 type dump
- 最终谁都能往里放一点

这会比现在更乱。

类型目录应该遵循两个规则：

- 私有类型跟实现同文件或同目录
- 只有当一个边界下有多个文件共享同一组契约时，才建立局部 `types.ts` 或 `contracts.ts`

也就是说，应当有多个小的 types/contracts 文件，而不是一个全局的 `react/types/`。

## 推荐目录边界

建议把 `dataview/src/react` 收敛成下面几类：

```text
react/
  dom/
  interaction/
  store/
  editor/
  page/
    valueEditor/
  currentView/
  properties/
  views/
```

说明：

- `dom/`: 通用 DOM 机械层与 dataview 的 field DOM adapter
- `interaction/`: 交互协议、协调器、拖拽、框选、auto-pan
- `store/`: React 层消费 external store 的 hooks
- `editor/`: provider、editor hooks、editor-facing session assembly
- `page/`: page chrome、本体 layout、toolbar、settings、query bar、host
- `page/valueEditor/`: value editor host/session/public contracts
- `currentView/`: 当前视图拼装、selection、commands 及其 contracts
- `properties/`: property schema/value/options
- `views/`: table/gallery/kanban/card feature

同时有一组 field 相关能力应跨 `react` 与 `engine` 拆开：

- `engine/projection/view/field.ts`: projection field ref helper
- `react/field/navigation.ts`: editor field navigation

## 关键结论

### A. `react/view` 不应整体迁到 `react/runtime`

理由：

- 它不是 runtime 机制
- 它承载的是 view state domain 和 field domain
- 其中 `currentViewStore.ts` 甚至更接近 editor 组装层

更合理的处理是拆分，而不是整体平移。

### B. `react/runtime` 应该被消解

建议分拆成：

- `react/store/*`
- `react/interaction/*`

`runtime` 这个名字过宽，会不断吸附新东西。

### C. `runtime/marquee.ts` 应移到 `react/interaction`

建议目标：

- `react/interaction/useMarquee.ts`

如果后续交互 hook 增多，可以再建：

- `react/interaction/marquee/useMarquee.ts`

### D. 不建议建立全局 `react/types`

建议建立局部契约文件：

- `currentView/contracts.ts`
- `interaction/contracts.ts`
- `page/valueEditor/types.ts`
- `field/types.ts` 仅在确实需要时建立

## 文件级迁移建议

### 1. `view` 目录拆分

当前：

- [dataview/src/react/view/currentViewStore.ts](/Users/realrong/Rostack/dataview/src/react/view/currentViewStore.ts)
- [dataview/src/react/view/commands.ts](/Users/realrong/Rostack/dataview/src/react/view/commands.ts)
- [dataview/src/react/view/selection.ts](/Users/realrong/Rostack/dataview/src/react/view/selection.ts)
- [dataview/src/react/view/field.ts](/Users/realrong/Rostack/dataview/src/react/view/field.ts)
- [dataview/src/react/view/types.ts](/Users/realrong/Rostack/dataview/src/react/view/types.ts)

建议改为：

```text
react/currentView/
  store.ts
  commands.ts
  selection.ts
  contracts.ts
  index.ts
```

对应关系：

- `view/currentViewStore.ts` -> `currentView/store.ts`
- `view/commands.ts` -> `currentView/commands.ts`
- `view/selection.ts` -> `currentView/selection.ts`
- `view/types.ts` -> 拆到 `currentView/contracts.ts`
- `view/field.ts` -> 拆成两份：
  - `engine/projection/view/field.ts`
  - `react/field/navigation.ts`

不建议把 `field.ts` 继续塞在 `view` 目录，因为它不是 current view state。

也不建议把它整体放进 `core`，因为其中的 `PropertyEditIntent` 驱动导航逻辑属于编辑器交互语义，不属于领域核心。

### 2. field DOM 继续和 field model 配对

当前已经有：

- [dataview/src/react/dom/field.ts](/Users/realrong/Rostack/dataview/src/react/dom/field.ts)

两种都可以：

1. 保持在 `dom/field.ts`
2. 最终挪到 `field/dom.ts`

我的建议：

- 短期保持 `react/dom/field.ts`
- 等 `engine/projection/view/field.ts` 与 `react/field/navigation.ts` 落位以后，再决定要不要并成 `react/field/dom.ts`

原因：

- 当前 `dom/field.ts` 还被视图组件直接消费
- 一次只改一维，风险更低

### 3. `runtime/store` 改成 `react/store`

当前：

- [dataview/src/react/runtime/store/useExternalValue.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/useExternalValue.ts)
- [dataview/src/react/runtime/store/useStoreValue.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/useStoreValue.ts)
- [dataview/src/react/runtime/store/useLazySelectorValue.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/useLazySelectorValue.ts)
- [dataview/src/react/runtime/store/index.ts](/Users/realrong/Rostack/dataview/src/react/runtime/store/index.ts)

建议改为：

```text
react/store/
  useExternalValue.ts
  useStoreValue.ts
  useLazySelectorValue.ts
  index.ts
```

理由：

- 它们是 React store hooks，不是 runtime generic
- 与根级 `src/runtime/store` 的非 React store 核心形成清晰区分：
  - `src/runtime/store`: store 核心
  - `src/react/store`: React 消费 hook

### 4. `runtime/interaction` 与 `runtime/marquee.ts` 合并成 `react/interaction`

建议改为：

```text
react/interaction/
  coordinator.ts
  events.ts
  autoPan.ts
  usePointerDragSession.ts
  useMarquee.ts
  index.ts
  contracts.ts
```

对应关系：

- `page/interaction/coordinator.ts` -> `interaction/coordinator.ts`
- `page/interaction/events.ts` -> `interaction/events.ts`
- `runtime/interaction/autoPan.ts` -> `interaction/autoPan.ts`
- `runtime/interaction/usePointerDragSession.ts` -> `interaction/usePointerDragSession.ts`
- `runtime/marquee.ts` -> `interaction/useMarquee.ts`

这里的关键是把“交互协议”和“交互 hook”收在一个边界下。

### 5. `propertyEdit` 目录删除，改成 `page/valueEditor/types.ts`

当前：

- [dataview/src/react/propertyEdit/types.ts](/Users/realrong/Rostack/dataview/src/react/propertyEdit/types.ts)
- [dataview/src/react/propertyEdit/index.ts](/Users/realrong/Rostack/dataview/src/react/propertyEdit/index.ts)

建议目标：

```text
react/page/valueEditor/
  types.ts
  host.tsx
  index.ts
```

其中：

- `PropertyValueEditorHost.tsx` 可改名为 `host.tsx`
- `propertyEdit/types.ts` -> `page/valueEditor/types.ts`

理由：

- 这组类型围绕的是 value editor session/host
- 不再存在真实的 `propertyEdit` 实现目录
- “property edit” 容易和 property schema edit 混淆

### 6. `page/session` 可继续保留，但更适合归到 `editor/pageSession`

当前：

- [dataview/src/react/page/session/api.ts](/Users/realrong/Rostack/dataview/src/react/page/session/api.ts)
- [dataview/src/react/page/session/state.ts](/Users/realrong/Rostack/dataview/src/react/page/session/state.ts)
- [dataview/src/react/page/session/settings.ts](/Users/realrong/Rostack/dataview/src/react/page/session/settings.ts)
- [dataview/src/react/page/session/types.ts](/Users/realrong/Rostack/dataview/src/react/page/session/types.ts)

职责上它们不是 page 视觉层，而是 provider 维护的页面状态域。

长期建议目标：

```text
react/editor/pageSession/
  api.ts
  state.ts
  settings.ts
  types.ts
```

短期可以不动，因为改动面较广。

## 类型迁移原则

### 1. 不建立全局 `react/types`

反例：

```text
react/types/
  currentView.ts
  field.ts
  page.ts
  interaction.ts
  misc.ts
```

这种目录很快会退化成倾倒点。

### 2. 只在“边界”处建立局部 contracts/types 文件

建议模式：

- `currentView/contracts.ts`
- `interaction/contracts.ts`
- `page/valueEditor/types.ts`
- `editor/pageSession/types.ts`

### 3. 组件 Props 留在组件附近

例如：

- `TableViewProps` 继续留在 [dataview/src/react/views/table/TableView.tsx](/Users/realrong/Rostack/dataview/src/react/views/table/TableView.tsx)
- `GalleryViewProps` 继续留在 [dataview/src/react/views/gallery/GalleryView.tsx](/Users/realrong/Rostack/dataview/src/react/views/gallery/GalleryView.tsx)

不要为了“集中”而把 props/interface 全搬走。

### 4. 纯内部类型尽量跟实现同文件

例如：

- `HoverState`
- `ResizeHandleProps`
- `RowsProps`

这些不应被迁到公共 types 文件。

## 推荐重排后的目标树

```text
dataview/src/react/
  dom/
    dragGhost.tsx
    field.ts
    focus.ts
    geometry.ts
    interactive.ts
    scroll.ts
    selection.ts
    viewport.ts

  store/
    index.ts
    useExternalValue.ts
    useLazySelectorValue.ts
    useStoreValue.ts

  interaction/
    index.ts
    contracts.ts
    coordinator.ts
    events.ts
    autoPan.ts
    usePointerDragSession.ts
    useMarquee.ts

  editor/
    index.ts
    provider.tsx
    useCurrentView.ts
    useDocument.ts
    useEngine.ts
    usePage.ts
    pageSession/
      api.ts
      state.ts
      settings.ts
      types.ts

  currentView/
    index.ts
    contracts.ts
    store.ts
    commands.ts
    selection.ts

  page/
    Page.tsx
    Body.tsx
    Header.tsx
    Toolbar.tsx
    KeyboardHost.tsx
    PageInteractionHost.tsx
    layout.ts
    keyboard.ts
    valueEditor/
      index.ts
      host.tsx
      types.ts
    features/
      ...

  properties/
    ...

  views/
    card/
    gallery/
    kanban/
    table/
```

以及：

```text
dataview/src/engine/projection/view/
  field.ts
```

```text
dataview/src/react/field/
  index.ts
  navigation.ts
```

## 分阶段执行顺序

### Phase 1: 消解最明显的错位目录

目标：

- `react/runtime/marquee.ts` -> `react/interaction/useMarquee.ts`
- `react/runtime/store/*` -> `react/store/*`
- `page/interaction/*` -> `react/interaction/*`

原因：

- 这些移动最能立刻改善目录语义
- 对业务 feature 的影响较小

### Phase 2: 拆 `view`

目标：

- `view/currentViewStore.ts` -> `currentView/store.ts`
- `view/commands.ts` -> `currentView/commands.ts`
- `view/selection.ts` -> `currentView/selection.ts`
- `view/field.ts` 拆成：
  - `engine/projection/view/field.ts`
  - `react/field/navigation.ts`
- `view/types.ts` -> `currentView/contracts.ts`

原因：

- `view` 是目前最混杂的目录
- 但它被大量引用，适合在 interaction/runtime 收敛后再动

### Phase 3: 删除 `propertyEdit`

目标：

- `propertyEdit/types.ts` -> `page/valueEditor/types.ts`
- `PropertyValueEditorHost.tsx` -> `page/valueEditor/host.tsx`
- 删除 `propertyEdit/`

原因：

- 这个目录现在已经退化成类型壳
- 适合在 field 与 interaction 边界稳定后处理

### Phase 4: 评估 `page/session` 是否并入 `editor/pageSession`

目标：

- provider/state assembly 与 page session 真正对齐

原因：

- 这个改动面大，涉及 editor/page 边界
- 应该放在前面几轮稳定之后

## 建议的执行约束

1. 每一轮只改一个边界问题，不要同时做“目录改名 + 语义重写”。

2. 先移动文件，再改名字；先稳定 import，再优化命名。

3. 不要创建一个全局 `types/` 作为过渡仓库。

4. 每轮完成后都跑：

- `pnpm --dir dataview typecheck`
- `pnpm run typecheck:dataview`

5. 每轮都要同步检查 public export surface，避免把内部路径暴露成长期契约。

## 最终判断

如果只回答你这轮最关心的三个点：

1. `dataview/src/react/view` 不应该整体移到 `dataview/src/react/runtime`
原因：它不是 runtime，而是 current-view state 与 field model 的混合目录。

2. `dataview/src/react/runtime/marquee.ts` 确实放错了
原因：它是交互 hook，应该进 `react/interaction`。

3. `types` 不应该做成一个总目录
原因：问题是边界不清，不是缺一个统一的 type 仓库。应该建立多个局部 contracts/types 文件。
