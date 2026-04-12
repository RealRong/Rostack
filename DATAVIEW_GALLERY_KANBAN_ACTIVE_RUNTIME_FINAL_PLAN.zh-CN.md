# Dataview Gallery / Kanban Active Runtime 最终收口方案

## 1. 目标

这份文档只讨论 `gallery` 和 `kanban` 两条线的最终收口方案。

目标非常明确：

- 把还留在 React 的重复领域派生继续收回 engine
- 删除不必要的 `currentView` 包装与本地类型壳
- 统一 gallery / kanban 的 active runtime 接法
- 让这份文档可以直接作为实现蓝图使用

本文只描述最终结构，不考虑兼容层、过渡层、多套实现共存。


## 2. 当前现状与问题

目前这两条线已经比之前干净很多：

- `engine.active.state` 已经提供通用 active projection
- `engine.active.read` 已经提供通用 lookup
- `engine.active.gallery.state`
- `engine.active.kanban.state`

也已经承接了一部分视图专属 extra state。

但 React 侧仍然残留几类问题。


## 3. 当前仍然存在的冗余

## 3.1 React 本地 `currentView` 类型壳

当前仍然存在：

- `GalleryCurrentView`
- `KanbanCurrentView`

它们本质上不是新的领域状态，只是 React 本地为了类型收窄和字段重组造出来的壳。

问题在于：

- 它们会让 controller 和组件继续把 `currentView` 当成“自己的一份 projection”
- 叶子组件会继续写 `controller.currentView.xxx`
- engine 和 React 的读边界不够清晰

长期最优不应该继续保留这层概念。


## 3.2 controller 仍然暴露完整 `currentView`

无论是 gallery 还是 kanban，controller 目前都还暴露：

- `currentView`

这会带来两个副作用：

- 叶子组件继续耦合 active projection 的内部结构
- controller API 看起来像“再向下传一份 view projection”

这与“host 负责挂载类型、engine 负责投影、React 负责 UI runtime”这条分层不够一致。


## 3.3 `groupField` / `customFields` 在 gallery / kanban extra state 里重复

现在通用 `ActiveViewState` 已经有：

- `groupField`
- `customFields`

但 `ActiveGalleryState` 与 `ActiveKanbanState` 里仍然重复保留这两个字段。

这是明显冗余。

长期最优应当是：

- 通用字段只出现在 `ActiveViewState`
- gallery / kanban extra state 只保留真正视图专属的字段


## 3.4 一些叶子组件仍然直接沿着 `currentView.appearances -> recordId -> engine.read.record` 取数据

典型例子在 gallery：

- card
- overlay

当前还在这样走：

1. 从 `currentView.appearances` 取 `recordId`
2. 再去 `engine.read.record` 读 record

但 engine 已经有：

- `engine.active.read.getAppearanceRecord(...)`

所以这类绕行应该继续收掉。


## 3.5 gallery / kanban 仍有一些命名层和读 helper 偏“controller 私有方言”

例如：

- `readSectionColorId`
- `readAppearanceColorId`
- `readRecord`

这些名字虽然能工作，但不是最紧凑、最统一的命名。

长期最优更适合：

- `getSectionColor`
- `getAppearanceColor`
- `getRecord`

也就是：

- 统一成简单、稳定、同步读取命名
- 不继续扩散“readXxxId”这类中间命名


## 3.6 kanban 的“show more”相关派生仍然分散在 controller 里

当前 kanban controller 里围绕“show more”有一整组相互关联的派生：

- `expandedCountBySectionKey`
- `visibleCountBySectionKey`
- `visibleIdsBySectionKey`
- `hiddenCount`
- `canShowMore`
- `showMore`

这些仍然属于 React UI runtime，不应进 engine。

但现在它们在 controller 里比较分散，仍然有进一步收口空间。

长期最优应当是：

