/**
 * Data parser for unified accident data
 */
export function unifiedParser(d) {
  return {
    state: (d.State || "").toUpperCase(),
    severity: +d.Severity,
    humidity: +d['Humidity(%)'],
    tempC: +d['Temperature(C)'],
    condition: d.Weather_Condition,
    isRain: d.is_Rain === "True" || d.is_Rain === true,
    isSnow: d.is_Snow === "True" || d.is_Snow === true,
    isFog: d.is_Fog === "True" || d.is_Fog === true,
    isClear: d.is_Clear === "True" || d.is_Clear === true,
    isCloud: d.is_Cloud === "True" || d.is_Cloud === true,
    highSeverity: +d.HighSeverity,
    dayOfWeek: +d.day_of_week,
    hourOfDay: +d.hour_of_day,
    Start_Lat: +d.Start_Lat,
    Start_Lng: +d.Start_Lng,
    lat: +d.Start_Lat,
    lng: +d.Start_Lng
  };
}
