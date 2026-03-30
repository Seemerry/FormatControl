import { NextRequest } from "next/server";

export const runtime = "nodejs";

interface AmbiguousSegment {
  id: string;
  original: string;
  context: string;
  syntacticFix: string;
}

interface RequestBody {
  segments: AmbiguousSegment[];
  config: {
    apiUrl: string;
    apiKey: string;
    modelId: string;
  };
}

const SYSTEM_PROMPT = `你是一个 Markdown 语法修复专家。用户会给你一些有语法歧义的 Markdown 片段，你需要根据上下文判断作者的真实意图，并给出正确的修复。

歧义类型与判断规则：

1. 不对称强调标记（*、_数量不匹配）：
   - **text* 可能是加粗缺闭合→ **text**，也可能是斜体多了开头→ *text*
   - ***text** 可能是粗斜体缺闭合→ ***text***，也可能是加粗多了开头→ **text**
   - _text__ 同理
   - 根据语义判断：内容强调程度、上下文用词

2. $ 符号（数学公式 vs 货币）：
   - $E=mc^2 → 数学公式，应闭合为 $E=mc^2$
   - $100 → 货币金额，不应修改
   - 根据内容是否为数学表达式判断

3. 图片链接缺少 ! 前缀：
   - [图片描述](url.png) 可能是忘加 ! 的图片→ ![图片描述](url.png)
   - 也可能是有意的超链接
   - 根据描述文本和 URL 判断

4. * / _ 在算术或标识符中被误解析为格式：
   - 3*4*5 中的 *4* 可能被误解为斜体→ 应转义为 3\\*4\\*5
   - my_project_name 中 _project_ 可能被误解为斜体→ 应转义
   - 根据上下文判断是格式还是字面量

5. 反引号分组歧义：
   - \`let x = \`hello\`\` 的定界符归属不明
   - 判断代码内容完整性，给出正确分组

6. 未闭合代码块边界：
   - 代码块后出现空行再出现 Markdown 语法
   - 判断代码块应在哪里结束

只返回修复后的片段，不要解释。`;

export async function POST(req: NextRequest) {
  const { segments, config } = (await req.json()) as RequestBody;

  if (!config.apiKey) {
    return Response.json({ error: "修复模型 API Key 未配置" }, { status: 400 });
  }

  if (!segments.length) {
    return Response.json({ fixes: [] });
  }

  // Build a concise prompt with all ambiguous segments
  const userMessage = segments
    .map(
      (seg, i) =>
        `片段${i + 1}：\n原文：${seg.original}\n上下文：…${seg.context}…\n语法修复建议：${seg.syntacticFix}`
    )
    .join("\n\n");

  const fullPrompt =
    userMessage +
    "\n\n请逐个给出你认为正确的修复结果，格式：\n片段1：修复结果\n片段2：修复结果\n...";

  const endpoint = `${config.apiUrl.replace(/\/$/, "")}/v1/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId || "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: fullPrompt },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json(
        { error: `修复模型 API 错误 (${response.status}): ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    // Parse the response: "片段1：**text**\n片段2：*text*"
    const fixes = segments.map((seg, i) => {
      const pattern = new RegExp(`片段${i + 1}[：:]\\s*(.+?)(?=\\n片段|$)`, "s");
      const match = content.match(pattern);
      return {
        id: seg.id,
        fixed: match ? match[1].trim() : seg.syntacticFix,
      };
    });

    return Response.json({ fixes });
  } catch (err) {
    return Response.json(
      { error: `修复模型请求失败: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
