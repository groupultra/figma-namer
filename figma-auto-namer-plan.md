# Figma 智能命名工具 — 完整规划

## 一、调研总结

### Figma API 能力矩阵

| 能力 | REST API | Plugin API | MCP Server |
|------|----------|------------|------------|
| 读取文件结构/节点树 | ✅ `GET /v1/files/:key` | ✅ `figma.root` 遍历 | ✅ 通过 tools 暴露 |
| 读取组件属性/变体 | ✅ components metadata | ✅ `componentPropertyDefinitions` | ✅ design context |
| 导出节点为图片 | ✅ `GET /v1/images/:key?ids=` | ✅ `node.exportAsync()` | ❌ |
| **修改节点名称** | ❌ **只读** | ✅ **`node.name = "xxx"`** | ❌ |
| 读取 Auto Layout 信息 | ✅ layoutMode, padding 等 | ✅ 完整访问 | ✅ |
| 读取样式/变量 | ✅ styles mapping | ✅ variables API | ✅ |

**关键发现：REST API 无法修改任何节点属性。重命名必须通过 Figma Plugin API 完成。**

### Figma MCP Server

Figma 官方 MCP Server 有两种模式：
- **Desktop MCP Server**：本地运行，通过 Figma 桌面端暴露，端点 `http://127.0.0.1:3845/mcp`
- **Remote MCP Server**：直接连接 `https://mcp.figma.com/mcp`，无需桌面端

MCP 提供的 tools 包括：生成代码、提取设计上下文（变量/组件/布局）、获取 Make 资源、结合 Code Connect 等。

社区方案 `GLips/Figma-Context-MCP` 简化了 Figma REST API 响应，只保留最相关的布局和样式信息。

### Figma 已有 AI 重命名

Figma 付费版自带 "Rename layers with AI"，但局限性很大：
- 只能重命名 Figma 默认名称的图层（Frame 1、Rectangle 等）
- 已手动命名的图层会被跳过
- 不能命名 instance 子层
- 不能自定义命名规则/模板
- 没有视觉上下文理解

---

## 二、好的命名应该是什么样

### 核心原则：让 LLM 一眼看懂图层是什么、在哪里、什么状态

命名需要回答三个问题：**What**（是什么）、**Where**（在哪里）、**State**（什么状态）。

### 命名模板

```
[Component] / [Variant] / [Element] - [State] - [Platform/Context]
```

### 大量示例

#### 1. 按钮系统
```
Button / Primary / Label - Default - Android
Button / Primary / Label - Pressed - Android
Button / Primary / Label - Disabled - Android
Button / Primary / Icon-Left + Label - Default - iOS
Button / Secondary / Label - Hover - Web
Button / Ghost / Icon-Only - Focus - Android
Button / Danger / Label - Loading - Web
Button / FAB / Icon - Default - Android                    ← Floating Action Button
```

#### 2. 输入框系统
```
Input / Text / Single-Line - Empty - Android
Input / Text / Single-Line - Filled - Android
Input / Text / Single-Line - Error - Android
Input / Text / Single-Line - Disabled - Android
Input / Search / With-Icon - Active - iOS
Input / Password / With-Toggle - Masked - Web
Input / Textarea / Multi-Line - Focused - Android
Input / OTP / 6-Digit - Partial-Fill - Android
Input / Phone / Country-Code + Number - Default - iOS
```

#### 3. 导航系统
```
Nav / BottomTab / 5-Items - Home-Active - Android
Nav / BottomTab / 5-Items - Chat-Active - Android
Nav / TopBar / Title + Back + Actions - Default - iOS
Nav / TopBar / Search-Expanded - Active - Android
Nav / Drawer / Menu-Items - Open - Android
Nav / TabBar / 3-Tabs - Tab2-Selected - Web
Nav / Breadcrumb / 3-Levels - Default - Web
```

#### 4. 卡片与列表
```
Card / Message / Text-Only - Sent - Android
Card / Message / Text + Image - Received - Android
Card / Message / Voice-Message - Playing - Android
Card / Contact / Avatar + Name + Status - Online - Android
Card / Contact / Avatar + Name + Status - Offline - Android
List / Chat / Preview - Unread-Badge - Android
List / Chat / Preview - Muted - Android
List / Settings / Toggle + Label - On - iOS
List / Settings / Arrow + Label - Default - iOS
```

