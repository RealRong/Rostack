# Dataview Table CurrentView 长期最优重构方案

本文只回答一个问题：

在 `engine -> runtime source -> runtime/model -> react table` 这条链已经切到 `snapshot + delta`、并且 public `source.active.state` 已经不再是目标合同的前提下，
`table` 这条链里还需要的 `currentView` 到底应该放在哪里，长期最优是什么。

本文前提：

- 不在乎重构成本
- 不需要兼容
- 优先做长期最稳的边界，而不是最省改动的边界
- 如果底层模型别扭，优先改底层模型

相关上下文：

- [DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_RUNTIME_BOUNDARY_REWRITE.zh-CN.md)
- [DATAVIEW_ENGINE_IMPACT_DELTA_REWRITE.zh-CN.md](/Users/realrong/Rostack/DATAVIEW_ENGINE_IMPACT_DELTA_REWRITE.zh-CN.md)
- 当前 runtime source contract：
  - [contracts.ts](/Users/realrong/Rostack/dataview/packages/dataview-runtime/src/source/contracts.ts)
- 当前 table 侧临时 currentView 组装：
  - [currentView.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/currentView.ts)
- 当前 table 消费面：
  - [controller.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/controller.ts)
  - [gridSelection.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/gridSelection.ts)
  - [usePointer.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/hooks/usePointer.ts)
  - [input.ts](/Users/realrong/Rostack/dataview/packages/dataview-react/src/views/table/input.ts)

---

## 1. 先给结论

结论有三条。

### 1.1 `react` 自己拼 `currentView` 不是长期最优

它是一次有边界的局部解法，不是最终 owner。

它解决的是：

- public `source.active.state` 已经不想保留
- 但 `table` 这条旧链还大量直接依赖 `ViewState`

所以临时在 `react/table` 内部把细粒度 source 重新拼回一个 `currentView`，
可以快速把 public 边界和旧消费面解耦开。

这一步是有效的，但不是长期最优。

### 1.2 长期最优 owner 不是 `react`，而是 `runtime`

真正长期最稳的职责切法仍然是：

- `engine` 负责算 snapshot / delta
- `runtime` 负责把 snapshot / delta 宿主成 source 和 feature runtime
- `react` 只消费 runtime 暴露的 source / model / feature runtime

所以：

> 如果 table 还需要组合态，它应该由 `dataview-runtime` 持有，而不是在 `dataview-react` 的 `TableProvider` 里临时再拼一遍。

### 1.3 长期最优甚至不应该继续复活完整 `ViewState`

这点最关键。

当前 `react` 侧拼出来的 `currentView`，
本质上是在 public `source.active.state` 被拿掉以后，又在 UI 层把 `ViewState` 这整个 bundle 复活了一次。

这比保留 public `active.state` 好，
因为它至少没有把 bundle store 继续公开成 public contract。

但从长期看，最优解不是“把 owner 从 public source 挪到 react”，
而是：

> 直接把 table 对 `ViewState` 这个整包形状的依赖拆掉。

最终 table 应该只依赖自己真正需要的几组 domain，
而不是继续围绕一个 engine snapshot bundle 去设计运行时。

---

## 2. 为什么这次会在 react 里先拼 `currentView`

这次这么做，不是因为这是最优设计，而是因为它是一个切断 public 逃生口时成本最低、风险最可控的局部桥接。

原因很简单：

1. `source.active.state` 必须删
2. public source 已经补齐了：
   - `view`
   - `meta`
   - `records`
   - `fields`
   - `sections`
   - `items`
   - `summaries`
3. 但 table 这条链还大量吃 `ViewState`

当前 `table` 消费面依赖的内容其实很分散：

- `gridSelection` 只要 `items + fields`
- `fill` 只要 `items + fields`
- `input` 只要 `items + fields`
- `row reorder` 要 `items + sections`
- `openCell` 要 `view.id`
- `capabilities` 要 `view.sort/group`
- `pointer` 要 `items + fields + item->record`
- `create record block` 要 `view.id + fields + items`

也就是说，真正的问题不是“table 必须要整包 `ViewState`”，
而是“table 现有接口历史上是按 `ViewState` 一整包写出来的”。

在这种前提下，
先在 `react` 内部局部拼一个 `currentView`，
可以把这次 rewrite 控制在：

- 不恢复 public `active.state`
- 不重新污染 `runtime source` 合同
- 不一次性重写整个 table 运行时签名