- 保留在 React
- 但收敛成一个本地 section visibility runtime
- 不继续把这组逻辑散在 controller 主体里


## 3.7 host 已经承担类型收窄，但部分形态仍然没有完全压平

目前：

- `GalleryProvider` 会从 `active.state + active.gallery.state` 组装 `currentView`
- `KanbanView` 会从 `active.state + active.kanban.state` 取出 `currentView`

这已经比以前干净，但仍然不是最终最优。

长期最优应当是：

- host 只做最薄的类型收窄和挂载保证
- 不在 host 再造一层 `currentView` 对象


## 4. 最终分层原则

gallery / kanban 这两条线，最终应该明确分为三层。

### host

host 负责：

- 当前 active view 是否为目标类型
- 类型收窄
- 决定挂载哪个视图 host

host 不负责：

- 组装新的 view projection 对象
- 再发明一个 `currentView`


### engine

engine 负责：

- 通用 active projection
- 通用 active lookup
- 视图专属 extra state

engine 不负责：

- DnD session
- marquee visual target registry
- 容器尺寸与虚拟滚动 runtime
- kanban 的 “show more” UI 状态


### controller

controller 负责：

- UI session state
- DnD / marquee / virtual coordination
- 本地展示策略

controller 不负责：

- 再次声明一份完整 active projection
- 重复做类型收窄
- 重复做 engine 已经能提供的 lookup


## 5. 最终 API 方向

## 5.1 通用 active 层继续保留

继续保留：

- `engine.active.state`
- `engine.active.read`
- `engine.active.select(...)`

这三者的职责分别是：

- `active.state`：完整通用投影
- `active.read`：同步 lookup
- `active.select(...)`：细粒度订阅


## 5.2 gallery / kanban extra state 只保留真正专属字段

最终建议改成：

```ts
interface ActiveGalleryState {
  sections: readonly Section[]
  groupUsesOptionColors: boolean
  canReorder: boolean
  cardSize: GalleryCardSize
}

interface ActiveKanbanState {
  groupUsesOptionColors: boolean
  cardsPerColumn: KanbanCardsPerColumn
  fillColumnColor: boolean
  canReorder: boolean
}
```

明确删除：

- gallery state 里的 `groupField`
- gallery state 里的 `customFields`
- kanban state 里的 `groupField`
- kanban state 里的 `customFields`

因为这两个字段已经是通用 active state 字段。


## 5.3 是否要把 `groupUsesOptionColors` 进一步并入通用 active state

这是一个值得明确判断的问题。

我的结论是：

- 可以考虑
- 但不是这轮必须

原因：

- 它是基于 `groupField` 的通用语义派生
- gallery / kanban 都在用

但另一方面：

- 当前真正消费它的只有 gallery / kanban
- 它还没有像 `groupField` / `customFields` 那样成为整个 active runtime 的基础字段

所以最终建议是：

- 本轮先保留在 `ActiveGalleryState / ActiveKanbanState`
- 不着急并进 `ActiveViewState`


## 6. gallery 最终形态

## 6.1 不再保留 `GalleryCurrentView`

最终应删除：

- `GalleryCurrentView`

host 不再组装：

```ts
{
  ...active,
  sections: extra.sections
}
```

这种 `currentView` 壳。

gallery controller 最终直接接受：

- `active: ActiveViewState`
- `extra: ActiveGalleryState`
- `containerRef`


## 6.2 controller 不再暴露 `currentView`

gallery controller 最终不再暴露：

- `currentView`

而是直接暴露它真正需要给叶子组件的稳定字段：

- `viewId`
- `appearances`
- `appearanceIds`
- `sections`
- `customFields`
- `groupUsesOptionColors`
- `canReorder`
- `layout`
- `blocks`
- `measure`
- `selectedIdSet`
- `drag`
- `indicator`
- `marqueeActive`
- `visualTargets`
- `getRecord`
- `getSectionColor`
- `select`

