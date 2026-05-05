# App Shell 重构清单

## 目标

把 `app/src` 重构成统一宿主层，承载：

- project 切换
- preset 切换
- theme 切换
- collab 状态栏
- URL / router 状态

同时明确边界：

- `dataview-react` 和 `whiteboard-react` 只提供产品组件与接入点
- `dataview` 的 presets **全部放到 app 层**
- 宿主 UI 尽量复用 `shared/ui` 和 `shared/ui/tailwind`

---

## 边界结论

### 1. app 是唯一宿主层

放在 `app`：

- 左上角 project menu
- preset 列表与切换
- theme 管理
- router / URL 解析
- collab 控制台与右上角状态栏

不放在 package：

- dataview page 内的 preset menu
- whiteboard 内部的 demo shell UI
- project 级 theme / room / router 管理

### 2. dataview presets 全部上提到 `app`

明确要求：

- `dataview/packages/dataview-react/src/page/perfPresets.ts` 不再保留 preset 定义、preset menu、preset apply 逻辑
- dataview preset 定义、preset 列表、preset 生成、preset 应用全部迁移到 `app/src/projects/dataview`

`dataview-react` 不再感知：

- demo perf preset
- preset dropdown
- preset busy state
- preset URL

### 3. whiteboard 与 dataview 对齐

whiteboard 也通过 `app/src/projects/whiteboard` 暴露：

- preset 列表
- preset 解析
- demo 页面装配

### 4. theme 不进 URL

- theme 存 `localStorage`
- 支持 `light | dark | system`

### 5. collab 放 app 层

- room 进 URL
- identity 存 `sessionStorage`
- 右上角状态栏展示协作状态、room、在线用户、新 tab 打开房间

### 6. UI 组件优先复用 shared/ui

宿主层组件尽量使用：

- `shared/ui`
- `shared/ui/tailwind`

优先复用：

- `Button`
- `Menu`
- `Popover` / `Dropdown`
- `Input`
- `Badge`
- `Avatar` 风格圆点

不建议在 `app` 自己重新发明一套 button/menu/panel 样式体系。

---

## 路由方案

使用 `react-router`。

### URL 结构

```txt
/:project?preset=:presetId&room=:roomId
```

示例：

```txt
/dataview?preset=roadmap-10k
/dataview?preset=roadmap-10k&room=demo-a
/whiteboard?preset=service-architecture-200
/whiteboard?preset=service-architecture-200&room=demo-a
```

### 路由规则

- `project` 决定当前页面类型
- `preset` 决定当前 project 的数据/场景
- `room` 存在即表示协作开启

### theme 规则

- 不进 URL
- 从 `localStorage` 读取

---

## 目录重构

建议把 `app/src` 重构为：

```txt
app/src/
  App.tsx
  main.tsx
  app.css

  shell/
    routes.tsx
    AppShell.tsx
    AppMenu.tsx
    AppStatusBar.tsx
    useAppRouteState.ts
    theme.ts

  collab/
    controller.ts
    identity.ts
    room.ts
    types.ts

  projects/
    registry.ts
    types.ts

    dataview/
      capability.ts
      presets.ts
      DataViewDemoPage.tsx
      engine.ts

    whiteboard/
      capability.ts
      presets.ts
      WhiteboardDemoPage.tsx
      document.ts

  whiteboard/
    scenarios/
      ...
```

---

## API 设计

## 1. Project Capability

文件：

- `app/src/projects/types.ts`

```ts
import type { ReactNode } from 'react'

export type AppTheme = 'light' | 'dark' | 'system'

export interface ProjectPresetDescriptor {
  id: string
  label: string
  group?: string
  summary?: string
}

export interface AppNavigateInput {
  project?: string
  preset?: string
  room?: string
}

export interface ProjectRenderContext {
  preset: ProjectPresetDescriptor
  theme: AppTheme
  roomId?: string
  collabEnabled: boolean
  navigate(next: AppNavigateInput): void
}

export interface ProjectCapability {
  id: string
  label: string
  defaultPreset: ProjectPresetDescriptor
  listPresets(): readonly ProjectPresetDescriptor[]
  preset(id: string): ProjectPresetDescriptor | undefined
  render(context: ProjectRenderContext): ReactNode
}
```

