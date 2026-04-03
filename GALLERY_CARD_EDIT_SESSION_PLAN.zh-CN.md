# gallery 局部编辑会话简化方案

## 结论

在当前约束下：

- 同时只有一个 `currentView`
- 同时只会有一个局部编辑中的 item
- 同时只会打开一个 `value editor`

长期最优的当前版本，不需要：

- `owner`
- boundary / stack / registry
- value editor 和 inline session 的显式关联建模

只需要两个判断维度：

1. `activeInlineSession`
2. `valueEditorOpen`

退出规则直接定义为：

- `Esc`
  - 如果 `valueEditorOpen === true`，先关闭 `value editor`
  - 否则清空 `activeInlineSession`
- outside click
  - 只有在 `valueEditorOpen === false` 时，才允许清空 `activeInlineSession`

同时：

- `blur` 只负责字段级提交
- `blur` 不负责结束整个局部编辑会话

## 命名结论

不建议继续使用：

- `editingCard`

原因：

- `card` 是 gallery/kanban 这种具体 UI 的叫法
- 真正稳定的身份不是“卡片组件”，而是 `currentView` 里的一个 `appearance`
- 后续如果 kanban 也接入，这个状态仍然是同一种东西，不应继续叫 card

推荐命名：

- `activeInlineSession`

对应 target：

```ts
export interface InlineSessionTarget {
  viewId: ViewId
  appearanceId: AppearanceId
}
```

当前版本下，状态本体直接是：

```ts
type ActiveInlineSessionState = InlineSessionTarget | null
```

不需要额外包装成：

- `InlineSessionState { target: ... }`

## 为什么用 page 级状态，不用 card 局部状态

因为现在要解决的问题已经跨出单个 card 组件了：

1. `Esc` 需要统一处理

- 如果 `value editor` 开着，先关 `value editor`
- 否则退出当前 inline session

2. outside click 需要统一处理

- 只有在 `valueEditorOpen === false` 时，才根据点击位置决定是否退出

3. `value editor` 是全局共享 surface

- 它不在 card DOM 树内
- 但当前模型下，只要它打开，就不允许清空当前 inline session

只要涉及这些跨组件、跨 portal 的行为，局部 `useState` 就不再是最合适的边界。

## 状态应该放哪里

推荐放在 React 侧的 page 级 transient state，而不是塞进具体 gallery 组件内部。

这里的 page 级指的是：

- 当前 `Page` React 实例生命周期内的临时交互状态

而不是：

- document 持久化状态
- engine/core 状态
- page chrome 的持久 session model

因此：

- 它可以视为 page 级状态
- 但不建议把它混进现有 `page.query/settings/surface` 这类 domain

长期更合理的组织方式是：

- 作为 `DataView` React runtime 下的独立 `inlineSession` domain

也就是：

- 归属上属于 page 级 transient state
- API 组织上独立于 `page`

## 推荐的数据结构

### 1. inline session

```ts
export interface InlineSessionTarget {
  viewId: ViewId
  appearanceId: AppearanceId
}
```

store 直接就是：

```ts
ValueStore<InlineSessionTarget | null>
```

推荐语义：

- `null`：当前没有局部编辑中的 item
- 非 `null`：当前有且只有一个 inline session

### 2. value editor open state

当前版本只需要：

```ts
valueEditorOpen: boolean
```

也就是：

- `valueEditor` 是否处于打开状态

当前版本不需要：

- `owner`
- `inlineOwner`
- editor 与 inline session 的身份绑定

## 核心规则

### 1. 进入局部编辑态

当用户点击 gallery item 的 edit icon：

- 设置 `activeInlineSession = { viewId, appearanceId }`

同时：

- title draft 初始化
- item UI 切到 edit mode

### 2. 从该 item 打开 value editor

当用户点击：

- “添加 xxx”
- 或编辑态中的某个 field

打开 `value editor` 时：

- 保持 `activeInlineSession` 不变
- 只要 `valueEditor` 仍然打开，就不允许清空 `activeInlineSession`

### 3. `Esc`

规则固定为：

1. 如果 `value editor` 开着：
   - 先关闭 `value editor`
   - 不退出 `activeInlineSession`
2. 否则如果 `activeInlineSession` 存在：
   - 清空 `activeInlineSession`
3. 否则：
   - 不处理

用户感知就是：

- 第一次 `Esc` 先关子编辑器
- 第二次 `Esc` 再退出局部编辑

### 4. outside click

outside click 规则直接收缩成：

1. 如果 `valueEditorOpen === true`
   - 不清空 `activeInlineSession`
2. 如果 `valueEditorOpen === false`
   - 只要点击不在当前 active item root 内，就执行：
     1. 提交 title draft
     2. 清空 `activeInlineSession`

这意味着：

- 当前版本下，`valueEditor` 不参与 identity 判断
- 它只作为一个“当前不允许退出 inline session”的全局信号

## 为什么这套模型足够

因为在当前约束下，系统里同时只会有：

- 一个 active inline session
- 一个 value editor

所以根本不需要：

- session registry
- owned surface stack
- editor owner 关系

outside click 只需要回答两个问题：

