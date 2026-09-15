<!--
  DataTable — a generic sortable table (plan §4.4 Fleets, §7 T6).

  Every cell is mono with tabular figures (§5.1); headers are sans. Sorting
  is controlled when `onSort` is given (the parent owns `sortKey`/`sortDir`)
  and internal otherwise. Sortable headers carry `aria-sort` and a glyph.
  Rows with `onRowClick` or `rowHref` are focusable; Enter or click opens
  them, except when the click lands on a control inside the row (the
  Fleets room keeps pause/scale buttons in a trailing cell).
-->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  type Align = 'left' | 'right' | 'center';
  type Dir = 'asc' | 'desc';

  interface Column {
    key: string;
    label: string;
    align?: Align;
    sortable?: boolean;
    /** Text for the cell when no `cell` snippet is given. Defaults to `String(row[key])`. */
    format?: (row: T) => string;
    /** Value to sort by. Defaults to `row[key]`. */
    value?: (row: T) => number | string | null | undefined;
    cell?: Snippet<[T]>;
    /** Column title attribute — the plain one-line definition of the term. */
    title?: string;
  }

  let {
    columns,
    rows,
    rowKey,
    sortKey,
    sortDir = 'desc',
    onSort,
    onRowClick,
    rowHref,
    caption,
  }: {
    columns: Column[];
    rows: T[];
    rowKey: (row: T) => string;
    sortKey?: string;
    sortDir?: Dir;
    onSort?: (key: string, dir: Dir) => void;
    onRowClick?: (row: T) => void;
    rowHref?: (row: T) => string;
    caption?: string;
  } = $props();

  // Internal sort state, used only when the parent does not pass `onSort`.
  let localKey = $state<string | undefined>(undefined);
  let localDir = $state<Dir>('desc');
  const activeKey = $derived(onSort ? sortKey : (localKey ?? sortKey));
  const activeDir = $derived(onSort ? sortDir : localKey ? localDir : sortDir);

  const columnByKey = $derived(new Map(columns.map((c) => [c.key, c])));

  function rawValue(row: T, col: Column): number | string | null | undefined {
    if (col.value) return col.value(row);
    const v = (row as unknown as Record<string, unknown>)[col.key];
    return typeof v === 'number' || typeof v === 'string' ? v : v == null ? null : String(v);
  }

  const sortedRows = $derived.by(() => {
    const key = activeKey;
    const col = key ? columnByKey.get(key) : undefined;
    if (!col) return rows;
    const sign = activeDir === 'asc' ? 1 : -1;
    // Stable: decorate with the original index.
    return rows
      .map((row, i) => ({ row, i, v: rawValue(row, col) }))
      .sort((a, b) => {
        const av = a.v;
        const bv = b.v;
        let c = 0;
        if (av == null && bv == null) c = 0;
        else if (av == null) c = 1;
        else if (bv == null) c = -1;
        else if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
        else c = String(av).localeCompare(String(bv));
        return c * sign || a.i - b.i;
      })
      .map((d) => d.row);
  });

  function toggleSort(col: Column): void {
    if (!col.sortable) return;
    const next: Dir = activeKey === col.key ? (activeDir === 'asc' ? 'desc' : 'asc') : 'desc';
    if (onSort) onSort(col.key, next);
    else {
      localKey = col.key;
      localDir = next;
    }
  }

  const interactive = $derived(!!onRowClick || !!rowHref);

  function isControl(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('button, a, input, select, textarea, label');
  }

  function open(row: T, ev: Event): void {
    if (isControl(ev.target)) return;
    if (onRowClick) onRowClick(row);
    else if (rowHref && typeof window !== 'undefined') window.location.assign(rowHref(row));
  }

  function onRowKey(row: T, ev: KeyboardEvent): void {
    if (ev.key === 'Enter' && !isControl(ev.target)) {
      ev.preventDefault();
      open(row, ev);
    }
  }

  function ariaSort(col: Column): 'ascending' | 'descending' | 'none' | undefined {
    if (!col.sortable) return undefined;
    if (activeKey !== col.key) return 'none';
    return activeDir === 'asc' ? 'ascending' : 'descending';
  }

  function cellText(row: T, col: Column): string {
    if (col.format) return col.format(row);
    const v = rawValue(row, col);
    return v == null ? '' : String(v);
  }
</script>

<div class="scroll">
  <table class="table" class:interactive>
    {#if caption}
      <caption class="dim">{caption}</caption>
    {/if}
    <thead>
      <tr>
        {#each columns as col (col.key)}
          <th
            scope="col"
            class="align-{col.align ?? 'left'}"
            class:sortable={col.sortable}
            class:sorted={activeKey === col.key}
            aria-sort={ariaSort(col)}
            title={col.title}
          >
            {#if col.sortable}
              <button type="button" class="sort" onclick={() => toggleSort(col)}>
                <span>{col.label}</span>
                <span class="glyph mono" aria-hidden="true">
                  {activeKey === col.key ? (activeDir === 'asc' ? '▲' : '▼') : '↕'}
                </span>
              </button>
            {:else}
              {col.label}
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each sortedRows as row (rowKey(row))}
        <tr
          class="row"
          tabindex={interactive ? 0 : undefined}
          onclick={interactive ? (ev) => open(row, ev) : undefined}
          onkeydown={interactive ? (ev) => onRowKey(row, ev) : undefined}
        >
          {#each columns as col (col.key)}
            <td class="mono align-{col.align ?? 'left'}">
              {#if col.cell}
                {@render col.cell(row)}
              {:else if rowHref && col === columns[0]}
                <a class="cell-link" href={rowHref(row)} tabindex="-1">{cellText(row, col)}</a>
              {:else}
                {cellText(row, col)}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
      {#if rows.length === 0}
        <tr>
          <td class="empty dim" colspan={columns.length}>no rows</td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .scroll {
    overflow: auto;
    max-height: 100%;
    min-width: 0;
  }
  .table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }
  caption {
    text-align: left;
    padding: 0.3em 0.6em;
    font-size: 0.85em;
    caption-side: top;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-1);
    font-family: var(--font-ui);
    white-space: nowrap;
  }
  th.sorted {
    color: var(--fg);
  }
  .sort {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
  }
  .sort:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
  .sort .glyph {
    color: var(--fg-muted);
    font-size: 0.8em;
  }
  .align-right { text-align: right; }
  .align-center { text-align: center; }
  .align-left { text-align: left; }
  .interactive .row {
    cursor: pointer;
  }
  .interactive .row:hover td {
    background: var(--bg-2);
  }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .cell-link {
    color: inherit;
  }
  .empty {
    text-align: center;
    padding: 1em;
    font-family: var(--font-ui);
  }
</style>
