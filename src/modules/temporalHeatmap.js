import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "../state.js";
import { WEATHER_LABELS } from "../constants.js";
import {
  getStateNameFromCode,
  formatNumber,
  showTooltip,
  hideTooltip,
  updateTooltipPosition
} from "../utils.js";
import { observeResize, getContainerSize } from "./resize.js";

// Temporal heatmap globals
let temporalSvg, temporalGroup, temporalEmptyText;
let temporalXScale, temporalYScale, temporalColorScale;
let temporalContainer;
let temporalXAxisG, temporalYAxisG, temporalXAxisLabel, temporalYAxisLabel;
let temporalInnerWidth = 0;
let temporalInnerHeight = 0;
let temporalXAxisTicks = [0, 6, 12, 18, 23];
let temporalYAxisTicks = d3.range(7);
let temporalResizeCleanup = null;
let temporalInitialized = false;
export let temporalMode = "total";
const temporalMargin = { top: 32, right: 24, bottom: 56, left: 70 };
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function setTemporalMode(mode) {
  temporalMode = mode;
}

export function initTemporalHeatmap() {
  if (temporalInitialized) return;
  const container = d3.select("#temporal-heatmap");
  if (container.empty()) return;
  temporalContainer = container;

  temporalSvg = container.append("svg");

  temporalGroup = temporalSvg
    .append("g")
    .attr("transform", `translate(${temporalMargin.left},${temporalMargin.top})`);

  temporalXScale = d3.scaleBand().domain(d3.range(24)).padding(0.05);
  temporalYScale = d3.scaleBand().domain(d3.range(7)).padding(0.05);
  temporalColorScale = d3.scaleSequential(d3.interpolateOrRd).clamp(true);

  temporalXAxisG = temporalGroup.append("g").attr("class", "temporal-x-axis");
  temporalYAxisG = temporalGroup.append("g").attr("class", "temporal-y-axis");

  temporalXAxisLabel = temporalGroup
    .append("text")
    .attr("class", "weather-severity-axis-label")
    .attr("text-anchor", "middle")
    .text("Hour of day");

  temporalYAxisLabel = temporalGroup
    .append("text")
    .attr("class", "weather-severity-axis-label")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)")
    .text("Day of week");

  temporalEmptyText = temporalGroup
    .append("text")
    .attr("class", "weather-severity-empty")
    .attr("text-anchor", "middle")
    .attr("fill", "#6b7280")
    .attr("font-size", 12)
    .style("display", "none")
    .text("No temporal data for this selection.");

  temporalInitialized = true;
  handleTemporalResize();

  if (temporalResizeCleanup) temporalResizeCleanup();
  temporalResizeCleanup = observeResize(temporalContainer.node(), handleTemporalResize, { delay: 120 });
}