1. `valueEditor` 现在是不是打开着
2. 如果没打开，当前点击是不是落在 active item root 内

而 `Esc` 只需要回答一个问题：

- 先关 editor，还是退 session

这两个问题都可以通过单例状态直接解决。

## blur 的职责

### title input blur

title input 的 `blur` 应继续保留，但职责只限于：

- 提交 title draft

不负责：

- 关闭 `value editor`
- 清空 `activeInlineSession`

换句话说：

- `blur = field commit`
- `Esc / outside click = session exit`

这是长期最重要的边界。

## DOM 层需要的最小条件

当前版本不需要引入新的 inline session 或 owner dataset。

只需要：

- 复用现有 item root 身份标记

例如 gallery 当前已有：

- `data-gallery-card-id`

document 级 outside click 判断流程就是：

1. 读 `activeInlineSession`
2. 读 `valueEditorOpen`
3. 如果 `valueEditorOpen === true`
   - 不清空 inline session
4. 如果 `valueEditorOpen === false`
   - 判断 target 是否命中当前 `appearanceId` 对应的 item root
   - 不命中则退出

所以这里不需要：

- `data-inline-session-root`
- `data-inline-session-view-id`
- `data-value-editor-owner-*`

## 推荐的 API 形状

### inline session store

```ts
interface InlineSessionApi {
  store: ValueStore<InlineSessionTarget | null>
  enter(target: InlineSessionTarget): void
  exit(): void
  isActive(target: InlineSessionTarget): boolean
}
```

这里的 `isActive(...)` 会比组件里自己比对 `viewId + appearanceId` 更干净。

推荐在 `DataView` 上的组织方式：

```ts
dataView.inlineSession.store
dataView.inlineSession.enter(target)
dataView.inlineSession.exit()
dataView.inlineSession.isActive(target)
```

而不是：

```ts
dataView.page.inlineSession...
```

原因：

- 它虽然属于 page 级 transient state
- 但和 `query/settings/surface` 不是同一种 domain
- 它和 `valueEditor` 的关系更直接

### value editor state

当前版本 inline session 逻辑只依赖：

```ts
valueEditorOpen: boolean
```

即使底层仍有完整 `ValueEditorSession`，inline session 退出规则也不依赖 editor owner。

## 对现有 gallery 的直接含义

### `Card.tsx`

不应再自己持有“长期有效的 editing 状态”。

它更适合做：

- hover 状态
- title draft
- 当前 item 是否是 active inline session 的派生判断

真正的 edit on/off 应来自：

- `activeInlineSession`

即：

- 如果 `activeInlineSession` 命中当前 item
  - 进入 edit mode
- 否则
  - view mode

### `CardSurface.tsx`

只负责：

- view / edit UI
- title input
- “添加 xxx”入口

不负责决定：

- 当前 item 是否是 active session
- `Esc` 怎么处理
- outside click 怎么处理

### `PropertyValueEditorHost`

当前版本不需要新增 owner 语义。

它只需要继续维护：

- `valueEditor` 的打开/关闭

inline session 逻辑只依赖：

- `valueEditorOpen`

## 为什么这是“长期最优”的当前版本

因为它满足三个条件：

1. 解决当前问题的最短路径

- gallery 局部编辑
- `value editor` 打开时不退出 edit 态
- `Esc` / outside click 行为正确

2. 命名和边界是正确的

- 不再叫 `editingCard`
- 使用 `activeInlineSession`
- 状态本体直接是 `InlineSessionTarget | null`
- API 组织为独立 `inlineSession` domain
- `valueEditor` 不参与 identity 建模

3. 未来仍可平滑升级

如果以后真的出现：

- 同时多个 inline session
- 多个 editor / surface 并行
- 更复杂的 Esc 层级

再从这个模型升级到更通用的 boundary / stack 也不晚。

因为到那时：

- `activeInlineSession`
- `valueEditorOpen`

这些核心概念依然成立，不会推倒重来。

## 不建议的方案

### 1. 继续用 `editingCard`

问题：

- 命名过于 UI-specific
- 会把 gallery 当前形态误写进长期模型

### 2. 继续把状态放在单个 item 局部

问题：

- 无法优雅处理全局 `Esc`
- 无法优雅处理 document 级 outside click

### 3. 现在就引入 owner / boundary / stack 全家桶

问题：

- 超出当前复杂度需要
- 实现成本高于收益

## 推荐落地顺序

### 第一阶段：状态与命名收敛

- 引入 `activeInlineSession`
- 形状直接为 `InlineSessionTarget | null`
- 在 `DataView` 上增加独立 `inlineSession` domain
- `Card.tsx` 不再以局部 `editing` 为真相来源

### 第二阶段：document 级退出规则

- `Esc`：
  - 先关 editor
  - 再退 session
- outside click：
  - 仅在 `valueEditorOpen === false` 时判断是否命中 active item

## 最终建议

下一步实现时，应该围绕这两个核心状态组织：

- `activeInlineSession`
- `valueEditorOpen`

其中：

- `activeInlineSession` 是 page 级 transient state
- 但 API 组织为 `dataView.inlineSession`

这已经是当前约束下最简单、同时长期命名和职责也最正确的方案。
