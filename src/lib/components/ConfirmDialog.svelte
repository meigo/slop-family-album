<script lang="ts">
  /**
   * Centered modal asking the user to confirm an action. Replaces native
   * window.confirm() with theme-aware styling and richer affordances
   * (multi-line body, danger styling, named action button).
   *
   * Usage:
   *   {#if dialog}
   *     <ConfirmDialog
   *       title="Delete project?"
   *       message="..."
   *       confirmLabel="Delete"
   *       danger
   *       onConfirm={async () => { await delete(); dialog = null; }}
   *       onCancel={() => (dialog = null)}
   *     />
   *   {/if}
   */
  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
  }
  let {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel,
  }: Props = $props();

  let busy = $state(false);

  async function confirm() {
    if (busy) return;
    busy = true;
    try {
      await onConfirm();
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
    else if (e.key === 'Enter') confirm();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events — backdrop is a
     click-to-cancel affordance; Esc on the window provides the keyboard
     equivalent. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="confirm-backdrop" role="presentation" onclick={onCancel}>
  <div
    class="confirm-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
  >
    <h2 id="confirm-title" class="confirm-title">{title}</h2>
    <p class="confirm-message">{message}</p>
    <div class="confirm-actions">
      <button type="button" class="btn-secondary" onclick={onCancel} disabled={busy}>{cancelLabel}</button>
      <!-- svelte-ignore a11y_autofocus — focusing the action button on
           dialog open is the expected modal behaviour; users want Enter
           to confirm without an extra tab. -->
      <button
        type="button"
        class={danger ? 'btn-danger' : 'btn-primary'}
        onclick={confirm}
        disabled={busy}
        autofocus
      >{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .confirm-card {
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: var(--radius-lg);
    padding: var(--space-5);
    width: 100%;
    max-width: 480px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }
  .confirm-title {
    font-size: var(--text-lg);
    font-weight: 500;
    margin-bottom: var(--space-3);
  }
  .confirm-message {
    color: var(--color-muted);
    font-size: var(--text-sm);
    white-space: pre-wrap;
    margin-bottom: var(--space-5);
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
