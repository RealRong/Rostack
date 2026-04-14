# DATAVIEW 性能预设方案

## 目标

在 `dataview/packages/dataview-react/src/page/Page.tsx` 的页面顶部区域增加一个 `PageTitle` 入口，并通过 `shared/ui/src/button.tsx` + `shared/ui/src/menu/dropdown.tsx` 提供一组可一键生成的大数据量预设。

这套预设不是单纯为了“造很多数据”，而是同时服务两个目标：

- 性能测试：快速构造可复现的高压力场景，验证 table / gallery / kanban / query / summary / group 的性能表现。
- 产品演示：数据看起来要像真的，字段结构和内容足够有吸引力，让页面一打开就有“真实产品”的感觉，而不是一堆机械随机串。

## 核心原则

### 1. 预设应该是“场景包”，不是“记录数按钮”

每个预设不只是定义一条“生成 10000 条数据”，而是同时定义：

- 数据规模
- 字段结构
- 值分布
- 默认视图
- 默认 query 配置
- 主要压测目标
- 演示风格

也就是说，预设本质上应该是：

`DatasetPreset + ViewPreset + DemoNarrative`

### 2. 数据必须可复现

每个预设都应该用固定 seed 生成，保证：

- 同一个预设每次生成结果一致
- 优化前后性能对比有意义
- 演示时不容易出现“这次刚好随机得不好看”的问题

### 3. 数据要“像真实世界”，但不能完全依赖纯随机

不要把真实性寄托给 `faker` 的默认输出。

真正影响真实感和性能的，是这些结构性特征：

- 空值比例
- 热门值 / 长尾值分布
- 分组 bucket 的数量
- multi-select 的平均密度
- 文本长度分布
- 重复值比例
- 日期集中区间
- 数值的偏态和长尾

比起“每条 title 都像随机生成的人话”，更重要的是整体分布像真实业务数据。

## 是否需要 fakerjs

结论：**可以用，但不应该成为核心生成策略。**

推荐定位如下：

- `fakerjs` 用于补充文案素材：
  - 标题
  - 公司名
  - 人名
  - 城市
  - 产品名
  - 标签描述
- 自定义生成器负责控制数据结构和概率分布：
  - status 的权重
  - option 字段热度
  - date 分布
  - number 分布
  - 空值比例
  - 文本长度层次
  - 多选字段平均选项数

换句话说：

- `faker` 负责“看起来像真的”
- 预设模型负责“统计结构像真的”

如果完全靠 `faker` 随机拼，会有几个问题：

- 数据太均匀，不像真实产品
- 每次生成差异过大，不利于性能对比
- 搜索 / 分组 / summary / option 分布不够真实
- 演示观感容易变成“随机假数据”

## 推荐的数据生成模型

建议采用“固定 seed + 受约束的业务分布模型”的方式。

每个字段类型都定义自己的生成规则。

### Title / Text

- 80% 短标题，长度 12-28 字符
- 15% 中等长度标题，长度 30-60 字符
- 5% 很长标题，长度 80+ 字符
- 保留 10%-20% 重复标题或近似标题，模拟真实业务中的重复任务、重复项目、批量导入数据

演示上建议使用更有产品感的文本主题，而不是 lorem ipsum。

例如：

- 任务 / 项目 / Roadmap
- 客户 / 销售线索 / 合同
- 内容日历 / 活动策划 / 发布流程
- Bug / Feature request / Release checklist

### Status / Select

必须使用偏态分布，不要平均分。

示例：

- `status`
  - 55% `todo`
  - 25% `doing`
  - 15% `done`
  - 5% `blocked`
- `priority`
  - 8% `urgent`
  - 22% `high`
  - 48% `medium`
  - 22% `low`

这样更像真实数据，也更利于测试 group bucket 热点不均衡时的表现。

### MultiSelect

不要每条记录都有很多 tag。

建议分布：

- 35% 无标签
- 40% 1 个标签
- 20% 2 个标签
- 5% 3-4 个标签

标签池也不要平均使用，应该有热点和长尾：

- 热门标签：`design` / `backend` / `frontend` / `research`
- 长尾标签：`migration` / `localization` / `benchmark` / `security`

这样能更真实地测试：