## 2. App Route State

文件：

- `app/src/shell/useAppRouteState.ts`

```ts
export interface AppRouteState {
  projectId: string
  presetId?: string
  roomId?: string
}

export interface AppRouteController {
  route: AppRouteState
  setProject(projectId: string): void
  setPreset(presetId?: string): void
  setRoom(roomId?: string): void
  replaceRoute(next: AppRouteState): void
}

export function useAppRouteState(): AppRouteController
```

## 3. Theme Hook

文件：

- `app/src/shell/theme.ts`

```ts
export type AppTheme = 'light' | 'dark' | 'system'

export const APP_THEME_STORAGE_KEY = 'rostack.app.theme'

export interface AppThemeController {
  theme: AppTheme
  setTheme(theme: AppTheme): void
  system(): 'light' | 'dark'
}

export function useAppTheme(): AppThemeController
```

## 4. Collab Types

文件：

- `app/src/collab/types.ts`

```ts
export interface DemoUserIdentity {
  id: string
  label: string
  color: string
}

export interface AppCollabState {
  enabled: boolean
  roomId?: string
  identity: DemoUserIdentity
  peers: readonly DemoUserIdentity[]
  connection: 'offline' | 'connecting' | 'connected'
}
```

## 5. Collab Controller

文件：

- `app/src/collab/controller.ts`

```ts
export interface AppCollabController {
  state: AppCollabState
  enable(): void
  disable(): void
  setRoom(roomId?: string): void
  openInNewTab(): void
  copyRoomLink(): Promise<void>
}

export function useAppCollabController(input: {
  projectId: string
  presetId?: string
  roomId?: string
}): AppCollabController
```

## 6. dataview Preset API

文件：

- `app/src/projects/dataview/presets.ts`

```ts
import type { DataDoc } from '@dataview/core/types'

export type DataViewPresetId =
  | 'roadmap-1k'
  | 'roadmap-10k'
  | 'sales-20k'
  | 'content-10k'
  | 'engineering-50k'
  | 'dense-20k'

export interface DataViewPresetDefinition {
  id: DataViewPresetId
  label: string
  group: string
  summary: string
  createDocument(): DataDoc
}

export const DEFAULT_DATAVIEW_PRESET: DataViewPresetDefinition
export const DATAVIEW_PRESETS: readonly DataViewPresetDefinition[]
export function getDataViewPreset(id: string): DataViewPresetDefinition | undefined
```

说明：

- dataview presets 全部在 app 里定义
- 不再从 `dataview-react` 导出 demo preset

## 7. whiteboard Preset API

文件：

- `app/src/projects/whiteboard/presets.ts`

```ts
import type { ScenarioPreset } from '@/whiteboard/scenarios'

export interface WhiteboardPresetDefinition {
  id: string
  label: string
  group: string
  summary?: string
  createScenario(): ScenarioPreset
}

export const DEFAULT_WHITEBOARD_PRESET: WhiteboardPresetDefinition
export const WHITEBOARD_PRESETS: readonly WhiteboardPresetDefinition[]
export function getWhiteboardPreset(id: string): WhiteboardPresetDefinition | undefined
```

---

## 组件重构清单

## 1. `app/src/App.tsx`

改成：

- 装配 `RouterProvider`
- 不再返回 `null`

## 2. `app/src/shell/routes.tsx`

新增：

- `createBrowserRouter`
- `/` 重定向到 `/dataview`
- `/:projectId` 渲染 `AppShell`

## 3. `app/src/shell/AppShell.tsx`

职责：

- 使用 `useAppRouteState()`
- 读取 project capability
- 读取 theme
- 创建 collab controller
- 渲染：
  - 左上角 `AppMenu`
  - 右上角 `AppStatusBar`
  - 当前 project page

## 4. `app/src/shell/AppMenu.tsx`

职责：

- 项目切换
- preset 切换
- theme 切换

组件实现要求：

