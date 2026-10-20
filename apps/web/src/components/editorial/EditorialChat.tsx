import React, { useState, useRef, useEffect } from "react";
import { EditorialMessage, EditorialAsset } from "../../types";
import { Send, Bot, User, Sparkles, AtSign } from "lucide-react";

interface EditorialChatProps {
  sessionId: string;
  messages: EditorialMessage[];
  assets: EditorialAsset[];
  isSending: boolean;
  onSendMessage: (text: string) => void;
  externalInputText?: string;
  onClearExternalInput?: () => void;
}

const QUICK_CHIPS = [
  "Perbesar ukuran caption",
  "Beri punch zoom di momen puncak",
  "Ducking musik latar lebih halus",
  "Ganti backsound musik",
  "Tampilkan asset di detik ini",
];

export const EditorialChat: React.FC<EditorialChatProps> = ({
  messages,
  assets,
  isSending,
  onSendMessage,
  externalInputText,
  onClearExternalInput,
}) => {
  const [inputText, setInputText] = useState("");
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync external text (such as timestamp comments from video player or @asset mentions)
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
  }, [messages]);

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
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-slate-200">
      {/* Chat Header */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Editorial AI Chat
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
            P3 Stub
          </span>
        </div>
        <span className="text-[11px] text-slate-500 hidden sm:inline">
          Kirim instruksi atau komentar bertimestamp
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 min-h-[220px]">
        {messages.length === 0 ? (
          <div className="my-auto text-center flex flex-col items-center gap-2 text-slate-500 py-6">
            <Bot className="w-8 h-8 text-slate-600" />
            <div className="text-xs font-medium text-slate-400">
              Editorial Studio siap menerima arahan.
            </div>
            <div className="text-[11px] max-w-sm">
              Gunakan tombol "Komentar di detik ini" pada video player untuk menandai timestamp, sebut @aset, atau pilih arahan cepat di bawah.
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
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Chips */}
      <div className="px-3 py-2 bg-slate-950/40 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px]">
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
      <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-col gap-2">
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
