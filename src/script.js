/*
US Accidents (Kaggle) 2016-2023
Visuals: Choropleth map by state (counts or average severity).
Data: stateMonthData (state + year_month aggregates), stateSummary (per-state totals/avg).
AI usage: Portions of this code were drafted with help from a generative AI assistant.
*/

// ---------------------------------------------------------------------------//
// File paths
// ---------------------------------------------------------------------------//
const stateMonthPath = "data/us_accidents_state_month.csv";
const statesGeoPath = "data/us_states.geojson";
const weatherBubblePath = "data/us_weather_bubble_sample.csv";
const severityWeatherPath = "data/us_severity_by_weather_state.csv";
const severityCountsPath = "data/us_state_severity_counts.csv";
const temporalPath = "data/us_temporal_patterns_state.csv";

// ---------------------------------------------------------------------------//
// Parsers and formatters
// ---------------------------------------------------------------------------//
const formatNumber = d3.format(",");
const formatSeverity = d3.format(".2f");
const formatCount = formatNumber;
const formatPercent = d3.format(".1%");

// ---------------------------------------------------------------------------//
// Data containers and state
// ---------------------------------------------------------------------------//
let stateMonthData = [];
let usStates = null;
let stateSummary = new Map();
let selectedState = "CA";
let currentMetric = "count"; // "count" or "severity"
let legendRange = { min: 0, max: 1 };
let weatherData = [];
let severityWeatherData = [];
let severityCounts = new Map();
let temporalData = [];

let tooltip;

// Map chart globals
let mapSvg, mapGroup, projection, pathGenerator, colorScale;
const mapMargin = { top: 10, right: 10, bottom: 10, left: 10 };
let resizeTimer;

// Bubble chart globals
let bubbleColorScale;
let bubbleSvg, bubbleGroup, bubbleEmptyText;
let bubbleXScale, bubbleYScale, bubbleSizeScale;
let bubbleInitialized = false;
let bubbleCurrentFilter = "all";
const bubbleMargin = { top: 28, right: 28, bottom: 56, left: 64 };

// Stacked bar chart globals
let severityChartSvg, severityChartGroup, severityEmptyText;
let severityXScale, severityYScale, severityColorScale;
const severitySubgroups = ["1", "2", "3", "4"];
const severityColors = ["#fee5d9", "#fcae91", "#fb6a4a", "#cb181d"];
let severityChartInitialized = false;
const severityChartMargin = { top: 40, right: 24, bottom: 60, left: 70 };
const severityChartSize = { width: 700, height: 400 };

// Temporal heatmap globals
let temporalSvg, temporalGroup, temporalEmptyText;
let temporalXScale, temporalYScale, temporalColorScale;
let temporalInitialized = false;
let temporalMode = "total";
const temporalMargin = { top: 32, right: 24, bottom: 56, left: 70 };
const temporalSize = { width: 820, height: 420 };
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// ---------------------------------------------------------------------------//
// Data loading
// ---------------------------------------------------------------------------//
Promise.all([
  d3.csv(stateMonthPath, stateMonthParserFn),
  d3.json(statesGeoPath),
  d3.csv(weatherBubblePath, weatherParserFn),
  d3.csv(severityWeatherPath, severityWeatherParserFn),
  d3.csv(severityCountsPath, severityCountsParserFn),
  d3.csv(temporalPath, temporalParserFn),
]).then(([stateMonth, statesGeo, weatherRows, severityRows, severityCountsRows, temporalRows]) => {
  stateMonthData = stateMonth;
  usStates = statesGeo;
  weatherData = weatherRows;
  severityWeatherData = severityRows;
  severityCounts = buildSeverityCountMap(severityCountsRows);
  temporalData = temporalRows;

  stateSummary = buildStateSummary(stateMonthData);

  // Use a state that exists in the data as default.
  if (!stateSummary.has(selectedState)) {
    const firstKey = stateSummary.keys().next().value;
    selectedState = firstKey || "CA";
  }

  updateMetricDescription(currentMetric);
  tooltip = createTooltip();
  initMap();
  initWeatherBubble();
  initWeatherSeverityChart();
  initTemporalHeatmap();
  attachControls();
  updateWeatherBubble();
  updateWeatherSeverityChart();
  updateTemporalHeatmap();
  updateStateSeveritySummary();
}).catch((err) => {
  console.error("Error loading data:", err);
});

function stateMonthParserFn(d) {
  return {
    state: d.state,
    year_month: d.year_month,
    year: +d.year,
    count_accidents: +d.count_accidents,
    avg_severity: +d.avg_severity,
  };
}

