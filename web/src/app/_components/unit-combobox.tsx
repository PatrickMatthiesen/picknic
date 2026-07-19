"use client";

import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  getUnitById,
  normalizeUnitInput,
  searchUnits,
  type MeasurementSystem,
  type UnitDefinition,
} from "@/lib/units";

const RECENT_UNITS_KEY = "picknic:recent-units";
const MAX_POPOVER_HEIGHT = 360;

type UnitValue = { unit: string | null; unitId: string | null };
type PopoverPosition = { left: number; maxHeight: number; top: number; width: number };

function readRecentUnits(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(RECENT_UNITS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function writeRecentUnit(unitId: string): string[] {
  const recent = [unitId, ...readRecentUnits().filter((id) => id !== unitId)].slice(0, 5);
  window.localStorage.setItem(RECENT_UNITS_KEY, JSON.stringify(recent));
  return recent;
}

export function UnitCombobox({
  label,
  onChange,
  preferredSystem,
  unitId,
  value,
}: {
  label: string;
  onChange: (value: UnitValue) => void;
  preferredSystem: MeasurementSystem;
  unitId: string | null;
  value: string | null;
}) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [draftValue, setDraftValue] = useState(value ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentUnitIds, setRecentUnitIds] = useState<string[]>([]);
  const [position, setPosition] = useState<PopoverPosition>({ left: 0, maxHeight: MAX_POPOVER_HEIGHT, top: 0, width: 260 });
  const query = isEditing ? draftValue : value ?? "";
  const results = useMemo(
    () => searchUnits(query, preferredSystem, recentUnitIds),
    [preferredSystem, query, recentUnitIds],
  );
  const showCustomOption = Boolean(query.trim()) && results.length === 0;
  const optionCount = results.length + (showCustomOption ? 1 : 0);
  const currentUnit = getUnitById(unitId);
  const duplicateSymbols = useMemo(() => {
    const counts = new Map<string, number>();
    for (const unit of results) counts.set(unit.symbol, (counts.get(unit.symbol) ?? 0) + 1);
    return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([symbol]) => symbol));
  }, [results]);

  const positionPopover = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    const rect = input.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - viewportPadding * 2);
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    const desiredHeight = Math.min(popoverRef.current?.scrollHeight ?? MAX_POPOVER_HEIGHT, MAX_POPOVER_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const placeAbove = spaceBelow < Math.min(180, desiredHeight) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(MAX_POPOVER_HEIGHT, placeAbove ? spaceAbove - 4 : spaceBelow - 4));
    const top = placeAbove ? Math.max(viewportPadding, rect.top - Math.min(desiredHeight, maxHeight) - 4) : rect.bottom + 4;
    setPosition({ left, maxHeight, top, width });
  }, []);

  const openMenu = useCallback(() => {
    setRecentUnitIds(readRecentUnits());
    setActiveIndex(0);
    setIsOpen(true);
    requestAnimationFrame(positionPopover);
  }, [positionPopover]);

  const closeMenu = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const reposition = () => positionPopover();
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      closeMenu();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [closeMenu, isOpen, positionPopover]);

  function commitCurrentValue() {
    const normalized = normalizeUnitInput(query, preferredSystem, unitId);
    setDraftValue(normalized.unit ?? "");
    setIsEditing(false);
    onChange(normalized);
  }

  function selectUnit(unit: UnitDefinition) {
    setDraftValue(unit.symbol);
    onChange({ unit: unit.symbol, unitId: unit.id });
    setRecentUnitIds(writeRecentUnit(unit.id));
    closeMenu();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectCustomValue() {
    const customValue = query.trim();
    setDraftValue(customValue);
    onChange({ unit: customValue || null, unitId: null });
    closeMenu();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) openMenu();
      else setActiveIndex((current) => optionCount ? (current + 1) % optionCount : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) openMenu();
      else setActiveIndex((current) => optionCount ? (current - 1 + optionCount) % optionCount : 0);
      return;
    }
    if (event.key === "Enter" && isOpen && optionCount) {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) selectUnit(selected);
      else if (showCustomOption) selectCustomValue();
      return;
    }
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  }

  const menu = isOpen && typeof document !== "undefined" ? createPortal(
    <div
      className="unit-combobox-popover"
      ref={popoverRef}
      style={{ left: position.left, maxHeight: position.maxHeight, top: position.top, width: position.width }}
    >
      {!query.trim() ? <div className="unit-combobox-group-label">Recent and common</div> : null}
      <div aria-label="Unit suggestions" id={listboxId} role="listbox">
        {results.map((unit, index) => (
          <button
            aria-selected={unit.id === unitId}
            className={index === activeIndex ? "is-active" : undefined}
            id={`${listboxId}-option-${index}`}
            key={unit.id}
            onClick={() => selectUnit(unit)}
            onPointerDown={(event) => event.preventDefault()}
            role="option"
            type="button"
          >
            <span className="unit-combobox-symbol">{unit.symbol}</span>
            <span className="unit-combobox-name">{unit.name}</span>
            {duplicateSymbols.has(unit.symbol) && unit.system !== "neutral" ? <small>{unit.system === "us" ? "US" : "Metric"}</small> : null}
            {unit.id === unitId ? <Check aria-hidden="true" size={15} /> : null}
          </button>
        ))}
        {showCustomOption ? (
          <button
            aria-selected={unitId === null}
            className={activeIndex === results.length ? "is-active" : undefined}
            id={`${listboxId}-option-${results.length}`}
            onClick={selectCustomValue}
            onPointerDown={(event) => event.preventDefault()}
            role="option"
            type="button"
          >
            <span className="unit-combobox-custom">Use &quot;{query.trim()}&quot;</span>
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div
      className="unit-combobox"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget as Node | null;
        if (nextTarget && (event.currentTarget.contains(nextTarget) || popoverRef.current?.contains(nextTarget))) return;
        commitCurrentValue();
        closeMenu();
      }}
    >
      <input
        aria-activedescendant={isOpen && optionCount ? `${listboxId}-option-${Math.min(activeIndex, optionCount - 1)}` : undefined}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={label}
        autoComplete="off"
        maxLength={30}
        onChange={(event) => {
          setDraftValue(event.target.value);
          setActiveIndex(0);
          if (!isOpen) openMenu();
          else requestAnimationFrame(positionPopover);
        }}
        onFocus={() => {
          setDraftValue(value ?? "");
          setIsEditing(true);
          openMenu();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Unit"
        ref={inputRef}
        role="combobox"
        title={currentUnit?.name}
        value={query}
      />
      <button
        aria-expanded={isOpen}
        aria-label="Show unit suggestions"
        className="unit-combobox-toggle"
        onClick={() => {
          inputRef.current?.focus();
          if (isOpen) closeMenu();
          else openMenu();
        }}
        onPointerDown={(event) => event.preventDefault()}
        tabIndex={-1}
        type="button"
      >
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {menu}
    </div>
  );
}
