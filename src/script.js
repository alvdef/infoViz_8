/*
US Accidents (Kaggle) 2016-2023
Visuals: Choropleth map by state (counts or average severity).
Data: stateMonthData (state + year_month aggregates), stateSummary (per-state totals/avg).
AI usage: Portions of this code were drafted with help from a generative AI assistant.
*/

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "./state.js";
import {
  createTooltip,
  buildStateSummaryFromUnified,
  buildSeverityCountMap,
  getStateNameFromCode
} from "./utils.js";
import {
  unifiedParser
} from "./parsers.js";
import { initMap, updateMetricDescription, updateMapColors } from "./modules/map.js";
import { initWeatherBubble, updateWeatherBubble } from "./modules/weatherBubble.js";
import { initWeatherSeverityChart, updateWeatherSeverityChart, updateStateSeveritySummary } from "./modules/severityChart.js";
import { initTemporalHeatmap, updateTemporalHeatmap, setTemporalMode } from "./modules/temporalHeatmap.js";

const statesGeoPath = "data/us_states.geojson";
const unifiedDataPath = "data.csv";


// ---------------------------------------------------------------------------//
// Data loading
// ---------------------------------------------------------------------------//
Promise.all([
  d3.csv(unifiedDataPath, unifiedParser),
  d3.json(statesGeoPath),
]).then(([allAccidents, statesGeo]) => {
  state.usStates = statesGeo;
  state.weatherData = allAccidents;
  state.severityWeatherData = allAccidents;
  state.temporalData = allAccidents;

  state.stateSummary = buildStateSummaryFromUnified(allAccidents);
  state.severityCounts = buildSeverityCountMap(allAccidents);

  // Use a state that exists in the data as default.
  if (state.selectedState && !state.stateSummary.has(state.selectedState)) {
    state.selectedState = null;
  }

  updateMetricDescription(state.currentMetric);
  createTooltip();
  initMap(handleMapStateChange); // Pass callback if needed, or rely on state
  initWeatherBubble();
  initWeatherSeverityChart(handleWeatherChartFilter);
  initTemporalHeatmap();
  attachControls();
  updateWeatherBubble();
  updateWeatherSeverityChart();
  updateTemporalHeatmap();
  updateWeatherSeverityChart();
  updateTemporalHeatmap();
  updateStateSeveritySummary();
  updateFilterDisplay();
}).catch((err) => {
  console.error("Error loading unified data. Make sure data.csv exists:", err);
});

function attachControls() {
  d3.select("#metric-select").on("change", (event) => {
    state.currentMetric = event.target.value;
    updateMetricDescription(state.currentMetric);
    updateMapColors();
    updateTemporalHeatmap();
  });
}



// Handler for State selection from Map (if map needs to trigger it)
// Currently Map module likely updates state directly and calls updates.
// We can centralize if needed, but for now we stick to the plan for Weather.

function handleMapStateChange(newState) {
  state.selectedState = newState;
  updateAllCharts();
}

function handleWeatherChartFilter(weatherKey) {
  // If clicking the same filter, toggle it off (reset to all)
  if (state.weatherFilter === weatherKey) {
    state.weatherFilter = "all";
  } else {
    state.weatherFilter = weatherKey;
  }
  updateAllCharts();
}

function updateAllCharts() {
  updateWeatherBubble();
  updateWeatherSeverityChart();
  updateTemporalHeatmap();
  updateMapColors();
  updateStateSeveritySummary();
  updateFilterDisplay();
}

const weatherLabels = {
  "all": "All conditions",
  "isRain": "Rain / Storm",
  "isSnow": "Snow / Ice",
  "isFog": "Fog / Mist",
  "isClear": "Clear sky",
  "isCloud": "Cloudy"
};

function updateFilterDisplay() {
  const filters = [];

  if (state.selectedState) {
    const stateName = getStateNameFromCode(state.selectedState);
    filters.push(`State: ${stateName}`);
  }

  if (state.weatherFilter && state.weatherFilter !== "all") {
    const wLabel = weatherLabels[state.weatherFilter] || state.weatherFilter;
    filters.push(`Weather: ${wLabel}`);
  }

  const display = d3.select("#filter-display");
  if (filters.length === 0) {
    display.text("None");
    display.style("color", "#666");
  } else {
    display.text(filters.join(" | "));
    display.style("color", "#2563eb");
  }
}