也就是说，leaf 不再写：

- `controller.currentView.appearances`
- `controller.currentView.view.id`

而是直接拿到它需要的字段。


## 6.3 gallery card / overlay / grid 的替换方向

### `Grid`

当前还在读：

- `controller.currentView.appearances.ids`
- `controller.sections`
- `controller.readSectionColorId(...)`

最终应改成：

- `controller.appearanceIds`
- `controller.sections`
- `controller.getSectionColor(...)`

### `Card`

当前还在读：

- `controller.currentView.appearances.get(appearanceId)?.recordId`
- `controller.currentView.view.id`
- `controller.fields`

最终应改成：

- `controller.getRecord(appearanceId)`
- `controller.viewId`
- `controller.customFields`

也就是说，gallery card 不应再沿着 `appearances -> recordId -> engine.read.record` 取 record。

### `Overlay`

当前还在读：

- `controller.currentView.appearances.get(activeId)?.recordId`
- `engine.read.record`

最终应改成：

- `controller.getRecord(activeId)`


## 6.4 gallery controller 内仍可保留的 UI runtime

这些继续留在 controller 是合理的：

- `dragging`
- `selectedIdSet`
- `visualTargets`
- `virtual layout / blocks`
- `indicator`

这些都不是领域投影问题。


## 7. kanban 最终形态

## 7.1 不再保留 `KanbanCurrentView`

最终应删除：

- `KanbanCurrentView`

host 不再把 `ActiveViewState` 再包一层 typed `currentView`。

kanban controller 最终直接接受：

- `active: ActiveViewState`
- `extra: ActiveKanbanState`
- `columnWidth`
- `columnMinHeight`


## 7.2 controller 不再暴露 `currentView`

kanban controller 最终不再暴露：

- `currentView`

而是直接暴露：

- `viewId`
- `appearances`
- `appearanceIds`
- `sections`
- `customFields`
- `groupField`
- `groupUsesOptionColors`
- `fillColumnColor`
- `cardsPerColumn`
- `canReorder`
- `layout`
- `scrollRef`
- `selection`
- `drag`
- `marqueeActive`
- `visualTargets`
- `getRecord`
- `getSectionColor`
- `getAppearanceColor`
- `getVisibleIds`
- `getVisibleCount`
- `getHiddenCount`
- `canShowMore`
- `showMore`

也就是说，kanban 叶子组件不再写：

- `controller.currentView.sections`
- `controller.currentView.view.id`
- `controller.currentView.appearances.ids`


## 7.3 kanban “show more” 派生继续留在 React，但要收拢成局部 runtime

这部分不应该进 engine。

因为它依赖的是：

- 当前页面展示策略
- UI 局部会话状态
- `cardsPerColumn`

而不是 document 领域模型。

但它应该被收敛成一个本地 runtime/hook，例如：

- `useSectionVisibility`
- `useKanbanSectionVisibility`

它统一对外提供：

- `getVisibleIds(sectionKey)`
- `getVisibleCount(sectionKey)`
- `getHiddenCount(sectionKey)`
- `canShowMore(sectionKey)`
- `showMore(sectionKey)`

这样 controller 主体不再同时承担：

- active runtime 编排
- section visibility 计算器


## 7.4 kanban card / overlay / column 的替换方向

### `KanbanCanvas`

当前还在读：

- `controller.currentView.sections`

最终应改成：

- `controller.sections`

### `Card`

当前还在读：

- `controller.currentView.view.id`
- `controller.fields`

最终应改成：

- `controller.viewId`
- `controller.customFields`

### `Overlay`

当前已经在使用：

- `controller.readRecord(...)`
- `controller.readAppearanceColorId(...)`

最终建议只做命名压平：

- `readRecord` -> `getRecord`
- `readAppearanceColorId` -> `getAppearanceColor`

### `Column`

当前还在使用：

- `controller.readSectionColorId(...)`

