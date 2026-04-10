# Dataview 剩余性能热点与长期最优方案

## 1. 目的

本文只回答当前阶段的三个问题：

1. 现在还慢在哪里
2. 哪些路径还值得继续优化
3. 如果继续按长期最优往下做，下一阶段应该怎么收

本文延续当前 dataview 重构的统一前提：

- 不保留兼容过渡
- 不保留第二套实现
- 不围绕历史实现做补丁式设计
- 优先选择长期最简单、最稳定、最好测、最好优化的结构


## 2. 当前最新 benchmark

基于 2026-04-10 最新实现，`large = 50k`，`iterations = 5`，`warmup = 2`，关键结果如下：

- `record.value.status.grouped`
  - `total = 26.442ms`
  - `index = 11.102ms`
  - `project = 4.439ms`
  - `sections = 2.736ms`
  - `nav = 0.997ms`
- `view.query.search.set`
  - `total = 4.722ms`
  - `index = 0.011ms`
  - `project = 3.691ms`
  - `query = 3.387ms`
- `view.query.sort.only`
  - `total = 19.949ms`
  - `index = 11.350ms`
  - `project = 8.466ms`
  - `query = 3.794ms`
  - `sections = 2.402ms`
  - `nav = 1.047ms`
- `view.query.group.set`
  - `total = 13.164ms`
  - `index = 6.053ms`
  - `project = 5.611ms`
  - `sections = 4.512ms`
  - `nav = 1.089ms`

结论：

- `search.set` 已经不再是结构性问题
- `nav` 已经压到低位，不再是主瓶颈
- 当前主要剩余热点集中在：
  - `sections`
  - `sort/group index`
  - `publish/store equality`
  - `document write / commit`


## 3. 已经基本解决的部分

### 3.1 search 冷启动问题已经解决

当前 `search` 已经改成：

- `recordId -> normalized search text`
- active view 常驻 search demand

这意味着：

- `view.query.search.set` 不再触发 search index 冷启动
- query 变更基本只剩 query 自身扫描和 publish 开销

继续压 `search` 只有两条路：

- 改搜索语义
- 引入更重的 substring index

在不改语义的前提下，当前收益空间已经明显变小。


### 3.2 nav 已经降到次要问题

`AppearanceList` 已经改成：

- 不再 eager 构建整张 `byId`
- 只保留 `ids / idsBySection / count`
- `Appearance` 按需解析
- 未变化项继续复用旧对象引用

现在 `nav` 在大多数关键场景下已经约 `1ms`。

继续抠 `nav` 的收益不会太高。


### 3.3 query.sort 已经不是主瓶颈

当前单字段排序已经走：

- `SortIndex.asc / desc`
- projection 单字段直通

因此：

- `query.sort` 自身已经明显变薄
- `sort.only` 剩余主要是 sort index 首建成本，而不是 projection comparator 逻辑


## 4. 当前最值得继续优化的地方

## 4.1 Sections 仍然是 projection 侧头号目标

当前 grouped 场景里，`sections` 仍然占据前排时间：

- `record.value.status.grouped`: `2.736ms`
- `view.query.group.set`: `4.512ms`
- `view.query.sort.only`: `2.402ms`

这说明 `sections` 虽然已经比旧版本轻很多，但还有几个结构性问题：

- projection 里仍然自己维护 `byRecord`
- projection 里仍然自己维护 `idsByKey`
- descriptor/domain/meta 的推导仍然晚于 index
- `toPublishedSections()` 又把 projection section 再扫一遍转成 publish section

### 长期最优方向

`sections` 应进一步收薄成：

- 只负责把 `query.visible / query.order` 映射到 section order 与 section visible ids
- 尽量不再负责 bucket descriptor 推导
- 尽量不再维护多份中间结构

### 推荐重构

1. 把 grouped descriptor 尽量前移到 `group index`
2. 单 bucket 字段不要继续常驻 `RecordId -> SectionKey[]`
3. `SectionState` 优先保留“发布直接可用”的结构，而不是先做 projection node 再二次 publish


## 4.2 Publish / Store Equality 还有重复扫描

当前 projection 已经非常强调引用复用，但 publish/store 层仍然保留深比较兜底：

- `sameSections`
- `sameAppearanceList`
- `sameFieldList`
- `sameCalculationsBySection`

这带来的问题是：

- runtime 已经努力复用对象
- store `set()` 前仍然会再次做深比较
- publish 自身也会为了“保险”再做一轮结构扫描

从 benchmark 看，这一层已经不是零成本：

- `view.query.group.set` 的 `publish` 仍有稳定成本
- `record.value.status.grouped` 的 `publish` 同样不低

### 长期最优方向

