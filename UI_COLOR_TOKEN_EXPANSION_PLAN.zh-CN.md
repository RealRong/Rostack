# UI 配色 Token 补充方案

## 结论

`ui` 层不是没有颜色体系，而是已经有一套基于 Notion 的“压缩版”颜色体系：

- [`ui/css/tokens.css`](/Users/realrong/Rostack/ui/css/tokens.css)
- [`ui/tailwind/preset.cjs`](/Users/realrong/Rostack/ui/tailwind/preset.cjs)
- [`ui/src/color/types.ts`](/Users/realrong/Rostack/ui/src/color/types.ts)
- [`ui/src/color/resolve.ts`](/Users/realrong/Rostack/ui/src/color/resolve.ts)

问题不在“完全缺色”，而在“压缩维度不够”：

- 颜色家族已经基本齐了，但公开给业务层的家族列表不完整，`teal` 已经在 token 里存在，却没有进 `UiOptionColorId` 和 tailwind option colors。
- 当前 family token 更偏 badge / column / card / overlay 场景，适合轻量 UI，不够支撑 whiteboard 这类大面积 fill。
- 当前 family foreground 只暴露了两档：
  - `text` = 很深的主前景
  - `text-muted` = 很浅的弱前景
- 中间那档最常用、也是最有“品牌色感”的 `TexSec` / `IcoSec` 没有暴露出来。

长期最优不是重做一套新色板，而是在现有体系上补齐两个缺口：

1. 补齐公开家族列表，使 token / TS / tailwind / resolver 同步。
2. 在每个 family 下补两组新 role：
   - 中阶前景色
   - 不透明 surface 色

---

## 当前状态

### 1. `tokens.css` 已经有完整的 family 基础

`ui/css/tokens.css` 里 light / dark 都已经有这些 family：

- `default`
- `gray`
- `brown`
- `green`
- `orange`
- `pink`
- `purple`
- `red`
- `teal`
- `yellow`
- `blue`

每个 family 当前已有这些 token 结构：

- `--ui-<color>-text`
- `--ui-<color>-text-muted`
- `--ui-<color>-icon`
- `--ui-<color>-icon-muted`
- `--ui-<color>-border`
- `--ui-<color>-border-muted`
- `--ui-<color>-border-strong`
- `--ui-<color>-border-alpha`
- `--ui-<color>-border-alpha-muted`
- `--ui-<color>-border-alpha-strong`
- `--ui-<color>-bg-soft`
- `--ui-<color>-bg-muted`
- `--ui-<color>-bg-strong`
- `--ui-<color>-bg-card`
- `--ui-<color>-bg-card-hover`
- `--ui-<color>-bg-card-pressed`

也就是说，底层 token 并不贫瘠。

### 2. 公开 API 比底层 token 少一层

`UiOptionColorId` 当前只有：

- `default`
- `gray`
- `brown`
- `orange`
- `yellow`
- `green`
- `blue`
- `purple`
- `pink`
- `red`

见：

- [`ui/src/color/types.ts`](/Users/realrong/Rostack/ui/src/color/types.ts)
- [`ui/tailwind/preset.cjs`](/Users/realrong/Rostack/ui/tailwind/preset.cjs)

这里少了 `teal`。

这会导致一个明显问题：

- CSS token 里已经支持 `teal`
- 但业务层类型、resolver、tailwind utility 都看不到它

这会形成隐性漂移。

### 3. 现有 role 偏“轻 UI”，不偏“大面积内容面”

当前 resolver 支持的 usage 是：

- `badge-bg`
- `badge-text`
- `badge-border`
- `column-bg`
- `column-border`
- `bg-card`
- `card-border`
- `bg-card-hover`
- `bg-card-pressed`
- `dot-bg`
- `text`
- `text-muted`

见 [`ui/src/color/resolve.ts`](/Users/realrong/Rostack/ui/src/color/resolve.ts)

这套 usage 对 dataview / status / option card 很合适，但对下面这些场景不够：

- whiteboard sticky fill
- shape fill
- frame fill
- 大块区域的 tinted surface
- 彩色 stroke / label / 次级正文

原因很简单：

- `bg-soft / bg-muted / bg-strong` 在 light theme 里偏透明叠加层，不是稳定的大面积底色
- `text` 太深，`text-muted` 太浅，中间那档最实用的彩色前景没有暴露

---

## 根因

当前 `ui` token 的压缩方式，本质上做了两件事：

1. 保留了 family。
2. 丢掉了 family 里的“中间层”和“实体层”。

从 Notion 原始色板看，每个 family 至少有三组关键层级：

