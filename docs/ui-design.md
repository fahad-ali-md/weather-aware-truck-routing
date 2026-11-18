# Wayfinder interface

Design direction: a dispatch workspace with the route map as the main visual.
Apply the [frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
to the existing React app. Keep forecasts, ranking, and inputs intact.

- Palette: ink `#162b3a`, muted slate `#526676`, canvas `#edf2f6`, white
  `#ffffff`, route teal `#126d6a`, pale teal `#e8f5f2`. Keep semantic risk colors.
- Type: IBM Plex Sans for headings, inputs, and data. Use readable text, tabular
  numbers, sentence case, and clear weight differences.
- Desktop: planner and route comparison on the left; map header, map, legend,
  forecast controls, and checkpoint table on the right. Controls use document flow.
- After search: the input form switches to a compact origin/destination summary.
  Route options occupy the top of the left panel as a directions list with selected
  blue rail, right-aligned duration, arrival time, and compact weather metrics.
  Edit trip restores the mounted form with its original values.
- Tablet/mobile: stack the directions panel and workspace. In-page navigation jumps
  to planning, map, and checkpoints. Route options remain a vertical list.
- Map: reserve overlays for map navigation, wind, and loading/error state. Keep the
  map heading, weather timeline, and risk legend outside the canvas.
- Interaction: at least 44px main controls; explicit selection; useful empty states;
  keyboard focus; reduced motion; horizontally scrollable data tables.

Review: remove decorative slogans, duplicated legends, timed introductory overlays,
and fixed offsets that depend on forecast-panel height. Preserve route comparison
and forecast behavior. Browser verification remains manual at the user's request.
