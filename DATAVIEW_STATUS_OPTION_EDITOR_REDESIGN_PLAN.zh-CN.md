# Dataview Status Option Popover Editor 改版方案

## 目标

把 status option 的编辑弹层改成接近 Notion 的结构，统一成下面四块，顺序固定：

1. 名称 input
2. 操作区
3. 分组区
4. 颜色区

目标效果：

- 视觉结构接近参考图
- status editor 和普通 option editor 继续共用主体实现，不再分叉出第二套面板
- status 特有能力只增加两项
  - `设为默认`
  - `组`
- 不把 rename input 塞进 `Menu`
- `组` 直接复用 `ui/src/dropdown-menu.tsx`
- 颜色仍然放在下方，不和上面的动作项混在一起

## 目标交互

### 1. 名称 input

- 弹层最上方保留单行 input
- 失焦提交
- `Enter` 提交
- 空字符串回退到原值，不允许提交空名
- 这一块继续独立，不进入 `Menu`

### 2. 操作区

名称 input 下方先放两个动作：

- 删除
- 设为默认

其中：

- `删除` 放在最上面，保持强语义动作
- `设为默认` 是普通动作，但如果当前 option 已经是默认项，右侧显示勾选
- `设为默认` 点击后立即生效，不需要二次确认

### 3. 分组区

在操作区下面放一个独立分组行：

- label：`组`
- trailing：当前分组名称，例如 `进行中`
- 最右侧再放一个 chevron

这一行本身不是 submenu 内联展开，而是：

- 行点击后打开一个小的 `DropdownMenu`
- Menu 只包含三个 category
  - 待办
  - 进行中
  - 已完成
- 当前 category 右侧显示勾选

这样做的原因：

- 跟参考图一致，分组是“行 + 右侧当前值”的结构，不是平铺成一组普通 menu item
- 不需要把多余的复杂状态塞进 `Menu` 本体
- 直接复用现有 `DropdownMenu`

### 4. 颜色区

分组区下面单独放颜色区：

- 用现有颜色列表
- 继续显示颜色 swatch + 文本
- 当前颜色右侧显示勾选
- 颜色切换即时生效

颜色区和上面动作区之间要有明确分隔，避免“删除 / 默认 / 分组 / 颜色”全部混成一块。

## 最终结构

status option editor 的面板结构建议固定为：

1. `Input`
2. `Menu`
   - 删除
   - 设为默认
3. `Group trigger row`
   - label: 组
   - trailing: 当前 category label
   - trigger: 打开 `DropdownMenu`
4. `Menu`
   - 颜色 label
   - 颜色项列表

也可以保持为单个竖向容器，但语义上要分成这四块。

## 设为默认的语义

`设为默认` 的含义不是“当前 category 的默认项”，而是：

- 这个 status field 在新建记录时，默认值就是这个 option

也就是：

- 所有新建卡片
- 只要该字段还没有显式赋值
- 就使用这个 default status option

这是字段级默认值，不是分类级默认值。

## 为什么不能直接复用当前 `getStatusDefaultOption`

当前 core 里已经有：

- `getStatusDefaultOption(field, category)`

但它的语义只是：

- 取某个 category 下排在第一个的 option

它主要服务于：

- status category 分桶展示
- category bucket 的代表值

它**不是**“新建记录时字段默认值”的能力，因此不能直接拿来承载这个需求。

## 数据设计

### 推荐方案

在 `StatusField` 上增加一个明确的字段级默认值：

- `defaultOptionId?: string | null`

推荐直接放在 `StatusField` 顶层，而不是塞进 `meta`。

原因：

- 这是业务语义字段，不是纯 UI 元数据
- 需要被创建记录、默认值注入、schema normalize、convert/clone 明确处理
- 放在顶层更可读，也更容易被后续逻辑消费

### 不推荐方案

不建议放到：

- `meta.defaultOptionId`

原因：

- `meta` 语义太松
- 后续读写默认值时会越来越隐蔽
- schema normalize / migrate / clone / convert 时更容易漏掉

## 默认值规则

### 创建记录时

新建卡片时，如果 status 字段没有显式赋值：

- 优先使用 `field.defaultOptionId`
- 如果找不到对应 option，则回退

### 回退策略

如果默认项失效，例如被删除：

1. 优先回退到 `todo` 分组的第一个 option
2. 如果 `todo` 为空，则回退到整个 status options 的第一个 option
3. 如果整个字段没有 option，则为空值

这样可以保证行为稳定，也符合 status 字段的直觉。

## 删除默认项时的处理

如果用户删除的正好是默认项：

- 删除成功后自动清理 `defaultOptionId`
- 然后按上面的回退规则重新解析运行时默认值

这里推荐：

- 存储层只做“清空 defaultOptionId”
- 运行时通过统一 helper 解析最终默认值

不要在删除时偷偷把另一个 option 写成新的默认项，否则副作用太重。

## 组件收敛方案

### 目标

不要再做一个专门的 `StatusOptionEditorPanel`。

### 推荐收敛方式

继续以 `OptionEditorPanel` 为唯一主体，只给它增加一个轻量 `variant`：

- `variant?: 'default' | 'status'`

