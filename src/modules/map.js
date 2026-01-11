import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "../state.js";
import {
  extractStateCode,
  extractStateName,
  showTooltip,
  hideTooltip,
  updateTooltipPosition,
  formatNumber,
  formatSeverity,
  formatCount
} from "../utils.js";
import { updateWeatherBubble } from "./weatherBubble.js";
import { updateWeatherSeverityChart, updateStateSeveritySummary } from "./severityChart.js";
import { updateTemporalHeatmap } from "./temporalHeatmap.js";

// Map chart globals
let mapSvg, mapGroup, projection, pathGenerator, colorScale;
const mapMargin = { top: 10, right: 10, bottom: 10, left: 10 };
let resizeTimer;

let onStateSelectCallback = null;

export function initMap(onStateSelect) {
  if (onStateSelect) onStateSelectCallback = onStateSelect;
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

  projection = d3.geoAlbersUsa().fitSize([innerWidth, innerHeight], state.usStates);
  pathGenerator = d3.geoPath().projection(projection);

  const states = mapGroup
    .selectAll("path.state")
    .data(state.usStates.features, (d) => extractStateCode(d));

  states
    .enter()
    .append("path")
    .attr("class", "state")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.7)
    .on("mouseover", function (event, d) {
      const code = extractStateCode(d);
      const name = extractStateName(d);

      // Calculate dynamic stats
      const rows = state.weatherData.filter(r =>
        r.state === code &&
        (state.weatherFilter === "all" || r[state.weatherFilter])
      );

      let html;
      if (rows.length === 0) {
        html = `<strong>${name} (${code})</strong><br/>No data matching filter`;
      } else {
        const count = rows.length;
        const avgSev = rows.reduce((acc, r) => acc + r.severity, 0) / count;
        html = `<strong>${name} (${code})</strong><br/>Accidents: ${formatNumber(
          count,
        )}<br/>Avg severity: ${formatSeverity(avgSev)}`;
      }

      d3.select(this).attr("stroke-width", 1.5);
      showTooltip(html, event);
    })
    .on("mousemove", (event) => {
      updateTooltipPosition(event);
    })
    .on("mouseout", function () {
      d3.select(this).attr("stroke-width", 0.7);
      hideTooltip();
    })
    .on("click", function (event, d) {
      const code = extractStateCode(d);
      if (!code) return;

      // Use callback if available to handle state change and global updates
      if (onStateSelectCallback) {
        // Toggle logic should be handled here or in the callback.
        // Let's pass the code, and let the callback handle toggle if it matches current.
        // Actually, to keep it simple, we can do the toggle check here or pass it.
        // script.js handleMapStateChange expects "newState".
        let newState = code;
        if (state.selectedState === code) {
          newState = null; // Toggle off
        }
        onStateSelectCallback(newState);
      } else {
        // Fallback for safety
        if (state.selectedState === code) {
          state.selectedState = null;
        } else {
          state.selectedState = code;
        }
        // Update local highlights immediately (though typically callback -> updateAll -> updateMapColors handles this)
        // We will leave the class toggling to updateMapColors/renderMap re-run or handle it efficiently.
        // For now, let's trust the callback chain.
      }
    })
    .merge(states)
    .attr("d", pathGenerator)
    .attr("fill", (d) => {
      const code = extractStateCode(d);
      return colorScale(getMetricValue(code));
    });

  states.exit().remove();

  // Highlight default selection if present.
  if (state.selectedState) {
    mapGroup
      .selectAll(".state")
      .filter((d) => extractStateCode(d) === state.selectedState)
      .classed("selected", true);
  }
}

function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderMap();
  }, 150);
}

