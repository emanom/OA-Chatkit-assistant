import { useState } from "react";

export interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your question…",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendMessage = async () => {
    if (isSubmitting || disabled) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;

    const previousValue = trimmed;
    setValue("");
    setIsSubmitting(true);
    try {
      await onSend(trimmed);
    } catch (error) {
      setValue(previousValue);
      console.error("Failed to send message", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      (event.nativeEvent as KeyboardEvent).isComposing
    ) {
      return;
    }

    event.preventDefault();
    void sendMessage();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 bg-white border border-slate-200 rounded-2xl p-3 flex items-end gap-3 shadow-sm"
    >
      <textarea
        className="w-full bg-transparent resize-y text-sm text-slate-900 focus:outline-none focus:ring-0 placeholder:text-slate-400"
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isSubmitting}
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled || isSubmitting}
        className="px-4 py-2 text-sm font-medium rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
      >
        Send
      </button>
    </form>
  );
}

