# App Project Shell 集成方案

## 目标

把 `app/src` 从当前几乎为空的 demo 入口，升级成一个统一的宿主层，用来承载：

1. `dataview/packages/dataview-react`
2. `whiteboard/packages/whiteboard-react`
3. 左上角 project menu
4. project 切换
5. theme 切换
6. URL 驱动的 preset 选择
7. preset 生成能力从 dataview page 内部上提到 app，并为 whiteboard 提供同构接口

这个方案的核心思想是：

- `app` 做壳
- `dataview-react` / `whiteboard-react` 继续做纯产品组件
- project / theme / preset / URL 这些“宿主级 concerns”不再塞进包内部

## 当前现状

### 1. `app/src` 现在几乎没有宿主逻辑

当前：

- [App.tsx](/Users/realrong/Rostack/app/src/App.tsx) 直接返回 `null`
- [main.tsx](/Users/realrong/Rostack/app/src/main.tsx) 只是挂载空 `App`

说明 `app` 还没有真正承担产品入口职责。

### 2. dataview 的 preset 已经越界到 page chrome 里了

当前 dataview 的性能预设集中在：

- [perfPresets.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/perfPresets.ts)

它不仅包含：

- preset id
- document 生成能力
- preset meta 写入

还包含：

- menu item 构建
- UI 文案
- 从 `PageTitle` 直接触发 preset 应用

对应使用点在：

- [PageTitle.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/PageTitle.tsx)

这意味着：

- dataview-react package 自己在决定 demo shell 行为
- 这和 app 作为宿主的职责冲突

### 3. whiteboard 目前没有对应宿主层 preset/menu 体系

whiteboard 这边目前更接近“有场景数据源，但没有宿主 menu 框架”：

- [app/src/whiteboard/scenarios/index.ts](/Users/realrong/Rostack/app/src/whiteboard/scenarios/index.ts)
- [app/src/whiteboard/scenarios/generated.ts](/Users/realrong/Rostack/app/src/whiteboard/scenarios/generated.ts)

它已经有：

- scenario preset 定义
- family / size 解析
- URL 相关解析基础

但这些还没有被包装成统一的 app shell project capability。

## 核心结论

长期正确方向是：

**把 app 做成唯一的 project shell，dataview 和 whiteboard 只暴露“可嵌入页面 + preset capability 接口”，不再在包内自己控制 project menu、theme menu、URL preset 行为。**

换句话说：

- project list 放到 `app`
- theme switch 放到 `app`
- URL state 放到 `app`
- dataview perf preset 从 `dataview-react/src/page/perfPresets.ts` 中拆出来
- whiteboard scenario/preset 能力和 dataview 使用同一个宿主协议

## 建议架构

## 1. app 作为统一 Shell

建议在 `app/src` 中建立新的宿主结构：

```txt
app/src/
  App.tsx
  shell/
    AppShell.tsx
    AppMenu.tsx
    routes.tsx
    useAppRouteState.ts
    theme.ts
  projects/
    registry.ts
    types.ts
    dataview/
      page.tsx
      presets.ts
      capability.ts
    whiteboard/
      page.tsx
      presets.ts
      capability.ts
```

### 职责分配

`App.tsx`

- 初始化 shell
- 初始化 router
- 解析当前 project / preset
- 读取本地 theme

`shell/AppShell.tsx`

- 渲染左上角 menu
- 渲染当前 project 页面
- 应用 theme class

`projects/registry.ts`

- 注册所有可切换的 project
- 提供默认 project

`projects/*/capability.ts`

- project 的 preset 列表
- preset 解析
- preset 应用
- route 参数解析

## 2. 引入 React Router

这里建议直接引入 `react-router`，不要自己维护一套手写 URL 状态层。

原因：

1. project 切换天然就是路由语义。
2. preset 本身就是 route-adjacent state，适合和路由一起管理。
3. 后续如果 dataview / whiteboard 各自出现子页面或子模式，router 可以直接承接。

推荐路由结构：

```txt
/dataview?preset=roadmap-10k
/whiteboard?preset=service-architecture-200
/whiteboard?preset=service-architecture-200&room=team-a
```

也就是：

- pathname 表示当前 project
- search params 表示当前 project 的 `preset`
- 当进入协作时，`room` 也进入 search params

