'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import type { Meeting } from '@/types/db';

type CalendarProps = {
  meetings: Meeting[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

type CalendarCell = {
  type?: 'empty';
  day?: number;
  dateString?: string;
  events?: Meeting[];
  isToday?: boolean;
};

export default function Calendar({
  meetings,
  selectedDate,
  onSelectDate,
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    if (meetings.length > 0) {
      return new Date(meetings[0].start_time);
    }
    return new Date();
  });

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const { monthLabel, grid } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: CalendarCell[] = [];

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ type: 'empty' });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dateString = toLocalDateString(date);
      const dayMeetings = meetings.filter(
        (m) => m.start_time.slice(0, 10) === dateString
      );

      cells.push({
        day,
        dateString,
        events: dayMeetings,
        isToday: dateString === toLocalDateString(new Date()),
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ type: 'empty' });
    }

    const label = currentDate.toLocaleString([], {
      month: 'long',
      year: 'numeric',
    });

    return {
      monthLabel: label,
      grid: cells,
    };
  }, [currentDate, meetings]);

  const prevMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <section className="mb-20">
      <div className="bg-surface shadow-sm rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="flex items-center justify-between p-8 bg-surface-container-low border-b border-outline-variant/10">
          <div className="flex items-center gap-4">
            <h3 className="text-3xl font-bold text-primary tracking-tight">
              {monthLabel}
            </h3>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="hidden md:flex gap-2">
            <button className="px-4 py-2 bg-primary text-on-primary text-sm font-bold rounded shadow-lg shadow-primary/20">
              Month
            </button>
            <button className="px-4 py-2 text-primary text-sm font-bold hover:bg-surface-container-high rounded transition-colors">
              Week
            </button>
            <button className="px-4 py-2 text-primary text-sm font-bold hover:bg-surface-container-high rounded transition-colors">
              Day
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-outline-variant/10">
          {days.map((d) => (
            <div
              key={d}
              className="p-4 text-center text-xs font-black uppercase tracking-widest text-on-surface-variant opacity-60"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {grid.map((cell, i) => {
            const isSelected =
              !!cell.dateString && selectedDate === cell.dateString;
            const firstEvent = cell.events?.[0];
            const extraCount = Math.max((cell.events?.length ?? 0) - 1, 0);

            return (
              <button
                type="button"
                key={i}
                disabled={!cell.dateString}
                onClick={() => cell.dateString && onSelectDate(cell.dateString)}
                className={`min-h-[140px] p-4 border-r border-b border-outline-variant/10 last:border-r-0 text-left transition-colors ${
                  cell.type === 'empty' ? 'bg-surface-container-low/30 cursor-default' : 'hover:bg-surface-container-low/40'
                } ${isSelected ? 'bg-primary/5' : ''}`}
              >
                {cell.day ? (
                  <span
                    className={`text-sm font-bold ${
                      isSelected || cell.isToday ? 'text-primary' : ''
                    }`}
                  >
                    {cell.day}
                  </span>
                ) : null}

                {firstEvent ? (
                  <motion.div
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`mt-2 p-2 rounded ${
                      isSelected
                        ? 'bg-primary text-on-primary'
                        : 'bg-primary-container/20 border-l-2 border-primary text-primary'
                    }`}
                  >
                    <p className="text-[10px] font-bold truncate">
                      {firstEvent.title ?? 'Meeting'}
                    </p>
                    {extraCount > 0 ? (
                      <p className="text-[10px] mt-1 opacity-80">+{extraCount} more</p>
                    ) : null}
                  </motion.div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}