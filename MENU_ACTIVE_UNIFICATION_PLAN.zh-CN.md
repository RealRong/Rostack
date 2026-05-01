# Menu Active / Reorder 一体化长期方案

## 目标

本文定义 `Menu` 的长期最优形态，目标不是修某一个 option picker，而是把整套菜单/选择器行为收成一套简单、统一、可复用的模型。

重点解决：

- 普通菜单和 reorder 菜单现在是两套组件语义
- active item 的默认策略散落在业务层
- picker 想要“输入后默认选第一项”时，要么自己管 active，要么临时猜测
- 空查询 / 有查询 / create item / reorder item 的行为不统一

最终目标：

- `Menu` 只有一个核心组件模型
- reorder 只是 `Menu` 的一个小变种，不再是另一套组件心智
- active 由 `Menu` 内部管理
- 业务层只传“列表数据”和“默认 active 策略”
- 字段和命名尽量简单，不引入复杂协议

---

## 结论

长期最优方案是：

- **不要让业务层受控 `activeKey`**
- **让 `Menu` 自己管理 active**
- **让业务层只提供简单的默认 active 策略**
- **把 reorder 收成 `Menu` 的一个 `reorder` 模式，而不是 `Menu.Reorder` 第二组件**

一句话：

- **业务层提供 items 和默认落点，Menu 自己处理导航。**

---

## 为什么不建议业务层受控 active

如果让 option picker / 各种 editor controller 去持有 `activeKey`，会有几个长期问题：

- 每个 picker 都要重复实现上下移动、首尾跳转、hover 切换、滚动跟随
- `Enter` 提交逻辑会散落到业务层
- `Menu` 会退化成纯视图壳，失去交互复用价值
- reorder、submenu、鼠标 hover、键盘切换等能力会越来越难统一

这条路短期能修 bug，但长期一定越来越绕。

所以最终原则应当是：

- `Menu` 内部管理 active
- `Menu` 暴露简单 handle
- 业务层不持有 active 状态本身

---

## 为什么也不能是“只传 items，Menu 盲管”

如果 `Menu` 完全只看当前 items，而不接收任何 active 默认策略，也不够。

因为业务层确实知道一些语义，`Menu` 不知道：

- 空 query 时应该默认落到第一项
- 有 query 时应该默认落到第一条匹配项
- 没有匹配但能创建时应该默认落到 `create` 项
- 如果当前 active 项已经不在新列表里，应该怎么重置

这些不是业务层自己去管 active，而是业务层告诉 `Menu`：

- “items 改变后，默认应该落到哪一类 item”

所以长期最优不是：

- 业务层受控 active

也不是：

- `Menu` 完全盲管

而是：

- **业务层给简单 active policy**
- **`Menu` 根据 policy 自己管 active**

---

## 最终组件形态

## 1. 只保留一个 `Menu`

不要长期保留：

- `Menu`
- `Menu.Reorder`

这两套并列组件。

应统一成一个：

- `Menu`

然后用很少的 props 切换能力。

例如概念上应收敛到：

```tsx
<Menu
  items={items}
  active={...}
  reorder={...}
/>
```

不是字面 API 必须长这样，但心智必须是：

- reorder 是菜单能力，不是第二套组件

## 2. reorder 只是一个模式

建议把 reorder 做成一个简单 prop，例如：

- `reorder`
- 或 `mode: 'normal' | 'reorder'`

更推荐第一种，因为简单：

- `reorder?: (input) => void`

没有 reorder 时，就是普通 menu。
有 reorder 时，就是支持拖拽/重排 handle 的 menu，也就直接进入 reorder 模式。

这样更自然，也更符合“reorder 只是变体”的目标。

---

## 最简 API 方案

下面是我认为长期最优、同时字段最少的一版。

## `Menu` 输入

### 1. `items`

```ts
items: readonly MenuItem[]
```

菜单唯一数据源。

每个 item 必须有稳定 `key`。

### 2. `defaultActive`

```ts
defaultActive?: MenuActiveDefault
```

这是最关键的新增字段。

它只表达：

- 当 items 建立或变化时，active 默认落到哪

不表达运行时 active 状态本身。

推荐定义尽量简单：

```ts
type MenuActiveDefault =
  | 'first'
  | 'last'
  | 'preserve'
  | 'preserve-or-first'
  | { key: string }
  | ((items: readonly MenuItem[], currentKey: string | null) => string | null)
```

其中长期最常用的其实只有两个：

- `'first'`
- `'preserve-or-first'`

函数版本只是最后兜底，不鼓励日常滥用。

### 3. `reorder`

```ts
reorder?: (input: {
  key: string
  before?: string
}) => void
```

这就够了。

有 `reorder`：

- item 显示 reorder handle
- menu 启用 reorder 交互
- `reorder` 本身就是 move 回调，不再包一层对象
- 是否处于 reorder 模式，由 `reorder` 是否存在直接决定

没有 `reorder`：

- 普通 menu

这里不再保留 `handleLabel`。

原因是：

- reorder handle 的文案不应变成业务层协议
- `Menu` 既然承接 reorder 模式，就应该自己统一可访问性文案
- 否则只是把第二套实现从组件层挪到了 prop 层

最终约束应是：

- 业务层只提供 `reorder({ key, before })`
- `Menu` 内部根据 item 自身 label / text / aria 信息生成 handle label
- 如果 item 缺少必要文本，再由 `MenuItem` 基础结构补齐，而不是给 reorder 单独开口

不需要第二个 `Menu.Reorder` 组件。

### 4. `value`

保留当前已有语义：