function weatherParserFn(d) {
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

function severityWeatherParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    weather: d.Weather_Condition,
    severity: d.Severity ? String(d.Severity) : "",
    count: +d.Count,
  };
}

function severityCountsParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    severity: +d.Severity,
    count: +d.Count,
  };
}

function temporalParserFn(d) {
  return {
    state: (d.State || "").toUpperCase(),
    dayOfWeek: +d.day_of_week,
    hourOfDay: +d.hour_of_day,
    totalAcc: +d.total_accidents,
    severeAcc: +d.high_severity_accidents,
  };
}

// ---------------------------------------------------------------------------//
// Helpers
// ---------------------------------------------------------------------------//
function createTooltip() {
  const t = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip");
  return t;
}

function showTooltip(html, event) {
  tooltip
    .html(html)
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY + 12}px`)
    .style("opacity", 1);
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

function buildStateSummary(data) {
  const summary = new Map();
  data.forEach((d) => {
    const code = (d.state || "").toUpperCase();
    if (!code) return;
    const entry = summary.get(code) || {
      totalCount: 0,
      weightedSeverity: 0,
    };
    entry.totalCount += d.count_accidents;
    entry.weightedSeverity += d.avg_severity * d.count_accidents;
    summary.set(code, entry);
  });

  summary.forEach((entry, code) => {
    entry.avgSeverity =
      entry.totalCount > 0 ? entry.weightedSeverity / entry.totalCount : 0;
    delete entry.weightedSeverity;
  });
  return summary;
}

function extractStateCode(feature) {
  const props = feature.properties || {};
  const candidates = [
    props.STUSPS,
    props.STUSPS10, // present in this GeoJSON
    props.state_code,
    props.STATE,
    props.CODE,
    props.code,
    props.postal,
    props.postalCode,
  ];
  return (candidates.find((c) => typeof c === "string" && c.trim().length) || "").trim();
}

function extractStateName(feature) {
  const props = feature.properties || {};
  return (
    props.NAME || props.NAME10 || props.name || props.state_name || extractStateCode(feature) || "State"
  ).toString();
}

function getStateNameFromCode(code) {
  const normalized = (code || "").toUpperCase();
  if (!usStates || !Array.isArray(usStates.features)) return normalized;
  const match = usStates.features.find((f) => extractStateCode(f) === normalized);
  return match ? extractStateName(match) : normalized;
}

function buildSeverityCountMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const code = (row.state || "").toUpperCase();
    if (!code || !Number.isFinite(row.severity)) return;
    const entry = map.get(code) || { 1: 0, 2: 0, 3: 0, 4: 0 };
    if (row.severity >= 1 && row.severity <= 4) {
      entry[row.severity] = (entry[row.severity] || 0) + (row.count || 0);
    }
    map.set(code, entry);
  });
  return map;
}

function attachControls() {
  d3.select("#metric-select").on("change", (event) => {
    currentMetric = event.target.value;
    updateMetricDescription(currentMetric);
    updateMapColors();
  });

  d3
    .selectAll("#weather-filters .filter-btn")
    .on("click", function handleFilterClick() {
      d3.selectAll("#weather-filters .filter-btn").classed("active", false);
      d3.select(this).classed("active", true);
      bubbleCurrentFilter = this.getAttribute("value") || "all";
      updateWeatherBubble();
    });

  d3
    .selectAll("#temporal-controls .filter-btn")
    .on("click", function handleTemporalClick() {
      d3.selectAll("#temporal-controls .filter-btn").classed("active", false);
      d3.select(this).classed("active", true);
      temporalMode = this.getAttribute("value") || "total";
      updateTemporalHeatmap();
    });
}

function updateMetricDescription(metric) {
  if (metric === "count") {
    d3.select("#metric-description").text(
      "Total number of reported accidents in each state between 2016 and 2023."
    );
  } else {
    d3.select("#metric-description").text(
      "Average severity of accidents in each state (1 = minor, 4 = most severe)."
    );
  }
}

// ---------------------------------------------------------------------------//
// Map
// ---------------------------------------------------------------------------//
function initMap() {
  const container = d3.select("#map");
  mapSvg = container.append("svg");
  mapGroup = mapSvg.append("g");

  updateColorScale();
  updateLegend();
  renderMap();

  window.addEventListener("resize", handleResize);
}

function getMapDimensions() {
  const containerNode = d3.select("#map").node();
  const containerWidth = containerNode ? containerNode.getBoundingClientRect().width : 900;
  const width = Math.max(320, Math.min(containerWidth, 1200));
  const height = Math.max(320, Math.round(width * 0.55));
  return { width, height };
}

function renderMap() {
  const { width, height } = getMapDimensions();
  const innerWidth = width - mapMargin.left - mapMargin.right;
  const innerHeight = height - mapMargin.top - mapMargin.bottom;

  mapSvg.attr("width", width).attr("height", height);
  mapGroup.attr("transform", `translate(${mapMargin.left},${mapMargin.top})`);

  projection = d3.geoAlbersUsa().fitSize([innerWidth, innerHeight], usStates);
  pathGenerator = d3.geoPath().projection(projection);

  const states = mapGroup
    .selectAll("path.state")
    .data(usStates.features, (d) => extractStateCode(d));

  states
    .enter()
    .append("path")
    .attr("class", "state")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.7)
    .on("mouseover", function (event, d) {
      const code = extractStateCode(d);
      const name = extractStateName(d);
      const stats = stateSummary.get(code);
      const html = stats
        ? `<strong>${name} (${code})</strong><br/>Accidents: ${formatNumber(
            stats.totalCount,
          )}<br/>Avg severity: ${formatSeverity(stats.avgSeverity)}`
        : `<strong>${name}</strong><br/>No data`;
      d3.select(this).attr("stroke-width", 1.5);
      showTooltip(html, event);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke-width", 0.7);
      hideTooltip();
    })
    .on("click", function (event, d) {
      const code = extractStateCode(d);
      if (!code) return;
      selectedState = code;
      mapGroup.selectAll(".state").classed("selected", false);
      d3.select(this).classed("selected", true);
      if (bubbleInitialized) {
        updateWeatherBubble();
      }
      if (severityChartInitialized) {
        updateWeatherSeverityChart();
      }
      if (temporalInitialized) {
        updateTemporalHeatmap();
      }
      updateStateSeveritySummary();
    })
    .merge(states)
    .attr("d", pathGenerator)
    .attr("fill", (d) => {
      const code = extractStateCode(d);
      return colorScale(getMetricValue(code));
    });

  states.exit().remove();

  // Highlight default selection if present.
  mapGroup
    .selectAll(".state")
    .filter((d) => extractStateCode(d) === selectedState)
    .classed("selected", true);
}

function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderMap();
  }, 150);
}

function updateColorScale() {
  if (currentMetric === "count") {
    const counts = Array.from(stateSummary.values(), (d) => d.totalCount);
    const [minCountRaw, maxCountRaw] = d3.extent(counts);
    const minCount = Number.isFinite(minCountRaw) ? minCountRaw : 0;
    const maxCount = Number.isFinite(maxCountRaw) ? maxCountRaw : 1;
    const domainMax = maxCount === minCount ? minCount + 1 : maxCount;
    colorScale = d3.scaleSequential(d3.interpolateReds).domain([minCount, domainMax]);
    legendRange = { min: minCount, max: maxCount };
  } else {
    const severities = Array.from(stateSummary.values(), (d) => d.avgSeverity || 0);
    const [minSevRaw, maxSevRaw] = d3.extent(severities);
    const minSev = Number.isFinite(minSevRaw) ? minSevRaw : 0;
    const maxSev = Number.isFinite(maxSevRaw) ? maxSevRaw : 1;
    const padding = 0.05;
    let domainMin = minSev - padding;
    let domainMax = maxSev + padding;
    if (domainMax <= domainMin) {
      domainMax = domainMin + 0.1;
    }
    colorScale = d3.scaleSequential(d3.interpolateBlues).domain([domainMin, domainMax]);
    legendRange = { min: minSev, max: maxSev };
  }
}

function updateMapColors() {
  updateColorScale();
  updateLegend();

  mapGroup
    .selectAll(".state")
    .transition()
    .duration(600)
    .attr("fill", (d) => {
      const code = extractStateCode(d);
      return colorScale(getMetricValue(code));
    });
}

function getMetricValue(stateCode) {
  const stats = stateSummary.get((stateCode || "").toUpperCase());
  if (!stats) return 0;
  return currentMetric === "count" ? stats.totalCount : stats.avgSeverity;
}

function updateLegend() {
  const isCount = currentMetric === "count";
  const lowLabel = isCount ? "Low accidents" : "Lower severity";
  const highLabel = isCount ? "High accidents" : "Higher severity";
  const minVal = legendRange.min;
  const maxVal = legendRange.max;

  d3.select("#legend-label-low").text(lowLabel);
  d3.select("#legend-label-high").text(highLabel);

  d3.select("#legend-gradient").style(
    "background",
    isCount
      ? "linear-gradient(90deg, #fee2e2, #b91c1c)"
      : "linear-gradient(90deg, #e0f2fe, #1d4ed8)",
  );

  d3.select("#legend-min").text(isCount ? formatCount(minVal) : formatSeverity(minVal));
  d3.select("#legend-max").text(isCount ? formatCount(maxVal) : formatSeverity(maxVal));
}

function updateStateSeveritySummary() {
  const container = d3.select("#state-severity-summary");
  if (container.empty()) return;

  const stateCode = (selectedState || "").toUpperCase();
  const counts = severityCounts.get(stateCode) || { 1: 0, 2: 0, 3: 0, 4: 0 };
  const total = severitySubgroups.reduce(
    (acc, key) => acc + (counts[parseInt(key, 10)] || 0),
    0,
  );
  const data = severitySubgroups.map((key, idx) => {
    const count = counts[parseInt(key, 10)] || 0;
    const share = total ? count / total : 0;
    return { level: key, count, share, color: severityColors[idx] || "#e5e7eb" };
  });

  const chips = container.selectAll(".severity-chip").data(data, (d) => d.level);

  const chipsEnter = chips
    .enter()
    .append("div")
    .attr("class", "severity-chip");

  chipsEnter.append("span").attr("class", "label");
  chipsEnter.append("span").attr("class", "value");

  chips
    .merge(chipsEnter)
    .style("background", (d) => {
      const c = d3.color(d.color);
      if (c) {
        c.opacity = 0.22;
        return c.toString();
      }
      return "#fff";
    })
    .style("border-color", (d) => d.color)
    .select(".label")
    .text((d) => `Severity ${d.level}`);

  chips
    .merge(chipsEnter)
    .select(".value")
    .text((d) => `${formatNumber(d.count)} (${formatPercent(d.share)})`);

  chips.exit().remove();
}

// ---------------------------------------------------------------------------//
// Bubble chart
// ---------------------------------------------------------------------------//
function initWeatherBubble() {
  const container = d3.select("#scatterplot");
  if (container.empty()) return;

  const width = 760;
  const height = 460;
  const innerWidth = width - bubbleMargin.left - bubbleMargin.right;
  const innerHeight = height - bubbleMargin.top - bubbleMargin.bottom;

  bubbleSvg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = bubbleSvg
    .append("g")
    .attr("transform", `translate(${bubbleMargin.left},${bubbleMargin.top})`);

  bubbleXScale = d3.scaleLinear().domain([0, 100]).range([0, innerWidth]);
  bubbleYScale = d3.scaleLinear().domain([-28, 45]).range([innerHeight, 0]);
  bubbleSizeScale = d3.scaleSqrt().range([2, 20]);
  bubbleColorScale = d3
    .scaleSequential(d3.interpolateYlOrRd)
    .domain([0, 0.15])
    .clamp(true);

  const xAxis = d3.axisBottom(bubbleXScale).ticks(10).tickFormat((d) => `${d}%`);
  const yAxis = d3.axisLeft(bubbleYScale).ticks(10).tickFormat((d) => `${d}°C`);

  g.append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis);

  g.append("text")
    .attr("class", "axis-label")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 40)
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563")
    .text("Humidity (%)");

  g.append("g").attr("class", "y-axis").call(yAxis);

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -(innerHeight / 2))
    .attr("y", -46)
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563")
    .text("Temperature (°C)");

  const humiditySplit = 60;
  const tempSplit = 10;

  // Quadrant guide lines
  g.append("line")
    .attr("x1", bubbleXScale(humiditySplit))
    .attr("x2", bubbleXScale(humiditySplit))
    .attr("y1", 0)
    .attr("y2", innerHeight)
    .attr("stroke", "#e5e7eb")
    .attr("stroke-dasharray", "4 4");

  g.append("line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", bubbleYScale(tempSplit))
    .attr("y2", bubbleYScale(tempSplit))
    .attr("stroke", "#e5e7eb")
    .attr("stroke-dasharray", "4 4");

  const quadrantLabels = [
    { text: "Cold & Dry", x: bubbleXScale(18), y: bubbleYScale(tempSplit + 14) },
    { text: "Cold & Humid", x: bubbleXScale(90), y: bubbleYScale(tempSplit + 14) },
    { text: "Hot & Dry", x: bubbleXScale(18), y: bubbleYScale(tempSplit - 8) },
    { text: "Hot & Humid", x: bubbleXScale(90), y: bubbleYScale(tempSplit - 8) },
  ];

  quadrantLabels.forEach((q) => {
    g.append("text")
      .attr("class", "quadrant-label")
      .attr("x", q.x)
      .attr("y", q.y)
      .attr("text-anchor", "middle")
      .attr("fill", "#9ca3af")
      .attr("font-size", 11)
      .text(q.text);
  });

  // Highlight near-freezing, high-humidity zone.
  const freezeX = bubbleXScale(70);
  const freezeWidth = bubbleXScale(100) - freezeX;
  const freezeYTop = bubbleYScale(3);
  const freezeYBottom = bubbleYScale(-5);
  const freezeHeight = freezeYBottom - freezeYTop;
  g.append("rect")
    .attr("class", "freeze-band")
    .attr("x", freezeX)
    .attr("y", freezeYTop)
    .attr("width", freezeWidth)
    .attr("height", freezeHeight);

  bubbleGroup = g.append("g").attr("class", "bubble-group");

  bubbleEmptyText = g
    .append("text")
    .attr("id", "bubble-empty")
    .attr("text-anchor", "middle")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight / 2)
    .attr("fill", "#6b7280")
    .attr("font-size", 12)
    .style("display", "none")
    .text("No data for this state and filter.");

  bubbleInitialized = true;
  updateWeatherBubble();
}

function updateWeatherBubble() {
  if (!bubbleInitialized) return;

  const stateCode = (selectedState || "").toUpperCase();
  const stateName = getStateNameFromCode(stateCode);
  const stateData = weatherData.filter((d) => d.state === stateCode);
  const hasStateData = stateData.length > 0;
  const baseData = hasStateData ? stateData : weatherData;

  const filtered =
    bubbleCurrentFilter === "all"
      ? baseData
      : baseData.filter((d) => d[bubbleCurrentFilter] === true);

  const bins = new Map();
  let maxCount = 0;

  filtered.forEach((d) => {
    if (!Number.isFinite(d.humidity) || !Number.isFinite(d.tempC)) return;
    const hBin = Math.round(d.humidity / 4) * 4;
    const tBin = Math.round(d.tempC / 2) * 2;
    const id = `${tBin}|${hBin}`;
    const bin = bins.get(id) || { id, temp: tBin, humidity: hBin, count: 0, sumHigh: 0 };
    bin.count += 1;
    bin.sumHigh += d.highSeverity || 0;
    bins.set(id, bin);
    if (bin.count > maxCount) {
      maxCount = bin.count;
    }
  });

  const binnedArray = Array.from(bins.values()).map((b) => ({
    ...b,
    riskRatio: b.count > 0 ? b.sumHigh / b.count : 0,
  }));

  bubbleSizeScale.domain([0, maxCount || 1]);

  const circles = bubbleGroup
    .selectAll("circle.bubble")
    .data(binnedArray, (d) => d.id);

  circles
    .exit()
    .transition()
    .duration(300)
    .attr("r", 0)
    .remove();

  const circlesEnter = circles
    .enter()
    .append("circle")
    .attr("class", "bubble")
    .attr("cx", (d) => bubbleXScale(d.humidity))
    .attr("cy", (d) => bubbleYScale(d.temp))
    .attr("r", 0)
    .attr("fill-opacity", 0.9)
    .attr("stroke", "rgba(0,0,0,0.25)")
    .attr("stroke-width", 0.6)
    .on("mouseover", (event, d) => {
      const html = `<strong>${formatNumber(d.count)} accidents</strong><br/>Severe share: ${formatPercent(
        d.riskRatio,
      )}<br/>Temp: ${d.temp}°C, Humidity: ${d.humidity}%`;
      showTooltip(html, event);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })
    .on("mouseout", hideTooltip);

  circlesEnter
    .merge(circles)
    .transition()
    .duration(500)
    .attr("cx", (d) => bubbleXScale(d.humidity))
    .attr("cy", (d) => bubbleYScale(d.temp))
    .attr("r", (d) => bubbleSizeScale(d.count))
    .attr("fill", (d) => bubbleColorScale(d.riskRatio));

  const filterLabels = {
    all: "All conditions",
    is_Rain: "Rain / Storm",
    is_Snow: "Snow / Ice",
    is_Fog: "Fog / Mist",
    is_Clear: "Clear sky",
    is_Cloud: "Cloudy",
  };

  const captionFilter =
    bubbleCurrentFilter === "all" ? "" : ` | Filter: ${filterLabels[bubbleCurrentFilter] || bubbleCurrentFilter}`;
  const captionBase = hasStateData
    ? `Showing ${formatNumber(baseData.length)} sampled accidents`
    : `No weather sample for ${stateCode}. Showing national sample (${formatNumber(baseData.length)} accidents)`;

  d3.select("#bubble-state-caption").text(
    `Current state: ${stateCode} – ${stateName}. ${captionBase}${captionFilter}.`,
  );

  if (binnedArray.length === 0) {
    bubbleEmptyText.style("display", "block");
  } else {
    bubbleEmptyText.style("display", "none");
  }
}

// ---------------------------------------------------------------------------//
// Stacked bar chart: severity across weather conditions
// ---------------------------------------------------------------------------//
function initWeatherSeverityChart() {
  if (severityChartInitialized) return;

  const container = d3.select("#weather-severity-chart");
  if (container.empty()) return;

  const width = severityChartSize.width;
  const height = severityChartSize.height;
  const innerWidth = width - severityChartMargin.left - severityChartMargin.right;
  const innerHeight = height - severityChartMargin.top - severityChartMargin.bottom;

  severityChartSvg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = severityChartSvg
    .append("g")
    .attr("transform", `translate(${severityChartMargin.left},${severityChartMargin.top})`);
  severityChartGroup = g;

  severityXScale = d3.scaleBand().range([0, innerWidth]).padding(0.2);
  severityYScale = d3.scaleLinear().range([innerHeight, 0]);
  severityColorScale = d3
    .scaleOrdinal()
    .domain(severitySubgroups)
    .range(severityColors);

  g.append("g")
    .attr("class", "severity-x-axis")
    .attr("transform", `translate(0, ${innerHeight})`);

  g.append("g").attr("class", "severity-y-axis");

  g.append("text")
    .attr("class", "weather-severity-axis-label")
    .attr("text-anchor", "end")
    .attr("transform", "rotate(-90)")
    .attr("y", -50)
    .attr("x", -(innerHeight / 2))
    .text("Number of accidents");

  const legend = g
    .append("g")
    .attr("class", "severity-legend")
    .attr("font-family", "sans-serif")
    .attr("font-size", 11)
    .attr("text-anchor", "end");

  const legendItems = legend
    .selectAll("g")
    .data(severitySubgroups.slice().reverse())
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(0, ${i * 18})`);

  legendItems
    .append("rect")
    .attr("x", innerWidth)
    .attr("width", 16)
    .attr("height", 16)
    .attr("fill", (d) => severityColorScale(d));

  legendItems
    .append("text")
    .attr("x", innerWidth - 4)
    .attr("y", 8)
    .attr("dy", "0.32em")
    .text((d) => `Severity ${d}`);

  severityEmptyText = g
    .append("text")
    .attr("class", "weather-severity-empty")
    .attr("text-anchor", "middle")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight / 2)
    .attr("fill", "#6b7280")
    .attr("font-size", 12)
    .style("display", "none")
    .text("No data for this state.");

  severityChartInitialized = true;
}

