"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { InventoryAiChatAnswer } from "@/lib/inventory-ai-insights";

type ChatMessage =
  | {
      id: string;
      from: "user";
      text: string;
    }
  | {
      id: string;
      from: "ai";
      answer: InventoryAiChatAnswer;
    };

const iconSrc = "/ai-chatbot-icon-transparent.png";
const quickPrompts = [
  "What should I reorder first?",
  "Which stock is not selling?",
  "Show missed demand risk",
];

const initialAnswer: InventoryAiChatAnswer = {
  title: "Inventory AI",
  answer:
    "Ask me about reorder priority, missed demand, slow stock, top sellers, or old inventory.",
  bullets: [
    "I analyze your live ERP records.",
    "Use short questions like: What should I reorder first?",
  ],
  sourceFacts: [],
  followUpPrompts: quickPrompts,
};

function ChatbotIcon({ className }: { className?: string }) {
  return (
    <Image
      src={iconSrc}
      alt="Inventory AI chatbot"
      width={96}
      height={96}
      className={className}
      draggable={false}
    />
  );
}

function AiMessage({ answer }: { answer: InventoryAiChatAnswer }) {
  return (
    <div className="flex justify-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">
        <ChatbotIcon className="h-full w-full object-contain drop-shadow-sm" />
      </div>

      <div className="max-w-[84%] rounded-[1.35rem] rounded-tl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        <p className="font-black text-slate-950 dark:text-white">
          {answer.title}
        </p>
        <p className="mt-2">{answer.answer}</p>

        {answer.bullets.length > 0 ? (
          <div className="mt-3 space-y-2">
            {answer.bullets.slice(0, 3).map((bullet) => (
              <p
                key={bullet}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
              >
                {bullet}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-[1.35rem] rounded-tr-md bg-blue-600 px-4 py-3 text-sm font-bold leading-6 text-white shadow-sm">
        {text}
      </div>
    </div>
  );
}

export function InventoryAiChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "intro", from: "ai", answer: initialAnswer },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  const followUpPrompts = useMemo(() => {
    const lastAiMessage = [...messages]
      .reverse()
      .find((message) => message.from === "ai");

    return lastAiMessage?.from === "ai"
      ? lastAiMessage.answer.followUpPrompts.slice(0, 3)
      : quickPrompts;
  }, [messages]);

  async function submitQuestion(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();

    if (!trimmedQuestion || isLoading) {
      return;
    }

    setIsOpen(true);
    setQuestion("");
    setIsLoading(true);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `user-${Date.now()}`,
        from: "user",
        text: trimmedQuestion,
      },
    ]);

    try {
      const response = await fetch("/api/inventory-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: trimmedQuestion }),
      });

      if (!response.ok) {
        throw new Error("Inventory AI request failed");
      }

      const data = (await response.json()) as {
        answer: InventoryAiChatAnswer;
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `ai-${Date.now()}`,
          from: "ai",
          answer: data.answer,
        },
      ]);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `ai-error-${Date.now()}`,
          from: "ai",
          answer: {
            title: "Inventory AI unavailable",
            answer:
              "I could not read the inventory records right now. Try again after the database is reachable.",
            bullets: [],
            sourceFacts: [],
            followUpPrompts: quickPrompts,
          },
        },
      ]);
    } finally {
      setIsLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(question);
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end sm:right-6 lg:bottom-6">
      {isOpen ? (
        <section className="mb-4 w-[min(calc(100vw-2.5rem),420px)] overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-2xl shadow-slate-300/60 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/30">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-4 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950">
            <div className="flex h-11 w-11 items-center justify-center">
              <ChatbotIcon className="h-full w-full object-contain drop-shadow-sm" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-950 dark:text-white">
                Inventory AI
              </p>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Stock, reorder and demand assistant
              </p>
            </div>
          </div>

          <div className="max-h-[52vh] space-y-4 overflow-y-auto p-4">
            {messages.map((message) =>
              message.from === "user" ? (
                <UserMessage key={message.id} text={message.text} />
              ) : (
                <AiMessage key={message.id} answer={message.answer} />
              ),
            )}

            {isLoading ? (
              <AiMessage
                answer={{
                  title: "Checking records...",
                  answer: "Reading products, orders, inquiries and stock data.",
                  bullets: [],
                  sourceFacts: [],
                  followUpPrompts: quickPrompts,
                }}
              />
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="mb-3 flex flex-wrap gap-2">
              {followUpPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitQuestion(prompt)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask inventory AI..."
                className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400/40 dark:focus:ring-blue-500/10"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="min-h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        aria-label={isOpen ? "Hide inventory AI chatbot" : "Open inventory AI chatbot"}
        onClick={() => setIsOpen((currentValue) => !currentValue)}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-transparent shadow-2xl shadow-cyan-500/30 transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-cyan-300/40"
      >
        <ChatbotIcon className="h-full w-full object-contain drop-shadow-xl" />
      </button>
    </div>
  );
}