theme 不进入 URL。

建议在 app 内使用：

- `createBrowserRouter`
- `RouterProvider`
- `Navigate`
- `useNavigate`
- `useParams`
- `useSearchParams`

推荐最小结构：

```tsx
<Route path="/" element={<Navigate to="/dataview" replace />} />
<Route path="/:projectId" element={<AppShell />} />
```

这样：

- project 切换走 router navigation
- preset 切换走 query param 更新
- 浏览器前进后退天然可用

## 3. 左上角 Menu 的建议信息架构

左上角 menu 建议不是只做一个下拉，而是一个统一入口，里面至少分三组：

1. Projects
2. Presets
3. Theme

推荐结构：

```txt
Menu
  Projects
    DataView
    Whiteboard
  Presets
    当前 project 对应的 preset 列表
  Theme
    Light
    Dark
    System
```

也可以做成二段式：

- 第一层只展示当前 project、current preset、theme
- 第二层按组展开 submenu

但无论视觉形式如何，状态源都应统一来自 app shell。

## 4. 建议引入统一 Project Capability 协议

这是这次改造最关键的抽象。

每个 project 都应实现一份宿主协议，而不是各自发明一套入口。

建议类型：

```ts
export type AppTheme = 'light' | 'dark' | 'system'

export interface ProjectPresetDescriptor {
  id: string
  label: string
  group?: string
  summary?: string
}

export interface ProjectUrlState {
  project: string
  preset?: string
}

export interface ProjectCapability {
  id: string
  label: string
  defaultPresetId?: string
  listPresets(): readonly ProjectPresetDescriptor[]
  resolvePreset(input: {
    presetId?: string | null
    searchParams: URLSearchParams
  }): string | undefined
  render(input: {
    presetId?: string
    theme: AppTheme
    navigate(next: Partial<ProjectUrlState>): void
  }): React.ReactNode
}
```

重点不是最终字段名字，而是：

- app shell 不直接理解 dataview / whiteboard 细节
- 每个 project 自己声明 preset 能力
- app 只负责选择、渲染、同步 URL

## dataview 方案

## 1. `perfPresets.ts` 需要拆分

当前 [perfPresets.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/perfPresets.ts) 混了三类内容：

1. 数据生成定义
2. meta 读写
3. menu / page title UI 行为

建议拆成两层：

### A. 保留在 dataview 侧的内容

适合保留在 dataview 侧，甚至可以继续放在 package 内，但不该挂在 `page/` 目录下：

- `PerfPresetId`
- preset document 生成逻辑
- `applyPerfPreset(engine, presetId)`
- `readPerfPresetMeta(meta)`
- preset descriptor 列表

建议新位置：

```txt
dataview/packages/dataview-react/src/demo/perfPresets.ts
```

或者更彻底一点：

```txt
dataview/packages/dataview-react/src/demo/presets.ts
```

因为这些本质上是 demo / host integration 能力，不是 page 内部组件能力。

### B. 应该移到 app 的内容

现在这个函数应移出 dataview package：

- `buildPerfPresetMenuItems(...)`

以及 `PageTitle.tsx` 中这一整套：

- 当前 preset 显示
- busy state
- dropdown trigger
- 选择 preset 后直接改 engine

这些都应该变成：

- app menu 负责 UI
- dataview capability 负责“列出 preset / 应用 preset”

## 2. dataview page 需要去宿主耦合

当前 [Page.tsx](/Users/realrong/Rostack/dataview/packages/dataview-react/src/page/Page.tsx) 直接包含：

- `PageTitle`
- `PageToolbar`
- `ViewQueryBar`

而 `PageTitle` 现在又承担 preset menu。

建议改法：

### 方案 A，最小侵入

保留 `PageTitle`，但移除 perf preset dropdown，让它只负责页面标题信息。

优点：

- 改动小
- dataview page 仍能独立工作

### 方案 B，更干净

让 `Page` 支持 header slot，例如：

```ts
export interface PageProps {
  headerStart?: React.ReactNode
  headerEnd?: React.ReactNode
}
```

然后 app shell 决定是否把 preset 入口放进 dataview 页面头部。

我建议先走 **方案 A**：

- app 左上角 menu 已经承担 preset 切换
- dataview 自己不再内置 perf preset menu
- `PageTitle` 简化为标题展示即可