- `TexPri / TexSec / TexTer`
- `BorPri / BorSec / BorStr`
- `BacPri / BacSec / BacTer`

现在 `ui` 层的映射大致是：

- `text` -> `TexPri`
- `text-muted` -> `TexTer`
- `bg-soft / bg-muted / bg-strong` -> 一组三层透明背景
- `bg-card*` -> “卡片置于 tinted area 中”的 neutral/inside card

丢掉的是：

- `TexSec`
- `IcoSec`
- `BacPri / BacSec / BacTer` 这种真正可作为 surface fill 的不透明背景层

这就是为什么你会感觉“不太够”：

- 小徽章够用了
- 大面积白板 fill 不够
- 颜色层次有，但业务上最常用的那一层没有开放出来

---

## 长期最优目标

不推翻现有 token 体系，只做增量补充。

### 保留不变

- Neutral token 命名
- 现有 family token 命名
- 现有 resolver 用途
- 现有 tailwind utility 风格

### 新增两类能力

#### 1. 补齐 family registry

统一公开家族顺序：

- `default`
- `gray`
- `brown`
- `yellow`
- `orange`
- `red`
- `green`
- `blue`
- `teal`
- `purple`
- `pink`

注意：

- `default` 是 neutral family，不是内容色板里的“白色”
- 面向内容选择器时，通常不直接展示 `default`
- 面向通用 UI option color 时，`default` 仍保留

#### 2. 每个 family 新增两组 token

新增中阶前景：

- `--ui-<color>-text-secondary`
- `--ui-<color>-icon-secondary`

新增不透明 surface：

- `--ui-<color>-surface`
- `--ui-<color>-surface-hover`
- `--ui-<color>-surface-pressed`

---

## 推荐命名

### 为什么不用 `accent` / `tone` / `fill`

不建议新增这种命名：

- `--ui-<color>-accent`
- `--ui-<color>-tone`
- `--ui-<color>-fill`

原因：

- `accent` 在系统里已经有全局语义，容易和 `--ui-accent` 混淆
- `tone` 太抽象，看不出具体用途
- `fill` 太白板化，不适合通用 UI 层

### 最简洁稳定的命名

推荐：

- `text-secondary`
- `icon-secondary`
- `surface`
- `surface-hover`
- `surface-pressed`

这套命名清楚、短、跨业务场景可复用。

---

## token 映射建议

### light theme

对于颜色 family，建议这样从 Notion 原色映射：

- `text` -> `TexPri`
- `text-secondary` -> `TexSec`
- `text-muted` -> `TexTer`

- `icon` -> `IcoPri`
- `icon-secondary` -> `IcoSec`
- `icon-muted` -> `IcoTer`

- `surface` -> `BacPri`
- `surface-hover` -> `BacSec`
- `surface-pressed` -> `BacTer`

现有这些继续保留：

- `bg-soft`
- `bg-muted`
- `bg-strong`
- `bg-card`
- `bg-card-hover`
- `bg-card-pressed`

### dark theme

同样保持同名 token 自动切换，不单独设计第二套 API。

dark 下映射仍然一致：

- `surface` -> dark `BacPri`
- `surface-hover` -> dark `BacSec`
- `surface-pressed` -> dark `BacTer`

这样业务层永远只关心 role，不关心主题。

---

## `default` family 的处理

`default` 不是彩色 family，但为了 API 完整性，建议也补齐相同 role。

建议：

- `--ui-default-text-secondary` -> `--ui-text-secondary`
- `--ui-default-icon-secondary` -> `--ui-icon-secondary`
- `--ui-default-surface` -> `--ui-bg-panel`
- `--ui-default-surface-hover` -> `--ui-bg-subtle`
- `--ui-default-surface-pressed` -> `--ui-border-default`

这样 resolver 不需要为 `default` 走特殊分支。

---

## 为什么现有 token 仍然要保留

现有 token 不是错，只是用途不同。

### 现有 token 适合

- badge
- chip
- option dot
- column background
- tint overlay
- option card inside tinted list

### 新 token 适合

- whiteboard sticky / frame / shape fill
- 大面积彩色 surface
- 作为图标、描边、次级正文的彩色前景
- 需要在 light / dark 下都保持同家族观感的内容面

也就是说：

- 旧 token 不替换
- 新 token 只补“旧体系缺失的 role”

---

## 对 tailwind 的补充建议

当前 tailwind preset 只生成了：

- `.bg-<color>`
- `.bg-<color>-muted`
- `.bg-<color>-soft`
- `.text-<color>`
- `.text-<color>-muted`
- `.border-option-<color>`