- `countByOption`
- `percentByOption`
- group bucket 密度
- filter option-set

### Number

不要平均随机。

推荐做偏态分布：

- 大多数记录落在小区间
- 少数记录有极端值
- 部分记录为空

示例：

- `storyPoints`
  - 大多为 `1, 2, 3, 5, 8`
  - 少量为 `13, 21`
- `revenue`
  - 对数分布或分段加权
- `score`
  - 大多集中在 `60-90`
  - 少量极低或极高值

这样 summary 结果和排序都会更像真实使用。

### Date

不要把日期均匀撒满多年。

更真实的方式：

- 70% 集中在最近 90 天
- 20% 在未来 30 天
- 10% 很久以前或更远的未来

如果有开始结束时间：

- 多数只有开始时间
- 少数有时间范围

这会让 calendar / sort / filter 的行为更接近真实业务。

### 空值

空值非常重要，不能太少。

建议：

- 必填感强的字段：空值 5%-10%
- 普通说明字段：空值 30%-60%
- 多选 / 日期 / 数字类字段：空值 20%-45%

这对以下性能和观感都重要：

- summary
- filter
- group
- table 空单元格密度
- 演示真实感

## 推荐预设体系

下面这几组预设足够覆盖“演示 + 性能”两类目标。

### 1. 产品路线图

定位：

- 最适合演示
- 第一眼观感最好
- 适合 table / kanban / gallery 切换展示

规模建议：

- `1k`
- `10k`

字段建议：

- `title`
- `status`
- `priority`
- `owner`
- `team`
- `tags`
- `targetDate`
- `storyPoints`
- `initiative`

默认视图建议：

- Table：按 `priority` 排序
- Kanban：按 `status` 分组
- Gallery：展示更卡片化字段

数据风格建议：

- 偏 SaaS / 产品团队语境
- 标题像真实 roadmap item
- owner/team 有稳定重复

适合展示：

- 分组
- 切 view
- summary
- 大量真实标签

### 2. 销售管道

定位：

- 强调商业感和“真实工作台”氛围
- 很适合演示 select / multi-select / date / number

规模建议：

- `5k`
- `20k`

字段建议：

- `company`
- `dealName`
- `stage`
- `owner`
- `region`
- `tags`
- `expectedRevenue`
- `closeDate`
- `healthScore`

默认视图建议：

- Table：按 `expectedRevenue desc`
- Kanban：按 `stage`

数据风格建议：

- 公司名、地区、交易规模都要像真的
- `expectedRevenue` 使用长尾分布

适合展示：

- number sort
- summary
- grouped sections
- 高价值商业数据观感

### 3. 内容运营日历

定位：

- 更有视觉吸引力
- 适合 gallery / calendar / table

规模建议：

- `3k`
- `10k`

字段建议：

- `title`
- `status`
- `channel`
- `campaign`
- `publishDate`
- `owner`
- `tags`
- `engagementScore`

默认视图建议：

- Calendar：按 `publishDate`
- Gallery：内容卡片展示

数据风格建议：

- 标题要像真实活动、文章、视频计划
- 标签和 campaign 命名要有营销语境

适合展示：

- calendar
- gallery
- search

### 4. 工程任务库

定位：

- 更贴近 dataview 自身场景
- 更适合测 search / sort / group / summary

规模建议：

- `10k`
- `50k`
- `100k`

字段建议：

- `title`
- `status`
- `priority`
- `assignee`
- `component`
- `labels`
- `estimate`
- `createdAt`
- `updatedAt`
- `sprint`

默认视图建议：

- Table：按 `updatedAt desc`
- Kanban：按 `status`

数据风格建议：

- 标题像真实 issue / task
- label 有热点和长尾
- estimate 有空值和偏态

适合展示：

- 大规模滚动
- search
- sort
- summary
- group

### 5. 压测专用 Dense Analytics

定位：

- 不以“最好看”为主
- 专门测宽表和聚合

规模建议：

- `20k`
- `100k`

字段建议：

- 12-20 个字段
- number / select / date 比例更高
- text 字段适量

默认视图建议：

- Table 打开多个 summary
- 默认至少一列按 option group
- 默认存在 1-2 个 filters

适合展示：

- 表头 summary
- 横向滚动
- 排序
- 聚合
- query bar 操作响应

