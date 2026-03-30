import { NextRequest } from "next/server";
import {
  remendByBlocks,
  findAmbiguousPatterns,
  applyLLMFixes,
} from "@/lib/remend-blocks";

export const runtime = "nodejs";

const REPAIR_API_URL = process.env.REPAIR_API_URL || "https://api.deepseek.com";
const REPAIR_API_KEY = process.env.REPAIR_API_KEY || "";
const REPAIR_MODEL_ID = process.env.REPAIR_MODEL_ID || "deepseek-chat";

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

3. 图片链接缺少 ! 前缀：
   - [图片描述](url.png) 可能是忘加 ! 的图片→ ![图片描述](url.png)
   - 也可能是有意的超链接

4. * / _ 在算术或标识符中被误解析为格式：
   - 3*4*5 中的 *4* 可能被误解为斜体→ 应转义为 3\\*4\\*5
   - my_project_name 中 _project_ 可能被误解为斜体→ 应转义

5. 反引号分组歧义：判断代码内容完整性，给出正确分组

6. 未闭合代码块边界：判断代码块应在哪里结束

只返回修复后的片段，不要解释。`;

/**
 * POST /api/repair
 *
 * 请求体:
 *   { "text": "有缺陷的 markdown 原文" }
 *   或
 *   { "text": "...", "semantic": false }   // 仅语法修复，不调用模型
 *
 * 响应体:
 *   { "fixed": "修复后的 markdown", "ambiguous_count": 0 }
 */
export async function POST(req: NextRequest) {
  let body: { text?: string; semantic?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体必须是合法 JSON" }, { status: 400 });
  }

  const { text, semantic } = body;

  if (typeof text !== "string") {
    return Response.json(
      { error: '缺少 "text" 字段或类型不是字符串' },
      { status: 400 }
    );
  }

  // 1. 语法修复（始终执行）
  const syntacticFixed = remendByBlocks(text);

  // 是否启用语义修复：请求显式指定 > 环境变量 > 默认 true
  const enableSemantic =
    semantic !== undefined
      ? semantic
      : process.env.REPAIR_SEMANTIC_ENABLED !== "false";

  if (!enableSemantic || !REPAIR_API_KEY) {
    return Response.json({ fixed: syntacticFixed, ambiguous_count: 0 });
  }

  // 2. 检测歧义片段
  const ambiguous = findAmbiguousPatterns(text);
  if (ambiguous.length === 0) {
    return Response.json({ fixed: syntacticFixed, ambiguous_count: 0 });
  }

  // 3. 调用模型修复歧义
  const userMessage = ambiguous
    .map(
      (seg, i) =>
        `片段${i + 1}：\n原文：${seg.original}\n上下文：…${seg.context}…\n语法修复建议：${seg.syntacticFix}`
    )
    .join("\n\n");

  const fullPrompt =
    userMessage +
    "\n\n请逐个给出你认为正确的修复结果，格式：\n片段1：修复结果\n片段2：修复结果\n...";

  const endpoint = `${REPAIR_API_URL.replace(/\/$/, "")}/v1/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${REPAIR_API_KEY}`,
      },
      body: JSON.stringify({
        model: REPAIR_MODEL_ID,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: fullPrompt },
        ],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      // 模型调用失败时退回语法修复结果
      return Response.json({
        fixed: syntacticFixed,
        ambiguous_count: ambiguous.length,
        warning: `语义修复模型调用失败 (${response.status})，已退回语法修复结果`,
      });
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content || "";

    const fixes = ambiguous.map((seg, i) => {
      const pattern = new RegExp(
        `片段${i + 1}[：:]\\s*(.+?)(?=\\n片段|$)`,
        "s"
      );
      const match = content.match(pattern);
      return {
        id: seg.id,
        fixed: match ? match[1].trim() : seg.syntacticFix,
      };
    });

    const finalFixed = applyLLMFixes(syntacticFixed, ambiguous, fixes);
    return Response.json({
      fixed: finalFixed,
      ambiguous_count: ambiguous.length,
    });
  } catch {
    // 网络异常时退回语法修复结果
    return Response.json({
      fixed: syntacticFixed,
      ambiguous_count: ambiguous.length,
      warning: "语义修复模型请求异常，已退回语法修复结果",
    });
  }
}
