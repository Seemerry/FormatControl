"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import ConfigPanel from "@/components/ConfigPanel";
import {
  DEFAULT_CONFIG,
  DEFAULT_REPAIR_CONFIG,
  type ModelConfig,
  type RepairModelConfig,
  type ChatMessage,
} from "@/lib/store";
import {
  remendByBlocks,
  findAmbiguousPatterns,
  applyLLMFixes,
  type AmbiguousSegment,
} from "@/lib/remend-blocks";

export default function Home() {
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [repairConfig, setRepairConfig] =
    useState<RepairModelConfig>(DEFAULT_REPAIR_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [llmFixedMarkdown, setLlmFixedMarkdown] = useState<string | null>(null);
  const [repairError, setRepairError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, rawMarkdown]);

  const syntacticFix = remendByBlocks(rawMarkdown);
  const fixedMarkdown = llmFixedMarkdown ?? syntacticFix;

  // Trigger LLM repair when streaming ends
  const triggerLLMRepair = useCallback(
    async (raw: string) => {
      if (!repairConfig.enabled || !repairConfig.apiKey) return;

      const ambiguous = findAmbiguousPatterns(raw);
      if (ambiguous.length === 0) return;

      setIsRepairing(true);
      setRepairError(null);

      try {
        const res = await fetch("/api/fix-ambiguous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments: ambiguous,
            config: {
              apiUrl: repairConfig.apiUrl,
              apiKey: repairConfig.apiKey,
              modelId: repairConfig.modelId,
            },
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          setRepairError(err.error || "修复请求失败");
          return;
        }

        const data = await res.json();
        if (data.fixes?.length) {
          const syntactic = remendByBlocks(raw);
          const patched = applyLLMFixes(syntactic, ambiguous, data.fixes);
          setLlmFixedMarkdown(patched);
        }
      } catch (err) {
        setRepairError((err as Error).message);
      } finally {
        setIsRepairing(false);
      }
    },
    [repairConfig]
  );

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setRawMarkdown("");
    setLlmFixedMarkdown(null);
    setRepairError(null);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    let accumulated = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          config,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setRawMarkdown(`**错误:** ${err.error || "请求失败"}`);
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith("data:")) continue;

          const data = trimmedLine.slice(5).trim();
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            if (json.content) {
              accumulated += json.content;
              setRawMarkdown(accumulated);
            }
          } catch {
            // skip
          }
        }
      }

      // Add assistant message to history
      setMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRawMarkdown(`**错误:** ${(err as Error).message}`);
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }

    // After streaming completes, trigger LLM repair for ambiguous segments
    if (accumulated) {
      triggerLLMRepair(accumulated);
    }
  }, [input, isStreaming, messages, config, triggerLLMRepair]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b shrink-0"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h1 className="text-base font-semibold">
          Streamdown (remend) Markdown 修复演示
        </h1>
        <button
          onClick={() => setShowConfig(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border hover:bg-[var(--color-muted)]"
          style={{ borderColor: "var(--color-border)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          模型配置
        </button>
      </header>

      {/* Main content: 3-column layout */}
      <main className="flex-1 flex min-h-0">
        {/* Column 1: Chat */}
        <section
          className="flex flex-col w-1/3 border-r"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="px-4 py-2 text-sm font-medium border-b bg-[var(--color-muted)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            聊天
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                      : "bg-[var(--color-muted)]"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="markdown-body">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {/* Current streaming response in chat */}
            {isStreaming && rawMarkdown && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-[var(--color-muted)]">
                  <MarkdownRenderer content={rawMarkdown} isStreaming />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {/* Input area */}
          <div
            className="p-3 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                className="flex-1 resize-none rounded border px-3 py-2 text-sm bg-[var(--color-bg)] min-h-[40px] max-h-[120px]"
                style={{ borderColor: "var(--color-border)" }}
                rows={1}
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 px-3 py-2 rounded text-sm text-white"
                  style={{ backgroundColor: "var(--color-danger)" }}
                >
                  停止
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  className="shrink-0 px-3 py-2 rounded text-sm text-white"
                  style={{ backgroundColor: "var(--color-primary)" }}
                  disabled={!input.trim()}
                >
                  发送
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Column 2: Raw Markdown */}
        <section
          className="flex flex-col w-1/3 border-r"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div
            className="px-4 py-2 text-sm font-medium border-b bg-[var(--color-muted)] flex items-center justify-between"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span>原始 Markdown（含缺陷）</span>
            {isStreaming && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-danger)] text-white">
                接收中...
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Raw source */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div
                className="px-3 py-1.5 text-xs font-medium border-b text-[var(--color-muted-fg)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                源码
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <pre className="text-xs whitespace-pre-wrap break-all font-mono text-[var(--color-muted-fg)]">
                  {rawMarkdown || "(等待模型回复...)"}
                </pre>
              </div>
            </div>
            {/* Rendered */}
            <div
              className="flex-1 min-h-0 flex flex-col border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div
                className="px-3 py-1.5 text-xs font-medium border-b text-[var(--color-muted-fg)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                渲染效果
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {rawMarkdown ? (
                  <MarkdownRenderer
                    content={rawMarkdown}
                    isStreaming={isStreaming}
                  />
                ) : (
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    (等待模型回复...)
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Column 3: Fixed Markdown (via remend + LLM) */}
        <section className="flex flex-col w-1/3">
          <div
            className="px-4 py-2 text-sm font-medium border-b bg-[var(--color-muted)] flex items-center justify-between"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span>remend 修复后</span>
            <div className="flex items-center gap-2">
              {isStreaming && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: "var(--color-success)" }}
                >
                  实时修复中
                </span>
              )}
              {isRepairing && (
                <span className="text-xs px-2 py-0.5 rounded-full text-white bg-amber-500">
                  语义修复中...
                </span>
              )}
              {llmFixedMarkdown && !isRepairing && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: "var(--color-primary)" }}
                >
                  语义修复完成
                </span>
              )}
              {repairError && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: "var(--color-danger)" }}
                  title={repairError}
                >
                  修复失败
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* Fixed source */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div
                className="px-3 py-1.5 text-xs font-medium border-b text-[var(--color-muted-fg)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                源码（修复后）
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <pre className="text-xs whitespace-pre-wrap break-all font-mono">
                  {rawMarkdown ? (
                    <DiffHighlight
                      original={rawMarkdown}
                      fixed={fixedMarkdown}
                    />
                  ) : (
                    <span className="text-[var(--color-muted-fg)]">
                      (等待模型回复...)
                    </span>
                  )}
                </pre>
              </div>
            </div>
            {/* Rendered */}
            <div
              className="flex-1 min-h-0 flex flex-col border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div
                className="px-3 py-1.5 text-xs font-medium border-b text-[var(--color-muted-fg)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                渲染效果（修复后）
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {rawMarkdown ? (
                  <MarkdownRenderer
                    content={fixedMarkdown}
                    isStreaming={isStreaming}
                  />
                ) : (
                  <p className="text-xs text-[var(--color-muted-fg)]">
                    (等待模型回复...)
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Config Modal */}
      <ConfigPanel
        config={config}
        repairConfig={repairConfig}
        onSave={setConfig}
        onSaveRepair={setRepairConfig}
        visible={showConfig}
        onClose={() => setShowConfig(false)}
      />
    </div>
  );
}

/**
 * Simple diff highlighting: shows the fixed markdown with
 * added characters highlighted in green.
 */
function DiffHighlight({
  original,
  fixed,
}: {
  original: string;
  fixed: string;
}) {
  if (original === fixed) {
    return <span>{fixed}</span>;
  }

  // Simple approach: find common prefix and suffix, highlight the middle
  let prefixLen = 0;
  while (
    prefixLen < original.length &&
    prefixLen < fixed.length &&
    original[prefixLen] === fixed[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < original.length - prefixLen &&
    suffixLen < fixed.length - prefixLen &&
    original[original.length - 1 - suffixLen] ===
      fixed[fixed.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const prefix = fixed.slice(0, prefixLen);
  const middle = fixed.slice(
    prefixLen,
    fixed.length - suffixLen || undefined
  );
  const suffix = suffixLen > 0 ? fixed.slice(fixed.length - suffixLen) : "";

  return (
    <>
      <span>{prefix}</span>
      {middle && (
        <span
          className="rounded px-0.5"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.25)",
            color: "var(--color-success)",
          }}
        >
          {middle}
        </span>
      )}
      <span>{suffix}</span>
    </>
  );
}
