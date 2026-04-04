# UI Overlay Runtime 方案

## 背景

当前 `ui` 层里，`Popover`、`Menu`、页面级快捷键、阻塞交互锁之间的职责边界不够清晰。

现状大致是：

- `Popover` 自己处理 `outside press`、`Escape`、focus manager、portal、positioning。
- `Menu` 自己处理上下方向键、submenu 打开、部分关闭逻辑。
- `dataview` 页面会通过 `blocking surface` 维护一个阻塞层栈，并用 `uiLock` 暂停页面交互。
- `KeyboardHost`、`MarqueeHost` 等页面级 host 又会基于 DOM 选择器或 lock 状态绕开一些全局行为。

当 `Popover + Menu + Submenu + 全局快捷键 + Page Scroll` 共存时，容易出现以下问题：

- `Escape` 到底应该由谁处理。
- submenu 的 `Escape` / `ArrowLeft` 会不会越级关闭 root menu。
- 外层 `Popover` 会不会先于内层 `Menu` 抢到 dismiss。
- 页面滚动和全局快捷键何时应该暂停。
- 组件之间只能靠 prop patch 或 DOM 选择器互相规避，而不是通过统一调度协作。

`closeOnEscape={false}` 这种做法本身不是错，但它暴露了一个更底层的问题：当前缺少一个统一的 overlay 调度层。

本方案的目标不是再加一层业务状态，而是在 `ui` 层建立一个全局的、纯交互语义的 overlay runtime。

## 目标

- 统一所有临时浮层的层级、优先级、dismiss 路由和焦点归还。
- 让 `Popover` 不再直接决定所有关闭行为，而是发出关闭请求。
- 让 `Menu` 不再猜测外层还有没有 `Popover`，只专注菜单语义。
- 让页面级快捷键、拖拽、滚动、marquee 等全局交互通过同一个 runtime 感知当前 top layer。
- 消除业务层到处写 `closeOnEscape={false}`、`event.stopPropagation()`、DOM 角色选择器兜底的模式。

## 非目标

- 不做一个“全局 UI 上帝对象”。
- 不把业务 route、表单草稿、视图设置状态塞进 runtime。
- 不让 runtime 负责菜单项选择、表单输入、字段编辑等语义。
- 不把 `Popover` 和 `Menu` 强行合并成一个万能组件。

runtime 只负责一件事：统一调度 overlay / layer 的交互优先级。

## 核心判断

应该做的是：

- 一个全局 `OverlayRuntime` 或 `LayerRuntime`
- 若干接入它的语义组件

不应该做的是：

- 让 `Popover` 继续承担全部键盘和 dismiss 策略
- 或者做一个完全耦合的 `PopoverMenu` 万能组件去吃掉所有差异

更合理的分层是：

1. `OverlayRuntime`
2. `Popover` 这类基础浮层 primitive
3. `Menu` 这类语义状态机
4. `MenuPopover` / `DropdownMenu` 这类组合语义组件

## 设计原则

### 1. 请求关闭，不是直接关闭

任何 layer 都不应默认把 `Escape`、outside press、backdrop press 直接映射成 `setOpen(false)`。

更合理的模型是：

- 基础层产生关闭意图
- runtime 根据层级和当前 top layer 决定把这个意图路由给谁
- 具体 layer 再决定是否接受

也就是：

- `requestClose(reason)`
- 而不是直接 `close()`

### 2. top layer 唯一拥有最高优先级

任意时刻只允许 topmost overlay 拥有：

- `Escape` 响应优先级
- outside press dismiss 优先级
- page interaction lock 决策权
- 焦点归还的主导权

父 layer 不应该抢子 layer 的 dismiss。

### 3. 基础浮层不理解菜单语义

`Popover` 只关心：

- 定位
- portal
- focus manager
- 层注册
- outside hit test
- backdrop

`Popover` 不应该理解：

- submenu
- `ArrowLeft` / `ArrowRight`
- 菜单方向键
- root menu 与 submenu 的关闭差异

### 4. 菜单只负责菜单

`Menu` 只关心：

- active item
- keyboard / pointer 导航
- submenu stack
- typeahead
- item select 后是否关闭
- submenu 关闭后焦点回父项

