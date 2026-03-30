"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export default function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body ${isStreaming ? "streaming-cursor" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
