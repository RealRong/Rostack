# DATAVIEW Remaining Long-Term Model Rewrite

## 1. 结论

做完前几轮 `delta`、runtime 边界、`filter/sort stable id` 之后，`dataview` 里还值得继续动“底层模型”的点，已经不多了。

如果目标是长期最优，而且明确：

- 不考虑兼容
- 不保留过渡 API
- 只要底层模型别扭就直接重写

那么下一轮真正值得做、而且属于同一类“底层建模不对”的问题，只剩三件：

1. `ViewGroup.field` 还在用旧命名，和 engine/runtime/public projection 的 `fieldId` 语言不一致。
2. `group.buckets` / `SectionKey` 还在把“bucket identity”“section identity”“持久化 bucket state key”三种语义压进同一个 `string`。
3. `View` 还不是按 `type` 判别的 union，`ViewOptions` 仍然是一个总包对象，导致整条链反复写 `view.type === ... ? ... : ...`。

除此之外，还有一类次一级问题：

4. runtime page/table 等 UI model 里，仍然有少量整包 `View` snapshot 继续往 React 暴露。

但第四类问题不是现在最核心的底层模型问题。  
它的优先级低于前面三件，因为它更多是 runtime read model 收口问题，不是 document model 本身错误。

这份文档的最终判断是：

- `display / orders / calc` 不属于和 `filter/sort` 同等级别的错误建模。
- `engine.views.* / fields.* / records.* / active.* / history.*` 继续对 React 可见，不是问题核心。
- 下一轮真正该动的，是 `group / bucket / section / typed view` 这四个边界。

## 2. 哪些东西已经是对的，不需要再发明一轮重构

## 2.1 `filter / sort` 现在的方向已经对了

这轮之前最别扭的地方，是：

- 没有稳定 id
- mutation target 靠 index
- UI route / React key / engine API 语言不统一

这类问题现在已经被收敛到了正确方向：

- rule 有稳定 `id`
- public API 以 rule 自身为 target
- 底层是 `EntityTable + order`

所以 `filter / sort` 这类“可编辑、有序、长期存在、需要 identity 的实体数组”，底层模型已经对了。

## 2.2 `EntityTable + order` 不是问题，反而是正确方向

不要把所有对象都往 `EntityTable` 上套。  
`EntityTable` 适合的是：

- 可编辑
- 有 identity
- 有顺序
- 需要局部 patch / move / remove

所以：

- `filter.rules`
- `sort.rules`
- `views`
- `records`
- `fields`

这些用 `EntityTable` 是对的。

但 `group.buckets` 不是同一类东西。  
它不是“用户维护的一组 bucket 实体”，而是“按分组策略派生出来的 bucket 状态表”。  
它真正的问题不是没做成 `EntityTable`，而是 identity 和 section 语义混在一起了。

## 2.3 React 可以直接调 engine 命令，不需要强行藏起来

这件事前面已经收敛过，不需要再回头。

长期最优不是：

- React 不能碰 `engine`

而是：

- React 不要自己跨 `source / session / workflow` 拼复杂流程

所以这轮不应该再把精力花在“把 engine API 全包进 runtime intent”上。

## 3. 剩下真正别扭、而且会反复解释的问题

## 3.1 `ViewGroup.field` 仍然是一个命名层级断裂

当前状态已经出现明显不一致：

- document/core state 用的是 `group.field`
- engine public projection 用的是 `group.fieldId`
- runtime / React 里有的地方读 `field`，有的地方读 `fieldId`

这不是表面命名问题，而是公共语言已经裂开了。

只要底层持久化模型还保留 `field`，就会一直出现：

- projection 要改名
- runtime 要来回翻译
- React 某些地方用旧字段，某些地方用新字段

这和之前 `filter/sort` 的问题是同一类：

- public 语言已经朝正确方向走了
- document model 还停在旧词汇

长期最优里，这件事不应该继续兼容。

最终应该统一成：