`Menu` 不应该负责：

- portal
- positioning
- backdrop
- 页面的全局快捷键屏蔽策略

### 5. 页面级 host 不再依赖硬编码 DOM 选择器

`KeyboardHost`、`MarqueeHost`、全局 scroll/drag 逻辑，应该通过 runtime 判断：

- 当前是否存在 blocking layer
- 当前 top layer 是谁
- 当前事件目标是否属于 active layer scope

而不是基于：

- `[role="menu"]`
- `[role="menuitem"]`
- 某些随机 className

## 推荐架构

### 一、Overlay Runtime

建议在 `ui` 层新增一套统一 runtime，例如：

- `ui/src/overlay/runtime.tsx`
- `ui/src/overlay/types.ts`
- `ui/src/overlay/context.ts`

runtime 负责维护一个 layer stack。

每个 layer 注册时，至少应包含这些信息：

- `id`
- `kind`
- `parentId`
- `scopeId`
- `modal`
- `blocksPageInteraction`
- `closeOnOutsidePress`
- `closeOnBackdropPress`
- `restoreFocusTo`
- `onRequestClose(reason)`

可选补充：

- `priority`
- `dismissGroup`
- `trapFocus`
- `interactiveRoot`
- `source`

### 二、关闭原因模型

统一定义 dismiss reason：

- `escape`
- `outside-press`
- `backdrop-press`
- `navigate-out`
- `select`
- `programmatic`

后续如果需要，也可以继续扩展：

- `route-change`
- `focus-loss`
- `parent-close`

关键点是：所有关闭行为最终都能归一成一套 reason。

### 三、基础 API

runtime 需要的最小接口可以是：

- `registerLayer(entry)`
- `updateLayer(id, patch)`
- `unregisterLayer(id)`
- `isTopLayer(id)`
- `getTopLayer()`
- `requestDismissTop(reason)`
- `requestDismissFrom(id, reason)`
- `containsTarget(id, target)`
- `hasBlockingLayer()`

如果要更进一步统一页面 host 的行为，也可以加：

- `getInteractionOwner(target)`
- `shouldBlockPageShortcut(target)`
- `shouldBlockPageScroll(target)`

### 四、Provider 挂载位置

provider 应该放在 app 根部或 page 根部。

以当前 dataview 为例，最终可以在 `Page` 根部挂：

- `OverlayProvider`
- `BlockingSurfaceProvider` 可以合并进 overlay runtime，或者退化成 runtime 的一个子能力

长期来看，`BlockingSurfaceProvider` 更适合作为 overlay runtime 的实现细节，而不是独立概念。

## 各组件职责重构

### Popover

`Popover` 最终应退化为一个纯浮层 primitive。

保留职责：

- `useFloating`
- portal
- transition
- focus manager
- 注册 layer
- outside press hit testing
- backdrop rendering

删除或弱化职责：

- 不再默认自己决定 `Escape => close`
- 不再自己判断“谁应该先 dismiss”
- 不再要求调用方用 `closeOnEscape={false}` 手动修层级问题

更合适的行为是：

- `Popover` 接收到 `Escape`
- 不是直接 `setOpen(false)`
- 而是向 runtime 发出 `requestDismissFrom(popoverId, 'escape')`

runtime 再判断：

- 当前是不是 topmost
- 有没有 child layer
- 当前 reason 是否应该由当前层处理

### Menu

`Menu` 最终应变成纯语义控制器 + 渲染层。

保留职责：

- active/focus item
- 键盘导航
- pointer hover 到 keyboard focus 的切换
- submenu open/close
- item select
- submenu 的 `Escape` / `ArrowLeft`
- focus return 到父 trigger

删除职责：

- 不自己处理 portal 和 positioning
- 不通过 DOM 冒泡猜测当前是不是 root menu
- 不和外层 `Popover` 做隐式博弈

`Menu` 遇到关闭动作时，统一发：

- `requestClose('escape')`
- `requestClose('navigate-out')`
- `requestClose('select')`

### MenuPopover / DropdownMenu

业务层不应继续手写：

- `<Popover ...><Menu ... /></Popover>`

