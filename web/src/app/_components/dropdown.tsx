"use client";

import { type ReactNode, useEffect, useRef } from "react";

type DropdownProps = {
  label: ReactNode;
  className?: string;
  summaryClassName: string;
  panelClassName: string;
  autoCloseOnOutsideClick?: boolean;
  children: ReactNode;
};

export function Dropdown({
  label,
  className,
  summaryClassName,
  panelClassName,
  autoCloseOnOutsideClick = true,
  children,
}: DropdownProps) {
  const dropdownRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!autoCloseOnOutsideClick) {
      return;
    }

    function closeOnOutsidePress(event: PointerEvent) {
      const dropdown = dropdownRef.current;
      if (!dropdown?.open) {
        return;
      }

      const target = event.target as Node;
      if (!dropdown.contains(target)) {
        dropdown.open = false;
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [autoCloseOnOutsideClick]);

  return (
    <details className={className} ref={dropdownRef}>
      <summary className={summaryClassName}>{label}</summary>
      <div className={panelClassName}>{children}</div>
    </details>
  );
}
