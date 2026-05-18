<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import { page } from '$app/state';
  import ThemeToggle from './ThemeToggle.svelte';

  interface Props {
    backHref?: string;
    children?: import('svelte').Snippet;
  }
  let { backHref, children }: Props = $props();

  let isHome = $derived(backHref ? page.url.pathname === backHref : true);
</script>

<header class="flex items-center justify-between gap-4 py-4">
  {#if !isHome && backHref}
    <a href={backHref} class="btn-ghost flex items-center gap-1">
      <ArrowLeft size={18} /> Back
    </a>
  {/if}
  <div class="flex-1">{@render children?.()}</div>
  <ThemeToggle />
</header>