应该新增一个 `ui` 层组合组件，例如：

- `MenuPopover`
- 或 `DropdownMenu`
- 或 `ContextMenu`

这个组合组件内部完成：

- layer 注册
- menu 与 popover 的父子关系绑定
- dismiss reason 路由
- submenu 的 focus return
- top layer 的 `Escape` 处理

业务层只负责传：

- `items`
- `open`
- `onOpenChange`
- `trigger`

而不是再关心 `closeOnEscape` 这种基础细节。

## 与当前 blocking surface 的关系

当前 `blocking surface` 已经实现了两个重要能力：

- 维护阻塞层栈
- dismiss topmost blocking surface

这说明现有系统不是方向错，而是抽象太窄。

建议演进方式：

- 保留现在的栈式思想
- 升级为通用 overlay layer registry
- `blocking surface` 变成 `OverlayRuntime` 的一个特例字段

也就是说，未来不是：

- `Popover` 一套
- `blocking surface` 一套
- `Menu` 一套

而是：

- `OverlayRuntime` 一套
- `Popover` / `MenuPopover` / `Dialog` / `Picker` 都注册进去

## 对 dataview 页面级 host 的影响

### KeyboardHost

当前 `KeyboardHost` 会基于 `uiLock` 和少量 DOM 选择器放弃处理快捷键。

长期应该改成：

- 如果存在 top layer 且该 layer 声明接管键盘
- 页面快捷键直接退出

不再依赖：

- `[role="menu"]`
- `[role="menuitem"]`
- `[role="menuitemcheckbox"]`

### MarqueeHost / Selection / Scroll

同样地：

- 如果当前存在 blocking top layer
- 或当前 pointer event 落在 top layer 的 interactive root 内
- 页面级 marquee、拖拽、多选、scroll 协调都应该优先让位给 overlay runtime

这能把目前散落在 page host 里的 lock 判断统一起来。

## 为什么不建议只靠 prop 解决

`closeOnEscape={false}` 有两个问题：

1. 它把交互优先级知识泄露给调用方。
2. 它只能修一个点，修不了整条链路。

例如：

- 业务方知道 root menu 要关掉 `closeOnEscape`
- 但不一定知道 submenu 的 outside press 也要特殊路由
- 也不一定知道全局快捷键要不要暂停
- 更不知道未来如果 menu 套 picker，再套子菜单，哪一层该吃 `Escape`

这类知识不应停留在业务层。

## 为什么不建议直接合并 Popover 和 Menu

`Popover` 和 `Menu` 不是一一对应关系。

有很多场景是 popover 但不是 menu：

- view settings
- filter rule editor 主体
- create view
- option editor
- date picker

如果把它们硬合并，结果会是一个越来越肥的万能组件，内部充满分支。

正确做法应该是：

- `Popover` 是基础 layer primitive
- `MenuPopover` 是菜单语义组合
- 两者共享同一个 overlay runtime

## 目录建议

建议在 `ui/src` 新增目录：

- `ui/src/overlay/`

推荐结构：

- `ui/src/overlay/types.ts`
- `ui/src/overlay/runtime.tsx`
- `ui/src/overlay/context.ts`
- `ui/src/overlay/useOverlayLayer.ts`
- `ui/src/overlay/useDismissRouter.ts`

原有组件演进方向：

- `ui/src/popover.tsx`
- `ui/src/menu.tsx`
- `ui/src/context-menu.tsx` 或 `ui/src/dropdown-menu.tsx`

如果后续想进一步收敛，也可以：

- `ui/src/popover.tsx` 保持对外 API
- 内部改用 `overlay/*`

这样迁移成本会小很多。

## API 草稿

本节给出一版尽量小、尽量短、尽量易懂的 API 草稿。

目标是：

- 先让架构边界清晰
- 不追求一次性覆盖所有未来场景
- 命名优先直白，不优先“框架味”

### 一、顶层 Provider

建议 API：

- `OverlayProvider`
- `useOverlay()`

示意：

```tsx
<OverlayProvider>
  <Page />
</OverlayProvider>
```

`useOverlay()` 返回全局 runtime context。

它是所有 layer、host、通用组件的统一入口。

