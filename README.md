# Streamdown Markdown 修复服务

修复 LLM 流式输出中常见的 Markdown 语法缺陷。提供 HTTP API 接口，也内置了可视化对比演示页面。

## 修复能力

采用两层修复架构：

**第一层：语法修复**（确定性正则，零延迟）

| 类别 | 修复内容 |
|------|---------|
| 标题 | `#标题` → `# 标题`，`#######` → `######` |
| 加粗/斜体 | `*text**` → `**text**`，未闭合自动补全 |
| 粗斜体 | `***text**` → `***text***` |
| 删除线 | `~text~~` → `~~text~~`，未闭合补全 |
| 列表 | `-item` → `- item` |
| 引用块 | `>text` → `> text` |
| 行内代码 | 未闭合反引号修复，双反引号不对称修复 |
| 代码块 | 未闭合自动补 ` ``` `，近似闭合 fence 纠正，嵌套代码块处理 |
| 链接 | 未闭合括号修复，`[text] (url)` 空格移除 |
| 图片 | 未闭合 URL 括号修复 |
| 表格 | 缺少尾部 `\|` 补全 |
| 数学公式 | `$$` 块未闭合补全，`$` 对 `$$` 不对称修正，行内公式闭合 |
| 嵌套结构 | 链接文本内未闭合标记、加粗内未闭合斜体/代码 |
| 空格标记 | `* *text* *` → `**text**` |

**第二层：语义修复**（可选，调用 LLM）

当语法层面存在歧义（多种合理解释）时，仅将歧义片段发送给模型判断：

| 歧义类型 | 示例 | 歧义说明 |
|---------|------|---------|
| 不对称强调 | `**文本*` | 加粗缺闭合 or 斜体多了 `*` |
| $ 符号 | `$50`、`$E=mc^2` | 货币 or 数学公式 |
| 图片链接 | `[图](url.png)` | 忘写 `!` or 有意的超链接 |
| 算术星号 | `3*4*5` | 乘法 or 斜体格式 |
| 标识符下划线 | `my_project_name` | snake_case or 斜体 |
| 反引号分组 | `` `x=`hello`` `` | 定界符归属不明 |
| 代码块边界 | 未闭合 + 空行 + Markdown 语法 | 代码 or 正文 |

完整检测规则见 [ambiguous-patterns.md](ambiguous-patterns.md)。

## 快速开始

```bash
git clone <repo-url>
cd FormatControl2
npm install

# 配置语义修复模型（可选）
cp .env.example .env
# 编辑 .env 填入 API Key

npm run dev
```

## API 接口

### `POST /api/repair`

传入有缺陷的 Markdown 原文，返回修复后的结果。

**请求：**

```bash
curl -X POST http://localhost:3000/api/repair \
  -H "Content-Type: application/json" \
  -d '{"text": "#标题\n\n**加粗文本* 的内容\n\n-列表项"}'
```

**请求体：**

```json
{
  "text": "有缺陷的 markdown 原文",
  "semantic": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 是 | 待修复的 Markdown 原文 |
| `semantic` | boolean | 否 | 是否启用 LLM 语义修复。省略时由环境变量 `REPAIR_SEMANTIC_ENABLED` 决定 |

**响应体：**

```json
{
  "fixed": "# 标题\n\n**加粗文本** 的内容\n\n- 列表项",
  "ambiguous_count": 0
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `fixed` | string | 修复后的 Markdown |
| `ambiguous_count` | number | 检测到的歧义片段数量 |
| `warning` | string? | 仅当语义修复失败时出现，此时 `fixed` 退回为语法修复结果 |

**调用示例（各语言）：**

Python:
```python
import requests

resp = requests.post("http://localhost:3000/api/repair", json={
    "text": "#标题\n\n**加粗* 内容"
})
print(resp.json()["fixed"])
```

JavaScript:
```javascript
const res = await fetch("http://localhost:3000/api/repair", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "#标题\n\n**加粗* 内容" }),
});
const { fixed } = await res.json();
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `REPAIR_API_URL` | `https://api.deepseek.com` | 语义修复模型的 API 地址，兼容 OpenAI 格式 |
| `REPAIR_API_KEY` | 空 | API Key。为空时自动跳过语义修复 |
| `REPAIR_MODEL_ID` | `deepseek-chat` | 模型 ID |
| `REPAIR_SEMANTIC_ENABLED` | `true` | 设为 `false` 全局禁用语义修复 |

## 演示页面

访问 `http://localhost:3000` 可查看内置的三栏对比演示界面：

- **左栏**：与 LLM 聊天（可配置任意 OpenAI 兼容 API）
- **中栏**：模型原始输出（含缺陷）的源码和渲染
- **右栏**：修复后的源码和渲染，差异部分绿色高亮

右上角"模型配置"可分别设置聊天模型和修复模型。

## 技术栈

- Next.js 15 (App Router) + React 19 + TypeScript
- [remend](https://www.npmjs.com/package/remend) — Markdown 流式修复基础库
- Tailwind CSS v4
- react-markdown + remark-gfm + remark-math + rehype-katex

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── repair/route.ts        ← 公开 API 接口
│   │   ├── chat/route.ts          ← 演示页面用的聊天代理
│   │   └── fix-ambiguous/route.ts ← 演示页面用的歧义修复代理
│   ├── page.tsx                   ← 三栏演示页面
│   └── layout.tsx
├── lib/
│   ├── remend-blocks.ts           ← 核心修复逻辑
│   └── store.ts                   ← 类型定义与默认配置
└── components/
    ├── MarkdownRenderer.tsx
    └── ConfigPanel.tsx
```

## License

Private