## 3. dataview capability 设计

建议在 app 层实现一个 dataview capability wrapper，例如：

```ts
export const dataviewProject: ProjectCapability = {
  id: 'dataview',
  label: 'DataView',
  defaultPresetId: 'roadmap-1k',
  listPresets: () => DATAVIEW_PRESET_DESCRIPTORS,
  resolvePreset: ({ presetId }) => resolveDataViewPresetId(presetId),
  render: ({ presetId, theme, navigate }) => (
    <DataViewDemoPage
      presetId={presetId}
      theme={theme}
      onPresetChange={nextPresetId => navigate({ preset: nextPresetId })}
    />
  )
}
```

其中 `DataViewDemoPage` 负责：

- 创建或持有 dataview engine
- 根据 `presetId` 应用 preset
- 渲染 `DataViewProvider + Page`

注意：

- preset 改变应由 app URL 驱动
- project 页面只消费当前 preset，不自行决定 URL

## whiteboard 方案

## 1. whiteboard 已经有 preset 基础，但没有统一 capability

当前 whiteboard 的场景系统已经具备这些基础：

- scenario 列表
- generated family
- family + size 解析

这些逻辑在：

- [app/src/whiteboard/scenarios/index.ts](/Users/realrong/Rostack/app/src/whiteboard/scenarios/index.ts)
- [app/src/whiteboard/scenarios/generated.ts](/Users/realrong/Rostack/app/src/whiteboard/scenarios/generated.ts)

这非常适合对齐 dataview 的 preset 协议。

## 2. whiteboard 的 preset 能力建议对齐 dataview

建议白板侧也导出同构 descriptor：

```ts
type WhiteboardPresetDescriptor = {
  id: string
  label: string
  group?: string
  summary?: string
}
```

再通过 whiteboard capability 暴露：

- `listPresets()`
- `resolvePreset()`
- `render()`

这样 app menu 不需要知道：

- dataview 的 preset 来自 perf docs
- whiteboard 的 preset 来自 scenario family

它只知道当前 project 有一组 presets。

## 3. whiteboard render 形态建议

whiteboard project page 建议负责：

- 根据 `presetId` 解析 `ScenarioPreset`
- 生成初始 document
- 把 document 喂给 `<Whiteboard />`

同时可支持：

- `theme`
- 后续 collab room id
- URL 中的 `size`

推荐仍然统一成单个 `presetId`，例如：

```txt
service-architecture-200
delivery-planning-500
research-knowledge-map-1000
```

这样 menu 和 URL 都更简单。

## Theme 方案

## 1. Theme 必须归 app 管

theme 是纯宿主能力，不应交给 dataview 或 whiteboard 分别控制。

当前仓库里已经有 shared UI theme token：

- `shared/ui/css/tokens.css`
- `shared/ui/css/semantic.css`

而且它已经支持：

- `.ui-light-theme`
- `.ui-dark-theme`

所以 app shell 最合理的方案是：

- 在最外层 root 容器挂 theme class
- 所有 project 共享这一层

例如：

```tsx
<div className={themeClassName}>
  <AppShell />
</div>
```

建议支持三种值：

- `light`
- `dark`
- `system`

其中：

- `system` 在运行时解析为 light / dark
- theme 选择值保存在 `localStorage`

## 2. Theme 持久化规则

theme 不放进 URL。

建议：

- 使用 `localStorage` 保存用户最后一次显式选择
- key 例如：

```txt
rostack.app.theme
```

- 如果没有存储值，默认使用 `system`

建议提供：

```ts
export type AppTheme = 'light' | 'dark' | 'system'

export const APP_THEME_STORAGE_KEY = 'rostack.app.theme'

export const readStoredTheme(): AppTheme
export const writeStoredTheme(theme: AppTheme): void
export const resolveEffectiveTheme(theme: AppTheme): 'light' | 'dark'
```

theme 是全局宿主状态，所以 project 切换时应保留当前 theme，但不进入可分享链接。

## Collab 方案

## 1. Collab 应放在 app 层

协作控制面板建议明确放在 `app` 宿主层，而不是分别做进：

- `dataview-react`
- `whiteboard-react`

原因：