```ts
value?: string | readonly string[]
selectionMode?: 'single' | 'multiple'
```

这跟 active 是不同层的概念：

- `value` 是“已选值”
- `active` 是“键盘当前焦点项”

必须继续分离。

---

## `Menu` 内部状态

`Menu` 自己维护：

```ts
activeKey: string | null
```

只在内部存在。

不对业务层暴露受控 prop。

业务层最多通过 handle 读：

- 当前 active 是谁

但不直接控制它。

---

## `Menu` handle

为了支持 picker 的键盘宿主，`Menu` 应统一暴露一个简单 handle：

```ts
type MenuMove = 'next' | 'prev' | 'first' | 'last'

interface MenuHandle {
  move(mode: MenuMove): void
  getActiveKey(): string | null
}
```

这套 handle：

- 普通 menu 有
- reorder 模式下也有

这点必须统一，不能再出现：

- `Menu` 有 handle
- `Menu.Reorder` 没同语义 handle

否则空 query / 有 query 两种渲染模式永远会出同类 bug。

---

## active 默认策略的实际语义

这里要定得很明确，避免每个业务层自己理解。

## 1. `'first'`

items 一建立或重建，就 active 第一项。

适合：

- option picker 的过滤结果
- 命令菜单
- 搜索结果列表

## 2. `'preserve'`

如果当前 active key 还在新 items 里，就保留；否则清空。

适合：

- 某些不希望自动跳项的面板

## 3. `'preserve-or-first'`

如果当前 active key 还在新 items 里，就保留；否则落到第一项。

这是最通用、也最推荐的默认值。

适合：

- 大多数带搜索的选择器

## 4. `{ key }`

强制落到某个稳定 key。

适合：

- 某些有“固定默认项”的菜单

## 5. 函数版

```ts
(items, currentKey) => nextKey
```

只给少数复杂业务使用。

例如 option picker 想表达：

- 有 query 时优先第一条已有 option
- 没有已有 option 但能创建时，落到 `CREATE_OPTION_KEY`

这时业务层可以简单返回对应 key，但 `Menu` 仍然是 active 的持有者。

---

## Option Picker 的长期最优用法

这次问题最典型，所以直接给出目标形态。

## 输入为空

业务层传：

- `items = 全部已有 options`
- `defaultActive = 'preserve-or-first'`
- `reorder = ({ key, before }) => { ... }`

结果：

- 下方向上/向下能立即导航
- 默认 active 第一项
- 同一套 `MenuHandle` 生效

## 输入非空

业务层传：

- `items = filtered options + create item`
- `defaultActive = resolveDefaultKey`

其中 `resolveDefaultKey` 规则应当是：

1. 如果有过滤结果，落到第一个已有 option
2. 否则如果有 create item，落到 `CREATE_OPTION_KEY`
3. 否则 `null`

这就能满足你要的行为：

- 输入字符后，自动选中符合条件的第一个已有 option
- 没有已有 option 时，自动选中 “创建 xxx”

注意：

- 这里仍然不是业务层自己持有 `activeKey`
- 只是业务层告诉 `Menu` 默认 key 应该是谁

---

## `Menu` 自己应承担的行为

这部分必须全部沉到 `Menu`，不要再让业务层各做各的。

`Menu` 应统一负责：

- active item 内部状态
- `ArrowUp` / `ArrowDown`
- `Home` / `End`
- hover 是否切 active
- active item 自动滚动到可见区域
- items 重建时应用 `defaultActive`
- active item 被删除时如何回退
- reorder 模式下 active 项与拖拽 handle 的协调

业务层不应该再重复实现这些。

---

## `Menu` 不应该承担的行为

这些仍然应由业务层决定：

- items 的过滤规则
- create item 是否出现
- create item 的 key 是什么
- 已选值 `value`
- commit 时 active key 对应的业务动作

也就是说：

- `Menu` 管 active
- 业务层管 item 语义

---

## 命名建议

目标是简单清晰，不引入太多词。

推荐保留以下几个名字：

- `items`
- `value`
- `selectionMode`
- `defaultActive`
- `reorder`
- `MenuMove`
- `MenuHandle`
- `move`
- `getActiveKey`

不推荐引入过重命名：

- `activeController`
- `navigationState`
- `selectionCoordinator`
- `activeResolutionPolicy`
- `virtualFocusManager`

这些都太重。

`defaultActive` 已经足够表达这个能力。

---

## 为什么 `defaultActive` 比 `activeKey` 受控更好

因为它刚好落在职责边界上：

- 业务层知道“默认应该落到谁”
- `Menu` 知道“之后怎么导航和维护”

这正好把两边责任切开。

如果用受控 `activeKey`：

- 业务层责任过重

如果完全没有 `defaultActive`：

- `Menu` 又太盲

所以 `defaultActive` 是最小、最稳、长期最优的接口。

---

## 推荐的最终演进方向

1. 停止新增 `Menu.Reorder` 这类平行组件语义。
2. 把 reorder 收成 `Menu` 的一个 prop。
3. 给 `Menu` 增加 `defaultActive`。
4. 统一 `Menu` 和 reorder 模式下的 `MenuHandle`。
5. option picker、status picker、命令菜单等都复用这套 active 规则。

---

## 最终判断

长期最优方案不是：

- 业务层受控 `activeKey`

也不是：

- `Menu` 完全盲管 active

而是：

- **`Menu` 内部管理 active**
- **业务层只传 `items` 和 `defaultActive`**
- **reorder 是 `Menu` 的模式，不是另一套组件**

推荐一句话概括：

- **Menu 自己管怎么走，业务层只告诉它起点应该落哪。**