建议新增：

- `.bg-<color>-surface`
- `.bg-<color>-surface-hover`
- `.bg-<color>-surface-pressed`
- `.text-<color>-secondary`
- `.icon-<color>-secondary`

必要时再补：

- `.border-option-<color>-strong`

但第一阶段可以先不加 `border strong`，因为大部分业务先缺的是前景和 surface。

---

## 对 resolver 的补充建议

`UiOptionColorTokenUsage` 建议新增：

- `surface`
- `surface-hover`
- `surface-pressed`
- `text-secondary`

如果 UI 确实有单独 icon token 使用场景，再补：

- `icon-secondary`

第一阶段不建议一次性把 usage 膨胀太多。

最简版本只补：

- `surface`
- `surface-hover`
- `surface-pressed`
- `text-secondary`

---

## 对业务层的推荐用法

### dataview / status / option

继续使用现有 usage：

- `badge-bg`
- `badge-text`
- `column-bg`
- `bg-card`

不要迁移。

### whiteboard

建议统一改为：

- fill / sticky tone / frame fill -> `surface` / `surface-pressed`
- hover fill preview -> `surface-hover`
- stroke / colored label / colored text button -> `text-secondary`
- 深色正文或高对比图标 -> `text`

这样 whiteboard 不再直接绑定 `bg-strong` 这种“轻 tint token”。

---

## 家族取舍建议

### 通用 UI family

长期建议公开：

- `default`
- `gray`
- `brown`
- `yellow`
- `orange`
- `red`
- `green`
- `blue`
- `teal`
- `purple`
- `pink`

### whiteboard 内容色板

建议内容色板使用：

- `gray`
- `brown`
- `yellow`
- `orange`
- `red`
- `green`
- `blue`
- `teal`
- `purple`
- `pink`

不建议把下面这些混进内容色板：

- `accent`
- `danger`
- `foreground`
- `surface`

它们是语义色，不是 family。

---

## 单一数据源

当前一个明显问题是：

- `tokens.css` 有 `teal`
- `types.ts` 没有 `teal`
- `tailwind/preset.cjs` 也没有 `teal`

长期必须收敛到一个 family registry。

推荐做法：

- 新建一个共享 registry 文件，作为颜色家族唯一数据源
- 内容至少包含：
  - `id`
  - `label`
  - `order`
  - `isDefault`

推荐放置位置：

- `ui/color/families.json`

原因：

- CSS / JS / TS / tailwind preset 都容易消费
- 不需要为 CJS/TS 互相导入搞额外兼容层

建议结构：

```json
[
  { "id": "default", "label": "Default", "order": 0, "default": true },
  { "id": "gray", "label": "Gray", "order": 10 },
  { "id": "brown", "label": "Brown", "order": 20 },
  { "id": "yellow", "label": "Yellow", "order": 30 },
  { "id": "orange", "label": "Orange", "order": 40 },
  { "id": "red", "label": "Red", "order": 50 },
  { "id": "green", "label": "Green", "order": 60 },
  { "id": "blue", "label": "Blue", "order": 70 },
  { "id": "teal", "label": "Teal", "order": 80 },
  { "id": "purple", "label": "Purple", "order": 90 },
  { "id": "pink", "label": "Pink", "order": 100 }
]
```

---

## 分阶段实施

### Phase 1

目标：先消除明显漂移。

- 把 `teal` 加入 `UiOptionColorId`
- 把 `teal` 加入 `tailwind optionColors`
- 收敛 family registry，去掉多处手写列表

### Phase 2

目标：补齐真正缺的 token role。

- 为每个 family 增加：
  - `text-secondary`
  - `icon-secondary`
  - `surface`
  - `surface-hover`
  - `surface-pressed`

### Phase 3

目标：补齐 API。

- 扩展 `UiOptionColorTokenUsage`
- 扩展 tailwind utility
- 扩展 `resolveOptionColorToken`

### Phase 4

目标：业务迁移。

- whiteboard fill/sticky/frame/shape 改用 `surface*`
- whiteboard stroke/text palette 改用 `text-secondary`
- dataview/status 维持现状，不做不必要迁移

---

## 最终建议

如果只做一件事，优先顺序如下：

1. 补 `teal` 到公开 registry。
2. 补 `surface / surface-hover / surface-pressed`。
3. 补 `text-secondary`。

这三步做完，`ui` 层就从“压缩得过头的轻量色板”变成“足够支撑白板、dataview、状态系统三类场景的统一色板”。

重点不是增加更多颜色家族，而是把每个家族补到“可用于内容面”的完整层级。
