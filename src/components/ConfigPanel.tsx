"use client";

import { useState } from "react";
import type { ModelConfig, RepairModelConfig } from "@/lib/store";

interface ConfigPanelProps {
  config: ModelConfig;
  repairConfig: RepairModelConfig;
  onSave: (config: ModelConfig) => void;
  onSaveRepair: (config: RepairModelConfig) => void;
  visible: boolean;
  onClose: () => void;
}

export default function ConfigPanel({
  config,
  repairConfig,
  onSave,
  onSaveRepair,
  visible,
  onClose,
}: ConfigPanelProps) {
  const [tab, setTab] = useState<"chat" | "repair">("chat");
  const [form, setForm] = useState<ModelConfig>(config);
  const [repairForm, setRepairForm] = useState<RepairModelConfig>(repairConfig);

  if (!visible) return null;

  const handleSave = () => {
    onSave(form);
    onSaveRepair(repairForm);
    onClose();
  };

  const inputClass =
    "w-full rounded border px-3 py-2 text-sm bg-[var(--color-muted)]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="w-[560px] max-h-[80vh] overflow-y-auto rounded-lg border bg-[var(--color-bg)] p-6 shadow-xl"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">配置</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex gap-0 mb-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            onClick={() => setTab("chat")}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderColor:
                tab === "chat" ? "var(--color-primary)" : "transparent",
              color:
                tab === "chat"
                  ? "var(--color-primary)"
                  : "var(--color-muted-fg)",
            }}
          >
            聊天模型
          </button>
          <button
            onClick={() => setTab("repair")}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderColor:
                tab === "repair" ? "var(--color-primary)" : "transparent",
              color:
                tab === "repair"
                  ? "var(--color-primary)"
                  : "var(--color-muted-fg)",
            }}
          >
            修复模型
          </button>
        </div>

        {/* Chat Model Tab */}
        {tab === "chat" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">API 地址</label>
              <input
                type="text"
                value={form.apiUrl}
                onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
                className={inputClass}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="https://api.deepseek.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                className={inputClass}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="sk-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">模型 ID</label>
              <input
                type="text"
                value={form.modelId}
                onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                className={inputClass}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="deepseek-chat"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                系统提示词
              </label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) =>
                  setForm({ ...form, systemPrompt: e.target.value })
                }
                className={`${inputClass} min-h-[200px] resize-y`}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="系统提示词..."
              />
            </div>
          </div>
        )}

        {/* Repair Model Tab */}
        {tab === "repair" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={repairForm.enabled}
                  onChange={(e) =>
                    setRepairForm({ ...repairForm, enabled: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-300 peer-checked:bg-[var(--color-primary)] rounded-full peer after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm font-medium">
                启用语义修复
              </span>
            </div>

            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--color-muted-fg)" }}
            >
              当语法修复遇到歧义时（如 **text* 无法判断是加粗还是斜体），
              将歧义片段发送给模型进行语义判断。仅发送歧义部分以节省 Token。
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">API 地址</label>
              <input
                type="text"
                value={repairForm.apiUrl}
                onChange={(e) =>
                  setRepairForm({ ...repairForm, apiUrl: e.target.value })
                }
                className={inputClass}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="https://api.deepseek.com"
                disabled={!repairForm.enabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <input
                type="password"
                value={repairForm.apiKey}
                onChange={(e) =>
                  setRepairForm({ ...repairForm, apiKey: e.target.value })
                }
                className={inputClass}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="sk-..."
                disabled={!repairForm.enabled}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">模型 ID</label>
              <input
                type="text"
                value={repairForm.modelId}
                onChange={(e) =>
                  setRepairForm({ ...repairForm, modelId: e.target.value })
                }
                className={inputClass}
                style={{ borderColor: "var(--color-border)" }}
                placeholder="deepseek-chat"
                disabled={!repairForm.enabled}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border hover:bg-[var(--color-muted)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