1. 当前两边底层都依赖 `shared/collab`，这本身就说明协作能力是跨 project 的宿主能力。
2. “是否开启协作、当前 room、在线用户、打开新 tab 模拟协作”这些都不是 dataview/whiteboard 自身页面语义，而是 app demo shell 语义。
3. 如果分别在 dataview page 和 whiteboard chrome 里各做一套协作 UI，后续一定会重复和分叉。

因此建议分层如下：

### 放在 app 层的内容

- 协作开关
- room 管理
- 当前用户 identity
- 在线用户状态栏
- 多 tab 模拟协作入口
- 连接状态展示
- `shared/collab` session 的宿主装配

### 放在 project 层的内容

- dataview 如何消费 collab session
- whiteboard 如何消费 collab presence / binding
- 各自内部的同步细节

也就是说：

- **控制台在 app**
- **接入点在 project adapter**
- **同步实现仍由 shared/collab + 各自产品侧完成**

## 2. UI 位置建议

协作入口不建议放左上角 menu。

左上角已经负责：

- project
- preset
- theme

再塞协作会让 menu 过载。

更合理的是做成 **右上角协作状态栏**，作为全局会话状态区域。

建议布局：

### 左上角

- project menu
- preset
- theme

### 右上角

- collab status bar
- room
- 在线用户
- 新 tab 打开房间

这样语义非常清楚：

- 左边是“当前看什么”
- 右边是“当前和谁一起看”

## 3. Right Status Bar 建议内容

建议分成两层。

### 常驻状态

- 协作状态：`Off / On`
- 当前 room id
- 在线人数
- 在线用户圆点
- `Open Tab` 按钮

### 展开 panel

- 启用/关闭协作
- 当前 room id
- 重新生成 room
- 复制 room link
- 在新 tab 打开当前房间
- 在线用户列表
- 当前连接状态

在线用户的视觉表现可以按你说的做：

- 随机颜色圆形背景
- 中间显示简短 id
- hover 或展开时显示完整 id

这很适合 demo，也足够直观。

## 4. Room 应进入 URL

theme 不该进 URL，但 room 应该进 URL。

原因：

1. room 是可分享状态。
2. 多 tab 模拟协作依赖 room。
3. 复制链接进入同房间依赖 room。

因此推荐 URL 格式升级为：

```txt
/:project?preset=:presetId&room=:roomId
```

示例：

```txt
/dataview?preset=roadmap-10k&room=demo-a
/whiteboard?preset=service-architecture-200&room=demo-a
```

这里的语义是：

- `project` 决定当前页面类型
- `preset` 决定当前数据/场景
- `room` 决定是否进入协作房间

## 5. 协作开关的建议规则

有两种实现方式。

### 方案 A：`room` 存在即开启协作

优点：

- 状态简单
- URL 简洁
- 用户容易理解

语义：

- 没有 `room`：单机模式
- 有 `room`：协作模式

### 方案 B：显式 `collab=1`

例如：

```txt
/whiteboard?preset=service-architecture-200&room=team-a&collab=1
```

优点：

- 语义更显式

缺点：

- URL 更重
- 对 demo 来说收益有限

我建议当前先走 **方案 A**：

- `room` 存在就视为协作开启

状态栏里的“开启协作”按钮行为可以定义为：

- 当前无 room 时：自动创建 room 并写入 URL
- 当前有 room 时：保持当前 room

“关闭协作”则是：

- 从 URL 移除 `room`

## 6. 用户 identity 存储建议

当前需求是多 tab 模拟不同用户，所以不建议把用户 identity 放 `localStorage`。

推荐放在：

- `sessionStorage`

建议结构：

```ts
export interface DemoUserIdentity {
  id: string
  label: string
  color: string
}
```

行为建议：

- tab 首次打开时生成 identity
- 存入 `sessionStorage`
- 同一个 tab 刷新后保持 identity
- 新开 tab 默认生成新的 identity

这样正好符合“多 tab = 多用户”的 demo 目标。

### 为什么不用 `localStorage`

如果放 `localStorage`：

- 同浏览器所有 tab 默认会共享同一个 identity

这和你要模拟多用户是冲突的。

因此建议：

- theme 用 `localStorage`
- collab identity 用 `sessionStorage`

## 7. 多 tab 模拟协作