function updateColorScale() {
  if (state.currentMetric === "count") {
    // Calculate max count across all states given current filter
    const counts = state.usStates.features.map(f => {
      const code = extractStateCode(f);
      return getMetricValue(code);
    });

    const maxCount = d3.max(counts) || 1;
    // Count -> Blue
    colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxCount]);
    state.legendRange = { min: 0, max: maxCount };
  } else {
    // Dynamic severity domain based on actual values
    const values = state.usStates.features.map(f => {
      const code = extractStateCode(f);
      return getMetricValue(code);
    }).filter(v => v > 0);

    const sevExtent = d3.extent(values);
    const minSev = sevExtent[0] || 2;
    const maxSev = sevExtent[1] || 3;

    // Custom interpolator to avoid too-light colors
    const customOranges = (t) => d3.interpolateOranges(0.2 + 0.8 * t);
    colorScale = d3.scaleSequential(customOranges).domain([minSev, maxSev]).clamp(true);
    state.legendRange = { min: minSev, max: maxSev };
  }
}

export function updateMapColors() {
  updateColorScale();
  updateLegend();
  updateMapTitle();

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
  if (!stateCode) return 0;

  // Filter raw data for this state and current weather filter
  const rows = state.weatherData.filter(d =>
    d.state === stateCode &&
    (state.weatherFilter === "all" || d[state.weatherFilter])
  );

  if (rows.length === 0) return 0;

  if (state.currentMetric === "count") {
    return rows.length;
  } else {
    // Calculate average severity on the fly
    const sumSev = rows.reduce((acc, r) => acc + r.severity, 0);
    return sumSev / rows.length;
  }
}

export function updateLegend() {
  const isCount = state.currentMetric === "count";
  const lowLabel = isCount ? "Low accidents" : "Lower severity";
  const highLabel = isCount ? "High accidents" : "Higher severity";
  const minVal = state.legendRange.min;
  const maxVal = state.legendRange.max;

  d3.select("#legend-label-low").text(lowLabel);
  d3.select("#legend-label-high").text(highLabel);

  d3.select("#legend-gradient").style(
    "background",
    isCount
      ? "linear-gradient(90deg, #eff6ff, #1d4ed8)" // Blue shades (Tailwind Blue 50-700 approx)
      : "linear-gradient(90deg, #fff7ed, #ea580c)", // Orange shades (Tailwind Orange 50-600 approx)
  );

  d3.select("#legend-min").text(isCount ? formatCount(minVal) : formatSeverity(minVal));
  d3.select("#legend-max").text(isCount ? formatCount(maxVal) : formatSeverity(maxVal));
}

export function updateMetricDescription(metric) {
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


export function updateMapTitle() {
  // Map doesn't have a specific caption ID in the HTML provided in the file view?
  // Checking index.html... it has <p class="subtitle"> under header, but that seems global.
  // Wait, the map section <section id="map-container"> has:
  // <h2>Accidents by State</h2>
  // <p class="subtitle">Identify high-risk states...</p>
  // The user wants filter info shown. We should append/update this subtitle.
  // Let's try to target the subtitle within #map-container

  const container = d3.select("#map-container");
  const subtitle = container.select(".subtitle");

  const weatherLabel = state.weatherFilter !== "all"
    ? (state.weatherFilter === "isRain" ? "Rain/Storm" :
      state.weatherFilter === "isSnow" ? "Snow/Ice" :
        state.weatherFilter === "isFog" ? "Fog/Mist" :
          state.weatherFilter === "isClear" ? "Clear" :
            state.weatherFilter === "isCloud" ? "Cloudy" : state.weatherFilter)
    : "All weather";

  // We can preserve the original text and append status, or just show status.
  // Given the request, "Identify high-risk..." is static help text.
  // Maybe we should replace it or append to it. 
  // Let's Replace it with dynamic context like other charts.

  subtitle.html(`
    Filters: <strong>${weatherLabel}</strong>. 
    ${state.selectedState ? `State: <strong>${state.selectedState}</strong>` : "National View"}
    <br/><span style="color:#999; font-size:10px;">(Identify high-risk states and clusters)</span>
  `);
}