- 尽量使用 `shared/ui` 的 `Menu.Dropdown`
- 触发按钮使用 `shared/ui` 的 `Button`
- 分组使用已有 `Menu` label/divider 能力

## 5. `app/src/shell/AppStatusBar.tsx`

职责：

- 展示 collab 状态
- 展示 room id
- 展示在线用户
- 打开新 tab
- 展开协作 panel

组件实现要求：

- 尽量使用 `shared/ui` 的 `Button` / `Menu` / `Input` / `Badge`
- 用户圆点优先用 shared token，不自造颜色体系

## 6. `dataview/packages/dataview-react/src/page/PageTitle.tsx`

重构要求：

- 删除 perf preset dropdown
- 删除对 `perfPresets.ts` 的依赖
- 只保留标题展示职责

## 7. `dataview/packages/dataview-react/src/page/perfPresets.ts`

重构要求：

- 整体删除或迁空
- 不再作为 demo preset 源文件存在

如果有仍需保留的纯领域工具函数，应迁移到 `app/src/projects/dataview`

## 8. `app/src/projects/dataview/DataViewDemoPage.tsx`

职责：

- 创建 / 持有 dataview engine
- 根据 resolved preset 应用 app 层 preset
- 把 collab 配置传给 `DataViewProvider`
- 渲染 dataview `Page`

## 9. `app/src/projects/whiteboard/WhiteboardDemoPage.tsx`

职责：

- 消费 resolved whiteboard preset
- 创建初始 document / scenario
- 把 collab / presence 配置传给 `<Whiteboard />`

---

## 实施方案

## Phase 1: 搭宿主壳

1. 引入 `react-router`
2. 实现 `routes.tsx`
3. 实现 `useAppRouteState.ts`
4. 实现 `theme.ts`
5. 建立 `projects/registry.ts`
6. 让 `App.tsx` 真正渲染 `AppShell`

验收：

- 可通过 `/dataview` / `/whiteboard` 打开不同 project
- `preset` 能跟随 URL
- `theme` 能通过 hook 持久化并返回当前 system 解析结果

## Phase 2: 上提 dataview presets 到 app

1. 在 `app/src/projects/dataview/presets.ts` 重建 preset 定义
2. 新建 `DataViewDemoPage.tsx`
3. `PageTitle.tsx` 删除 preset UI
4. 废弃 `dataview-react/src/page/perfPresets.ts`

验收：

- dataview preset 只由 app menu 控制
- dataview package 内不再有 demo preset menu 逻辑

## Phase 3: whiteboard 对齐 capability

1. 新建 `app/src/projects/whiteboard/presets.ts`
2. 新建 `WhiteboardDemoPage.tsx`
3. 用 capability 封装 whiteboard scenario/preset

验收：

- dataview / whiteboard 都通过同一套 menu 和 route 切换

## Phase 4: collab 宿主化

1. 实现 `collab/identity.ts`
2. 实现 `collab/controller.ts`
3. 实现 `AppStatusBar.tsx`
4. project page 接入 collab props

验收：

- `room` 出现在 URL
- 新 tab 可进入同房间
- 在线用户可在右上角看到

## Phase 5: UI 收口到 shared/ui

1. 审查 `app` 层新增组件
2. 优先改用 `shared/ui` 和 `shared/ui/tailwind`
3. 删除重复样式与自定义基础组件

验收：

- app shell 没有自造一套 button/menu/form 组件
- 视觉 token 与 shared theme 对齐

---

## 明确禁区

不要再做：

- 在 `dataview-react` 内保留 preset menu
- 在 `dataview-react` 内保留 demo perf preset 目录
- 在 `whiteboard-react` 内新增 project shell
- theme 放 URL
- collab panel 放左上角 menu
- app 自己造一套基础 UI 组件替代 `shared/ui`

---

## 最终验收标准

1. dataview presets 全部在 `app/src/projects/dataview`
2. whiteboard presets 全部通过 app capability 暴露
3. `react-router` 成为唯一 project/preset/room 状态源
4. theme 仅由 `localStorage` 管理
5. collab 状态栏在右上角
6. 新增宿主 UI 优先复用 `shared/ui` 和 `shared/ui/tailwind`