```ts
export interface ViewGroup {
  fieldId: FieldId
  mode: string
  bucketSort: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
  buckets?: Readonly<Record<ViewGroupBucketId, BucketState>>
}
```

也就是说：

- `field` 直接删掉
- 全链路统一只保留 `fieldId`

## 3.2 `bucket` 和 `section` 现在是同一个字符串，语义混了

这是当前剩余问题里最别扭、也最容易在实现里不断长补丁的一点。

现在一段 `string` 同时承担了三种角色：

1. 分组算法产出的 bucket key
2. runtime/engine 里的 section key
3. `view.group.buckets` 里的持久化状态 key

这会带来三个长期问题。

### 3.2.1 派生值和 UI identity 没被区分

`SectionKey` 现在看起来像 UI section 的 identity，  
但它实际又被当成 domain bucket key 使用。

例如：

- `Section.key`
- `ItemPlacement.sectionKey`
- `MoveTarget.section`
- `group.buckets[sectionKey]`
- `groupWriteValue(..., toKey)`

这说明：

- UI section identity
- bucket identity
- 对应 field value 的写回 target

全被压成了一个词。

### 3.2.2 对日期 / 范围 / 空桶 / category 这类 bucket 特别别扭

现在很多 field kind 都在自己约定 bucket key 的字符串编码：

- `range:start:interval`
- 日期 bucket key
- status category key
- 空桶 key

这意味着：

- key 既是 identity
- 又承担了编码后的业务值
- 还顺手被拿去当持久化 bucket state key

这种模型短期能跑，长期会让下面几件事都变得不清楚：

- section 是否允许有自己的 UI identity
- bucket 是否允许以后切换编码方式
- bucket state 到底绑定的是“bucket 本身”还是“当前 section 实例”

### 3.2.3 drag / move / collapse / summary 目标语言会一直混

只要 section 和 bucket 还是同一个字符串，下面这些 API 的职责就会一直不够清楚：

- item placement 到底记录的是“在哪个 section”还是“属于哪个 bucket”
- move target 到底是“UI section target”还是“分组写回 target”
- summary 到底按 section 聚合还是按 bucket 聚合

长期最优必须把这两个概念拆开。

## 4. `group / bucket / section` 的最终模型

这部分建议直接一步到位，不保留旧命名。

## 4.1 section 用 `id`，bucket 也用 `id`，但两者是不同类型

最终应该明确区分：

```ts
export type SectionId = string & {
  readonly __brand: 'SectionId'
}

export type ViewGroupBucketId = string & {
  readonly __brand: 'ViewGroupBucketId'
}
```

然后 engine shared contract 改成：

```ts
export interface SectionBucket {
  id: ViewGroupBucketId
  label: Token
  value: unknown
  clearValue?: unknown
  empty?: boolean
  color?: string
}

export interface Section {
  id: SectionId
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  itemIds: readonly ItemId[]
}

export interface ItemPlacement {
  recordId: RecordId
  sectionId: SectionId
}

export interface MoveTarget {
  sectionId: SectionId
  before?: ItemId
}
```

这一步最关键的收益不是运行时行为变化，而是：

- public 语言终于变清楚了
- section 是 section
- bucket 是 bucket

是否让当前实现里大多数 `section.id === section.bucket?.id`，是实现细节，不再属于类型契约的一部分。

## 4.2 `ViewGroup.buckets` 只按 bucket id 存状态

持久化模型应该明确只绑定 bucket 自身状态：

```ts
export interface BucketState {
  hidden?: boolean
  collapsed?: boolean
}

export interface ViewGroup {
  fieldId: FieldId
  mode: string
  bucketSort: BucketSort
  bucketInterval?: number
  showEmpty?: boolean
  buckets?: Readonly<Record<ViewGroupBucketId, BucketState>>
}
```

这代表：

- document 里存的是 bucket state
- 不是 section state

换句话说，document 不再承诺：

- 某个 runtime section id 永久稳定
- 某个 section id 一定等于 bucket key

