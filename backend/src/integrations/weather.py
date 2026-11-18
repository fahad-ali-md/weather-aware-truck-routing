"""Open-Meteo: instantaneous wind and preceding-hour precipitation intervals."""

import bisect
import math
from datetime import UTC, datetime, timedelta

from trips.risk import classify

from .http import ProviderError, get_json


def sample(hourly, at, load_lb):
    times = hourly.get("time", [])
    timestamp = at.timestamp()
    right = bisect.bisect_left(times, timestamp)
    if not times or right >= len(times) or timestamp < times[0]:
        return {
            "wind_mph": None,
            "wind_direction_deg": None,
            "rain_in": None,
            "snow_in": None,
            "risk": classify(None, None, None, load_lb),
        }
    left = right if times[right] == timestamp else max(0, right - 1)

    def value(key, i):
        values = hourly.get(key, [])
        return values[i] if i < len(values) else None

    wind_left, wind_right = value("wind_speed_10m", left), value("wind_speed_10m", right)
    wind = None
    direction = None
    if wind_left is not None and wind_right is not None:
        fraction = (timestamp - times[left]) / (times[right] - times[left]) if right != left else 0
        wind = wind_left + fraction * (wind_right - wind_left)
        direction_left = value("wind_direction_10m", left)
        direction_right = value("wind_direction_10m", right)
        if direction_left is not None and direction_right is not None:
            # Interpolate wind vectors: 350° to 10° passes north, never south through 180°.
            angles = [math.radians(direction_left), math.radians(direction_right)]
            east = (1 - fraction) * wind_left * -math.sin(
                angles[0]
            ) + fraction * wind_right * -math.sin(angles[1])
            north = (1 - fraction) * wind_left * -math.cos(
                angles[0]
            ) + fraction * wind_right * -math.cos(angles[1])
            if math.hypot(east, north) > 1e-8:
                direction = math.degrees(math.atan2(-east, -north)) % 360
    # 12:30 uses the accumulation at 13:00: the interval (12:00,13:00].
    rain, showers, snow = value("rain", right), value("showers", right), value("snowfall", right)
    rain = (rain + showers) / 25.4 if rain is not None and showers is not None else None
    snow = snow / 2.54 if snow is not None else None
    if wind is not None:
        wind /= 1.609344
    return {
        "wind_mph": wind,
        "wind_direction_deg": direction,
        "rain_in": rain,
        "snow_in": snow,
        "risk": classify(wind, rain, snow, load_lb),
    }


def forecast(checkpoints, departure, load_lb):
    end = max(
        departure + timedelta(hours=49),
        *(datetime.fromisoformat(p["eta"]) + timedelta(hours=1) for p in checkpoints),
    )
    result = get_json(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": ",".join(str(round(p["lat"], 5)) for p in checkpoints),
            "longitude": ",".join(str(round(p["lon"], 5)) for p in checkpoints),
            "hourly": "wind_speed_10m,wind_direction_10m,rain,showers,snowfall",
            "wind_speed_unit": "kmh",
            "precipitation_unit": "mm",
            "timezone": "UTC",
            "timeformat": "unixtime",
            "start_date": departure.date().isoformat(),
            "end_date": end.date().isoformat(),
        },
    )
    results = result if isinstance(result, list) else [result]
    if len(results) != len(checkpoints):
        raise ProviderError("Weather provider returned incomplete location coverage.")
    output = []
    for checkpoint, location in zip(checkpoints, results, strict=True):
        hourly = location.get("hourly", {})
        units = location.get("hourly_units", {})
        if (
            units.get("wind_speed_10m") != "km/h"
            or units.get("rain") != "mm"
            or units.get("snowfall") != "cm"
            or units.get("showers") != "mm"
            or units.get("wind_direction_10m") != "°"
        ):
            raise ProviderError("Weather provider returned unexpected units.")
        frames = []
        for hour in range(49):
            weather = sample(hourly, departure + timedelta(hours=hour), load_lb)
            frames.append(
                [
                    weather["wind_mph"],
                    weather["rain_in"],
                    weather["snow_in"],
                    weather["risk"]["level"],
                    weather["wind_direction_deg"],
                ]
            )
        output.append(
            {
                "id": checkpoint["id"],
                **sample(hourly, datetime.fromisoformat(checkpoint["eta"]), load_lb),
                "frames": frames,
            }
        )
    return output


def validate_coordinate(value, limit):
    value = float(value)
    if not math.isfinite(value) or not -limit <= value <= limit:
        raise ValueError("Invalid checkpoint coordinates.")
    return value


def utc_datetime(value):
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("Departure must include a timezone.")
    return parsed.astimezone(UTC)
