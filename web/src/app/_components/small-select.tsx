"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type SmallSelectOption<T extends string> = {
  value: T;
  label: string;
};

type SmallSelectProps<T extends string> = {
  ariaLabel: string;
  icon?: ReactNode;
  onChange: (value: T) => void;
  options: readonly SmallSelectOption<T>[];
  value: T;
};

export function SmallSelect<T extends string>({
  ariaLabel,
  icon,
  onChange,
  options,
  value,
}: SmallSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  useEffect(() => {
    if (!isOpen) return;
    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isOpen]);

  function openAt(index: number) {
    setActiveIndex(index);
    setIsOpen(true);
  }

  function closeAndReturnFocus() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(options.length - 1);
    }
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }
    if (event.key === "Tab") {
      setIsOpen(false);
      return;
    }

    let nextIndex = activeIndex;
    if (event.key === "ArrowDown") nextIndex = (activeIndex + 1) % options.length;
    else if (event.key === "ArrowUp") nextIndex = (activeIndex - 1 + options.length) % options.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = options.length - 1;
    else return;

    event.preventDefault();
    setActiveIndex(nextIndex);
  }

  const selectedOption = options[selectedIndex];

  return (
    <div className="small-select" ref={rootRef}>
      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="small-select-trigger"
        data-open={isOpen || undefined}
        onClick={() => isOpen ? closeAndReturnFocus() : openAt(selectedIndex)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        {icon ? <span className="small-select-icon">{icon}</span> : null}
        <span className="small-select-value">{selectedOption?.label ?? value}</span>
        <ChevronDown aria-hidden="true" className="small-select-chevron" size={16} />
      </button>

      {isOpen ? (
        <div
          aria-label={ariaLabel}
          className="small-select-listbox"
          id={listboxId}
          onKeyDown={handleListboxKeyDown}
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              aria-selected={option.value === value}
              className="small-select-option"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                closeAndReturnFocus();
              }}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              role="option"
              tabIndex={index === activeIndex ? 0 : -1}
              type="button"
            >
              <span>{option.label}</span>
              <Check aria-hidden="true" size={15} visibility={option.value === value ? "visible" : "hidden"} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