它只承诺：

- 某个 bucket id 的隐藏/折叠状态

## 4.3 group write / read 都不再使用裸字符串语义

和上面一起，所有这类 API 都应该同步收紧：

- `groupWriteValue(..., toKey)` 改成明确的 bucket id 输入
- `SectionBucket.key` 改成 `SectionBucket.id`
- `Section.key` 改成 `Section.id`
- `SectionKey` 整个删掉，统一用 `SectionId`

也就是说，长期最优里不该再出现这种命名：

- `key`
- `sectionKey`
- `toKey`
- `fromKey`

如果语义是 identity，就叫 `id`。  
如果语义是 field value，就叫 `value`。  
如果语义是 bucket target，就叫 `bucketId`。

## 4.4 这一层不建议再引入额外中间模型

这里最稳的做法不是再发明一层“bucket handle / section handle / encoded key wrapper”。

真正要做的是：

- 直接在现有 public contract 上把名字和类型拆对
- 让 `publish section`、`group state`、`group write` 三条链说同一种语言

这样复杂度最低，也最不容易继续长兼容胶水。

## 5. `View` 应该改成按 `type` 判别的 union

这是剩余问题里的第三个核心点。

当前 `ViewOptions` 还是：

```ts
export interface ViewOptions {
  table: TableOptions
  gallery: GalleryOptions
  kanban: KanbanOptions
}
```

也就是说，一个 `View` 无论实际是不是 table，都永远带着：

- `options.table`
- `options.gallery`
- `options.kanban`

这会让整条链都不断重复下面这种代码：

```ts
view.type === 'gallery'
  ? view.options.gallery
  : view.options.kanban
```

或者：

```ts
if (view.type !== 'table') {
  return undefined
}
```

这说明问题不在组件写法，而在底层模型。

## 5.1 最终应该只有一种 `View` 语言

长期最优建议直接改成：

```ts
export interface ViewBase {
  id: ViewId
  name: string
  search: Search
  filter: Filter
  sort: Sort
  calc: ViewCalc
  display: ViewDisplay
  orders: RecordId[]
}

export interface TableView extends ViewBase {
  type: 'table'
  options: TableOptions
}

export interface GalleryView extends ViewBase {
  type: 'gallery'
  options: GalleryOptions
  group?: ViewGroup
}

export interface KanbanView extends ViewBase {
  type: 'kanban'
  options: KanbanOptions
  group: ViewGroup
}

export type View =
  | TableView
  | GalleryView
  | KanbanView
```

这个定义里最重要的不是字段多少，而是：

- `options` 不再是总包对象
- layout-specific invariant 进入具体分支
- `type` 真正变成类型系统里的判别条件

## 5.2 为什么 `KanbanView.group` 应该直接变成必填

当前 planner 实际已经在做这件事：

- `kanban` 没有 group 时会补默认 group

这说明从语义上看：

- `kanban` 本来就不是“可选 group”
- 而是“必须有 group，只是旧模型还没表达出来”

既然目标是不留兼容，长期最优就不该继续把这个 invariant 放在运行时修补。

所以最终更稳的做法是：

- `KanbanView.group` 直接必填

如果未来 `gallery` 也被证明语义上必须分组，再继续往具体分支里收紧。  
但当前至少应先把 `options` bag 删除。

## 5.3 这样可以直接删除一整类重复函数和判断

一旦 `View` 是 union，很多当前重复存在的判断都可以自然消失：

- `readTableView(active)`
- 到处 `if (view.type !== 'table') return undefined`
- React 里各种 `view.type === 'gallery' ? ... : ...`
- planner / publish / runtime 里反复从 `view.type` 推导哪个 `options` 分支有效

也就是说，这不是“类型更好看一点”，而是：

- 直接减少重复分支
- 让函数签名更短
- 让 runtime/model 更容易按 layout 拆清楚

## 6. runtime 里还剩下的整包 `View` 暴露，属于后续收口项

