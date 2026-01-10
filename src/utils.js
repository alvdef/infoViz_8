import { state } from "./state.js";

// ---------------------------------------------------------------------------//
// Formatters
// ---------------------------------------------------------------------------//
export const formatNumber = d3.format(",");
export const formatSeverity = d3.format(".2f");
export const formatCount = formatNumber;
export const formatPercent = d3.format(".1%");

// ---------------------------------------------------------------------------//
// Data Processing Helpers
// ---------------------------------------------------------------------------//
export function buildStateSummaryFromUnified(data) {
  const summary = new Map();
  data.forEach((d) => {
    const code = (d.state || "").toUpperCase();
    if (!code) return;
    const entry = summary.get(code) || {
      totalCount: 0,
      weightedSeverity: 0,
    };
    entry.totalCount += 1; // It's one row per accident in the sample
    entry.weightedSeverity += d.severity;
    summary.set(code, entry);
  });

  summary.forEach((entry, code) => {
    entry.avgSeverity =
      entry.totalCount > 0 ? entry.weightedSeverity / entry.totalCount : 0;
  });
  return summary;
}

// ---------------------------------------------------------------------------//
// Tooltip helpers
// ---------------------------------------------------------------------------//
let tooltip = null;

export function createTooltip() {
  tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip");
  return tooltip;
}

export function showTooltip(html, event) {
  if (!tooltip) return;
  tooltip
    .html(html)
    .style("left", `${event.pageX + 12}px`)
    .style("top", `${event.pageY + 12}px`)
    .style("opacity", 1);
}

export function hideTooltip() {
  if (!tooltip) return;
  tooltip.style("opacity", 0);
}

export function updateTooltipPosition(event) {
    if (!tooltip) return;
    tooltip
      .style("left", `${event.pageX + 12}px`)
      .style("top", `${event.pageY + 12}px`);
}

// ---------------------------------------------------------------------------//
// Geo / State Helpers
// ---------------------------------------------------------------------------//
export function extractStateCode(feature) {
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

export function extractStateName(feature) {
  const props = feature.properties || {};
  return (
    props.NAME || props.NAME10 || props.name || props.state_name || extractStateCode(feature) || "State"
  ).toString();
}

export function getStateNameFromCode(code) {
  const normalized = (code || "").toUpperCase();
  if (!state.usStates || !Array.isArray(state.usStates.features)) return normalized;
  const match = state.usStates.features.find((f) => extractStateCode(f) === normalized);
  return match ? extractStateName(match) : normalized;
}

// ---------------------------------------------------------------------------//
// Data Processing Helpers
// ---------------------------------------------------------------------------//
export function buildStateSummary(data) {
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

export function buildSeverityCountMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const code = (row.state || "").toUpperCase();
    if (!code || !Number.isFinite(row.severity)) return;
    const entry = map.get(code) || { 1: 0, 2: 0, 3: 0, 4: 0 };
    if (row.severity >= 1 && row.severity <= 4) {
      const increment = row.count !== undefined ? row.count : 1;
      entry[row.severity] = (entry[row.severity] || 0) + increment;
    }
    map.set(code, entry);
  });
  return map;
}