然后让 `OptionEditorPanel` 内部按 variant 决定是否渲染：

- 默认项动作
- 分组行

这样结构会变成：

- 普通 option
  - input
  - color
  - delete
- status option
  - input
  - delete
  - set default
  - group row + group dropdown
  - color

### 为什么不单独拆 status panel

因为 status option 和普通 option 的公共部分已经非常高：

- rename
- color
- delete

真正多出来的只有：

- default
- group

为了这两项再拆一套 panel，只会让实现重新分叉。

## `OptionEditorPanel` 的建议改造

建议把 `OptionEditorPanel` 改成“主体逻辑内聚，status 仅传少量必要信息”。

### 保留内部负责

- rename
- color change
- delete

### status 额外输入

只额外传：

- `variant: 'status'`
- `statusCategory`
- `isDefault`
- `onSetDefault`
- `groupItems`

其中：

- `groupItems` 用于渲染 `DropdownMenu.items`
- `onSetDefault` 只负责设置默认项

不要把 rename / color / delete 再往上抛。

## Group 的 UI 方案

不需要额外抽象成通用组件，最简单的方案就是直接在 `OptionEditorPanel` 里放一行触发器：

- 左侧 label
- 右侧 current value
- 最右侧 chevron
- 整行可点击

这行不属于 `Menu` 本体，但它直接作为 `DropdownMenu.trigger`。

原因：

- 参考图里的“组”更像设置行，不像普通菜单项
- 如果强行塞进 `Menu`，会引入很多特例
- 如果再额外抽一个 UI 抽象，这个场景又显得过度设计
- 直接在 panel 里写成一行，然后挂 `DropdownMenu`，这是最省事的实现

## `Menu` 是否需要改

这次不建议为了 status editor 去继续扩 `Menu` 本体。

原因：

- `Menu` 已经支持 `label`、`trailing`
- 颜色区和动作区都足够用
- 真正特殊的是“组”这一行，它更像 panel setting row，不是 menu item

所以最小方案是：

- `Menu` 保持现状
- `Group` 这一行直接挂 `DropdownMenu`
- `DropdownMenu` 内部继续使用现有 `Menu`

这比把 `Menu` 改成超大而通用的 settings 容器更收敛。

## 数据与行为分层

推荐分层如下：

### `OptionEditorPanel`

负责：

- 展示结构
- rename / color / delete
- 触发 `set default`
- 渲染 `Group` 这一行并触发 `DropdownMenu`

### status helper

负责：

- 生成 category menu items
- 判断当前 option 是否默认项
- 解析默认 status option
- 删除默认项后的回退逻辑

### record create / default value path

负责：

- 新建卡片时读取 status field 默认 option
- 把默认值写入新记录

## 落地范围

### UI 层

需要调整：

- `dataview/src/react/field/options/OptionEditorPanel.tsx`
- `dataview/src/react/field/options/OptionEditorPopover.tsx`
- status 相关调用点，给 `OptionEditorPanel` 传 status variant 所需数据

### core 层

需要新增：

- `StatusField.defaultOptionId`

需要补齐：

- normalize
- create default field
- kind convert / clone
- 删除 option 时默认项清理
- 解析 status 默认值 helper
- 创建记录时注入默认 status

## 行为细节

### 设为默认

- 当前不是默认项：点击后设为默认项
- 当前已经是默认项：点击后不切换成“取消默认”

也就是：

- `设为默认` 是幂等动作
- 不提供“无默认项”的显式切换入口

原因：

- status 字段通常应该有一个合理的默认起点
- 用户说的是“设为默认”，不是“切换默认”

### Group 迁移

- 选择新的 category 后立即生效
- dropdown 关闭
- editor 保持打开或关闭都可以，但建议只关闭这个 group dropdown，不关闭主 editor

### 删除

- 删除后关闭主 editor
- 如果被删的是当前字段值，调用现有删除回调清理 draft

## 推荐视觉顺序

建议最终弹层从上到下是：

1. 名称输入框
2. 删除
3. 设为默认
4. 组
5. 颜色列表

其中：

- `删除 / 设为默认 / 组` 都属于“配置动作层”
- `颜色列表` 独立在最下方

这和参考图的认知顺序一致：

- 先处理对象本身
- 再处理状态规则
- 最后处理外观颜色

## 复杂度控制原则

这次改版要保持收敛，不做下面这些事：

- 不新增单独的 `StatusOptionEditorPanel`
- 不把 rename input 塞进 `Menu`
- 不为了 group row 去重写 `Menu`
- 不把“category 默认项”和“字段默认值”混为一谈
- 不把默认值塞进 `meta`

## 结论

最优方案是：

- 继续以 `OptionEditorPanel` 为唯一 editor 主体
- status 只增加两项能力
  - `设为默认`
  - `组`
- `组` 在 `OptionEditorPanel` 里直接渲染为一行，并复用 `ui/src/dropdown-menu.tsx`
- `设为默认` 使用字段级 `defaultOptionId`
- 创建新卡片时读取这个默认值作为 status 初始值

这样可以同时满足：

- UI 接近参考图
- 逻辑语义正确
- 不重新分叉 editor 体系
- 后续维护成本最低
