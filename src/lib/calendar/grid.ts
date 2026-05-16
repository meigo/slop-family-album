/**
 * Pure calendar grid math. Given a year-month and a week-start (0=Sun, 1=Mon),
 * return a fixed 6-row × 7-column grid of cells. Each cell either holds a
 * date (1..N) or is padding (null) representing days from the previous or
 * next month.
 */

export interface GridCell {
  /** The day-of-month if this cell belongs to the target month; null for
   *  padding from previous/next month. */
  day: number | null;
  /** True if this cell is "today" (only meaningful when the target month
   *  matches the current month). */
  isToday: boolean;
}

export interface CalendarGrid {
  year: number;
  month: number; // 1..12
  weekStart: 0 | 1;
  /** Localized day names (Mon..Sun or Sun..Sat depending on weekStart),
   *  length 7. */
  dayHeaders: string[];
  /** Six rows of seven cells = 42 cells total. */
  rows: GridCell[][];
}

/** Parse a page title like "2026-03" into (year=2026, month=3). Returns
 *  null on invalid input. */
export function parseYearMonth(title: string | null): { year: number; month: number } | null {
  if (!title) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(title.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Number of days in (year, month). month is 1..12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** JS Date.getDay() returns 0=Sun..6=Sat. Convert to a "column index" where
 *  the first column = weekStart day. */
function columnOf(jsDay: number, weekStart: 0 | 1): number {
  return (jsDay - weekStart + 7) % 7;
}

/** Build the 6×7 grid for a given month. */
export function buildCalendarGrid(
  year: number,
  month: number,
  weekStart: 0 | 1,
  locale?: string,
): CalendarGrid {
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstColumn = columnOf(firstOfMonth.getDay(), weekStart);
  const days = daysInMonth(year, month);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = today.getDate();

  const cells: GridCell[] = [];
  for (let i = 0; i < firstColumn; i++) cells.push({ day: null, isToday: false });
  for (let d = 1; d <= days; d++) {
    cells.push({ day: d, isToday: isCurrentMonth && d === todayDay });
  }
  while (cells.length < 42) cells.push({ day: null, isToday: false });

  const rows: GridCell[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));

  // Localized short day headers. 2024-01-07 is a Sunday; iterate from there
  // shifted by weekStart so column 0 is the user's chosen first day.
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const dayHeaders: string[] = [];
  for (let i = 0; i < 7; i++) {
    const ref = new Date(2024, 0, 7 + ((i + weekStart) % 7));
    dayHeaders.push(fmt.format(ref));
  }

  return { year, month, weekStart, dayHeaders, rows };
}

/** Month name for a page title like "2026-03". */
export function monthLabel(year: number, month: number, locale?: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });
  return fmt.format(new Date(year, month - 1, 1));
}
