<script lang="ts">
  import { buildCalendarGrid, monthLabel, type CalendarGrid } from '$lib/calendar/grid';
  import type { CalendarEventRow } from '$lib/db/types';

  interface Props {
    year: number;
    month: number;             // 1..12
    weekStart: 0 | 1;
    /** Events for the project. The component filters to events matching
     *  this month (with year=NULL OR year matching). */
    events: CalendarEventRow[];
    /** Optional locale override; falls back to the browser/system locale. */
    locale?: string;
    /** Show the month/year heading above the grid. Default true. */
    showHeading?: boolean;
    /** Optional Google Font family for the entire grid. null/undefined =
     *  inherit (app default monospace). Caller is responsible for
     *  loading the font; this component only sets font-family. */
    fontFamily?: string | null;
  }
  let { year, month, weekStart, events, locale, showHeading = true, fontFamily = null }: Props = $props();

  let grid = $derived<CalendarGrid>(buildCalendarGrid(year, month, weekStart, locale));
  let heading = $derived(monthLabel(year, month, locale));

  // Map day-of-month -> list of events on that day for the target month.
  let eventsByDay = $derived.by(() => {
    const m = new Map<number, CalendarEventRow[]>();
    for (const e of events) {
      if (e.month !== month) continue;
      if (e.year !== null && e.year !== year) continue;
      const arr = m.get(e.day) ?? [];
      arr.push(e);
      m.set(e.day, arr);
    }
    return m;
  });

  function kindColor(kind: CalendarEventRow['kind']): string {
    switch (kind) {
      case 'birthday': return '#e11d48';     // rose
      case 'anniversary': return '#7c3aed';  // violet
      case 'holiday': return '#15803d';      // green
      case 'event':
      default: return '#0369a1';             // sky
    }
  }
</script>

<div class="w-full h-full flex flex-col" style="font-size: 0.65em;{fontFamily ? ` font-family: '${fontFamily.replace(/'/g, "\\'")}', sans-serif;` : ''}">
  {#if showHeading}
    <div class="text-center font-medium mb-1" style="font-size: 1.4em;">{heading}</div>
  {/if}
  <!-- Day headers -->
  <div class="grid grid-cols-7 gap-px mb-px">
    {#each grid.dayHeaders as h}
      <div class="text-center font-medium" style="color: var(--color-muted);">{h}</div>
    {/each}
  </div>
  <!-- Date rows. grid-auto-rows: 1fr forces every row to share the
       container's height evenly so the grid never overflows the
       template's calendarGrid bbox when content (date number + events)
       would otherwise push past the allocation. Cells overflow:hidden
       handles content truncation inside each row. -->
  <div class="grid grid-cols-7 gap-px flex-1 min-h-0" style="grid-auto-rows: 1fr;">
    {#each grid.rows as row}
      {#each row as cell}
        <div
          class="relative"
          style="
            border: 1px solid {cell.day === null ? 'transparent' : 'var(--color-line)'};
            background: {cell.isToday ? 'rgba(255,200,0,0.15)' : 'transparent'};
            min-height: 0;
            overflow: hidden;
            padding: 1px 2px;
          "
        >
          {#if cell.day !== null}
            <div class="font-medium">{cell.day}</div>
            {#each (eventsByDay.get(cell.day) ?? []).slice(0, 2) as ev}
              <div
                class="truncate"
                style="font-size: 0.75em; line-height: 1.1; color: {kindColor(ev.kind)};"
                title={ev.label}
              >{ev.label}</div>
            {/each}
            {#if (eventsByDay.get(cell.day)?.length ?? 0) > 2}
              <div style="font-size: 0.7em; color: var(--color-muted);">
                +{(eventsByDay.get(cell.day)!.length - 2)} more
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</div>