所以它是合理的过渡手段。

但它仍然只是：

> 用局部桥接换取 public 边界收紧。

不是最终模型。

---

## 3. 这是不是局部解决问题

是。

而且应该明确承认这点。

这次 `react/table/currentView.ts` 的性质是：

- 不是 public contract
- 不是 engine contract
- 不是 runtime source contract
- 是 table 旧消费面和新 source 边界之间的局部兼容适配层

它的价值在于：

- 把“删掉 `source.active.state`”这件事先做成
- 把影响面限制在 table feature 内部
- 不把 bundle store 再放回 public API

但它的问题也很明显：

### 3.1 owner 放错层了

`react` 本应是消费层。

现在却在 `react` 里做了一层 source -> composite runtime 的再投影，
这已经开始侵入 runtime 的职责。

### 3.2 复活了被刻意删除的 bundle 语言

public source 明明已经拆成 artifact source，
结果 table 内部又把它们重新拼回 `ViewState`。

这会让 `ViewState` 继续作为“隐性 feature contract”活下去。

### 3.3 容易让 feature 层继续偷懒

只要 `currentView` 还在，后续 table 代码就很容易继续新增：

- `currentView.xxx`
- `currentView.yyy`

最后就会变成：

- public `active.state` 虽然没了
- 但 feature 内部仍然围着一个 bundle 继续长

这不是长期收敛方向。

---

## 4. 整条链重新过一遍，长期最优怎么切

现在把整条链从头到尾重新定一遍。

## 4.1 engine

`engine` 的职责已经很清楚：

- commit
- derive
- publish
- 产出 `snapshot`
- 产出 artifact-shaped `delta`

`engine` 到这里就应该停住。

`engine` 不应该知道：

- `store`
- `source`
- `currentView`
- `table controller`
- `react feature runtime`

一句话：

> `engine` 负责算真相，不负责为 table 组 bundle。

## 4.2 runtime source

`runtime source` 的职责也很清楚：

- 基于 `snapshot + delta` 宿主出细粒度 store
- 提供 artifact-level source

最终 public source 应稳定停在：

- `view`
- `meta`
- `records`
- `fields`
- `sections`
- `items`
- `summaries`

这里不应该再放回：

- `active.state`
- `currentView`
- feature bundle

一句话：

> `runtime source` 是 published artifact host，不是 feature bundle host。

## 4.3 runtime feature layer

真正缺的，是这层。

也就是：

- 基于细粒度 source
- 为特定 feature 组装 feature-local runtime / derived store
- 但这些组合态不进入 public `source` 合同

table 的 `currentView` 问题，本质上就属于这里。

长期最优的 owner 应该是：

- `dataview-runtime` 的 table feature runtime

而不是：

- public `source.active.state`
- `react` 里的临时 provider 组装

一句话：

> 组合态应该存在，但它应该是 runtime feature 内部产物，不是 public source，也不是 react 自己临时拼。

## 4.4 react

`react` 应该只负责：

- 订阅 runtime source
- 订阅 runtime model
- 订阅 runtime feature runtime
- 做 DOM / pointer / keyboard / virtual / render

不应该在 `TableProvider` 里再承担一层 source -> feature runtime 的 owner 角色。

这一步长期看一定要收回去。

---

## 5. 长期最优不是“runtime 里放一个一模一样的 currentView”

这一点要说清楚。

如果只是把现在 `react/currentView.ts` 原封不动搬到 `dataview-runtime`，
它会比放在 `react` 好，
但还不是最优。

因为这样做只是把 owner 挪对了，
没有解决底层模型仍然别扭的问题：

- table 仍然依赖整包 `ViewState`
- feature 仍然围绕 engine snapshot bundle 写
- `ViewState` 仍然作为隐形 contract 存在

所以长期最优不能停在：

- “runtime 里有个 `currentViewStore`”

而应该继续往下收敛成：

- “table 只依赖 table 自己真正需要的 domain”

---

## 6. table 真正需要的 domain 到底是什么

把现有消费面收敛一下，table 真正依赖的是下面几类东西。

## 6.1 GridDomain

用途：

- grid selection
- keyboard move
- fill handle
- pointer hit

真正需要的只有：

- 行域
- 列域

也就是今天的：

- `items`
- `fields`

这块根本不需要整包 `ViewState`。

## 6.2 ViewContext

用途：

