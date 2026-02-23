# Module A: 节点遍历与元数据提取 报告

## 思路
Figma 设计稿的图层结构是一棵深度嵌套的 N 叉树。需要 DFS 递归遍历，同时进行智能过滤——
不是所有节点都值得被 VLM 命名（如纯装饰矢量、单像素线条）。

核心挑战：
1. 如何高效过滤噪声节点，保留有业务语义的节点
2. 如何提取最大化的上下文信息（变量绑定、组件属性、文本内容）
3. 如何处理超深嵌套（可能 20+ 层）

## 模块结构
```
src/plugin/traversal/
├── index.ts      # 主遍历入口: traverseSelection()
├── filter.ts     # 智能过滤: shouldIncludeNode(), isDefaultName()
└── metadata.ts   # 元数据提取: extractMetadata(), extractTextContent()
```

## 过程

### 1. DFS 遍历主入口 (`index.ts`)

`traverseSelection()` 接收 `figma.currentPage.selection` 和 `NamerConfig`，对每个选中的根节点调用内部 `walkDFS()` 执行深度优先遍历。

`walkDFS()` 实现了两层安全守卫：
- **MAX_TRAVERSAL_DEPTH = 100**：当递归深度超过 100 层时立即返回，防止栈溢出
- **MAX_NODE_COUNT = 5000**：当已收集节点数达到 5000 时停止遍历，防止超大设计稿拖垮插件

关键设计决策：**即使父容器被过滤掉（如被锁定的 FRAME），仍然递归遍历其子节点**。这确保了"跳过容器但保留其有价值子元素"的语义。

### 2. 智能过滤引擎 (`filter.ts`)

`shouldIncludeNode()` 按优先级顺序应用 7 条过滤规则：

1. **类型黑名单** — 跳过 SKIP_NODE_TYPES 中的原始图形类型（VECTOR, LINE, ELLIPSE 等）
2. **可见性检查** — 跳过不可见节点（除非 `config.includeInvisible = true`）
3. **锁定检查** — 跳过锁定节点（除非 `config.includeLocked = true`）
4. **最小面积检查** — 跳过 `absoluteBoundingBox` 面积小于 `config.minNodeArea` 的节点（默认 4px 以下过滤），当 `absoluteBoundingBox` 为 null 时保留节点以避免误删
5. **可命名类型白名单** — NAMEABLE_NODE_TYPES 中的类型（FRAME, COMPONENT, INSTANCE 等）直接通过
6. **含文本容器** — FRAME/GROUP 如果包含 TEXT 子孙节点则保留（通过 `hasTextDescendant()` 递归检测）
7. **用户自定义白名单** — `config.includeNodeTypes` 数组中指定的额外类型

辅助函数 `isDefaultName()` 通过 `DEFAULT_NAME_PATTERNS` 正则列表检测 Figma 自动命名（如 "Frame 123", "Rectangle 45"），用于 UI 中标记需要重命名的图层。

### 3. 元数据提取 (`metadata.ts`)

`extractMetadata()` 为每个通过过滤的节点构建完整的 `NodeMetadata` 记录，包含 12 个字段：

- **基础信息**：`id`, `originalName`, `nodeType`, `depth`, `parentId`
- **几何信息**：`boundingBox`（从 `absoluteBoundingBox` 转换，无值时回退到零矩形）
- **文本提取**：`extractTextContent()` — TEXT 节点直接读 `characters`；容器节点收集第一层 TEXT 子节点的文本并用空格拼接
- **变量绑定**：`extractBoundVariables()` — 遍历 `node.boundVariables` 中所有属性绑定，通过 `figma.variables.getVariableById()` 解析变量名（如 "Colors/Surface/Primary"）。双层 try-catch 防护旧版 API 不可用的情况
- **组件属性**：`extractComponentProperties()` — 仅对 INSTANCE 节点提取 `componentProperties`，将值序列化为字符串映射
- **结构信息**：`hasChildren`, `childCount`, `layoutMode`（HORIZONTAL/VERTICAL/NONE）

## 结果

模块 100% 完成。三个子模块（index.ts、filter.ts、metadata.ts）共覆盖 60 个单元测试，全部通过。测试覆盖了以下场景：DFS 遍历顺序正确性、MAX_DEPTH/MAX_NODE_COUNT 安全守卫触发、所有 7 条过滤规则的独立和组合验证、不可见/锁定节点在不同配置下的行为、默认名称正则匹配、文本提取（直接 TEXT 节点和容器递归）、变量绑定解析（含 API 不可用回退）、组件属性提取（含分离实例防护）、空选区和边界条件处理。

## 关键算法
- **DFS 深度优先遍历**: 自顶向下扫描所有子节点，记录深度
- **噪点过滤策略**: 基于节点类型 + 面积 + 可见性 + 默认名称检测
- **文本内容提取**: TextNode 直接取 characters，容器节点递归搜索子文本
- **变量融合**: 通过 figma.variables API 获取设计令牌绑定信息
