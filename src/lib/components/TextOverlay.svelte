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
  class="absolute"
  style="
    left: calc({pagePaddingPx}px + {text.position_x} * (100% - {2 * pagePaddingPx}px));
    top: calc({pagePaddingPx}px + {text.position_y} * (100% - {2 * pagePaddingPx}px));
    width: calc({text.width} * (100% - {2 * pagePaddingPx}px));
    height: calc({text.height} * (100% - {2 * pagePaddingPx}px));
    {cssForStyle(style)};
    z-index: 3;
    overflow: hidden;
    cursor: {interactive ? 'pointer' : 'default'};
    {interactive ? '' : 'pointer-events: none;'}
  "
  onclick={() => interactive && onClick?.()}
  role={interactive ? 'button' : 'presentation'}
  tabindex={interactive ? 0 : undefined}
  aria-label={interactive ? `Edit text: ${text.content.slice(0, 40)}` : undefined}
>
  {text.content}
</div>
