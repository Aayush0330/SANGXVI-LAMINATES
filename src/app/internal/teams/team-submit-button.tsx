"use client";

import { useFormStatus } from "react-dom";

type TeamSubmitButtonProps = {
  label: string;
  pendingLabel: string;
  className: string;
  ariaLabel?: string;
  confirmMessage?: string;
  disabled?: boolean;
  title?: string;
};

export function TeamSubmitButton({
  label,
  pendingLabel,
  className,
  ariaLabel,
  confirmMessage,
  disabled = false,
  title,
}: TeamSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={ariaLabel}
      title={title}
      className={className}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