#### 5. 弹窗与浮层
```
Modal / Alert / Title + Message + 2-Buttons - Default - Android
Modal / Confirm / Title + Message + 2-Buttons - Destructive - iOS
BottomSheet / Action / 3-Options - Default - Android
BottomSheet / Language-Picker / Search + List - Default - Android
BottomSheet / Sharing / Contact-Grid + Link - Default - Android
Dialog / Permission / Camera-Access - First-Time - Android
Toast / Success / Icon + Message - Default - Android
Toast / Error / Icon + Message - Default - Android
Tooltip / Arrow-Top / Text - Default - Web
Snackbar / Action / Message + Button - Default - Android
```

#### 6. 表单与选择器
```
Picker / Date / Calendar-View - Month-Selected - iOS
Picker / Time / Scroll-Wheels - Default - iOS
Picker / Language / Search + Grid - Default - Android
Toggle / Switch / Label - On - Android
Toggle / Switch / Label - Off - Android
Checkbox / Single / Label - Checked - Android
Checkbox / Single / Label - Unchecked - Android
Radio / Group / 3-Options - Option2-Selected - Android
Slider / Range / Min-Max - Default - Android
Stepper / Quantity / Minus-Value-Plus - Default - iOS
```

#### 7. 状态与反馈
```
State / Empty / Illustration + Title + CTA - No-Messages - Android
State / Empty / Illustration + Title + CTA - No-Network - Android
State / Loading / Skeleton - Chat-List - Android
State / Loading / Spinner - Centered - Android
State / Error / Illustration + Retry - Server-Error - Android
State / Success / Check-Animation + Message - Sent - Android
Badge / Notification / Count - 99Plus - Android
Badge / Status / Dot - Online-Green - Android
Progress / Linear / Determinate - 60-Percent - Android
Progress / Circular / Indeterminate - Default - Android
```

#### 8. 你的 IM 产品特定组件
```
Chat / Bubble / Text - Sent-Mine - Android
Chat / Bubble / Text - Received-Original + Translation - Android
Chat / Bubble / Voice - Playing-Waveform - Android
Chat / Bubble / Image + Caption - Sent-Mine - Android
Chat / Input-Bar / Text + Send + Translate - Default - Android
Chat / Input-Bar / Voice-Recording - Active - Android
Chat / Header / Avatar + Name + Call-Icons - Online - Android
Chat / Header / Avatar + Name + Call-Icons - Translating - Android
Translation / Overlay / Original + Translated - Fade-In - Android
Translation / Banner / Language-Pair - Active - Android
Call / Video / Full-Screen + Captions - Active - Android
Call / Audio / Avatar + Timer + Controls - Active - Android
Call / Incoming / Avatar + Accept-Reject - Ringing - Android
Call / Caption / Subtitle-Bar - Translating - Android
```

#### 9. 内部图层命名（组件内部的子层）
```
# Button 内部子层
→ container                          ← 外层 frame
  → icon-left                        ← 左侧图标
  → label                            ← 文字
  → icon-right                       ← 右侧图标
  → ripple-overlay                   ← Android 水波纹

# Chat Bubble 内部子层
→ bubble-container
  → message-text-original
  → divider-translation
  → message-text-translated
  → timestamp + read-status
  → translation-indicator-icon

# Bottom Sheet 内部子层
→ sheet-container
  → drag-handle
  → header / title + close-button
  → content-scrollable
  → footer / action-buttons
```

### 命名规则总结

| 维度 | 规则 | 示例 |
|------|------|------|
| 层级分隔 | `/` 斜杠 | `Button / Primary / Label` |
| 同级组合 | `+` 加号 | `Icon + Label` |
| 状态标注 | `-` 连字符 | `Default`、`Pressed`、`Disabled` |
| 平台标注 | 尾部 `-` 连接 | `- Android`、`- iOS`、`- Web` |
| 数量描述 | 数字前缀 | `3-Options`、`5-Items` |
| 可见性 | `.` 开头隐藏 | `.internal-spacer` |
| 子层命名 | kebab-case | `icon-left`、`message-text` |
| Variant Props | `Prop=Value` | `State=Disabled, Size=Large` |

