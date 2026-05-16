<script lang="ts">
  import { onMount } from 'svelte';
  import { listEvents, addEvent, updateEvent, deleteEvent } from '$lib/db';
  import type { CalendarEventRow } from '$lib/db/types';

  interface Props {
    projectId: number;
  }
  let { projectId }: Props = $props();

  let events = $state<CalendarEventRow[]>([]);
  let loading = $state(true);

  let newMonth = $state(1);
  let newDay = $state(1);
  let newYear = $state<string>('');
  let newKind = $state<CalendarEventRow['kind']>('birthday');
  let newLabel = $state('');

  async function refresh() {
    events = await listEvents(projectId);
  }

  onMount(async () => {
    await refresh();
    loading = false;
  });

  async function onAdd() {
    if (!newLabel.trim()) return;
    const year = newYear.trim() === '' ? null : Number(newYear);
    if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2200)) return;
    await addEvent({
      project_id: projectId,
      month: newMonth,
      day: newDay,
      year,
      kind: newKind,
      label: newLabel.trim(),
    });
    newLabel = '';
    await refresh();
  }

  async function onDelete(id: number) {
    await deleteEvent(id);
    await refresh();
  }

  async function onEditLabel(id: number, label: string) {
    if (!label.trim()) return;
    await updateEvent(id, { label: label.trim() });
    await refresh();
  }

  function fmtDate(ev: CalendarEventRow): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return ev.year === null
      ? `${pad(ev.month)}-${pad(ev.day)} (yearly)`
      : `${ev.year}-${pad(ev.month)}-${pad(ev.day)}`;
  }
</script>

<section class="surface-card mt-4">
  <h2 class="text-lg font-medium mb-2">Calendar events</h2>
  {#if loading}
    <p class="text-sm" style="color: var(--color-muted)">Loading…</p>
  {:else}
    <!-- Add form -->
    <div class="flex flex-wrap items-end gap-2 mb-3">
      <label class="text-sm flex flex-col gap-1">
        <span style="color: var(--color-muted)">Month</span>
        <input type="number" min="1" max="12" bind:value={newMonth} style="width: 60px;" />
      </label>
      <label class="text-sm flex flex-col gap-1">
        <span style="color: var(--color-muted)">Day</span>
        <input type="number" min="1" max="31" bind:value={newDay} style="width: 60px;" />
      </label>
      <label class="text-sm flex flex-col gap-1">
        <span style="color: var(--color-muted)">Year (blank = yearly)</span>
        <input type="text" bind:value={newYear} placeholder="" style="width: 80px;" />
      </label>
      <label class="text-sm flex flex-col gap-1">
        <span style="color: var(--color-muted)">Kind</span>
        <select bind:value={newKind}>
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
          <option value="event">Event</option>
          <option value="holiday">Holiday</option>
        </select>
      </label>
      <label class="text-sm flex flex-col gap-1 flex-1" style="min-width: 200px;">
        <span style="color: var(--color-muted)">Label</span>
        <input type="text" bind:value={newLabel} placeholder="e.g., Anna's birthday" />
      </label>
      <button type="button" class="btn-primary" onclick={onAdd} disabled={!newLabel.trim()}>Add</button>
    </div>

    <!-- List -->
    {#if events.length === 0}
      <p class="text-sm" style="color: var(--color-muted)">No events yet.</p>
    {:else}
      <ul class="flex flex-col gap-1">
        {#each events as ev (ev.id)}
          <li class="flex items-center gap-2 text-sm">
            <span style="font-variant-numeric: tabular-nums; color: var(--color-muted); min-width: 11ch;">{fmtDate(ev)}</span>
            <span style="color: var(--color-muted); min-width: 8ch;">{ev.kind}</span>
            <input
              type="text"
              value={ev.label}
              onblur={(e) => onEditLabel(ev.id, (e.currentTarget as HTMLInputElement).value)}
              style="flex: 1;"
            />
            <button type="button" class="btn-ghost" onclick={() => onDelete(ev.id)} title="Delete">×</button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
