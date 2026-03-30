import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { messages, config } = await req.json();

  const apiUrl = config.apiUrl || "https://api.deepseek.com";
  const apiKey = config.apiKey;
  const modelId = config.modelId || "deepseek-chat";
  const systemPrompt = config.systemPrompt || "";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API Key 未配置" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = {
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    stream: true,
  };

  const endpoint = `${apiUrl.replace(/\/$/, "")}/v1/chat/completions`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({ error: `API 错误 (${response.status}): ${errText}` }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Forward the SSE stream
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) continue;

              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }

              try {
                const json = JSON.parse(data);
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `请求失败: ${(err as Error).message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
