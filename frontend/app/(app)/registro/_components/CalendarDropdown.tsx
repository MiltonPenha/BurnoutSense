"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { DropdownProps } from "react-day-picker";

export function CalendarDropdown(props: DropdownProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const id = useId();
  const options = props.options ?? [];
  const selected = options.find(option => String(option.value) === String(props.value));

  useEffect(() => {
    if (!open) return;
    const option = root.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]:not(:disabled)')
      ?? root.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)');
    option?.focus();
    option?.scrollIntoView({ block: "nearest" });
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function navigate(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
      return;
    }
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault(); buttons[next]?.focus();
  }

  function choose(value: number) {
    if (select.current) {
      // Forward a real select change to DayPicker's month/year navigation.
      select.current.value = String(value);
      select.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false); trigger.current?.focus();
  }

  return <div className="calendar-select" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <select hidden aria-hidden="true" tabIndex={-1} ref={select} value={props.value} onChange={props.onChange} disabled={props.disabled}>
      {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <button className="calendar-select-trigger" ref={trigger} type="button" aria-label={props["aria-label"]} aria-haspopup="listbox" aria-controls={id} aria-expanded={open} disabled={props.disabled}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}>
      <span>{selected?.label}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div className={`calendar-select-options${options.length <= 12 ? " calendar-select-months" : ""}`} id={id} role="listbox" aria-label={props["aria-label"]} onKeyDown={navigate}>
      {options.map(option => <button type="button" role="option" aria-selected={option.value === selected?.value} disabled={option.disabled} key={option.value} tabIndex={option.value === selected?.value ? 0 : -1} onClick={() => choose(option.value)}>
        <span>{option.label}</span>{option.value === selected?.value && <Check size={13} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
