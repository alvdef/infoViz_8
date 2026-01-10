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
  buildSeverityCountMap 
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
  console.error("Error loading unified data. Make sure data.csv exists:", err);
});

function attachControls() {
  d3.select("#metric-select").on("change", (event) => {
    state.currentMetric = event.target.value;
    updateMetricDescription(state.currentMetric);
    updateMapColors();
    updateTemporalHeatmap();
  });

  d3
    .selectAll("#global-weather-filters .filter-btn")
    .on("click", function handleFilterClick() {
        d3.selectAll("#global-weather-filters .filter-btn").classed("active", false);
        d3.select(this).classed("active", true);
        const val = this.getAttribute("value") || "all";
        state.weatherFilter = val;
        
        // Update all charts that support weather filtering
        updateWeatherBubble();
        updateWeatherSeverityChart();
        updateTemporalHeatmap(); 
        updateMapColors(); // Trigger map update to reflect new filter
    });


}