---

## 三、自动化工具架构

### 核心思路：Plugin 收集上下文 → 导出截图 → Vision LLM 理解 → Plugin 回写名称

```
┌──────────────────────────────────────────────────┐
│                  Figma Plugin                     │
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐│
│  │ 1. 遍历     │  │ 4. 高亮导出 │  │ 7. 回写名称  ││
│  │ 节点树      │  │ 截图       │  │ node.name=  ││
│  └─────┬──────┘  └─────┬──────┘  └──────▲──────┘│
└────────┼───────────────┼────────────────┼────────┘
         │               │                │
         ▼               ▼                │
┌──────────────────────────────────────────────────┐
│              Backend Service (Node.js/Python)      │
│  ┌────────────┐  ┌────────────┐  ┌─────────────┐│
│  │ 2. 构建     │  │ 5. 组装     │  │ 6. 解析     ││
│  │ 节点元数据  │  │ Vision     │  │ LLM 返回    ││
│  │ + 上下文    │  │ Prompt     │  │ 的命名方案  ││
│  └─────┬──────┘  └─────┬──────┘  └──────▲──────┘│
│        │               │                │        │
│        ▼               ▼                │        │
│  ┌────────────┐  ┌───────────────────────┐       │
│  │ 3. REST API│  │ Claude / GPT-4o       │       │
│  │ 导出图片   │  │ Vision API Call       │───────┘│
│  └────────────┘  └───────────────────────┘       │
└──────────────────────────────────────────────────┘
```

### Phase 1：Figma Plugin — 数据收集器（MVP 2周）

**技术选型：** Figma Plugin API (TypeScript)

**核心功能：**

```typescript
// 1. 递归遍历所有节点，收集元数据
interface NodeMetadata {
  id: string;
  currentName: string;           // 当前名称（可能是 "Frame 123"）
  type: NodeType;                // FRAME, COMPONENT, INSTANCE, TEXT, etc.
  parentChain: string[];         // 祖先链路 ["Page > Screen > Header > ..."]
  
  // 结构信息
  children: string[];            // 子节点名称列表
  childCount: number;
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL";
  
  // 视觉信息
  width: number;
  height: number;
  position: { x: number, y: number };
  fills: FillInfo[];             // 颜色/图片填充
  strokes: StrokeInfo[];
  opacity: number;
  visible: boolean;
  
  // 文字信息（如果是 TEXT 节点）
  characters?: string;           // 实际文字内容
  fontSize?: number;
  fontFamily?: string;
  
  // 组件信息
  isComponent: boolean;
  componentProperties?: Record<string, ComponentProperty>;
  variantProperties?: Record<string, string>;  // Size=Large, State=Disabled
  mainComponentName?: string;    // instance 的主组件名
  
  // 样式信息
  boundVariables?: Record<string, Variable>;
  appliedStyles?: Record<string, Style>;
  
  // 上下文线索
  isDefaultName: boolean;        // 是否是 Figma 默认名称
  siblingNames: string[];        // 兄弟节点名称
  pageContext: string;           // 所在页面名称
}

// 2. 导出节点截图（带高亮）
async function exportNodeWithHighlight(
  targetNode: SceneNode,
  parentFrame: FrameNode
): Promise<Uint8Array> {
  // 方案A: 在目标节点上方临时创建高亮矩形
  const highlight = figma.createRectangle();
  highlight.x = targetNode.absoluteTransform[0][2];
  highlight.y = targetNode.absoluteTransform[1][2];
  highlight.resize(targetNode.width, targetNode.height);
  highlight.fills = [];
  highlight.strokes = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 0.8 }];
  highlight.strokeWeight = 3;
  highlight.dashPattern = [8, 4]; // 虚线边框
  
  // 导出包含高亮的父级 frame
  const bytes = await parentFrame.exportAsync({
    format: 'PNG',
    constraint: { type: 'SCALE', value: 2 }
  });
  
  highlight.remove(); // 清理
  return bytes;
}

// 3. 批量处理 + 发送到后端
async function processPage(page: PageNode) {
  const allNodes: NodeMetadata[] = [];
  
  function traverse(node: SceneNode, depth: number) {
    const metadata = extractMetadata(node);
    if (metadata.isDefaultName || shouldRename(node)) {
      allNodes.push(metadata);
    }
    if ("children" in node) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }
  
  for (const child of page.children) {
    traverse(child, 0);
  }
  
  // 按批次发送（避免一次性处理太多节点）
  const batches = chunkArray(allNodes, 20);
  for (const batch of batches) {
    await sendToBackend(batch);
  }
}
```