### 二、核心 context API

建议 `useOverlay()` 暴露的最小 API 如下：

```ts
type CloseReason =
  | 'escape'
  | 'outside'
  | 'backdrop'
  | 'select'
  | 'back'
  | 'program'

type LayerKind =
  | 'popover'
  | 'menu'
  | 'dialog'
  | 'picker'
  | 'custom'

interface LayerOptions {
  id?: string
  kind: LayerKind
  parentId?: string | null
  modal?: boolean
  blocking?: boolean
  onClose?: (reason: CloseReason) => void
}

interface LayerHandle {
  id: string
  close: (reason: CloseReason) => void
  isTop: () => boolean
}

interface OverlayApi {
  addLayer: (options: LayerOptions) => LayerHandle
  removeLayer: (id: string) => void
  updateLayer: (id: string, patch: Partial<LayerOptions>) => void

  topLayerId: string | null
  isTopLayer: (id: string | null | undefined) => boolean
  closeTop: (reason: CloseReason) => void

  addKeyHandler: (handler: KeyHandler) => () => void
  addDismissHandler: (handler: DismissHandler) => () => void
  addPointerHandler: (handler: PointerHandler) => () => void
}
```

这里刻意避免更长、更抽象的名字，比如：

- 不用 `registerOverlayLayer`
- 不用 `requestDismissTopLayer`
- 不用 `registerGlobalInteractionHandler`

统一压缩成：

- `addLayer`
- `removeLayer`
- `updateLayer`
- `closeTop`
- `addKeyHandler`
- `addDismissHandler`
- `addPointerHandler`

这样日常使用更直接。

### 三、为什么是 `addLayer`，不是 `openLayer`

runtime 只负责注册和调度，不负责业务 open state。

所以这里更适合：

- `addLayer`
- `removeLayer`

而不是：

- `openLayer`
- `closeLayer`

因为很多组件本来就是受控的：

- `open={...}`
- `onOpenChange={...}`

runtime 不应反客为主接管这层状态。

### 四、Layer 级 hook

为了让组件接入更轻，建议额外提供一个 hook：

- `useLayer(options)`

示意：

```ts
const layer = useLayer({
  open,
  kind: 'popover',
  parentId,
  blocking: true,
  onClose: reason => onOpenChange(false)
})
```

返回值可以尽量短：

```ts
interface UseLayerResult {
  id: string
  isTop: boolean
  close: (reason: CloseReason) => void
}
```

这样大部分基础组件不需要自己写：

- `useEffect(addLayer/removeLayer)`

统一由 `useLayer()` 包装。

### 五、事件处理器注册 API

用户特别提到 dataview 自己的 host 也需要接入 runtime。

这类 host 不应靠 DOM 猜测，而应通过 runtime 注册处理器。

建议最小 API：

- `addKeyHandler`
- `addDismissHandler`
- `addPointerHandler`

对应类型建议尽量简单：

```ts
interface KeyHandler {
  id?: string
  order?: number
  when?: () => boolean
  onKeyDown: (event: KeyboardEvent, api: OverlayApi) => boolean | void
}

interface DismissHandler {
  id?: string
  order?: number
  when?: () => boolean
  onDismiss: (reason: CloseReason, api: OverlayApi) => boolean | void
}

interface PointerHandler {
  id?: string
  order?: number
  when?: () => boolean
  onPointerDown: (event: PointerEvent, api: OverlayApi) => boolean | void
}
```

约定：

- 返回 `true` 表示事件已被当前 handler 吃掉
- 返回 `false` 或 `void` 表示继续向后分发

这里不建议 API 设计成：

- `registerKeyboardHandler`
- `registerDismissIntentResolver`

虽然更精确，但太长，调用体验差。

### 六、给 host 用的便捷 hook

为了避免每个 host 手动 `addHandler/removeHandler`，建议再补一层小 hook：

- `useOverlayKey(handler)`
- `useOverlayDismiss(handler)`
- `useOverlayPointer(handler)`

示意：

```ts
useOverlayKey({
  order: 100,
  when: () => currentView != null,
  onKeyDown: event => {
    if (event.key !== 'Escape') {
      return
    }

    if (overlay.topLayerId) {
      return true
    }

    clearSelection()
    event.preventDefault()
    return true
  }
})
```

