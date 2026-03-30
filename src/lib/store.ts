export interface ModelConfig {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  systemPrompt: string;
}

export interface RepairModelConfig {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  modelId: string;
}

export const DEFAULT_CONFIG: ModelConfig = {
  apiUrl: "https://api.deepseek.com",
  apiKey: "",
  modelId: "deepseek-chat",
  systemPrompt: `你是一个AI助手。请注意：你在回复时必须使用 Markdown 格式，并且要故意制造一些 Markdown 语法缺陷。具体要求：

1. 使用丰富的 Markdown 格式（标题、加粗、斜体、代码块、列表、表格、链接、引用等）
2. 但要故意制造以下类型的缺陷（每次回复随机包含3-5种）：
   - 加粗标记不闭合，如 **文本 缺少右侧 **
   - 斜体标记不闭合，如 *文本 缺少右侧 *
   - 代码块缺少结尾的 \`\`\`
   - 链接格式不完整，如 [文本](url 缺少右括号
   - 表格缺少分隔行或列数不匹配
   - 行内代码缺少闭合反引号
   - 删除线标记不对称
   - 标题井号后缺少空格
   - 列表符号后缺少空格
   - 引用块大于号后缺少空格

请自然地回答问题，同时在 Markdown 格式中混入这些缺陷。不要告诉用户你在故意制造缺陷。`,
};

export const DEFAULT_REPAIR_CONFIG: RepairModelConfig = {
  enabled: true,
  apiUrl: "https://api.deepseek.com",
  apiKey: "",
  modelId: "deepseek-chat",
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