export function updateTemporalHeatmap() {
  if (!temporalInitialized || !state.temporalData.length) return;

  const stateCode = (state.selectedState || "").toUpperCase();
  const stateName = stateCode ? getStateNameFromCode(stateCode) : "USA";

  let rows = state.selectedCluster?.points?.length
    ? state.selectedCluster.points
    : state.selectedState
      ? state.temporalData.filter((d) => d.state === stateCode)
      : state.temporalData;

  if (state.weatherFilter !== "all" && rows.length > 0) {
    rows = rows.filter(d => d[state.weatherFilter]);
  }

  const cellMap = new Map();
  rows.forEach((row) => {
    const key = `${row.dayOfWeek}|${row.hourOfDay}`;
    const existing = cellMap.get(key) || { totalAcc: 0, severeAcc: 0, sumSeverity: 0 };

    const count = row.totalAcc !== undefined ? row.totalAcc : 1;
    const isSevere = row.severeAcc !== undefined ? row.severeAcc : (row.severity >= 3 ? 1 : 0);
    const sevValue = row.sumSeverity !== undefined ? row.sumSeverity : row.severity;

    existing.totalAcc += count;
    existing.sumSeverity += sevValue;
    existing.severeAcc += isSevere;
    cellMap.set(key, existing);
  });

  const grid = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${day}|${hour}`;
      const row = cellMap.get(key) || { totalAcc: 0, severeAcc: 0 };
      let value = 0;
      if (state.currentMetric === "count") {
        value = row.totalAcc;
      } else {
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

  if (state.currentMetric === "count") {
    const maxVal = d3.max(grid, (d) => d.value) || 1;
    const minVal = Math.min(1, maxVal);
    const warmRamp = (t) => d3.interpolateYlOrRd(0.25 + 0.75 * t);
    temporalColorScale = d3.scaleSequentialPow(warmRamp).exponent(0.6).domain([minVal, maxVal]).clamp(true);
  } else {
    const sevExtent = d3.extent(grid.filter(d => d.value > 0), (d) => d.value);
    const minSev = sevExtent[0] || 2;
    const maxSev = sevExtent[1] || 3;
    const customOranges = (t) => d3.interpolateOranges(0.2 + 0.8 * t);
    temporalColorScale = d3.scaleSequential(customOranges).domain([minSev, maxSev]).clamp(true);
  }

  temporalGroup
    .select(".temporal-x-axis")
    .transition()
    .duration(400)
    .call(d3.axisBottom(temporalXScale).tickValues(temporalXAxisTicks));

  temporalGroup
    .select(".temporal-y-axis")
    .transition()
    .duration(400)
    .call(
      d3
        .axisLeft(temporalYScale)
        .tickValues(temporalYAxisTicks)
        .tickFormat((d) => dayLabels[d] || d)
        .tickSizeOuter(0),
    );

  // Data binding
  const cells = temporalGroup
    .selectAll("rect.temporal-cell")
    .data(grid, (d) => `${d.day}-${d.hour}`);

  // ENTER: New cells fade in
  const cellsEnter = cells
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
    .style("fill-opacity", 0)
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

  // ENTER transition: fade in
  cellsEnter
    .transition()
    .duration(400)
    .style("fill-opacity", 1);

  // UPDATE: Smooth transition for color changes
  cells
    .transition()
    .duration(400)
    .style("fill", (d) => (d.value > 0 ? temporalColorScale(d.value) : "#f3f4f6"))
    .style("fill-opacity", 1)
    .attr("x", (d) => temporalXScale(d.hour))
    .attr("y", (d) => temporalYScale(d.day))
    .attr("width", temporalXScale.bandwidth())
    .attr("height", temporalYScale.bandwidth());

  cells.exit().remove();

  const weatherStr = state.weatherFilter !== "all" ? ` | Weather: ${WEATHER_LABELS[state.weatherFilter] || state.weatherFilter}` : "";
  const locationStr = state.selectedCluster?.points?.length
    ? `Cluster ${state.selectedState ? `(${stateCode} – ${stateName})` : ""}${weatherStr}`
    : (state.selectedState ? `${stateCode} – ${stateName}` : "National View") + weatherStr;
  d3.select("#temporal-caption").text(locationStr);

  if (grid.every((d) => d.value === 0)) {
    temporalEmptyText.style("display", "block");
  } else {
    temporalEmptyText.style("display", "none");
  }
}

function handleTemporalResize() {
  if (!temporalContainer) return;
  const { width, height } = getContainerSize(temporalContainer.node(), { minW: 320, minH: 220 });
  temporalInnerWidth = Math.max(1, width - temporalMargin.left - temporalMargin.right);
  temporalInnerHeight = Math.max(1, height - temporalMargin.top - temporalMargin.bottom);

  temporalSvg.attr("width", width).attr("height", height);
  temporalGroup.attr("transform", `translate(${temporalMargin.left},${temporalMargin.top})`);

  temporalXScale.range([0, temporalInnerWidth]);
  temporalYScale.range([0, temporalInnerHeight]);

  if (temporalInnerWidth < 420) {
    temporalXAxisTicks = [0, 12, 23];
  } else if (temporalInnerWidth < 620) {
    temporalXAxisTicks = [0, 6, 12, 18, 23];
  } else {
    temporalXAxisTicks = [0, 3, 6, 9, 12, 15, 18, 21, 23];
  }

  temporalYAxisTicks = temporalInnerHeight < 180 ? [0, 2, 4, 6] : d3.range(7);

  temporalXAxisG.attr("transform", `translate(0, ${temporalInnerHeight})`);

  temporalXAxisLabel
    .attr("x", temporalInnerWidth / 2)
    .attr("y", temporalInnerHeight + 44);

  temporalYAxisLabel
    .attr("x", -(temporalInnerHeight / 2))
    .attr("y", -52);

  temporalEmptyText
    .attr("x", temporalInnerWidth / 2)
    .attr("y", temporalInnerHeight / 2);

  updateTemporalHeatmap();
}
