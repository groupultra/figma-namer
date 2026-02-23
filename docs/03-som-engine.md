# Module B: SoM Canvas 渲染引擎 + 防重叠算法 报告

## 思路
Set-of-Mark (SoM) 是突破 VLM 空间认知瓶颈的核心技术。通过在 UI 截图上叠加
带数字 ID 的高亮框，将模糊的视觉识别任务转化为精确的 Key-Value 映射。

关键设计决策：
- **离屏渲染**: 使用 Canvas API 在 UI iframe 中渲染，不污染 Figma 画布
- **防重叠**: 密集 UI 中标签会互相遮挡，必须用模拟退火算法优化位置

## 模块结构
```
src/plugin/som/
├── index.ts          # 模块导出
├── renderer.ts       # Canvas SoM 渲染器: renderSoMImage()
└── anti-overlap.ts   # 模拟退火防重叠: optimizeLabelPositions()
```

## 过程

### 1. SoM 渲染管线 (`renderer.ts`)

`renderSoMImage()` 是主入口，执行 6 步渲染流水线：

1. **createCanvas** — 优先使用 `OffscreenCanvas`（内存效率更高），不可用时回退到 `document.createElement('canvas')`，即 `HTMLCanvasElement`
2. **加载底图** — `loadImageFromBase64()` 将 Base64 字符串转为 HTMLImageElement（通过 `data:image/png;base64,` 前缀），绘制到 Canvas 作为底层
3. **绘制高亮框** — `drawHighlightBox()` 对每个标记节点的 `highlightBox` 绘制两层矩形：半透明填充（`globalAlpha = SOM_DEFAULTS.HIGHLIGHT_OPACITY`）+ 全不透明描边（`lineWidth = SOM_DEFAULTS.HIGHLIGHT_STROKE_WIDTH`）
4. **计算标签初始位置** — 用 `ctx.measureText()` 计算每个数字标签的 badge 宽高（文本宽度 + padding * 2），初始位置设为高亮框左上角上方（`y = box.y - badgeHeight`）
5. **模拟退火优化标签位置** — 调用 `optimizeLabelPositions()` 对所有标签进行防重叠优化
6. **绘制编号徽章** — `drawLabel()` 绘制圆角矩形背景（`drawRoundedRect()`）+ 白色居中数字文本

最终通过 `canvasToBase64()` 导出 PNG Base64 字符串。OffscreenCanvas 路径使用 `convertToBlob()` + `FileReader`；HTMLCanvasElement 路径使用 `toDataURL()` 并剥离前缀。

### 2. 模拟退火防重叠算法 (`anti-overlap.ts`)

核心函数 `optimizeLabelPositions()` 接收初始标签位置和画布尺寸，返回优化后的新位置数组（纯函数，不修改输入）。

**能量函数** `calculateEnergy()`：

```
E = Σ(两两重叠面积) × OVERLAP_PENALTY_WEIGHT
  + Σ(超出边界面积) × BOUNDARY_PENALTY_WEIGHT
  + Σ(与锚点距离)   × DISTANCE_PENALTY_WEIGHT
```

三个子计算函数：
- `calculateOverlapArea(a, b)` — 计算两个轴对齐矩形的交叉面积（AABB 相交检测）
- `calculateBoundaryPenalty(label, w, h)` — 分别计算左/上/右/下四边溢出面积之和
- 锚点距离使用欧氏距离 `√(dx² + dy²)`

**模拟退火循环**：
- 初始温度 `T = INITIAL_TEMPERATURE`，冷却率 `COOLING_RATE`
- 共迭代 `MAX_ITERATIONS` 次
- 每次随机选取一个标签，在 `NUDGE_RADIUS` 像素半径内的 `NUDGE_ANGLES` 个等分方向上探测（方向向量预计算，避免热循环中的三角函数开销）
- 选取最优方向：若能量下降则无条件接受；若能量上升，以 Boltzmann 概率 `exp(-ΔE/T)` 接受
- 每次迭代后 `T *= COOLING_RATE` 降温

对于 0 或 1 个标签的情况直接返回，跳过优化。

## 结果

模块 100% 完成。渲染器 29 个测试 + 防重叠算法 32 个测试，共 61 个单元测试全部通过。测试覆盖了 Canvas 创建策略切换、底图加载与绘制、高亮框透明度与描边、标签位置计算、圆角矩形路径正确性、重叠面积计算精度、边界惩罚四方向溢出、能量函数权重组合、模拟退火收敛性验证、空标签/单标签边界条件、大批量标签防重叠效果。

## 防重叠算法设计
```
能量函数 E = Σ(重叠面积 × 10) + Σ(超界面积 × 5) + Σ(锚点距离 × 1)

模拟退火:
T = 100, cooling = 0.95
for i in 1..200:
    随机选标签 L
    在 L 周围 20px 半径内尝试 12 个方向
    if ΔE < 0: 接受
    else: 以 exp(-ΔE/T) 概率接受
    T *= 0.95
```
