"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { InventoryAiChatAnswer } from "@/lib/inventory-ai-insights";
import {
  announceWorkspaceOverlay,
  WORKSPACE_OVERLAY_OPEN_EVENT,
  type WorkspaceOverlayOpenDetail,
} from "@/lib/workspace-overlay";

const INVENTORY_INTELLIGENCE_OVERLAY_ID = "inventory-intelligence";

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

function IntelligenceIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8.5 5.5 12 3l3.5 2.5v4L12 12 8.5 9.5v-4Z" />
      <path d="m12 12-3.5 2.5v4L12 21l3.5-2.5v-4L12 12Z" />
      <path d="M8.5 7.5H5.8L4 9.3M15.5 7.5h2.7L20 9.3M8.5 16.5H5.8L4 14.7M15.5 16.5h2.7l1.8-1.8" />
      <circle cx="4" cy="9.3" r=".8" fill="currentColor" stroke="none" />
      <circle cx="20" cy="9.3" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4" cy="14.7" r=".8" fill="currentColor" stroke="none" />
      <circle cx="20" cy="14.7" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function AiMessage({ answer }: { answer: InventoryAiChatAnswer }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-start gap-3 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/20">
          <IntelligenceIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-950 dark:text-white">
              {answer.title}
            </p>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              Live ERP data
            </span>
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
            {answer.answer}
          </p>
        </div>
      </div>

      {answer.bullets.length > 0 ? (
        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-slate-950/40">
          <div className="space-y-2.5">
            {answer.bullets.slice(0, 4).map((bullet) => (
              <div key={bullet} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                <p className="min-w-0 break-words text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                  {bullet}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {answer.sourceFacts.length > 0 ? (
        <details className="group border-t border-slate-100 dark:border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-[0.13em] text-slate-500 transition hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/[0.03]">
            How this was calculated
            <span className="text-sm transition group-open:rotate-45">+</span>
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-white/10">
            {answer.sourceFacts.slice(0, 4).map((fact) => (
              <p
                key={fact}
                className="break-words text-[11px] font-medium leading-5 text-slate-500 dark:text-slate-400"
              >
                {fact}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[86%] rounded-2xl rounded-br-md bg-slate-950 px-4 py-3 text-sm font-bold leading-5 text-white shadow-sm dark:bg-blue-600">
        {text}
      </div>
    </div>
  );
}

function LoadingMessage() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
        <IntelligenceIcon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-slate-800 dark:text-slate-100">
          Analysing inventory signals
        </p>
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className="h-1.5 w-8 animate-pulse rounded-full bg-blue-200 dark:bg-blue-500/30"
              style={{ animationDelay: `${item * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function InventoryAiChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleWorkspaceOverlayOpen(event: Event) {
      const overlayId = (
        event as CustomEvent<WorkspaceOverlayOpenDetail>
      ).detail?.id;

      if (overlayId !== INVENTORY_INTELLIGENCE_OVERLAY_ID) {
        setIsOpen(false);
      }
    }

    window.addEventListener(
      WORKSPACE_OVERLAY_OPEN_EVENT,
      handleWorkspaceOverlayOpen,
    );

    return () => {
      window.removeEventListener(
        WORKSPACE_OVERLAY_OPEN_EVENT,
        handleWorkspaceOverlayOpen,
      );
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [isLoading, isOpen, messages]);

  async function submitQuestion(nextQuestion: string) {
    const trimmedQuestion = nextQuestion.trim();

    if (!trimmedQuestion || isLoading) return;

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion }),
      });

      if (!response.ok) {
        throw new Error("Inventory intelligence request failed");
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
            title: "Inventory intelligence unavailable",
            answer:
              "The inventory records could not be read right now. Please try again in a moment.",
            bullets: [],
            sourceFacts: [],
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

  function toggleInventoryIntelligence() {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const blockingOverlay = document.querySelector(
      `[data-workspace-overlay]:not([data-workspace-overlay="${INVENTORY_INTELLIGENCE_OVERLAY_ID}"])`,
    );

    if (blockingOverlay) return;

    announceWorkspaceOverlay(INVENTORY_INTELLIGENCE_OVERLAY_ID);
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end sm:right-6 lg:bottom-6">
      {isOpen ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close inventory intelligence"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 cursor-default bg-transparent"
        />
      ) : null}

      {isOpen ? (
        <section
          role="dialog"
          aria-modal={false}
          aria-label="Inventory Intelligence"
          data-workspace-overlay={INVENTORY_INTELLIGENCE_OVERLAY_ID}
          className="relative mb-4 flex max-h-[min(720px,calc(100vh-8rem))] w-[min(calc(100vw-2rem),440px)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-[0_28px_80px_rgba(15,23,42,0.22)] dark:border-white/10 dark:bg-slate-950"
        >
          <header className="relative overflow-hidden border-b border-slate-200 bg-white px-5 py-4 dark:border-white/10 dark:bg-slate-900">
            <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-blue-100/80 blur-3xl dark:bg-blue-500/10" />
            <div className="relative flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 via-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25">
                <IntelligenceIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    Inventory Intelligence
                  </p>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-500/10" />
                </div>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Evidence-backed stock decisions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close inventory intelligence"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && !isLoading ? (
              <div className="px-3 py-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                  <IntelligenceIcon className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-black text-slate-900 dark:text-white">
                  Ask in your own words
                </p>
                <p className="mx-auto mt-1 max-w-xs text-xs font-medium leading-5 text-slate-500 dark:text-slate-400">
                  English, Hindi, Hinglish or mixed language—type naturally.
                </p>
              </div>
            ) : null}
            {messages.map((message) =>
              message.from === "user" ? (
                <UserMessage key={message.id} text={message.text} />
              ) : (
                <AiMessage key={message.id} answer={message.answer} />
              ),
            )}
            {isLoading ? <LoadingMessage /> : null}
            <div ref={messagesEndRef} />
          </div>

          <footer className="border-t border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100 dark:border-white/10 dark:bg-slate-950 dark:focus-within:border-blue-400/40 dark:focus-within:ring-blue-500/10"
            >
              <input
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about stock, demand or reorder..."
                aria-label="Ask inventory intelligence"
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
              <button
                type="submit"
                disabled={isLoading || !question.trim()}
                aria-label="Send inventory question"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
              >
                <ArrowIcon className="h-4 w-4" />
              </button>
            </form>
            <p className="mt-2 text-center text-[9px] font-semibold text-slate-400">
              Uses ERP records only · Recommendations remain reviewable
            </p>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        aria-label={
          isOpen
            ? "Hide inventory intelligence"
            : "Open inventory intelligence"
        }
        onClick={toggleInventoryIntelligence}
        className="group relative grid h-14 w-14 place-items-center rounded-2xl border border-blue-200 bg-white text-blue-600 shadow-[0_14px_35px_rgba(37,99,235,0.18)] transition hover:-translate-y-1 hover:border-blue-300 hover:bg-blue-50 hover:shadow-[0_18px_42px_rgba(37,99,235,0.24)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200/70 dark:border-blue-300/20 dark:bg-gradient-to-br dark:from-slate-950 dark:via-blue-950 dark:to-blue-700 dark:text-white dark:shadow-[0_18px_45px_rgba(37,99,235,0.34)] dark:hover:border-blue-300/30 dark:hover:shadow-[0_22px_55px_rgba(37,99,235,0.42)] dark:focus-visible:ring-blue-300/50"
      >
        <span className="absolute inset-[1px] rounded-[15px] bg-gradient-to-br from-blue-50/80 to-transparent dark:from-white/10" />
        <IntelligenceIcon className="relative h-7 w-7 transition group-hover:scale-105" />
        <span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-emerald-500 dark:border-slate-950" />
      </button>
    </div>
  );
}
