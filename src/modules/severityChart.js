import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "../state.js";
import {
  getStateNameFromCode,
  formatNumber,
  formatPercent,
  showTooltip,
  hideTooltip,
  updateTooltipPosition
} from "../utils.js";

// Stacked bar chart globals
let severityChartSvg, severityChartGroup, severityEmptyText;
let severityXScale, severityYScale, severityColorScale;
const severitySubgroups = ["Low", "High"];
const severityColors = ["#fed8b1", "#c2410c"]; // Light/dark orange for consistency
let severityChartInitialized = false;
let onFilterChangeCallback = null; // Callback for filter updates
const severityChartMargin = { top: 40, right: 24, bottom: 60, left: 70 };
const severityChartSize = { width: 700, height: 280 };

export function initWeatherSeverityChart(onFilterChange) {
  if (onFilterChange) onFilterChangeCallback = onFilterChange;
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
    .attr("font-size", 11)
    .attr("text-anchor", "end")
    .attr("transform", "translate(0, -35)");

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
    .text((d) => d);

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

export function updateWeatherSeverityChart() {
  if (!severityChartInitialized) return;
  if (!state.severityWeatherData.length) return;

  const stateCode = (state.selectedState || "").toUpperCase();
  const stateName = stateCode ? getStateNameFromCode(stateCode) : "USA";

  let rows = state.selectedCluster?.points?.length
    ? state.selectedCluster.points
    : state.selectedState
      ? state.severityWeatherData.filter((d) => d.state === stateCode)
      : state.severityWeatherData;

  // We now group by the 5 main categories derived from global filters.
  if (state.weatherFilter !== "all" && rows.length > 0) {
    rows = rows.filter(d => d[state.weatherFilter]);
  }
  const hasData = rows.length > 0;

  const categories = [
    { label: "Rain / Storm", key: "isRain" },
    { label: "Snow / Ice", key: "isSnow" },
    { label: "Fog / Mist", key: "isFog" },
    { label: "Clear sky", key: "isClear" },
    { label: "Cloudy", key: "isCloud" },
  ];

  const categoryMap = new Map();
  categories.forEach(cat => {
    const base = { Weather_Condition: cat.label };
    severitySubgroups.forEach(s => base[s] = 0);
    categoryMap.set(cat.key, base);
  });

  rows.forEach((row) => {
    const sev = row.severity;
    let group = null;
    if (sev === 1 || sev === 2) group = "Low";
    if (sev === 3 || sev === 4) group = "High";

    if (!group) return;

    categories.forEach(cat => {
      if (row[cat.key]) {
        categoryMap.get(cat.key)[group] += 1;
      }
    });
  });

  const top = Array.from(categoryMap.values()); // Show all 5 categories

  const label = d3.select("#weather-severity-state-label");
  const weatherText = state.weatherFilter !== "all"
    ? ` | Filter: ${categories.find(c => c.key === state.weatherFilter)?.label || state.weatherFilter}`
    : "";

  if (state.selectedCluster?.points?.length) {
    label.text(`Cluster ${state.selectedState ? `(${stateCode} – ${stateName})` : ""}${weatherText}`);
  } else if (!state.selectedState) {
    label.text(`National View${weatherText}`);
  } else {
    label.text(`${stateCode} – ${stateName}${weatherText}`);
  }

  const allZero = top.every(d => severitySubgroups.every(s => d[s] === 0));

  if (!top.length || allZero) {
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
    .on("click", (event, d) => {
      // d.data is the row object, d.data.Weather_Condition contains the label
      // We need to map back to the key (e.g. "Rain / Storm" -> "isRain")
      // BUT current implementation of updateWeatherSeverityChart constructs top array 
      // where d.data.Weather_Condition is the Label.
      // We need to lookup the key.
      const label = d.data.Weather_Condition;
      const categories = [
        { label: "Rain / Storm", key: "isRain" },
        { label: "Snow / Ice", key: "isSnow" },
        { label: "Fog / Mist", key: "isFog" },
        { label: "Clear sky", key: "isClear" },
        { label: "Cloudy", key: "isCloud" },
      ];
      const match = categories.find(c => c.label === label);
      if (match && onFilterChangeCallback) {
        onFilterChangeCallback(match.key);
      }
    })
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
    .attr("height", (d) => severityYScale(d[0]) - severityYScale(d[1]))
    .attr("opacity", (d) => {
      // Visual feedback: dim non-selected bars if a filter is active
      if (state.weatherFilter !== "all") {
        const label = d.data.Weather_Condition;
        const categories = [
          { label: "Rain / Storm", key: "isRain" },
          { label: "Snow / Ice", key: "isSnow" },
          { label: "Fog / Mist", key: "isFog" },
          { label: "Clear sky", key: "isClear" },
          { label: "Cloudy", key: "isCloud" },
        ];
        const match = categories.find(c => c.label === label);
        if (match && match.key !== state.weatherFilter) {
          return 0.3;
        }
      }
      return 1;
    });

  rects
    .exit()
    .transition()
    .duration(400)
    .attr("height", 0)
    .remove();
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
  updateTooltipPosition(event);
  // Optional: offset adjustment if needed, but standardizing is safer.
  // If fine-tuning is needed, we can do it here. 
  // Let's stick to the standard imported one unless it looks off.
}

function severityMouseleave(event) {
  hideTooltip();
  d3.select(event.currentTarget).attr("stroke", "none");
}

export function updateStateSeveritySummary() {
  const container = d3.select("#state-severity-summary");
  if (container.empty()) return;

  let counts = { 1: 0, 2: 0, 3: 0, 4: 0 };

  if (state.selectedCluster?.points?.length) {
    state.selectedCluster.points.forEach((d) => {
      const sev = Math.round(d.severity);
      if (sev >= 1 && sev <= 4) counts[sev] += 1;
    });
  } else if (state.selectedState) {
    const stateCode = (state.selectedState || "").toUpperCase();
    counts = state.severityCounts.get(stateCode) || { 1: 0, 2: 0, 3: 0, 4: 0 };
  } else {
    // Aggregate all
    state.severityCounts.forEach(c => {
      counts[1] += c[1];
      counts[2] += c[2];
      counts[3] += c[3];
      counts[4] += c[4];
    });
  }
  const lowCount = (counts[1] || 0) + (counts[2] || 0);
  const highCount = (counts[3] || 0) + (counts[4] || 0);
  const total = lowCount + highCount;

  const data = [
    { level: "Low", count: lowCount, color: severityColors[0] },
    { level: "High", count: highCount, color: severityColors[1] }
  ].map(d => ({ ...d, share: total ? d.count / total : 0 }));

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
    .text((d) => d.level);

  chips
    .merge(chipsEnter)
    .select(".value")
    .text((d) => `${formatNumber(d.count)} (${formatPercent(d.share)})`);

  chips.exit().remove();
}