右上角状态栏中建议提供一个主操作：

- `Open In New Tab`

行为：

1. 保持当前 `project`
2. 保持当前 `preset`
3. 保持当前 `room`
4. 新 tab 自动生成新的 `sessionStorage` identity

例如当前：

```txt
/whiteboard?preset=service-architecture-200&room=team-a
```

点击后新 tab 直接打开同一个 URL。

### 如果当前没有 room

建议行为：

1. 先生成 room id
2. 当前 tab 切换到带 room 的 URL
3. 再打开新 tab

这样用户不需要手动先开启协作。

## 8. 路由与 collab 的关系

既然 app 已经引入 `react-router`，collab 也应该走同一套 route model。

建议 `useAppRouteState()` 扩展为：

```ts
export interface AppRouteState {
  projectId: string
  presetId?: string
  roomId?: string
}

export const useAppRouteState(): {
  route: AppRouteState
  setProject(projectId: string): void
  setPreset(presetId?: string): void
  setRoom(roomId?: string): void
  replaceRoute(next: AppRouteState): void
}
```

语义：

- `setRoom(undefined)` 表示退出协作
- `setRoom('team-a')` 表示进入协作

## 9. App 层的 Collab Controller 抽象

为了避免把 collab 宿主逻辑散落在 menu、page、project adapter 之间，建议新增一个 app-level controller。

例如：

```ts
export interface AppCollabState {
  enabled: boolean
  roomId?: string
  identity: DemoUserIdentity
  peers: readonly DemoUserIdentity[]
  connection: 'offline' | 'connecting' | 'connected'
}

export interface AppCollabController {
  state: AppCollabState
  enable(): void
  disable(): void
  setRoom(roomId?: string): void
  openInNewTab(): void
  copyRoomLink(): Promise<void>
}
```

这里的 controller 放在 `app/src/shell` 或 `app/src/collab` 都可以。

重点是：

- app shell 统一持有 collab host state
- project capability 只消费已经解析好的 collab props

## 10. Project Adapter 的 collab 边界

建议每个 project page 不直接读 URL、也不直接管理多 tab。

它只接收 app 传下来的 collab 输入。

例如：

```ts
export interface ProjectCollabProps {
  enabled: boolean
  roomId?: string
  identity: DemoUserIdentity
}
```

然后按 project 类型适配：

### dataview

- 把 `roomId` / `identity` 转成 dataview 所需的 collab session 配置
- 传给 `DataViewProvider`

### whiteboard

- 把 `roomId` / `identity` 转成 whiteboard 所需的 collab / presence binding
- 传给 `<Whiteboard />`

这样可以保证：

- app 是唯一协作宿主
- dataview / whiteboard 只是协作消费者

## 11. 文件结构建议补充

建议在 `app/src` 里新增一组 collab 宿主文件：

```txt
app/src/
  shell/
    AppShell.tsx
    AppMenu.tsx
    AppStatusBar.tsx
    useAppRouteState.ts
    theme.ts
  collab/
    controller.ts
    identity.ts
    room.ts
    status.ts
```

### 推荐职责

`collab/identity.ts`

- 生成 / 读取 / 写入 `sessionStorage` identity

`collab/room.ts`

- 生成 room id
- 构造 room link

`collab/controller.ts`

- 基于 route + identity 生成 collab controller

`shell/AppStatusBar.tsx`

- 右上角协作状态栏 UI

## 12. 对现有文档其他部分的影响

引入 collab 后，之前的 route 结论应更新为：

- URL 负责 `project + preset + room`
- `theme` 不进入 URL

所以完整推荐 URL 变成：

```txt
/:project?preset=:presetId&room=:roomId
```

如果没有协作：

```txt
/:project?preset=:presetId
```

## URL 状态设计

## 1. 推荐 URL 结构

推荐：

```txt
/:project?preset=:presetId&room=:roomId
```

示例：

```txt
/dataview?preset=roadmap-10k
/whiteboard?preset=service-architecture-200
/whiteboard?preset=service-architecture-200&room=team-a
```

优点：

- project 与 preset 解耦
- room 可分享
- dataview / whiteboard 都可用同一套解析逻辑
- 直接分享链接即可恢复页面状态

## 2. app 的 URL 解析职责

