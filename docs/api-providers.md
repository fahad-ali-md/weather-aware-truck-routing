# API provider decision

Researched on 2026-11-18 for the free, noncommercial Weather-Aware Truck Routing demo. This records the selected providers; no account, key, or provider integration has been created or tested in this research step.

## Selected stack

| Responsibility | Choice | Verified free allowance |
| --- | --- | --- |
| Truck routes and alternatives | TomTom Routing API, TomTom Maps v1 | Current pricing lists 20,000 Routing API requests/month; free access requires no credit card. |
| Street address geocoding | TomTom Geocoding API | Current pricing lists 20,000 requests/month. |
| Checkpoint hourly weather | Open-Meteo Forecast API | Noncommercial open access: 10,000 calls/day, 300,000/month, 600/minute and 5,000/hour. |
| Interactive map renderer | Existing MapLibre GL JS dependency | Open-source client library. |
| Basemap tiles | OpenFreeMap public instance | No registration, key, or stated map-view/request quota. Required data attribution; no SLA. |
| Risk scoring and route ranking | Our Django application | Pure application logic, independent of provider responses. |

TomTom's monthly allowances above come from its current pricing page, not older community posts advertising daily limits. Allowances are account budgets, not a promise of that many complete trip analyses. Keep the account on free access without adding a payment method, and handle quota failures explicitly. Account-specific access and authenticated route responses still require verification with the project's own API key.

Sources: [TomTom pricing](https://docs.tomtom.com/pricing), [Open-Meteo pricing](https://open-meteo.com/en/pricing), [OpenFreeMap](https://openfreemap.org/).

## Routing contract

Use the documented TomTom Maps v1 Calculate Route endpoint with `travelMode=truck`, `maxAlternatives=2`, and the requested `departAt`. This requests a main route and two alternatives. Fewer can be returned; show the actual count and never fabricate distinct routes. Request cumulative distance/travel-time information where supported to interpolate checkpoint ETAs along the actual route rather than assuming constant speed.

TomTom documents truck weight, axle weight, dimensions, and commercial-vehicle parameters. The brief's cargo load is used in our weather rules; it is not the vehicle's gross weight. Do not pass cargo load alone as `vehicleWeight` or invent vehicle dimensions.

Choose v1 deliberately: it has current documentation updated in August 2026 and supports trucks. The newer Orbis v2 Calculate Route documentation currently permits only `travelMode=car`; adopting that endpoint would lose a required capability. Reconsider migration when truck support is documented.

Sources: [TomTom Maps v1 Calculate Route](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route), [Orbis v2 Calculate Route](https://docs.tomtom.com/routing-api/documentation/tomtom-orbis-maps/calculate-route).

## Weather and map contract

Fetch hourly `wind_speed_10m`, `rain`, and `snowfall` for sampled route coordinates and arrival times. Batch locations and reuse forecasts across overlapping routes and slider positions; multilocation or large requests may count as multiple weather calls. Normalize units and UTC timestamps before scoring. Hourly precipitation fields describe accumulation intervals, so match each ETA to the correct interval. Missing data remains unknown, never Low risk.

Render routes, checkpoints, and corridor forecast samples in MapLibre over OpenFreeMap. The 0–48-hour slider uses forecast data we obtain and our own risk calculation. OpenFreeMap provides the basemap, not the weather overlay. Keep OpenMapTiles/OpenStreetMap and weather-provider attribution visible.

Open-Meteo's free hosted endpoint is suitable for this noncommercial demo; a commercial launch would require revisiting weather hosting/licensing.

Source: [Open-Meteo forecast documentation](https://open-meteo.com/en/docs).

## Developer feedback and rejected alternatives

Feedback is supporting evidence, not a performance benchmark or a representative satisfaction survey.

- A TomTom user describes straightforward no-card setup and a working Python traffic/commute integration. That is firsthand evidence about setup, not proof of truck accuracy; its old daily quota is superseded by today's official pricing. [User report](https://www.reddit.com/r/selfhosted/comments/1bzkmzg/psa_tomtom_has_2500_free_daily_requests_for_their/).
- GraphHopper's own developer forum contains a free-account report rejecting `small_truck`, plus the error `Free packages cannot use flexible mode`. This makes it a poor default for our zero-budget truck application. [Developer thread](https://discuss.graphhopper.com/t/message-for-your-account-the-profile-parameter-can-only-be-one-of-car-bike-foot-but-was-small-truck/9468), [pricing](https://www.graphhopper.com/pricing/).
- HERE's older no-card Limited Plan guide conflicts with its current Base Plan presentation. Users also report disruptive free-tier changes. Its current pricing lists 5,000 truck-routing transactions/month, but the older no-card promise is insufficient evidence for selecting it under the strict budget. [Current pricing](https://www.here.com/get-started/pricing), [community discussion](https://www.reddit.com/r/homeassistant/comments/1l8pfok/here_maps_routing_free_tier_ending_august_31st/).
- OpenRouteService's hosted alternative-route distance limit is 100 km, unsuitable as our default for long truck trips. [Official restrictions](https://giscience.github.io/openrouteservice/hosted-api-restrictions).
- Geoapify has an attractive no-card 3,000-credit/day plan and truck profiles. Its retrieved routing request documentation did not clearly establish a dedicated alternative-count parameter, so TomTom is the more direct documented fit for the three-route requirement. This does not establish that Geoapify lacks the capability. [Routing documentation](https://apidocs.geoapify.com/docs/routing/), [pricing](https://www.geoapify.com/pricing/).

## First authenticated validation

With the project's TomTom key, verify a realistic long-distance trip: truck mode, alternative count, geometry, cumulative timing, and address lookup. Check a corridor with multiple roads and one with fewer alternatives. Keep the key server-side. No paid subscription is required for the selected demo design.