## 推荐菜单信息架构

不要只列数字。

建议一级菜单先按场景分，再在每个场景下给规模：

- 产品路线图
  - 生成 1k
  - 生成 10k
- 销售管道
  - 生成 5k
  - 生成 20k
- 内容运营日历
  - 生成 3k
  - 生成 10k
- 工程任务库
  - 生成 10k
  - 生成 50k
  - 生成 100k
- 压测专用
  - Dense Analytics 20k
  - Dense Analytics 100k

如果只保留最小可用集合，建议先上 6 个按钮：

- 产品路线图 1k
- 产品路线图 10k
- 销售管道 20k
- 工程任务库 10k
- 工程任务库 50k
- Dense Analytics 20k

这样既适合演示，也足够开始压测。

## 生成结果不应该只有数据，还应该包含默认视图

为了真正用于演示，每个 preset 生成后，应该顺手把当前 page 配置成对应的默认展示状态。

建议每个 preset 附带：

- 默认 view type
- 默认可见字段
- 默认排序
- 默认 group
- 默认 summary
- 默认 filters

例如：

### 工程任务库 50k

- 默认打开 `table`
- 默认按 `status` 分组
- 默认按 `updatedAt desc` 排序
- 默认打开：
  - `estimate.sum`
  - `priority.countByOption`
  - `labels.percentByOption`

### 销售管道 20k

- 默认打开 `kanban`
- 默认按 `stage` 分组
- 切回 `table` 时按 `expectedRevenue desc`

这比单纯“造完数据，让用户自己配视图”更适合演示和压测。

## 为了演示更吸引人，应该做哪些视觉层面的数据处理

### 1. 命名要有主题

不要用：

- `Task 1`
- `Item 2`
- `Record 3`

应该用更像产品 demo 的命名体系：

- 路线图：`Launch usage-based billing for enterprise workspaces`
- 销售：`Northwind annual renewal expansion`
- 运营：`April product launch email sequence`
- 工程：`Stabilize grouped summary snapshot recompute path`

### 2. 标签和 option 的名字要好看

不要只用技术占位符。

建议使用：

- `Research`
- `Growth`
- `Mobile`
- `Platform`
- `Enterprise`
- `Urgent`
- `Q2 Launch`

### 3. 让一部分数据“明显重要”

演示时页面不能所有记录都一样平。

可以有意制造：

- 一小批高优先级
- 一小批高金额 deal
- 一小批马上到期的日期
- 一小批长标题和高热标签

这样页面更有视觉层次。

## 关于“真实”与“吸引人”的平衡

如果完全追求真实性，页面可能会显得平淡、脏、难看。

如果完全追求好看，页面又会失真，不适合压测。

建议采用这个比例：

- 70% 真实业务分布
- 20% 为演示优化的命名和热点
- 10% 刻意保留的异常和脏数据

这样做的结果通常最平衡：

- 看起来像真的
- 页面有亮点
- 仍然能暴露真实性能问题

## 实施建议

建议分三阶段做。

### 阶段 1：最小可用

- 在 `Page.tsx` 顶部增加 `PageTitle`
- 下挂一个 dropdown
- 先提供 4-6 个预设
- 每个预设生成固定 seed 数据
- 每个预设附带默认 view 配置

### 阶段 2：真实感增强

- 引入 `fakerjs` 作为文案素材来源
- 加入更真实的 title / company / owner / campaign 文案
- 优化 option / tag 命名体系

### 阶段 3：压测能力增强

- 支持更高规模档位
- 支持生成后自动记录耗时
- 支持切换 preset 后自动聚焦到对应视图
- 支持“重新生成同一 preset”

## 最终建议

最合理的实现方向不是“接不接 faker”，而是：

- 先设计好 4-6 个可复现的业务场景预设
- 用固定 seed 保证稳定
- 用自定义分布模型保证真实
- 用 faker 或自定义词库提升文案观感
- 每个 preset 同时生成数据和默认视图

如果只能先做一版，建议优先做这三套：

- 产品路线图 10k
- 销售管道 20k
- 工程任务库 50k

这三套最容易同时满足：

- 有吸引力
- 看起来真实
- 能覆盖 dataview 主要性能路径