这部分不再建议做成手写 `urlState.ts`，而是用 router hook 封装。

建议新增：

- `app/src/shell/useAppRouteState.ts`

职责：

- 从 `params.projectId` 解析当前 project
- 从 `searchParams.get('preset')` 解析当前 preset
- 从 `searchParams.get('room')` 解析当前 room
- 做 fallback
- 暴露设置 project / preset / room 的宿主 API

建议提供：

```ts
export interface AppRouteState {
  projectId: string
  presetId?: string
  roomId?: string
}

export const useAppRouteState(): {
  route: AppRouteState
  setProject(projectId: string): void
  setPreset(presetId?: string): void
  setRoom(roomId?: string): void
  replaceRoute(next: AppRouteState): void
}
```

## Menu 具体建议

## 1. 左上角 Menu 的最小交互

点击左上角 menu 按钮后弹出 dropdown。

内容建议：

### Projects

- DataView
- Whiteboard

### Presets

- 动态读取当前 project capability 的 `listPresets()`
- 当前 preset 高亮
- 切换时直接更新 URL

### Theme

- Light
- Dark
- System

## 2. 切换行为

### 切 project

- 保留当前 theme
- preset 重置为目标 project 的 default preset
- 使用 router 导航到目标 pathname + preset query

### 切 preset

- 不切 project
- 不切 theme
- 仅更新 `preset`

### 切 theme

- 不切 project
- 不切 preset
- 仅更新本地 theme state 和 `localStorage`

## 关于 perf preset 上提的具体建议

## 1. 不建议直接把整个 `perfPresets.ts` 原样挪到 app

因为其中的数据生成逻辑本身仍然是 dataview 领域代码。

更好的拆法是：

### dataview package 保留

- preset id/type
- 生成 document 的实现
- `applyPerfPreset(engine, presetId)`
- `readPerfPresetMeta(...)`
- `listPerfPresets()` 或 `PERF_PRESET_DESCRIPTORS`

### app 接管

- menu item 结构
- dropdown UI
- busy state
- URL 到 preset 的映射
- preset 切换时机

也就是说：

- 把 **UI shell** 提出去
- 保留 **domain preset implementation** 在 dataview 一侧

## 2. 更理想的文件拆分

建议 dataview 最终改成：

```txt
dataview/packages/dataview-react/src/demo/perfPresets.ts
  - PerfPresetId
  - PERF_PRESET_DESCRIPTORS
  - readPerfPresetMeta
  - applyPerfPreset

dataview/packages/dataview-react/src/page/PageTitle.tsx
  - 不再 import perf preset menu builder
  - 只展示标题
```

这样 package 边界会干净很多。

## 白板和 dataview 对齐的建议

要点不是让 whiteboard 也有一个叫 `perfPresets.ts` 的文件，而是让两边都提供统一的 preset capability。

建议统一协议：

```ts
interface ProjectPresetCapability<TPresetId extends string = string> {
  defaultPresetId: TPresetId
  list(): readonly {
    id: TPresetId
    label: string
    group?: string
    summary?: string
  }[]
  resolve(value?: string | null): TPresetId
}
```

然后：

- dataview 提供 perf preset capability
- whiteboard 提供 scenario preset capability

app menu 不再关心底层差异。

## 具体落地顺序

## Phase 1

先把 app shell 和 router 搭起来。

做的事：

- `App.tsx` 不再返回 `null`
- 引入 `react-router`
- 建立 project registry
- 建立 route state hook
- 建立 theme state
- 做左上角 menu

这一步先不改 dataview / whiteboard 内部 UI。

## Phase 2

把 dataview perf preset UI 从 `PageTitle.tsx` 移出。

做的事：

- `PageTitle.tsx` 删除 preset dropdown
- `perfPresets.ts` 删掉 `buildPerfPresetMenuItems`
- app shell 接管 preset menu

这一步完成后：

- dataview preset 只由 app menu 控制
- URL 驱动 dataview preset

## Phase 3

给 whiteboard 做同构 capability。

做的事：

- 把现有 scenario preset 包装成 capability
- 让 app menu 可在 whiteboard project 下显示 preset 列表
- URL 驱动 whiteboard scenario

## Phase 4

清理 demo / host boundary。

做的事：

