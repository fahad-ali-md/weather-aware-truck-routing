# Wayfinder interface

Design direction: a dispatch workspace with the route map as the main visual.
Apply the [frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
to the existing React app. Keep forecasts, ranking, and inputs intact.

- Palette: ink `#162b3a`, muted slate `#526676`, canvas `#edf2f6`, white
  `#ffffff`, route teal `#126d6a`, pale teal `#e8f5f2`. Keep semantic risk colors.
- Type: IBM Plex Sans for headings, inputs, and data. Use readable text, tabular
  numbers, sentence case, and clear weight differences.
- Desktop: preserve the left directions panel. The right side is a tall map with
  a small floating route capsule and a bottom forecast dock. A white readings strip
  joins a dark navy timeline with mint playback controls and hourly wind bars.
  Checkpoint tables remain below the map.
- After search: the input form switches to a compact origin/destination summary.
  Route options occupy the top of the left panel as a directions list with selected
  blue rail, right-aligned duration, arrival time, and compact weather metrics.
  Edit trip restores the mounted form with its original values.
- Tablet/mobile: stack the directions panel and workspace. In-page navigation jumps
  to planning, map, and checkpoints. Route options remain a vertical list.
- Map: use floating controls for navigation, full screen, fitting routes, and wind.
  Keep the route capsule and bottom dock compact; forecast details expand on demand.
  Fit bounds account for the measured dock height. Preserve map attribution.
- Interaction: at least 44px main controls; explicit selection; useful empty states;
  keyboard focus; reduced motion; horizontally scrollable data tables.

Review: remove decorative slogans, duplicated legends, timed introductory overlays,
and fixed offsets that depend on forecast-panel height. Preserve route comparison
and forecast behavior. Browser verification remains manual at the user's request.

References: [Windy weather-map timeline](https://media.windy.app/page144770606.html)
and [Mapbox navigation camera](https://docs.mapbox.com/ios/navigation/guides/map-and-camera/navigation-camera/).
Use their map-first hierarchy with our existing forecast data and risk policy.