### Phase 2：Backend — 视觉上下文组装 + LLM 调用（MVP 2周）

**技术选型：** Python (FastAPI) 或 Node.js

**截图策略（核心创新点）：**

```python
# 三层截图策略，给 Vision LLM 最丰富的上下文

class ScreenshotStrategy:
    
    async def generate_context_images(self, node_id: str, file_key: str):
        """为单个节点生成多层上下文截图"""
        
        # Layer 1: 全屏截图 — 展示整体页面布局
        # 标注目标节点位置（红色虚线框）
        full_screen = await self.export_with_annotation(
            file_key=file_key,
            node_id=self.get_top_frame_id(node_id),
            highlight_node_id=node_id,
            scale=1
        )
        
        # Layer 2: 局部截图 — 目标节点的父级区域
        # 展示目标节点在局部的上下关系
        parent_area = await self.export_with_annotation(
            file_key=file_key,
            node_id=self.get_parent_id(node_id),
            highlight_node_id=node_id,
            scale=2
        )
        
        # Layer 3: 节点本身截图 — 高清细节
        node_detail = await self.export_node(
            file_key=file_key,
            node_id=node_id,
            scale=3
        )
        
        return {
            "full_screen": full_screen,
            "parent_area": parent_area,
            "node_detail": node_detail
        }
```

**LLM Prompt 设计（核心）：**

```python
def build_naming_prompt(node: NodeMetadata, images: dict) -> list:
    """构建给 Vision LLM 的 prompt"""
    
    system_prompt = """You are a senior design system architect. 
Your job is to provide precise, semantic names for Figma layers that:
1. Are instantly understandable by both designers and developers
2. Follow the naming convention: [Component] / [Variant] / [Element] - [State] - [Platform]
3. Make AI/LLM code generation more accurate
4. Use kebab-case for internal layers (icon-left, message-text)
5. Use Title Case for component-level names (Button, Input, Card)

NAMING RULES:
- "/" separates hierarchy levels: Button / Primary / Label
- "+" combines sibling elements: Icon + Label  
- "-" separates state/modifier: Default, Pressed, Disabled
- Platform goes last: Android, iOS, Web
- Internal layers use kebab-case: content-wrapper, action-buttons
- Numbers describe quantity: 3-Options, 5-Items
- Variant props use Prop=Value: State=Disabled, Size=Large

CONTEXT ANALYSIS:
- Look at the FULL SCREEN image to understand the page type (login, chat, settings, etc.)
- Look at the PARENT AREA image to understand the component's role in its section
- Look at the NODE DETAIL image to identify the specific element and its visual state
- Consider the text content, colors, icons to infer purpose
- Consider siblings to ensure consistent naming within a group"""

    user_content = [
        {
            "type": "text",
            "text": f"""Please name this Figma layer. Here's the context:

CURRENT NAME: {node['currentName']}
NODE TYPE: {node['type']}
PARENT CHAIN: {' > '.join(node['parentChain'])}
CHILDREN: {', '.join(node['children'][:10])}
LAYOUT: {node['layoutMode']}
SIZE: {node['width']}x{node['height']}
TEXT CONTENT: {node.get('characters', 'N/A')}
VARIANT PROPERTIES: {json.dumps(node.get('variantProperties', {}))}
SIBLING NAMES: {', '.join(node['siblingNames'][:8])}
PAGE: {node['pageContext']}

Below are 3 images showing the context:
1. FULL SCREEN — red dashed box shows where this node is in the overall page
2. PARENT AREA — zoomed into the parent, red dashed box highlights the node
3. NODE DETAIL — the node itself at high resolution"""
        },
        {"type": "image", "source": {"type": "base64", "data": images["full_screen"]}},
        {"type": "image", "source": {"type": "base64", "data": images["parent_area"]}},
        {"type": "image", "source": {"type": "base64", "data": images["node_detail"]}},
        {
            "type": "text", 
            "text": """Respond with ONLY a JSON object:
{
  "suggested_name": "Button / Primary / Label - Disabled - Android",
  "reasoning": "brief explanation of why this name",
  "confidence": 0.95,
  "alternative_names": ["Button / Primary / CTA - Disabled", "..."]
}"""
        }
    ]
    
    return system_prompt, user_content
```

