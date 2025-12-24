# Wireframes

These low-fidelity wireframes describe target layouts for the major experiences. They are intentionally text-first so we can iterate quickly while keeping structural clarity.

## Explorer
```
+-------------------------------------------------------------+
| Header: Breadcrumbs | Spot selector | Pin button | Actions  |
+-------------------------------------------------------------+
| Filters: Position dropdown | Stack depth | Board picker     |
+-------------------------------------------------------------+
| Board/Range heatmap (left)  | Mixed-strategy pie (right)    |
|                             | Equity/EV sliders             |
+-------------------------------------------------------------+
| Tabs: Lines | Combos | Notes | Why?                        |
| Content: tables with sortable columns and inline tags       |
+-------------------------------------------------------------+
| Bottom bar: History, Bookmarks, Share/Copy link             |
+-------------------------------------------------------------+
```

## Live Sensitivity
```
+-------------------------------------------------------------+
| Header: Scenario summary | In-play status | Refresh toggle  |
+-------------------------------------------------------------+
| Sensitivity controls: sliders for bet sizing, ranges, rake  |
+-------------------------------------------------------------+
| Heatmap showing EV deltas vs baseline                       |
| Inline annotations for high-sensitivity cells               |
+-------------------------------------------------------------+
| Why? panel: explanation template with solver metrics        |
+-------------------------------------------------------------+
| Bottom: history timeline + pin to sync                      |
+-------------------------------------------------------------+
```

## Training
```
+-------------------------------------------------------------+
| Header: Current drill | Timer | Difficulty toggle           |
+-------------------------------------------------------------+
| Prompt area: board + action prompt + position indicator     |
+-------------------------------------------------------------+
| Answer input: slider for mix | buttons for discrete actions |
+-------------------------------------------------------------+
| Feedback: heatmap snippet + mixed-strategy pie              |
| Why? explanation + solver metrics summary                   |
+-------------------------------------------------------------+
| Progress + history, bookmark button                         |
+-------------------------------------------------------------+
```

## Leak Review
```
+-------------------------------------------------------------+
| Header: Leak category filter | Date range | Stakes filter    |
+-------------------------------------------------------------+
| Aggregated heatmap of mistakes / EV loss                    |
| List of most costly spots with links to Explorer            |
+-------------------------------------------------------------+
| Why? panel explaining recurring patterns                    |
+-------------------------------------------------------------+
| Bookmarks + pinned spots synced across devices              |
+-------------------------------------------------------------+
```
