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
    <div className="flex flex-col h-full min-h-0 bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-slate-200">
      {/* Autopilot Command Bar (PLAN.md P4 Task 4) */}
      <div className="shrink-0 p-3 bg-slate-950/90 border-b border-slate-800 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              AI Autopilot
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-mono">
              gaming_hype
            </span>
          </div>

          <button
            onClick={onViewCode}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-[11px] font-semibold transition"
            title="Buka kode Composition.tsx hasil susunan AI"
          >
            <Code2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Lihat Kode</span>
          </button>
        </div>

        {/* 3 Main Action Buttons & Plan Review Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRunAutopilot}
            disabled={isAutopilotWorking}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50"
          >
            {isAutopilotWorking ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current text-yellow-300" />
            )}
            <span>{isAutopilotWorking ? "Sedang Memasak..." : "Masak Otomatis"}</span>
          </button>

          <button
            onClick={onOpenScriptModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition shadow-sm"
            title="Buka panel Kirim Script untuk menyelaraskan narasi"
          >
            <FileText className="w-3.5 h-3.5 text-sky-400" />
            <span>Kirim Script</span>
          </button>

          <button
            onClick={onOpenAssetsTab}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tambah Aset Dulu ({assets.length})</span>
          </button>

          <label className="flex items-center gap-2 ml-auto text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reviewPlanToggle}
              onChange={onToggleReviewPlan}
              className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Review rencana dulu</span>
          </label>
        </div>

        {/* Live Working Progress Banner */}
        {isAutopilotWorking && (
          <div className="flex items-center gap-2.5 p-2 bg-indigo-950/60 border border-indigo-700/60 rounded text-xs text-indigo-200">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
            <div className="flex-1 truncate">
              <span className="font-bold">AI Agent sedang bekerja: </span>
              Menganalisis manifest sinyal, menyusun komposisi Remotion TSX, typecheck & render still...
            </div>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 min-h-0 p-4 overflow-y-auto flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="my-auto text-center flex flex-col items-center gap-2 text-slate-500 py-6">
            <Bot className="w-8 h-8 text-slate-600" />
            <div className="text-xs font-medium text-slate-300">
              Klip siap diramu oleh AI Autopilot.
            </div>
            <div className="text-[11px] max-w-sm text-slate-400 leading-relaxed">
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
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isUser
                      ? "bg-slate-700 text-slate-200"
                      : "bg-indigo-950 border border-indigo-700/60 text-indigo-300"
                  }`}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div
                  className={`p-3 rounded-lg text-xs leading-relaxed ${
                    isUser
                      ? "bg-slate-800 text-slate-100 rounded-tr-none border border-slate-700"
                      : "bg-slate-950 text-slate-300 rounded-tl-none border border-slate-800"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                  <div
                    className={`mt-1 text-[9px] font-mono ${
                      isUser ? "text-slate-400 text-right" : "text-slate-500"
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
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-indigo-950 border border-indigo-500/80 text-indigo-300 shadow-sm animate-pulse">
              <Bot className="w-3.5 h-3.5" />
            </div>

            <div className="p-3 rounded-lg text-xs leading-relaxed bg-slate-950 text-slate-200 rounded-tl-none border border-indigo-700/60 shadow-lg flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {React.createElement(THINKING_STEPS[thinkingStep].icon, {
                  className: "w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0",
                })}
                <span className="font-medium text-slate-200">
                  {THINKING_STEPS[thinkingStep].label}
                </span>
              </div>

              {/* Bouncing Dots Indicator */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-400 font-mono">Editor sedang bekerja</span>
                <span className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"></span>
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Chips */}
      <div className="shrink-0 px-3 py-2 bg-slate-950/40 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px]">
        <span className="text-slate-500 shrink-0 text-[10px] font-semibold uppercase">
          Cepat:
        </span>
        {QUICK_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => insertChip(chip)}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded whitespace-nowrap transition text-[11px]"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-3 bg-slate-950 border-t border-slate-800 flex flex-col gap-2">
        {/* Mention Helper Popover */}
        {showMentionMenu && assets.length > 0 && (
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-1.5 shadow-xl flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            <div className="w-full text-[10px] text-slate-400 font-semibold px-1 pb-1 border-b border-slate-800">
              Pilih aset untuk disisipkan ke instruksi:
            </div>
            {assets.map((ast) => (
              <button
                key={ast.id}
                onClick={() => insertAssetMention(ast.label)}
                className="px-2 py-1 bg-slate-800 hover:bg-indigo-900 text-indigo-300 rounded text-xs flex items-center gap-1 transition"
              >
                <AtSign className="w-3 h-3" />
                <span>{ast.label}</span>
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
              placeholder="Ketik instruksi perbaikan komposisi... (misal: 'Beri zoom di [00:04.2]')"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            {assets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMentionMenu(!showMentionMenu)}
                title="Sebut aset (@)"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-xs flex items-center justify-center"
              >
                <AtSign className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              title="Kirim pesan"
              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition disabled:opacity-40 flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
