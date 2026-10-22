# Module presentation conventions

Use the approved modern formatting for all existing and future teaching modules.
The global HTML configuration loads `assets/styles.css` and
`assets/callout-preview.css`. No page-specific stylesheet is needed for these
components.

## Callouts

Use the shared `.learning-callout` component rather than native `.callout-*`
blocks. Match the type, icon, and header using this mapping:

| Modifier | Standard header |
|---|---|
| `learning-callout--objectives` | Learning objectives |
| `learning-callout--think` | Pause and think |
| `learning-callout--idea` | Key idea |
| `learning-callout--clinical` | Clinical relevance |
| `learning-callout--caution` | Word of caution |
| `learning-callout--red-flag` | Red flag |
| `learning-callout--questions` | Clinical questions |

For end-of-module cases, use the questions modifier and icon but retain the
numbered header, such as **Question 1**, instead of **Clinical questions**.
Preserve numbering within each case and existing answer reveal controls.

Use Pandoc fenced divs for the outer callout and body, and a raw HTML fence for
the header. Do not use an `aside`, which Quarto can treat as margin content.
Give each callout a unique page-specific heading ID and matching
`aria-labelledby`. Copy the appropriate SVG from `assets/_callout-preview.html`.
The following shows the Key idea structure:

````qmd
:::: {.learning-callout .learning-callout--idea .module-learning-callout role="note" aria-labelledby="module-section-callout-1"}

```{=html}
<header class="learning-callout-header">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></svg>
  <h3 id="module-section-callout-1">Key idea</h3>
</header>
```

::: {.learning-callout-body}

Callout content goes here, with normal Markdown and existing details/summary
elements where appropriate.

:::

::::
````

## Tables and buttons

Wrap module tables in `.module-table`, with `tabindex="0"`, `role="region"`,
and a short descriptive `aria-label`. If a table already has a wrapper for
column widths, add `.module-table` to that wrapper instead of nesting another
scrolling region. Keep cell text, captions, column-width attributes, and
existing width classes intact. The shared CSS supplies the muted maroon header,
alternating rows, rounded border, and faint vertical dividers without extra
cell padding.

Use the existing `.btn` classes for navigation; they already have pill ends.
Do not add redundant page-specific button styling.

Presentation changes should preserve educational wording, links, question
numbers, and answer behaviour unless content changes were requested. These
conventions apply to teaching modules; preserve the separate Clinical
Challenges and interactive case interfaces.