- 把所有与 app shell 相关的 menu / theme / URL 逻辑彻底留在 `app`
- dataview / whiteboard 只保留组件和 domain-level preset APIs

## 最小可行 API 设计

下面这组 API 足够开始落地。

### app project types

```ts
export type AppTheme = 'light' | 'dark' | 'system'

export interface AppNavigateInput {
  project?: string
  preset?: string
}

export interface ProjectPresetDescriptor {
  id: string
  label: string
  group?: string
  summary?: string
}

export interface ProjectCapability {
  id: string
  label: string
  defaultPresetId?: string
  listPresets(): readonly ProjectPresetDescriptor[]
  resolvePreset(input: {
    presetId?: string | null
    searchParams: URLSearchParams
  }): string | undefined
  render(input: {
    presetId?: string
    theme: AppTheme
    navigate(next: AppNavigateInput): void
  }): React.ReactNode
}
```

### app router / theme

```ts
export type AppTheme = 'light' | 'dark' | 'system'

export const APP_THEME_STORAGE_KEY = 'rostack.app.theme'

export const readStoredTheme(): AppTheme
export const writeStoredTheme(theme: AppTheme): void
export const resolveEffectiveTheme(theme: AppTheme): 'light' | 'dark'

export interface AppRouteState {
  projectId: string
  presetId?: string
  roomId?: string
}

export const useAppRouteState(): {
  route: AppRouteState
  setProject(projectId: string): void
  setPreset(presetId?: string): void
  setRoom(roomId?: string): void
  replaceRoute(next: AppRouteState): void
}
```

### dataview side

```ts
export type PerfPresetId = ...

export interface PerfPresetDescriptor {
  id: PerfPresetId
  label: string
  group: string
  summary: string
}

export const DATAVIEW_PERF_PRESETS: readonly PerfPresetDescriptor[]
export const resolvePerfPresetId(value?: string | null): PerfPresetId
export const applyPerfPreset(input: {
  engine: Engine
  presetId: PerfPresetId
}): { preset: PerfPresetDescriptor; document: DataDoc }
```

### whiteboard side

```ts
export interface WhiteboardScenarioDescriptor {
  id: string
  label: string
  group: string
  summary?: string
}

export const WHITEBOARD_SCENARIOS: readonly WhiteboardScenarioDescriptor[]
export const resolveWhiteboardScenarioId(value?: string | null): string
export const createWhiteboardScenarioDocument(id: string): Document
```

## 风险与注意点

## 1. dataview `Page` 现在默认把 header/title 一起渲染

如果 app 想完全掌控顶部 chrome，未来可能还要让 `Page` 支持可选隐藏内置 title。

但当前阶段不一定要立刻做，只要先把 preset dropdown 移走即可。

## 2. whiteboard 可能不像 dataview 那样天然有“page header”

所以 project menu 必须放在 app shell 固定层，而不是放进各自 project 内。

这正好也满足“左上角统一 menu”的需求。

## 3. URL 改变时的实例生命周期

对 dataview / whiteboard 都要明确：

- 切 preset 是重建 engine/document，还是在现有实例上 replace

建议：

- dataview：沿用现有 `engine.replace(document, { origin: 'system' })`
- whiteboard：优先也走 document replace，而不是整个 React subtree 重建

但这取决于白板当前实例管理方式，实施时再具体确认。

## 4. theme 需要作用在 shared/ui token 根节点

theme class 必须加在足够外层，确保 dataview 和 whiteboard 都继承到同一套 token。

## 最终结论

这次集成最合理的方向是：

1. `app/src` 升级成统一 shell。
2. 用 `react-router` 管理 project 路由和 preset query。
3. 左上角 menu 由 app 管，负责 project / preset / theme。
4. URL 用 `/:project?preset=...&room=...` 作为可分享状态源。
5. theme 用 `localStorage` 持久化，不进入 URL。
6. `dataview-react/src/page/perfPresets.ts` 里的 **menu/UI 行为** 提出去，保留 **preset 生成实现**。
7. whiteboard 用同一套 capability 协议对齐 dataview。

这样以后：

- project 切换统一
- theme 切换统一
- preset 切换统一
- 链接分享统一
- dataview / whiteboard 包边界也会明显干净很多

这是当前代码结构下最稳、最清晰的一步。