function updateWeatherSeverityChart() {
  if (!severityChartInitialized) return;
  if (!severityWeatherData.length) return;

  const stateCode = (selectedState || "").toUpperCase();
  const stateName = getStateNameFromCode(stateCode);
  let rows = severityWeatherData.filter((d) => d.state === stateCode);
  const hasStateData = rows.length > 0;
  if (!hasStateData) {
    rows = severityWeatherData;
  }

  const byWeather = new Map();
  rows.forEach((row) => {
    const weather = row.weather || "Other";
    if (!byWeather.has(weather)) {
      const base = { Weather_Condition: weather };
      severitySubgroups.forEach((s) => {
        base[s] = 0;
      });
      byWeather.set(weather, base);
    }
    if (severitySubgroups.includes(row.severity)) {
      byWeather.get(weather)[row.severity] += row.count || 0;
    }
  });

  const aggregated = Array.from(byWeather.values());
  aggregated.sort((a, b) => {
    const sumA = severitySubgroups.reduce((acc, s) => acc + (a[s] || 0), 0);
    const sumB = severitySubgroups.reduce((acc, s) => acc + (b[s] || 0), 0);
    return sumB - sumA;
  });

  const top = aggregated.slice(0, 5);

  const label = d3.select("#weather-severity-state-label");
  if (!hasStateData) {
    label.text(`All states (no sample for ${stateCode})`);
  } else {
    label.text(`${stateCode} – ${stateName}`);
  }

  if (!top.length) {
    severityChartGroup.selectAll(".severity-layer").remove();
    severityEmptyText.style("display", "block");
    return;
  }
  severityEmptyText.style("display", "none");

  const totalMax =
    d3.max(top, (d) => severitySubgroups.reduce((acc, s) => acc + (d[s] || 0), 0)) || 1;

  severityXScale.domain(top.map((d) => d.Weather_Condition));
  severityYScale.domain([0, totalMax * 1.1]);

  severityChartGroup
    .select(".severity-x-axis")
    .transition()
    .duration(500)
    .call(d3.axisBottom(severityXScale).tickSizeOuter(0))
    .selectAll("text")
    .attr("transform", "rotate(-20)")
    .style("text-anchor", "end");

  severityChartGroup
    .select(".severity-y-axis")
    .transition()
    .duration(500)
    .call(d3.axisLeft(severityYScale).ticks(6).tickFormat(formatNumber));

  const stackedData = d3.stack().keys(severitySubgroups)(top);

  const layers = severityChartGroup
    .selectAll("g.severity-layer")
    .data(stackedData, (d) => d.key);

  layers
    .enter()
    .append("g")
    .attr("class", "severity-layer")
    .attr("fill", (d) => severityColorScale(d.key))
    .merge(layers)
    .attr("fill", (d) => severityColorScale(d.key));

  layers.exit().remove();

  const rects = severityChartGroup
    .selectAll("g.severity-layer")
    .selectAll("rect")
    .data((d) => d, (d) => d.data.Weather_Condition);

  rects
    .enter()
    .append("rect")
    .attr("x", (d) => severityXScale(d.data.Weather_Condition))
    .attr("width", () => severityXScale.bandwidth())
    .attr("y", () => severityYScale(0))
    .attr("height", 0)
    .on("mouseover", severityMouseover)
    .on("mousemove", severityMousemove)
    .on("mouseleave", severityMouseleave)
    .transition()
    .duration(600)
    .attr("y", (d) => severityYScale(d[1]))
    .attr("height", (d) => severityYScale(d[0]) - severityYScale(d[1]));

  rects
    .transition()
    .duration(600)
    .attr("x", (d) => severityXScale(d.data.Weather_Condition))
    .attr("width", () => severityXScale.bandwidth())
    .attr("y", (d) => severityYScale(d[1]))
    .attr("height", (d) => severityYScale(d[0]) - severityYScale(d[1]));

  rects
    .exit()
    .transition()
    .duration(400)
    .attr("height", 0)
    .remove();

  const annotations = top
    .map((d) => {
      const total = severitySubgroups.reduce((acc, s) => acc + (d[s] || 0), 0);
      const severeShare = total ? (d["3"] + d["4"]) / total : 0;
      return { weather: d.Weather_Condition, total, severeShare };
    })
    .filter((d) => d.severeShare > 0.3 && d.total > 0);

  const annotationSel = severityChartGroup
    .selectAll("text.severity-annotation")
    .data(annotations, (d) => d.weather);

  annotationSel
    .enter()
    .append("text")
    .attr("class", "severity-annotation")
    .attr("x", (d) => severityXScale(d.weather) + severityXScale.bandwidth() / 2)
    .attr("y", (d) => severityYScale(d.total) - 6)
    .text("Higher severity share")
    .merge(annotationSel)
    .transition()
    .duration(400)
    .attr("x", (d) => severityXScale(d.weather) + severityXScale.bandwidth() / 2)
    .attr("y", (d) => severityYScale(d.total) - 6)
    .text("Higher severity share");

  annotationSel.exit().remove();
}