- open cell 里的 `viewId`
- capability 里的 sort/group 判断
- query/filter UI 定位
- column 菜单里的当前 query 信息

真正需要的是：

- `view`
- `query`
- `table`

也不需要整包 `ViewState`。

## 6.3 SectionContext

用途：

- row reorder
- create record block
- section footer/header
- grouped table 结构

真正需要的是：

- `sections`
- `item -> section`

也不需要整包 `ViewState`。

## 6.4 RecordLookup

用途：

- row/cell 里从 `itemId` 找 `recordId`

真正需要的是：

- `item -> record`

也不需要整包 `ViewState`。

所以 table 现在对 `ViewState` 的依赖，
不是因为业务真的需要一个整包对象，
而只是因为历史上接口签名太宽。

---

## 7. 最终最优方案

长期最优方案可以直接固定成下面四条。

### 7.1 public source 不恢复 `active.state`

这是已经明确过的，不应该回头。

### 7.2 `react` 不再 owner `currentView`

`react/table/currentView.ts` 这种组装不应成为长期常驻实现。

### 7.3 在 `runtime` 新增 table feature runtime

这层专门负责：

- 从 `active source` 组 table 需要的 feature runtime
- 只服务 table feature
- 不进入 public `source` contract

### 7.4 table controller/runtime 改成吃 domain，不吃 `ViewState`

这是最终最优的关键。

最终目标不是保留一个 runtime-owned `currentView`，
而是把 table 侧输入从：

- `ReadStore<ViewState | undefined>`

改成几组更窄的 domain 输入。

---

## 8. 最终建议的 API 形状

如果只追求长期最优，不考虑兼容，建议 table runtime 最终直接收敛成下面这种形状。

```ts
export interface TableGridDomain {
  items: ItemList
  fields: FieldList
}

export interface TableViewContext {
  view: View
  query: ActiveViewQuery
  table: ActiveViewTable
}

export interface TableSectionContext {
  sections: SectionList
}

export interface TableRecordAccess {
  recordId: (itemId: ItemId) => RecordId | undefined
  sectionKey: (itemId: ItemId) => SectionKey | undefined
}

export interface TableRuntime {
  grid: ReadStore<TableGridDomain | undefined>
  view: ReadStore<TableViewContext | undefined>
  sections: ReadStore<TableSectionContext | undefined>
  record: TableRecordAccess
}
```

这里有两个关键点。

### 1. 仍然允许 runtime 做组合

因为 table 的确需要比 public source 更方便消费的 feature runtime。

### 2. 但不再复活完整 `ViewState`

这一步才是真正把底层模型收紧。

---

## 9. 如果只允许保留一个中间形态，应该选哪个

如果现实里不想一次把 table 全部接口拆完，
那也不建议长期保留 `react` 侧 `currentView`。

唯一还能接受的中间形态是：

1. 把 `currentView` owner 从 `react` 挪到 `runtime`
2. 明确标成 table feature internal runtime
3. 后续继续把 table controller/runtime 从 `ViewState` 迁到窄 domain

也就是说：

- `react currentView` 是临时桥
- `runtime currentView` 只能算过渡 owner
- `domain-oriented table runtime` 才是最终形态

---

## 10. 对这次实现的判断

这次把 `currentView` 先拼在 `react` 里，结论应该明确写死：

### 对

- 它没有把 `active.state` 放回 public source
- 它把影响面限制在 table feature 内部
- 它让 `delta rewrite` 和 `public source 收紧` 可以先闭环

### 不对的地方

- owner 放在了消费层
- 继续复活了 `ViewState` bundle
- 容易让 table 继续围绕 bundle 写代码

所以它是：

> 一个合理的局部桥接，不是长期最优方案。

---

## 11. 最终建议

如果只谈长期最优，不谈迁移成本，建议固定成下面这个顺序。

1. 保持现在的 public `delta + source` 边界，不回退
2. 删除 `react` 里的 `currentView` owner
3. 在 `dataview-runtime` 内新增 table feature runtime
4. table controller/runtime 改成消费窄 domain，而不是 `ViewState`
5. 最终删除所有 feature 内部“复活完整 `ViewState`”的桥接实现

一句话收敛：

> 真正长期最优不是“把 `currentView` 放到哪一层”，而是“不要再让 table 继续依赖完整 `ViewState`”；在过渡期如果必须有 owner，这个 owner 也应该是 `runtime`，不是 `react`。
