<script lang="ts">
  import { buildCalendarGrid, monthLabel, type CalendarGrid } from '$lib/calendar/grid';
  import type { CalendarEventRow } from '$lib/db/types';

  interface Props {
    year: number;
    month: number;             // 1..12
    weekStart: 0 | 1;
    /** Reserved for future re-rendering of birthdays/holidays/anniversaries
     *  on the grid. Currently accepted but unused — the data still lives in
     *  the calendar_event table; the cell rendering was simplified to give
     *  the date numbers more vertical room. TODO: re-introduce events with
     *  a less cramped visual treatment (e.g. dots under the date number,
     *  or a side rail listing the month's marked days). */
    events?: CalendarEventRow[];
    /** Optional locale override; falls back to the browser/system locale. */
    locale?: string;
    /** Show the month/year heading above the grid. Default true. */
    showHeading?: boolean;
    /** Optional Google Font family for the entire grid. null/undefined =
     *  inherit (app default monospace). Caller is responsible for
     *  loading the font; this component only sets font-family. */
    fontFamily?: string | null;
    /** Hex color for text + cell borders. Default black. */
    color?: string;
    /** Cell rule style:
     *   - 'boxed': full border around every cell (default).
     *   - 'lines': horizontal divider above each row of dates.
     *   - 'none':  no rules at all, dates float on the page background. */
    gridStyle?: 'boxed' | 'lines' | 'none';
  }
  let { year, month, weekStart, locale, showHeading = true, fontFamily = null, color = '#000000', gridStyle = 'boxed' }: Props = $props();

  let grid = $derived<CalendarGrid>(buildCalendarGrid(year, month, weekStart, locale));
  let heading = $derived(monthLabel(year, month, locale));

  function cellBorder(cellHasDay: boolean, rowIdx: number): string {
    if (!cellHasDay) return 'border: 1px solid transparent';
    if (gridStyle === 'boxed') return `border: 1px solid ${color}`;
    if (gridStyle === 'lines') return rowIdx === 0 ? 'border: 1px solid transparent' : `border-top: 1px solid ${color}`;
    return 'border: 1px solid transparent';
  }
</script>

<div class="w-full h-full flex flex-col" style="font-size: 0.65em; color: {color};{fontFamily ? ` font-family: '${fontFamily.replace(/'/g, "\\'")}', sans-serif;` : ''}">
  {#if showHeading}
    <div class="text-center font-medium mt-3 mb-8" style="font-size: 2.6em; line-height: 1;">{heading}</div>
  {/if}
  <!-- Day headers. Use the calendar color at 70% opacity so headers
       sit lighter than date numbers — matches the previous "muted"
       look without depending on app theme colors. -->
  <div class="grid grid-cols-7 gap-px mb-1">
    {#each grid.dayHeaders as h}
      <div class="text-center font-medium" style="opacity: 0.7;">{h}</div>
    {/each}
  </div>
  <!-- Date rows. grid-auto-rows: 1fr forces every row to share the
       container's height evenly so the grid never overflows the
       template's calendarGrid bbox when its content would otherwise
       push past the allocation. -->
  <div class="grid grid-cols-7 gap-px flex-1 min-h-0" style="grid-auto-rows: 1fr;">
    {#each grid.rows as row, rowIdx}
      {#each row as cell}
        <div
          class="relative flex items-center justify-center"
          style="
            {cellBorder(cell.day !== null, rowIdx)};
            background: {cell.isToday ? 'rgba(255,200,0,0.15)' : 'transparent'};
            min-height: 0;
            overflow: hidden;
            padding: 2px 4px;
          "
        >
          {#if cell.day !== null}
            <div class="font-medium" style="font-size: 1.8em; line-height: 1;">{cell.day}</div>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</div>
