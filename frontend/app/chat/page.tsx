"use client"
import React, { useState, useRef, useEffect } from "react";
import { ChatStreamProvider, useChatStream } from "./ChatStreamContext";

function ChatMessages() {
  const { messages } = useChatStream();
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl mx-auto py-4 px-2 overflow-y-auto flex-1">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`rounded-lg px-4 py-2 max-w-[80%] whitespace-pre-line ${
            msg.role === "user"
              ? "self-end bg-blue-500 text-white"
              : "self-start bg-zinc-200 text-black dark:bg-zinc-800 dark:text-zinc-100"
          } ${msg.partial ? "opacity-70 italic" : ""}`}
        >
          {msg.content}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function ChatInput() {
  const { sendMessage, suggestions, loading } = useChatStream();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = async (prompt: string) => {
    if (!prompt.trim()) return;
    setInput("");
    await sendMessage(prompt);
    inputRef.current?.focus();
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-2 pb-4">
      {loading && suggestions.length === 0 && (
        <div className="flex flex-col gap-1 mb-2">
          <span className="text-zinc-500 text-sm pl-1">Loading suggestions…</span>
          <div className="flex flex-wrap gap-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-8 w-40 bg-zinc-200 dark:bg-zinc-700 rounded-full animate-pulse"
              />
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              className="bg-zinc-100 dark:bg-zinc-700 text-black dark:text-zinc-100 px-3 py-1 rounded-full border border-zinc-300 dark:border-zinc-600 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition"
              onClick={() => handleSend(s)}
              disabled={loading}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          handleSend(input);
        }}
      >
        <input
          ref={inputRef}
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 bg-white dark:bg-zinc-900 text-black dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          type="text"
          placeholder="Type your message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default function ChatPage() {
  return (
    <ChatStreamProvider>
      <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-black">
        <header className="w-full py-4 px-4 border-b border-zinc-200 dark:border-zinc-800 text-xl font-bold text-center bg-white dark:bg-zinc-900">
          AI Chat
        </header>
        <main className="flex flex-col flex-1">
          <ChatMessages />
        </main>
        <ChatInput />
      </div>
    </ChatStreamProvider>
  );
}