这类 hook 的价值是：

- dataview 的 `KeyboardHost`
- `MarqueeHost`
- 以后 whiteboard 的 host

都能统一接 overlay runtime，而不是自己再维护一套全局监听优先级。

### 七、Popover 接入建议 API

`Popover` 不应该直接暴露太多 overlay 细节给业务。

建议内部自己用：

- `useLayer()`

对外仍保留熟悉的组件 API。

`Popover` 内部只需要向 runtime 暴露这几个事实：

- 自己是不是 open
- 自己是不是 blocking
- 自己的 parent 是谁
- 收到 dismiss 请求时如何通知调用方

内部示意：

```ts
const layer = useLayer({
  open,
  kind: 'popover',
  parentId,
  blocking: surface === 'blocking',
  onClose: reason => setOpen(false)
})
```

然后：

- `Escape` 变成 `layer.close('escape')`
- outside press 变成 `layer.close('outside')`
- backdrop press 变成 `layer.close('backdrop')`

注意这里的 `close()` 不是直接改状态，而是走 runtime 的关闭路由。

### 八、Menu 接入建议 API

`Menu` 最终不需要直接知道 `Popover` 的实现。

它只需要依赖：

- `useLayer()` 获取自己的 layer 身份
- 可选依赖一个更高层组合组件传下来的 parent layer id

示意：

```ts
const layer = useLayer({
  open,
  kind: 'menu',
  parentId,
  onClose: reason => onClose?.(reason)
})
```

然后菜单状态机内：

- root menu `Escape` -> `layer.close('escape')`
- submenu `Escape` -> 只关 submenu 自己
- submenu `ArrowLeft` -> `layer.close('back')`
- item select -> `layer.close('select')`

### 九、推荐的组合组件 API

为了避免业务层还得拼 `Popover + Menu`，建议新增：

- `DropdownMenu`

API 尽量简单：

```ts
interface DropdownMenuProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger: ReactElement
  items: readonly MenuItem[]
  placement?: Placement
}
```

更复杂的 submenu、focus return、dismiss routing 都藏在内部。

如果未来还要支持右键菜单，再单独加：

- `ContextMenu`

不要把所有菜单形态都塞进一个组件。

### 十、给 dataview host 的接入方式

这是这套 API 设计里非常关键的一点。

dataview 自己的 host 应该通过 hook 拿到 overlay context，再注册处理器。

示意：

```ts
const overlay = useOverlay()

useOverlayKey({
  order: 10,
  onKeyDown: event => {
    if (overlay.topLayerId) {
      return
    }

    if (event.key === 'Escape') {
      clearSelection()
      event.preventDefault()
      return true
    }
  }
})
```

这比当前模式更好，原因是：

- host 不必猜测当前是不是 menu
- host 不必硬编码 role selector
- 只需问 runtime：当前 top layer 是不是 overlay 自己接管

### 十一、是否需要 `useOverlayHost`

可以有，但不建议第一版就做。

例如：

- `useOverlayHost({ onKeyDown, onPointerDown })`

这种 API 会更少，但也更模糊。

第一版建议保持显式：

- `useOverlayKey`
- `useOverlayDismiss`
- `useOverlayPointer`

原因是：

- 它们语义更清楚
- 更容易调试
- 不会过早设计成一个“大而全”的 host hook

### 十二、是否需要 `scope` 相关 API

需要，但不建议第一版暴露太多。

建议先让 `useLayer()` 内部自动生成：

- `id`
- `scopeId`

需要时再暴露：

- `layer.id`
- `layer.scopeId`

供复杂组件使用。

第一版不建议业务直接操作：

- `createScope`
- `joinScope`
- `leaveScope`

这会让 API 变重。

### 十三、最小 API 清单

如果严格收敛到第一版，我建议只保留这些公开 API：

- `OverlayProvider`
- `useOverlay`
- `useLayer`
- `useOverlayKey`
- `useOverlayDismiss`
- `useOverlayPointer`
- `DropdownMenu`

其中：