### Phase 3：智能批量处理 + 一致性保证（Week 3-4）

```python
class ConsistencyEngine:
    """确保同一文件内的命名一致性"""
    
    def __init__(self):
        self.naming_registry = {}  # 已确认的命名
        self.component_patterns = {}  # 识别出的组件模式
    
    def two_pass_naming(self, all_nodes: list):
        """两轮命名策略"""
        
        # Pass 1: 先处理所有组件（Component + ComponentSet）
        # 这些是命名的"锚点"，子层和实例都会参考它们
        components = [n for n in all_nodes if n['isComponent']]
        for comp in components:
            name = self.name_with_llm(comp)
            self.naming_registry[comp['id']] = name
            self.component_patterns[comp['mainComponentName']] = name
        
        # Pass 2: 处理所有 Frame / Instance / 子层
        # 参考 Pass 1 的结果，确保 instance 命名与主组件一致
        others = [n for n in all_nodes if not n['isComponent']]
        for node in others:
            # 如果是 instance，直接继承主组件的命名模式
            if node['type'] == 'INSTANCE' and node['mainComponentName'] in self.component_patterns:
                name = self.derive_instance_name(node)
            else:
                name = self.name_with_llm(node, context=self.naming_registry)
            self.naming_registry[node['id']] = name
    
    def validate_batch(self, names: dict) -> list:
        """验证批量命名的一致性"""
        issues = []
        
        # 检查：同类型组件是否使用相同命名模式
        # 检查：兄弟节点是否有命名冲突
        # 检查：层级深度是否合理（不超过4层 /）
        # 检查：是否有冗余信息（父子节点名重复）
        
        return issues
```

### Phase 4：Plugin UI + 用户交互（Week 4-5）

```
┌─────────────────────────────────────────┐
│  🏷️ Smart Namer                    [×] │
├─────────────────────────────────────────┤
│                                         │
│  Scope: ○ Current Selection             │
│         ● Current Page                  │
│         ○ Entire File                   │
│                                         │
│  Platform: [Android ▼]                  │
│  Naming Style: [Component/Variant ▼]    │
│                                         │
│  ☑ Skip already-named layers           │
│  ☑ Include internal sublayers          │
│  ☐ Dry run (preview only)              │
│                                         │
│  [🔍 Analyze & Preview]                │
│                                         │
├─────────────────────────────────────────┤
│  Preview Changes (24 nodes):            │
│                                         │
│  ✅ Frame 47                            │
│     → Nav / TopBar / Title + Back       │
│     Confidence: 96%                     │
│                                         │
│  ✅ Rectangle 12                        │
│     → Button / Primary / Label - CTA    │
│     Confidence: 91%                     │
│                                         │
│  ⚠️  Group 3                           │
│     → Card / Message / Text ???         │
│     Confidence: 62% [Edit ✏️]           │
│                                         │
│  [Apply All ✅]  [Apply Selected]       │
│  [Export CSV]    [Undo Last]            │
└─────────────────────────────────────────┘
```

---

## 四、技术实现路线图

### MVP（4 周）

| Week | 任务 | 交付物 |
|------|------|--------|
| W1 | Plugin 骨架 + 节点遍历 + 元数据提取 | Plugin 能读取并输出所有节点信息 |
| W2 | REST API 截图导出 + 高亮叠加 | 3 层截图策略可用 |
| W3 | Backend + LLM 集成 + Prompt 工程 | 单节点命名准确率 > 80% |
| W4 | 批量处理 + 一致性引擎 + Plugin UI | 端到端 flow 可跑通 |

