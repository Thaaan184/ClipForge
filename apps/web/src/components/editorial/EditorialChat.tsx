import React, { useState, useRef, useEffect } from "react";
import { EditorialMessage, EditorialAsset } from "../../types";
import {
  Send,
  Bot,
  User,
  Sparkles,
  AtSign,
  Play,
  FileText,
  PlusCircle,
  Code2,
  Loader2,
  Clock,
} from "lucide-react";

interface EditorialChatProps {
  sessionId: string;
  messages: EditorialMessage[];
  assets: EditorialAsset[];
  isSending: boolean;
  isAutopilotWorking: boolean;
  onSendMessage: (text: string) => void;
  onRunAutopilot: () => void;
  onOpenAssetsTab: () => void;
  onViewCode: () => void;
  onOpenScriptModal: () => void;
  reviewPlanToggle: boolean;
  onToggleReviewPlan: () => void;
  externalInputText?: string;
  onClearExternalInput?: () => void;
}

const QUICK_CHIPS = [
  "Lebih rame",
  "Lebih clean",
  "Caption lebih besar",
  "Ganti musik",
  "Zoom lebih sering",
  "Ducking musik latar lebih halus",
];

export const EditorialChat: React.FC<EditorialChatProps> = ({
  messages,
  assets,
  isSending,
  isAutopilotWorking,
  onSendMessage,
  onRunAutopilot,
  onOpenAssetsTab,
  onViewCode,
  onOpenScriptModal,
  reviewPlanToggle,
  onToggleReviewPlan,
  externalInputText,
  onClearExternalInput,
}) => {
  const [inputText, setInputText] = useState("");
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Dynamic Bot Thinking State
  const [thinkingStep, setThinkingStep] = useState(0);
  const THINKING_STEPS = [
    { label: "Menganalisis instruksi & konteks video...", icon: Sparkles },
    { label: "Mengevaluasi timeline, transkrip & audio...", icon: Clock },
    { label: "Menyusun balasan & validasi Remotion TSX...", icon: Code2 },
    { label: "Finishing & mematangkan respon...", icon: Bot },
  ];

  useEffect(() => {
    if (!isSending) {
      setThinkingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setThinkingStep((prev) => (prev + 1) % THINKING_STEPS.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [isSending]);

  useEffect(() => {
    if (externalInputText) {
      setInputText((prev) => {
        const separator = prev.trim().length > 0 ? " " : "";
        return `${prev.trim()}${separator}${externalInputText} `;
      });
      if (onClearExternalInput) {
        onClearExternalInput();
      }
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [externalInputText, onClearExternalInput]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, thinkingStep]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    onSendMessage(inputText.trim());
    setInputText("");
    setShowMentionMenu(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const insertChip = (chip: string) => {
    setInputText((prev) => {
      const sep = prev.trim().length > 0 ? " " : "";
      return `${prev.trim()}${sep}${chip}`;
    });
    inputRef.current?.focus();
  };

  const insertAssetMention = (assetLabel: string) => {
    setInputText((prev) => {
      const sep = prev.trim().length > 0 ? " " : "";
      return `${prev.trim()}${sep}@${assetLabel} `;
    });
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-card border border-line overflow-hidden text-copy font-sans">
      {/* Autopilot Command Bar (PLAN.md P4 Task 4) */}
      <div className="shrink-0 p-3 bg-surface border-b border-line flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-action" />
            <span className="text-xs font-extrabold text-copy uppercase tracking-wider font-mono">
              AI Autopilot
            </span>
            <span className="text-[10px] px-1.5 py-0.2 bg-card text-action border border-line font-mono">
              gaming_hype
            </span>
          </div>

          <button
            onClick={onViewCode}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-card hover:border-action border border-line text-copy text-[11px] font-bold uppercase font-mono transition-colors"
            title="Buka kode Composition.tsx hasil susunan AI"
          >
            <Code2 className="w-3.5 h-3.5 text-action" />
            <span>Lihat Kode</span>
          </button>
        </div>

        {/* 3 Main Action Buttons & Plan Review Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRunAutopilot}
            disabled={isAutopilotWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-action hover:bg-action-hover text-bg text-xs font-extrabold uppercase font-mono tracking-wider transition-colors disabled:opacity-50"
          >
            {isAutopilotWorking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isAutopilotWorking ? "Sedang Memasak..." : "Masak Otomatis"}</span>
          </button>

          <button
            onClick={onOpenScriptModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card hover:border-action border border-line text-copy text-xs font-bold uppercase font-mono tracking-wider transition-colors"
            title="Buka panel Kirim Script untuk menyelaraskan narasi"
          >
            <FileText className="w-3.5 h-3.5 text-action" />
            <span>Kirim Script</span>
          </button>

          <button
            onClick={onOpenAssetsTab}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card hover:border-action border border-line text-copy text-xs font-bold uppercase font-mono tracking-wider transition-colors"
          >
            <PlusCircle className="w-3.5 h-3.5 text-action" />
            <span>Tambah Aset ({assets.length})</span>
          </button>

          <label className="flex items-center gap-2 ml-auto text-[11px] text-muted cursor-pointer select-none font-mono">
            <input
              type="checkbox"
              checked={reviewPlanToggle}
              onChange={onToggleReviewPlan}
              className="accent-[#FF6A00]"
            />
            <span>Review rencana</span>
          </label>
        </div>

        {/* Live Working Progress Banner */}
        {isAutopilotWorking && (
          <div className="flex items-center gap-2.5 p-2 bg-card border border-action text-xs text-action font-mono">
            <Loader2 className="w-4 h-4 text-action animate-spin shrink-0" />
            <div className="flex-1 truncate">
              <span className="font-bold">AI Agent sedang bekerja: </span>
              Menganalisis sinyal, menyusun Composition.tsx, typecheck & render still...
            </div>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="my-auto text-center flex flex-col items-center gap-2 text-muted py-6">
            <Bot className="w-8 h-8 text-muted/60" />
            <div className="text-xs font-bold uppercase tracking-wider font-mono text-copy">
              Klip siap diramu oleh AI Autopilot.
            </div>
            <div className="text-[11px] max-w-sm text-muted leading-relaxed font-sans">
              Klik <strong>"Masak Otomatis"</strong> untuk menyusun video 9:16 dengan subtitle kinetic dan efek punch zoom tersinkronisasi, atau berikan instruksi spesifik di bawah.
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === "user";

            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 max-w-[85%] ${
                  isUser ? "self-end flex-row-reverse" : "self-start flex-row"
                }`}
              >
                <div
                  className={`w-7 h-7 flex items-center justify-center shrink-0 border ${
                    isUser
                      ? "bg-surface border-line text-copy"
                      : "bg-card border-action text-action font-mono"
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={`p-3 text-xs leading-relaxed ${
                    isUser
                      ? "bg-surface text-copy border border-line"
                      : "bg-card text-copy border border-line border-l-2 border-l-action shadow-sm"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  <div
                    className={`mt-1 text-[9px] font-mono ${
                      isUser ? "text-muted text-right" : "text-muted"
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Bot Thinking & Editing Active Status Indicator */}
        {isSending && (
          <div className="flex gap-2.5 max-w-[85%] self-start flex-row animate-fadeIn">
            <div className="w-7 h-7 flex items-center justify-center shrink-0 bg-card border border-action text-action shadow-sm animate-pulse">
              <Bot className="w-3.5 h-3.5" />
            </div>

            <div className="p-3 text-xs leading-relaxed bg-surface text-copy border border-action shadow-lg flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {React.createElement(THINKING_STEPS[thinkingStep].icon, {
                  className: "w-3.5 h-3.5 text-action animate-spin shrink-0",
                })}
                <span className="font-bold text-action font-mono">
                  {THINKING_STEPS[thinkingStep].label}
                </span>
              </div>

              {/* Bouncing Dots Indicator */}
              <div className="flex items-center gap-1.5 pt-0.5 font-mono">
                <span className="text-[10px] text-muted">Editor sedang bekerja</span>
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-action animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-action animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-action animate-bounce"></span>
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Chips */}
      <div className="shrink-0 px-3 py-2 bg-surface border-t border-line flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
        <span className="text-muted shrink-0 text-[10px] font-bold uppercase">
          Cepat:
        </span>
        {QUICK_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => insertChip(chip)}
            className="px-2 py-1 bg-card hover:border-action border border-line text-copy whitespace-nowrap transition-colors text-[11px]"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-3 bg-surface border-t border-line flex flex-col gap-2">
        {/* Mention Helper Popover */}
        {showMentionMenu && assets.length > 0 && (
          <div className="bg-card border border-line p-1.5 shadow-xl flex flex-wrap gap-1.5 max-h-32 overflow-y-auto font-mono">
            <div className="w-full text-[10px] text-muted font-bold px-1 pb-1 border-b border-line uppercase">
              Pilih aset untuk disisipkan ke instruksi:
            </div>
            {assets.map((ast) => (
              <button
                key={ast.id}
                onClick={() => insertAssetMention(ast.label)}
                className="px-2 py-1 bg-surface hover:border-action border border-line text-action text-xs flex items-center gap-1.5 transition-colors"
              >
                <AtSign className="w-3 h-3 text-action" />
                <span className="font-bold">{ast.label}</span>
                {ast.type === "document" && (
                  <span className="text-[9px] px-1 py-0.2 bg-action/20 text-action border border-action/40">
                    TXT/MD
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik instruksi atau panggil aset dengan @label (misal: '@script tolong selaraskan video')..."
              className="w-full bg-card border border-line px-3 py-2 text-xs text-copy placeholder:text-muted/60 focus:outline-none focus:border-action resize-none font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            {assets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMentionMenu(!showMentionMenu)}
                title="Sebut aset (@)"
                className="p-2 bg-surface hover:border-action border border-line text-copy transition-colors text-xs flex items-center justify-center min-h-[36px] min-w-[36px]"
              >
                <AtSign className="w-4 h-4 text-action" />
              </button>
            )}
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              title="Kirim pesan"
              className="p-2 bg-action hover:bg-action-hover text-bg transition-colors disabled:opacity-40 flex items-center justify-center min-h-[36px] min-w-[36px]"
            >
              <Send className="w-4 h-4 fill-current" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