- `Popover` 继续对外保留原有组件 API
- `Menu` 继续对外保留原有渲染 API
- 真正的 runtime 细节尽量不泄漏到业务层

### 十四、命名最终建议

为了兼顾短和清晰，我建议最终命名如下：

- `OverlayProvider`
- `useOverlay`
- `useLayer`
- `useOverlayKey`
- `useOverlayDismiss`
- `useOverlayPointer`
- `DropdownMenu`

内部 runtime API：

- `addLayer`
- `removeLayer`
- `updateLayer`
- `isTopLayer`
- `closeTop`
- `addKeyHandler`
- `addDismissHandler`
- `addPointerHandler`

这套命名的优点：

- 足够短
- 不会过度抽象
- 业务和基础层都能读懂
- 给 dataview / whiteboard 的 host 接入也顺手

## 迁移策略

### 第一阶段：建立 runtime，但不大改业务 API

目标：

- 先把统一 layer registry 和 dismiss routing 建起来
- 不急着大面积改业务代码

动作：

- 新增 `OverlayProvider`
- 让 `Popover` 在内部注册 overlay layer
- 把 `blocking surface` 栈并入 runtime 或桥接到 runtime
- `KeyboardHost` 先接 top-layer 查询能力

产出：

- 即使业务代码还在用 `Popover`，也能开始减少事件优先级混乱

### 第二阶段：让 Popover 从“直接关闭”改成“请求关闭”

目标：

- 让 dismiss 逻辑统一走 runtime

动作：

- `Escape` 不再直接 `setOpen(false)`
- outside press / backdrop press 不再直接 `setOpen(false)`
- 改成 `requestDismissFrom(id, reason)`

产出：

- `Popover` 不再需要承担最终关闭决策

### 第三阶段：新增 MenuPopover / DropdownMenu

目标：

- 把所有 `Popover + Menu` 组合从业务层移出

优先迁移场景：

- tab 右键菜单
- table header menu
- group panel 中的多级菜单
- sort / filter 条件菜单
- schema editor 里的下拉选择菜单

产出：

- 业务层不再写 `closeOnEscape={false}`
- submenu 逻辑统一

### 第四阶段：页面 host 全部接 runtime

目标：

- 让全局快捷键、drag、scroll、selection 与 overlay runtime 共用一套优先级模型

动作：

- `KeyboardHost` 接入 top-layer routing
- `MarqueeHost` / selection host 接入 interaction owner 判断
- 去掉依赖 DOM role 选择器的高优先级兜底逻辑

产出：

- 页面级交互与 overlay 行为边界清晰

## 优先级建议

如果只做一轮有限重构，推荐优先级如下：

1. 先做 `OverlayRuntime`
2. 再把 `Popover` 改成 request-based dismiss
3. 再做 `MenuPopover`
4. 最后收拢 `KeyboardHost` 和 `MarqueeHost`

原因：

- 如果没有 runtime，`MenuPopover` 最终还是只能继续 patch `Popover`
- 如果先有 runtime，后续 menu、dialog、picker 都能复用

## 最终目标状态

理想状态下，系统会收敛成这样：

- `Popover` 只管浮层 primitive
- `Menu` 只管菜单状态机
- `OverlayRuntime` 统一调度层级、dismiss、focus return、interaction lock
- `MenuPopover` / `DropdownMenu` 成为业务层唯一菜单入口
- 页面级 host 通过 runtime 查询当前交互优先级

到这个阶段后：

- 不再需要业务层到处写 `closeOnEscape={false}`
- 不再需要 `Popover` 和 `Menu` 互相猜测谁该吃事件
- 不再需要页面级 host 依赖角色选择器回避菜单

## 一句话总结

应该做的不是继续给 `Popover` 加更多 dismiss prop，也不是把 `Popover` 和 `Menu` 硬合并，而是在 `ui` 层建立一个统一的 `OverlayRuntime`。

`Popover`、`Menu`、`DropdownMenu`、页面级快捷键和交互锁都应成为这个 runtime 的客户端，由 runtime 统一决定谁是当前 top layer、谁先响应 `Escape`、谁负责 outside press、以及关闭后焦点该回到哪里。