function severityMouseover(event, d) {
  const layerKey = d3.select(event.currentTarget.parentNode).datum().key;
  const weather = d.data.Weather_Condition;
  const count = d.data[layerKey] || 0;
  const total = severitySubgroups.reduce((acc, s) => acc + (d.data[s] || 0), 0);
  const share = total ? count / total : 0;
  const html = `<strong>${weather}</strong><br/>Severity ${layerKey}: ${formatNumber(
    count,
  )} accidents<br/>Share of weather: ${formatPercent(share)}`;
  showTooltip(html, event);
  d3.select(event.currentTarget).attr("stroke", "#000").attr("stroke-width", 1);
}

function severityMousemove(event) {
  tooltip
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY - 20}px`);
}

function severityMouseleave(event) {
  hideTooltip();
  d3.select(event.currentTarget).attr("stroke", "none");
}

// ---------------------------------------------------------------------------//
// Temporal heatmap (day-of-week x hour-of-day)
// ---------------------------------------------------------------------------//
function initTemporalHeatmap() {
  if (temporalInitialized) return;
  const container = d3.select("#temporal-heatmap");
  if (container.empty()) return;

  const width = temporalSize.width;
  const height = temporalSize.height;
  const innerWidth = width - temporalMargin.left - temporalMargin.right;
  const innerHeight = height - temporalMargin.top - temporalMargin.bottom;

  temporalSvg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  temporalGroup = temporalSvg
    .append("g")
    .attr("transform", `translate(${temporalMargin.left},${temporalMargin.top})`);

  temporalXScale = d3.scaleBand().domain(d3.range(24)).range([0, innerWidth]).padding(0.05);
  temporalYScale = d3.scaleBand().domain(d3.range(7)).range([0, innerHeight]).padding(0.05);
  temporalColorScale = d3.scaleSequential(d3.interpolateOrRd).clamp(true);

  temporalGroup
    .append("g")
    .attr("class", "temporal-x-axis")
    .attr("transform", `translate(0, ${innerHeight})`);

  temporalGroup.append("g").attr("class", "temporal-y-axis");

  temporalGroup
    .append("text")
    .attr("class", "weather-severity-axis-label")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 44)
    .attr("text-anchor", "middle")
    .text("Hour of day");

  temporalGroup
    .append("text")
    .attr("class", "weather-severity-axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .attr("x", -(innerHeight / 2))
    .attr("y", -52)
    .text("Day of week");

  temporalEmptyText = temporalGroup
    .append("text")
    .attr("class", "weather-severity-empty")
    .attr("text-anchor", "middle")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight / 2)
    .attr("fill", "#6b7280")
    .attr("font-size", 12)
    .style("display", "none")
    .text("No temporal data for this selection.");

  temporalInitialized = true;
}

function updateTemporalHeatmap() {
  if (!temporalInitialized || !temporalData.length) return;

  const stateCode = (selectedState || "").toUpperCase();
  const stateName = getStateNameFromCode(stateCode);
  let rows = temporalData.filter((d) => d.state === stateCode);
  const hasStateData = rows.length > 0;
  if (!hasStateData) {
    rows = temporalData;
  }

  const cellMap = new Map();
  rows.forEach((row) => {
    const key = `${row.dayOfWeek}|${row.hourOfDay}`;
    const existing = cellMap.get(key) || { totalAcc: 0, severeAcc: 0 };
    existing.totalAcc += row.totalAcc || 0;
    existing.severeAcc += row.severeAcc || 0;
    cellMap.set(key, existing);
  });

  const grid = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${day}|${hour}`;
      const row = cellMap.get(key) || {
        totalAcc: 0,
        severeAcc: 0,
      };
      const value = temporalMode === "severe" ? row.severeAcc || 0 : row.totalAcc || 0;
      grid.push({
        day,
        hour,
        totalAcc: row.totalAcc || 0,
        severeAcc: row.severeAcc || 0,
        value,
      });
    }
  }

  const maxVal = d3.max(grid, (d) => d.value) || 1;
  temporalColorScale.domain([0, maxVal]);

  temporalGroup
    .select(".temporal-x-axis")
    .transition()
    .duration(400)
    .call(d3.axisBottom(temporalXScale).tickValues([0, 6, 12, 18, 23]));

  temporalGroup
    .select(".temporal-y-axis")
    .transition()
    .duration(400)
    .call(
      d3
        .axisLeft(temporalYScale)
        .tickFormat((d) => dayLabels[d] || d)
        .tickSizeOuter(0),
    );

  const cells = temporalGroup
    .selectAll("rect.temporal-cell")
    .data(grid, (d) => `${d.day}-${d.hour}`);

  cells
    .enter()
    .append("rect")
    .attr("class", "temporal-cell")
    .attr("x", (d) => temporalXScale(d.hour))
    .attr("y", (d) => temporalYScale(d.day))
    .attr("width", temporalXScale.bandwidth())
    .attr("height", temporalYScale.bandwidth())
    .attr("rx", 2)
    .attr("ry", 2)
    .style("fill", (d) => (d.value > 0 ? temporalColorScale(d.value) : "#f3f4f6"))
    .on("mouseover", (event, d) => {
      const dayLabel = dayLabels[d.day] || d.day;
      const html = `<strong>${dayLabel}, ${d.hour}:00–${(d.hour + 1) % 24}:00</strong><br/>Total: ${formatNumber(
        d.totalAcc,
      )}<br/>High severity (3–4): ${formatNumber(d.severeAcc)}`;
      showTooltip(html, event);
    })
    .on("mousemove", (event) => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY - 20}px`);
    })
    .on("mouseout", hideTooltip);

  cells
    .transition()
    .duration(400)
    .style("fill", (d) => (d.value > 0 ? temporalColorScale(d.value) : "#f3f4f6"))
    .attr("x", (d) => temporalXScale(d.hour))
    .attr("y", (d) => temporalYScale(d.day))
    .attr("width", temporalXScale.bandwidth())
    .attr("height", temporalYScale.bandwidth());

  cells.exit().remove();

  const caption = hasStateData
    ? `Showing accidents for: ${stateCode} – ${stateName} (${temporalMode === "severe" ? "high-severity" : "all"})`
    : `No temporal sample for ${stateCode}. Showing national patterns (${temporalMode === "severe" ? "high-severity" : "all"})`;
  d3.select("#temporal-caption").text(caption);

  if (grid.every((d) => d.value === 0)) {
    temporalEmptyText.style("display", "block");
  } else {
    temporalEmptyText.style("display", "none");
  }
}