这一点存在，但不应该和前三项混成同一优先级。

当前 page/table model 里仍然有一些：

- `activeView?: View`
- `views: readonly View[]`

这类暴露的主要问题是：

- React 仍然容易直接读整包 snapshot
- 某些 page model 在重复输出 engine 已经 publish 过的信息

但它没有前面三件那样“公共语言天然错误”。

更准确的判断是：

- 如果前三项不改，这些 model 就算再收口，也还是会继续背着旧的 `field / key / options bag`
- 如果前三项先改，runtime read model 的收口会自然变得简单很多

所以这里更适合放在第三项完成之后，作为一轮“read model 收边”清理，而不是本轮主轴。

## 7. 最终实施顺序

如果以“长期最优、一步到位、不留兼容”为目标，建议顺序如下。

## 7.1 第一阶段：先改 `ViewGroup` 语言

直接全链路统一：

- `group.field` -> `group.fieldId`

涉及：

- core state
- group state/write/read
- engine publish/query
- runtime model
- React settings/query UI

这一阶段的目标只有一个：

- `group` 再也不出现 `field`

## 7.2 第二阶段：拆 `bucketId` 和 `sectionId`

直接一起完成：

- `SectionKey` 删除
- `Section.key` -> `Section.id`
- `SectionBucket.key` -> `SectionBucket.id`
- `ItemPlacement.sectionKey` -> `sectionId`
- `MoveTarget.section` -> `sectionId`
- `group.buckets` 改成按 `ViewGroupBucketId` keyed

这一阶段做完之后，`group / section / move / summary` 的语言会第一次真正统一。

## 7.3 第三阶段：把 `View` 改成 typed union

直接删除：

- `ViewOptions` 总包对象

改成：

- `TableView.options: TableOptions`
- `GalleryView.options: GalleryOptions`
- `KanbanView.options: KanbanOptions`

并把已知 invariant 收进分支：

- `KanbanView.group: ViewGroup`

这一阶段收益最大的是：

- 删除一整类 `view.type` + `options.xxx` 的噪音代码

## 7.4 第四阶段：再做 runtime read model 收口

前三项完成之后，再看 page/table/gallery/kanban model：

- 哪些还在暴露整包 `View`
- 哪些只是为了历史兼容多输出了一层 snapshot
- 哪些可以直接改成更小的 layout-specific projection

这时再收口，成本最低，也最不容易反复改。

## 8. 明确不建议这轮去做的事

为了避免目标发散，这里也明确几件“不建议混进这一轮”的事。

## 8.1 不要把这轮做成“大规模目录重排”

目录和文件数只有在：

- 它阻碍了上面三项模型收敛

时才值得顺手处理。  
否则先改类型和 public 语言，收益更直接。

## 8.2 不要为了“更抽象”再加一层中间抽象

这轮的重点不是再发明：

- adapter
- descriptor
- normalized wrapper
- compatibility mapper

而是：

- 直接把底层 contract 改对

## 8.3 不要把 `display / orders / calc` 误判成同等级问题

这些部分当然也还能继续整理，  
但它们没有：

- 命名裂开
- identity 混乱
- 类型判别失败

这种根层错误。

所以优先级明显低于：

- `group.fieldId`
- `bucketId / sectionId`
- typed `View`

## 9. 最终判断

如果只问一句：

“`dataview` 现在还有没有像 `filter/sort` 一样，属于底层模型别扭、会导致整条链反复解释的问题？”

我的判断是：有，但已经只剩三类，而且非常集中。

真正该继续重写的就是：

1. `ViewGroup.field` 的旧命名
2. `bucket` 与 `section` 的 identity 混用
3. `ViewOptions` 总包导致的非判别式 `View`

这三件做完，`dataview-engine` 和 `dataview-runtime` 的公共语言才算真的稳定下来。  
如果再往后看，剩下更多就是实现整理和 read model 收口，而不再是底层模型本身不正确。
