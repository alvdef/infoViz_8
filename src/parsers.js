export function stateMonthParserFn(d) {
  return {
    state: d.state,
    year_month: d.year_month,
    year: +d.year,
    count_accidents: +d.count_accidents,
    avg_severity: +d.avg_severity,
  };
}

export function weatherParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    severity: +d.Severity,
    humidity: +d["Humidity(%)"],
    tempC: +d["Temperature(C)"],
    condition: d.Weather_Condition,
    isRain: d.is_Rain === "True" || d.is_Rain === true,
    isSnow: d.is_Snow === "True" || d.is_Snow === true,
    isFog: d.is_Fog === "True" || d.is_Fog === true,
    isClear: d.is_Clear === "True" || d.is_Clear === true,
    isCloud: d.is_Cloud === "True" || d.is_Cloud === true,
    highSeverity: +d.HighSeverity,
  };
}

export function severityWeatherParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    weather: d.Weather_Condition,
    severity: d.Severity ? String(d.Severity) : "",
    count: +d.Count,
  };
}

export function severityCountsParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    severity: +d.Severity,
    count: +d.Count,
  };
}

export function temporalParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    dayOfWeek: +d.day_of_week,
    hourOfDay: +d.hour_of_day,
    totalAcc: +d.total_accidents,
    severeAcc: +d.high_severity_accidents,
  };
}

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
