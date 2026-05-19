<script lang="ts">
  import { parseStyle, cssForStyle, DEFAULT_TEXT_STYLE, type TextStyle } from '$lib/text/style';
  import { loadGoogleFont } from '$lib/text/fonts';
  import type { PageTextRow } from '$lib/db/types';

  interface Props {
    text: PageTextRow;
    pagePaddingPx: number;
    /** When true, click on the overlay invokes onClick (review/edit mode).
     *  When false, the overlay is purely decorative (sorter thumbs). */
    interactive: boolean;
    onClick?: () => void;
  }
  let { text, pagePaddingPx, interactive, onClick }: Props = $props();

  let style = $derived<TextStyle>(parseStyle(text.style_json) ?? DEFAULT_TEXT_STYLE);

  $effect(() => {
    loadGoogleFont(style.fontFamily, [style.fontWeight]);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_tabindex -->
<div
  class="absolute overlay-text"
  class:interactive
  style="
    left: calc({pagePaddingPx / 10}cqi + {text.position_x} * (100% - {pagePaddingPx / 5}cqi));
    top: calc({pagePaddingPx / 10}cqi + {text.position_y} * (100% - {pagePaddingPx / 5}cqi));
    max-width: calc({1 - text.position_x} * (100% - {pagePaddingPx / 5}cqi));
    width: max-content;
    {cssForStyle(style)};
    z-index: 3;
    cursor: {interactive ? 'pointer' : 'default'};
    {interactive ? '' : 'pointer-events: none;'}
  "
  onclick={() => interactive && onClick?.()}
  role={interactive ? 'button' : 'presentation'}
  tabindex={interactive ? 0 : undefined}
  aria-label={interactive ? `Edit text: ${text.content.slice(0, 40)}` : undefined}
>{text.content}</div>

<style>
  /* Faint hover ring so interactive overlays are discoverable without
     adding a permanent border. Non-interactive overlays (sorter thumbs)
     remain completely chrome-less. */
  .overlay-text.interactive:hover {
    outline: 1px dashed rgba(0, 0, 0, 0.4);
    outline-offset: 2px;
  }
</style>