最终建议改成：

- `controller.getSectionColor(...)`


## 8. gallery / kanban 的共同收口点

## 8.1 统一 controller 输入

最终统一成：

```ts
useGalleryController({
  active,
  extra,
  containerRef
})

useKanbanController({
  active,
  extra,
  columnWidth,
  columnMinHeight
})
```

这里的 `active` 一律是：

- `ActiveViewState`

不再是：

- `GalleryCurrentView`
- `KanbanCurrentView`


## 8.2 统一 controller 输出风格

gallery / kanban controller 都不再向下暴露 `currentView`。

统一改成：

- 暴露扁平字段
- 暴露同步读取函数
- 暴露 UI runtime 对象

而不是：

- 再给叶子组件一整个 projection 壳


## 8.3 统一读取命名

建议统一替换为：

- `readRecord` -> `getRecord`
- `readSectionColorId` -> `getSectionColor`
- `readAppearanceColorId` -> `getAppearanceColor`
- `readVisibleIds` -> `getVisibleIds`
- `readVisibleCount` -> `getVisibleCount`
- `hiddenCount` -> `getHiddenCount`

理由很简单：

- 命名更短
- 表达的是同步读取
- 不再出现多套 `readXxx` / `getXxx` 混用


## 8.4 host 侧硬约束

gallery / kanban 最终都应遵守同一条硬约束：

- host 一旦挂载，就意味着当前 active view 类型已经匹配

因此：

- controller
- selector
- leaf component

都不允许再重复写：

- `state?.view.type === 'gallery'`
- `state?.view.type === 'kanban'`

类型防御只允许存在于 host 边界。


## 8.5 默认不引入 selector helper

这条规则与 table 一致：

- 默认不引入任何 selector helper

像下面这种 selector：

- `state => state?.group`
- `state => state?.sort`
- `state => state?.customFields ?? []`
- `state => state?.groupField`

如果只有一两个使用点，就直接内联。

不要提前发明：

- `selectActiveGroup()`
- `selectActiveCustomFields()`
- `selectActiveGroupField()`

只有当未来出现真实的、重复的、非平凡 selector，才按需抽取。


## 9. 共享层可以继续简化的地方

## 9.1 `CardContent` / `useCardTitleEditing` 仍然在传 `viewId`

当前 gallery / kanban 两条线都还在给共享卡片层继续透传：

- `viewId`

这主要是因为：

- `inlineSession` 的 target 仍然带 `viewId`

这条线已经不是 gallery / kanban 独有问题，而是共享 card editing runtime 的问题。

最终可以继续研究是否进一步压平为：

- active view 唯一前提下，不再由 gallery / kanban 层显式传 `viewId`

但这属于共享 runtime 的下一层清理，不是这份文档的主任务。

因此本轮结论是：

- gallery / kanban 本轮先不强行改共享 card editing 协议
- 只把它记录为下一步可替代点


## 9.2 颜色与 record 查询应该尽量经由 controller 暴露

gallery / kanban 的 leaf 组件不应继续直接依赖：

- `engine.read.record`
- `currentView.appearances.get(...)`

也不应继续理解：

- appearance -> recordId -> record
- appearance -> sectionKey -> color

这些组合关系最终都应由：

- `engine.active.read`
- controller 的扁平读函数

承接。


## 10. engine 侧需要修改的文件

这轮目标实现会直接涉及这些 engine 文件：

- `dataview/src/engine/api/public/project.ts`
- `dataview/src/engine/store/selectors.ts`

具体要做的事：

1. 从 `ActiveGalleryState` 删除 `groupField` 与 `customFields`
2. 从 `ActiveKanbanState` 删除 `groupField` 与 `customFields`
3. 保持 `groupUsesOptionColors`
4. 保持 `sections` 仅属于 gallery extra state
5. 保持 `cardsPerColumn / fillColumnColor / canReorder` 属于 kanban extra state