### V1.0（+4 周）

| Week | 任务 |
|------|------|
| W5-6 | 自定义命名模板/规则引擎，用户可定义自己的 pattern |
| W7 | 与 Figma MCP Server 集成 — 命名后直接优化 MCP 输出质量 |
| W8 | 团队共享命名词典 + 学习用户修正 |

### V2.0（远期）

- **Design-to-Code 闭环**：命名工具 → MCP → Claude Code → 代码生成，命名质量直接提升代码生成准确率
- **增量更新**：监听 Figma webhook，新增/修改的节点自动触发命名
- **多语言描述**：组件描述同时包含中英文，匹配你的跨语言产品定位

---

## 五、关键技术决策

### 为什么用 Plugin 而不是纯 REST API？

| 因素 | Plugin API | REST API |
|------|-----------|----------|
| 写入能力 | ✅ `node.name = "xxx"` | ❌ 只读 |
| 截图导出 | ✅ `exportAsync()` 可加高亮 | ✅ 但无法叠加标注 |
| 实时性 | ✅ 即时反映 | 需要刷新 |
| 部署 | Figma Community 发布 | 需要服务器 |

**结论：Plugin 是唯一入口，Backend 负责 LLM 调用。**

### 截图高亮策略（核心创新）

```
方案 A: Plugin 内高亮（推荐 MVP）
├── 在目标节点上临时创建红色虚线矩形
├── 导出父级 Frame 的截图
├── 删除临时矩形
└── 优点: 简单，无需图片后处理

方案 B: 后端图片叠加（推荐 V1）
├── REST API 导出原始截图
├── 根据节点坐标信息，在图片上用 Pillow/Sharp 画高亮框
├── 可以同时标注多个节点，用不同颜色
└── 优点: 不修改 Figma 文件，可标注坐标和编号

方案 C: 交互式截图（远期）
├── 导出整页截图
├── 用 SVG overlay 标注所有待命名节点
├── 编号标注，LLM 一次看整页，批量命名
└── 优点: 效率最高，一次 API 调用命名整页
```

### LLM 选型

| 场景 | 推荐模型 | 原因 |
|------|----------|------|
| 视觉理解 + 命名 | Claude Sonnet 4 | 视觉理解强，成本合理 |
| 批量处理降本 | Claude Haiku 4.5 | 简单节点可用小模型 |
| 复杂组件/低置信度 | Claude Opus | 复杂嵌套组件需要更强推理 |

**成本估算（每页约 50 个节点）：**
- 3 张截图 × 50 节点 = 150 张图（可批量优化到 ~20 张整页标注图）
- 估算 ~$0.5-2 / 页（使用 Sonnet）
- 整文件（10 页）~$5-20

---

## 六、与你 IM 产品的协同价值

这个工具对你的 IM 产品有直接价值：

1. **提升 MCP→Code 准确率**：精确命名的 Figma 文件通过 MCP Server 传给 Claude Code，生成的代码直接匹配设计意图
2. **设计师效率**：设计师专注设计，命名自动化处理，降低 designer 负担
3. **跨语言一致性**：你的产品面向多语言用户，组件命名统一后，中英文 UI 的代码复用更容易
4. **可作为独立产品**：这个 Figma Plugin 本身可以独立商业化，Figma Community 有大量需求

---

## 七、Quick Start — 最小可行验证

**用 1 天时间验证核心假设：Vision LLM + 截图能否准确命名？**

```bash
# Step 1: 用 REST API 导出一个页面的截图
curl -H 'X-FIGMA-TOKEN: xxx' \
  'https://api.figma.com/v1/images/FILE_KEY?ids=NODE_ID&format=png&scale=2'

# Step 2: 用 REST API 获取节点树
curl -H 'X-FIGMA-TOKEN: xxx' \
  'https://api.figma.com/v1/files/FILE_KEY/nodes?ids=NODE_ID'

# Step 3: 把截图 + 节点元数据丢给 Claude Vision API
# 看命名准确率如何

# Step 4: 如果准确率 > 70%，值得投入开发完整 Plugin
```

这一步不需要任何 Plugin 开发，纯 API 调用就能验证。
