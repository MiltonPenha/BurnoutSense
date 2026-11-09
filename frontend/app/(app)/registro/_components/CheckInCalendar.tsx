"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import { dailyDate } from "@/lib/daily-checkin";
import "./CheckInCalendar.css";

function localDay(key: string) {
  return new Date(`${key}T12:00:00`);
}

function dayKey(day: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${String(day.getFullYear()).padStart(4, "0")}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

export function CheckInCalendar({ date, today, disabled, onSelect }: { date: string; today: string; disabled: boolean; onSelect: (date: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const selected = localDay(date || today);
  const lastDay = localDay(today);
  const firstYear = Math.min(1900, selected.getFullYear());

  function choose(value: Date) {
    dialog.current?.close();
    onSelect(dayKey(value));
  }

  return <div className="daily-date-field">
    <span className="check-in-calendar-label" id="check-in-date-label">Dia do check-in</span>
    <button id="check-in-date" className="check-in-calendar-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-labelledby="check-in-date-label check-in-date-value" data-date={date} disabled={disabled || !date} onClick={() => { setOpen(true); dialog.current?.showModal(); }}>
      <CalendarDays size={17} aria-hidden="true" /><span id="check-in-date-value">{date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : "Selecionar data"}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    <dialog className="check-in-calendar" ref={dialog} aria-labelledby="check-in-calendar-title" onClose={() => setOpen(false)}>
      <header><h2 id="check-in-calendar-title">Selecionar data</h2><button className="check-in-calendar-icon" type="button" aria-label="Fechar calendário" title="Fechar calendário" onClick={() => dialog.current?.close()}><X size={18} aria-hidden="true" /></button></header>
      {open && <DayPicker mode="single" required locale={ptBR} today={lastDay} selected={selected} defaultMonth={selected}
        startMonth={localDay(`${String(firstYear).padStart(4, "0")}-01-01`)} endMonth={lastDay} disabled={{ after: lastDay }}
        captionLayout="dropdown" navLayout="after" fixedWeeks autoFocus onSelect={choose}
        labels={{ labelNext: () => "Próximo mês", labelPrevious: () => "Mês anterior", labelMonthDropdown: () => "Mês", labelYearDropdown: () => "Ano",
          labelDayButton: (day, modifiers) => `${dailyDate(dayKey(day))}${modifiers.today ? ", hoje" : ""}${modifiers.selected ? ", selecionado" : ""}` }}
        components={{ Chevron: ({ orientation, className }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
          return <Icon className={className} size={16} aria-hidden="true" />;
        } }} />}
      <footer><button className="button secondary" type="button" onClick={() => choose(lastDay)}>Hoje</button></footer>
    </dialog>
  </div>;
}