## 11. React 侧需要修改的文件

## 11.1 gallery

应直接修改这些文件：

- `dataview/src/react/views/gallery/context.tsx`
- `dataview/src/react/views/gallery/useGalleryController.ts`
- `dataview/src/react/views/gallery/components/Grid.tsx`
- `dataview/src/react/views/gallery/components/Card.tsx`
- `dataview/src/react/views/gallery/components/Overlay.tsx`

具体方向：

1. 删除 `GalleryCurrentView`
2. controller 输入改成 `active + extra`
3. controller 输出删除 `currentView`
4. 叶子组件不再读取 `controller.currentView.*`
5. record 读取统一改走 `getRecord`
6. section color 统一改走 `getSectionColor`


## 11.2 kanban

应直接修改这些文件：

- `dataview/src/react/views/kanban/KanbanView.tsx`
- `dataview/src/react/views/kanban/useKanbanController.ts`
- `dataview/src/react/views/kanban/components/KanbanCanvas.tsx`
- `dataview/src/react/views/kanban/components/Card.tsx`
- `dataview/src/react/views/kanban/components/Overlay.tsx`
- `dataview/src/react/views/kanban/components/Column.tsx`
- `dataview/src/react/views/kanban/components/ColumnBody.tsx`

具体方向：

1. 删除 `KanbanCurrentView`
2. controller 输入改成 `active + extra`
3. controller 输出删除 `currentView`
4. 把 “show more” 相关派生收拢成局部 runtime
5. 叶子组件不再读取 `controller.currentView.*`
6. 颜色与 record 查询统一压平成 `getXxx`


## 12. 明确禁止的实现形式

以下形式在最终实现中应明确禁止：

### 12.1 React 再造 `currentView`

不允许再出现：

- `GalleryCurrentView`
- `KanbanCurrentView`
- `{ ...active, sections: extra.sections }`
- 任何新的 view projection 包装层

### 12.2 叶子组件继续读取 `controller.currentView.*`

不允许继续扩散：

- `controller.currentView.view.id`
- `controller.currentView.appearances`
- `controller.currentView.sections`

### 12.3 重复类型防御

不允许在 gallery / kanban 的 controller、selector、leaf 组件里重复写：

- `state?.view.type === 'gallery'`
- `state?.view.type === 'kanban'`

### 12.4 为简单 selector 预先抽 helper

不允许为了“可能未来复用”提前引入 selector helper 层。


## 13. 推荐实施顺序

为了保证收口干净，建议按这个顺序实施：

1. 先改 engine types
2. 再改 engine selectors
3. 再改 gallery host / controller / 组件
4. 再改 kanban host / controller / 组件
5. 最后删掉旧 `currentView` 类型壳和所有相关引用

这样做的原因是：

- 先稳住 engine 边界
- 再压平 React 调用面
- 最后统一删旧概念


## 14. 最终结论

gallery / kanban 这两条线，当前还没有像 table 那样留着完整 React projection store，但仍然残留一层：

- React 本地 `currentView` 壳

长期最优应该继续往前走一步：

- host 只负责类型挂载
- engine 继续负责 projection 和 lookup
- gallery / kanban extra state 只保留真正专属字段
- controller 不再向下暴露 `currentView`
- leaf 组件只消费扁平字段与简单 `getXxx`

也就是说，最终应该删掉的不是 gallery / kanban 的 active state 体系，而是 React 自己又长出来的那一层 view-shaped 包装。

这份文档对应的最终方向是：

- 删除 `GalleryCurrentView`
- 删除 `KanbanCurrentView`
- 删除 gallery / kanban extra state 中重复的通用字段
- 统一 controller 输入为 `active + extra`
- 统一 controller 输出为扁平 runtime API
- 保留 engine.active.state / engine.active.read / typed extra state 这条主线不变

这就是 gallery / kanban 两条线可以直接落地的最终实现方向。
