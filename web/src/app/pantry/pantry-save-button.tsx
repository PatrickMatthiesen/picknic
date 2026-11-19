"use client";

import { useFormStatus } from "react-dom";

export function PantrySaveButton() {
  const { pending } = useFormStatus();

  return (
    <button aria-live="polite" className="app-theme-primary-button" disabled={pending} type="submit">
      {pending ? "Saving…" : "Save item"}
    </button>
  );
}