把“引用稳定”从优化策略提升成硬契约：

- runtime/projection 负责稳定复用引用
- publish 层不再兜底深比较
- store 层尽量退回 `Object.is`

这会带来两个直接收益：

- 结构更简单
- 运行时更可预测


## 4.3 Sort / Group Index 已经进入数据结构优化区

当前：

- `view.query.sort.only` 的剩余重点在 `sort index`
- `view.query.group.set` 的剩余重点在 `group index`

这和之前不一样。现在不再是“projection 算法写错”，而是 index 本身已经成为首要成本。

### sort index 当前问题

当前 `sort.only` 本质上仍然是：

- 首次为字段建立 `asc / desc`
- 做一轮 `O(n log n)` 排序

局部快路已经做了很多，但如果想继续压，已经不能只靠局部 comparator 微调。

### group index 当前问题

当前 `group.set` 已经做了常见字段快路，但 grouped 结构仍然是：

- `recordBuckets`
- `bucketRecords`

而 `sections` 还会在上层继续重建可发布结构。

### 长期最优方向

1. `sort index`
   - 如果 active view 的 sort 字段稳定，应考虑常驻预热
   - 如果要继续压 update 场景，需要真正支持增量 reposition
2. `group index`
   - 应把更多 section descriptor 信息下沉进去
   - 对单归属字段单独建轻量结构，不再一律按多 bucket 处理


## 4.4 Document Write / Commit 已经开始进入主路径

最新 benchmark 里，`record.value.status.grouped` 的总耗时不只由 index/project 决定，`commitMs` 也已经占明显比例。

这说明：

- document 写路径本身不够轻
- commit collector / inverse / history 相关成本也开始变得重要

当前问题主要在：

- document records 仍然基于 plain object spread 更新
- commit collector 仍然做较重的 delta 归纳
- history 逆操作构造仍然依赖较重 clone / readback

### 长期最优方向

1. document records table 应该朝“增量写优化”的结构演进
2. delta 应更靠近 operation 直接生成，而不是大量依赖 collector 二次总结
3. history inverse 应继续减少 readback / clone


## 5. 当前不值得优先继续抠的地方

### 5.1 nav

已经基本到位，继续优化的边际收益很小。

### 5.2 search

现在 `search.set` 已经约 `5ms`，继续优化将明显提高复杂度，但收益有限。

### 5.3 calc

当前不再是头号热点，除非 benchmark 再出现新异常，否则优先级应后移。


## 6. 长期最优实施顺序

如果继续按“不留兼容过渡”的方式推进，建议顺序如下：

### Phase 1: Sections 收薄

目标：

- 让 `sections` 不再维护多套重复中间结构
- 尽量让 grouped descriptor 前移到 `group index`
- 让 `toPublishedSections()` 尽量退化成轻量引用复用

完成标准：

- `SectionState` 更接近最终发布形态
- grouped 场景下 `sections` 成为明显更薄的一层


### Phase 2: Publish / Store Equality 收紧

目标：

- runtime 负责引用稳定
- publish/store 取消深比较兜底

完成标准：

- project store 大量回到 `Object.is`
- `sameSections / sameAppearanceList / sameFieldList / sameCalculationsBySection` 只保留 React 组合视图真正需要的地方


### Phase 3: Group Index 再下沉

目标：

- 单 bucket 字段走更轻结构
- descriptor/domain/meta 下沉到 index

完成标准：

- `group.set` 进一步下降
- `record.value.status.grouped` 的 index 与 sections 都继续变薄


### Phase 4: Sort Index 再结构化

目标：

- 把 `sort.only` 的剩余 `indexMs` 继续压缩

完成标准：

- 决定是：
  - active-view 常驻 sort index
  - 还是引入真正的增量 reposition 结构


### Phase 5: Commit / Document Write 重构

目标：

- 压缩非 projection 路径的基础写入成本

完成标准：

- `record.value.*` 场景的 `commitMs` 明显下降


## 7. 最核心的判断

当前系统已经过了“算法级错误非常明显”的阶段。

现在剩余的问题不再是：

- search index 设计完全错误
- nav eager materialization 完全错误
- calc sync 退化成灾难级复杂度

这些问题已经基本处理掉了。

当前真正的剩余复杂度集中在：

- `sections` 这一层仍在重复组装结构
- `publish/store` 仍然在深比较兜底
- `sort/group index` 已进入数据结构级优化阶段
- `commit/document write` 开始成为不可忽视的基础成本

因此，下一阶段如果还要继续做“长期最优”，最值得继续动的不是 `search` 或 `nav`，而是：

1. `sections`
2. `publish/store equality`
3. `group/sort index`
4. `commit/document write`

