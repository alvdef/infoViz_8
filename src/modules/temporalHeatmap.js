import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "../state.js";
import { 
  getStateNameFromCode, 
  formatNumber, 
  showTooltip, 
  hideTooltip, 
  updateTooltipPosition 
} from "../utils.js";

// Temporal heatmap globals
let temporalSvg, temporalGroup, temporalEmptyText;
let temporalXScale, temporalYScale, temporalColorScale;
let temporalInitialized = false;
export let temporalMode = "total";
const temporalMargin = { top: 32, right: 24, bottom: 56, left: 70 };
const temporalSize = { width: 820, height: 220 };
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function setTemporalMode(mode) {
    temporalMode = mode;
}

export function initTemporalHeatmap() {
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

export function updateTemporalHeatmap() {
  if (!temporalInitialized || !state.temporalData.length) return;

  const stateCode = (state.selectedState || "").toUpperCase();
  const stateName = stateCode ? getStateNameFromCode(stateCode) : "USA";
  
  // If state selected, filter data. Else use all data.
  // Filter by state
  let rows = state.selectedState
    ? state.temporalData.filter((d) => d.state === stateCode)
    : state.temporalData;

  // Filter by weather
  if (state.weatherFilter !== "all" && rows.length > 0) {
    rows = rows.filter(d => d[state.weatherFilter]);
  }
  
  const hasData = rows.length > 0;
  
  // Note: Temporal heatmap relies on `temporalData`.
  // The logic below aggregates whatever is in `rows` into `cellMap`.

  const cellMap = new Map();
  rows.forEach((row) => {
    const key = `${row.dayOfWeek}|${row.hourOfDay}`;
    const existing = cellMap.get(key) || { totalAcc: 0, severeAcc: 0, sumSeverity: 0 };
    
    // Support for both pre-aggregated (row.totalAcc) and individual rows
    const count = row.totalAcc !== undefined ? row.totalAcc : 1;
    const isSevere = row.severeAcc !== undefined ? row.severeAcc : (row.severity >= 3 ? 1 : 0);
    const sevValue = row.sumSeverity !== undefined ? row.sumSeverity : row.severity; // Severity value to add

    // Aggregation logic
    existing.totalAcc += count;
    existing.sumSeverity += sevValue; // Accumulate severity for average
    existing.severeAcc += isSevere;
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
      let value = 0;
      if (state.currentMetric === "count") {
          value = row.totalAcc;
      } else {
          // Average severity
          value = row.totalAcc > 0 ? row.sumSeverity / row.totalAcc : 0;
      }

      grid.push({
        day,
        hour,
        totalAcc: row.totalAcc || 0,
        severeAcc: row.severeAcc || 0,
        avgSeverity: row.totalAcc > 0 ? row.sumSeverity / row.totalAcc : 0,
        value,
      });
    }
  }

  // Define scale based on metric
  if (state.currentMetric === "count") {
      const maxVal = d3.max(grid, (d) => d.value) || 1;
      temporalColorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxVal]);
  } else {
      // User requested explicit [2, 3] domain for better contrast in severity average
      // Custom interpolator to avoid "too light" colors at the low end
      const customOranges = (t) => d3.interpolateOranges(0.3 + 0.7 * t);
      temporalColorScale = d3.scaleSequential(customOranges).domain([2, 3]).clamp(true);
  }

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
      const metricLabel = state.currentMetric === "count" ? "Total Accidents" : "Avg Severity";
      const metricVal = state.currentMetric === "count" ? formatNumber(d.totalAcc) : formatNumber(d.avgSeverity, 2);
      
      const html = `<strong>${dayLabel}, ${d.hour}:00–${(d.hour + 1) % 24}:00</strong><br/>
                    ${metricLabel}: ${metricVal}<br/>
                    <small>High severity count: ${formatNumber(d.severeAcc)}</small>`;
      showTooltip(html, event);
    })
    .on("mousemove", (event) => {
      updateTooltipPosition(event);
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

  const locationStr = state.selectedState ? `${stateCode} – ${stateName}` : "National View";
  d3.select("#temporal-caption").text(locationStr);

  if (grid.every((d) => d.value === 0)) {
    temporalEmptyText.style("display", "block");
  } else {
    temporalEmptyText.style("display", "none");
  }
}
