import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { hexbin as d3Hexbin } from "https://cdn.jsdelivr.net/npm/d3-hexbin@0.2/+esm";
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

// Layout + projection
const mapMargin = { top: 10, right: 10, bottom: 10, left: 10 };
let width = 900;
let height = 500;
let innerWidth = 880;
let innerHeight = 480;
let projection = d3.geoAlbersUsa();
let pathGenerator = d3.geoPath(projection);

// Containers and layers
let mapContainer;
let mapSvg;
let rootG;
let zoomContent;
let statesLayer;
let aggregationLayer;

// Behaviors + state
let hexbinGenerator = d3Hexbin();
let colorScale = d3.scaleSequential(d3.interpolateBlues);
let resizeTimer = null;
let onStateSelectCallback = null;

// Data caches
let basePoints = []; // { id, data, lon, lat, stateCode }
let projectedPoints = []; // { ...base, x, y }
let cachedFiltered = [];
let cachedBins = [];
const pointStateCache = new WeakMap();

export function initMap(geojsonOrCallback, data, svg, initialMetric, onStateSelect) {
  // Flexible signature to remain compatible with previous usage.
  if (typeof geojsonOrCallback === "function") {
    onStateSelectCallback = geojsonOrCallback;
  } else if (geojsonOrCallback) {
    state.usStates = geojsonOrCallback;
  }
  if (typeof onStateSelect === "function") {
    onStateSelectCallback = onStateSelect;
  }
  if (Array.isArray(data) && data.length) {
    state.weatherData = data;
  }
  const metric = normalizeMetric(initialMetric || state.currentMetric);
  state.currentMetric = metric;

  mapContainer = d3.select("#map");
  mapContainer.style("position", "relative");
  mapSvg = svg ? d3.select(svg) : mapContainer.append("svg");
  rootG = mapSvg.append("g");
  zoomContent = rootG.append("g").attr("class", "zoom-content");
  statesLayer = zoomContent.append("g").attr("class", "states-layer");
  aggregationLayer = zoomContent.append("g").attr("class", "aggregation-layer");

  updateDimensions();
  buildBasePoints(state.weatherData);
  reprojectPoints();
  renderStates();
  updateMap();
  window.addEventListener("resize", handleResize);
}

function updateDimensions() {
  const dims = getMapDimensions();
  width = dims.width;
  height = dims.height;
  innerWidth = width - mapMargin.left - mapMargin.right;
  innerHeight = height - mapMargin.top - mapMargin.bottom;

  mapSvg.attr("width", width).attr("height", height);
  rootG.attr("transform", `translate(${mapMargin.left},${mapMargin.top})`);

  if (state.usStates) {
    projection = d3.geoAlbersUsa().fitSize([innerWidth, innerHeight], state.usStates);
  } else {
    projection = d3.geoAlbersUsa().translate([innerWidth / 2, innerHeight / 2]);
  }
  pathGenerator = d3.geoPath().projection(projection);
  hexbinGenerator = d3Hexbin().extent([[0, 0], [innerWidth, innerHeight]]);
}

function getMapDimensions() {
  const node = d3.select("#map").node();
  const containerWidth = node ? node.getBoundingClientRect().width : 900;
  const w = Math.max(320, Math.min(containerWidth, 1200));
  const h = Math.max(320, Math.round(w * 0.55));
  return { width: w, height: h };
}

function buildBasePoints(data = []) {
  basePoints = [];
  data.forEach((d, i) => {
    const coords = getCoordinates(d);
    if (!coords) return;
    const stateCode = inferStateCode(d, coords);
    basePoints.push({
      id: i,
      data: d,
      lon: coords.lon,
      lat: coords.lat,
      stateCode
    });
  });
}

function getCoordinates(d) {
  const lonCandidates = [d.lng, d.lon, d.longitude, d.start_lng, d.Start_Lng, d.Start_Longitude];
  const latCandidates = [d.lat, d.latitude, d.start_lat, d.Start_Lat, d.Start_Latitude];
  const lonVal = lonCandidates.find((v) => Number.isFinite(+v));
  const latVal = latCandidates.find((v) => Number.isFinite(+v));
  const lon = Number.isFinite(+lonVal) ? +lonVal : null;
  const lat = Number.isFinite(+latVal) ? +latVal : null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

function inferStateCode(d, coords) {
  if (pointStateCache.has(d)) return pointStateCache.get(d);
  let code = (d.state || d.State || "").toString().trim().toUpperCase();
  if (!code && state.usStates) {
    for (const feature of state.usStates.features) {
      if (d3.geoContains(feature, [coords.lon, coords.lat])) {
        code = extractStateCode(feature);
        break;
      }
    }
  }
  pointStateCache.set(d, code);
  return code;
}

function reprojectPoints() {
  projectedPoints = [];
  basePoints.forEach((p) => {
    const proj = projection([p.lon, p.lat]);
    if (!proj) return;
    projectedPoints.push({
      ...p,
      x: proj[0],
      y: proj[1],
    });
  });
}

function renderStates() {
  if (!state.usStates) return;
  const states = statesLayer
    .selectAll("path.state")
    .data(state.usStates.features, (d) => extractStateCode(d));

  states.enter()
    .append("path")
    .attr("class", "state")
    .attr("fill", "#f9fafb")
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 0.7)
    .attr("vector-effect", "non-scaling-stroke")
    .on("click", (event, d) => handleStateClick(extractStateCode(d)))
    .on("mouseover", function (event, d) {
      const code = extractStateCode(d);
      const name = extractStateName(d);
      const rows = state.weatherData.filter((r) =>
        matchWeather(r) &&
        (!state.selectedState || r.state === state.selectedState) &&
        r.state === code
      );
      const count = rows.length;
      const avgSev = rows.length ? rows.reduce((acc, r) => acc + (+r.severity || 0), 0) / rows.length : 0;
      const html = rows.length
        ? `<strong>${name} (${code})</strong><br/>Accidents: ${formatNumber(count)}<br/>Avg severity: ${formatSeverity(avgSev)}`
        : `<strong>${name} (${code})</strong><br/>No data matching filter`;
      d3.select(this).attr("stroke-width", 1.2);
      showTooltip(html, event);
    })
    .on("mousemove", (event) => updateTooltipPosition(event))
    .on("mouseout", function () {
      d3.select(this).attr("stroke-width", 0.7);
      hideTooltip();
    })
    .merge(states)
    .attr("d", pathGenerator)
    .classed("selected", (d) => extractStateCode(d) === state.selectedState)
    .attr("stroke", (d) => extractStateCode(d) === state.selectedState ? "#111827" : "#cbd5e1");

  states.exit().remove();
}

function handleStateClick(code) {
  if (!code) return;
  state.selectedCluster = null; // clear cluster when selecting via states
  const newState = state.selectedState === code ? null : code;
  if (onStateSelectCallback) {
    onStateSelectCallback(newState);
  } else {
    state.selectedState = newState;
    updateWeatherBubble();
    updateWeatherSeverityChart();
    updateTemporalHeatmap();
    updateStateSeveritySummary();
    updateMap();
  }
}

function getFilteredPoints() {
  return projectedPoints.filter((p) => {
    if (state.selectedState) {
      if (!p.stateCode || p.stateCode !== state.selectedState) return false;
    }
    if (!matchWeather(p.data)) return false;
    return true;
  });
}

function matchWeather(row) {
  const key = state.weatherFilter;
  if (!key || key.toLowerCase() === "all") return true;
  return !!row[key];
}

export function updateMap() {
  const filtered = getFilteredPoints();
  cachedFiltered = filtered;

  const aggregations = buildAggregations(filtered);
  cachedBins = aggregations || [];
  updateColorScale(filtered, aggregations);
  updateLegend();
  updateMapTitle();
  renderStates();

  aggregationLayer.selectAll("path.hex").remove();
  renderAggregation(aggregations);
}

export function updateMapColors() {
  updateMap();
}

function buildAggregations(points) {
  if (!points.length) return [];
  const radius = getHexRadius();
  const generator = hexbinGenerator.radius(radius);
  const bins = generator(points.map((p) => [p.x, p.y, p]));
  return bins.map((bin) => {
    const count = bin.length;
    const avgSeverity = d3.mean(bin, (b) => b[2].data.severity);
    const stateCounts = new Map();
    const rawRows = [];
    let lonSum = 0;
    let latSum = 0;
    let coordCount = 0;
    bin.forEach((b) => {
      rawRows.push(b[2].data);
      const sc = b[2].stateCode;
      if (!sc) return;
      stateCounts.set(sc, (stateCounts.get(sc) || 0) + 1);
      if (Number.isFinite(b[2].lon) && Number.isFinite(b[2].lat)) {
        lonSum += b[2].lon;
        latSum += b[2].lat;
        coordCount += 1;
      }
    });
    const topState = Array.from(stateCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    return {
      x: bin.x,
      y: bin.y,
      count,
      avgSeverity: Number.isFinite(avgSeverity) ? avgSeverity : 0,
      stateCode: topState,
      points: rawRows,
      centerLon: coordCount ? lonSum / coordCount : null,
      centerLat: coordCount ? latSum / coordCount : null
    };
  });
}

function renderAggregation(bins) {
  const metric = normalizeMetric(state.currentMetric);
  const maxCount = d3.max(bins, (d) => d.count) || 1;
  const radiusBase = getHexRadius();
  const radiusScale = d3.scaleSqrt().domain([0, maxCount]).range([radiusBase * 0.6, radiusBase * 1.8]);

  const hexes = aggregationLayer
    .selectAll("path.hex")
    .data(bins, (d) => `${Math.round(d.x)}-${Math.round(d.y)}-${Math.round(radiusBase)}`);

  hexes.enter()
    .append("path")
    .attr("class", "hex")
    .attr("stroke", "#ffffff")
    .attr("stroke-width", 0.6)
    .attr("vector-effect", "non-scaling-stroke")
    .on("click", (event, d) => {
      const clusterId = `${Math.round(d.x)}-${Math.round(d.y)}`;
      const isSameCluster = state.selectedCluster && state.selectedCluster.id === clusterId;
      if (isSameCluster) {
        state.selectedCluster = null;
        state.selectedState = state.selectedState; // keep current state selection unchanged
      } else {
        // Store cluster selection and propagate state selection
        state.selectedCluster = {
          id: clusterId,
          points: d.points || [],
          stateCode: d.stateCode || null
        };
        // Do not override existing state selection when clicking a cluster
      }
      const nextState = state.selectedState;
      if (onStateSelectCallback) {
        onStateSelectCallback(nextState);
      } else {
        updateWeatherBubble();
        updateWeatherSeverityChart();
        updateTemporalHeatmap();
        updateStateSeveritySummary();
        updateMap();
      }
    })
    .on("mousemove", (event, d) => {
      const topStateLabel = d.stateCode ? `Top state: ${d.stateCode}` : "Top state: mixed/unknown";
      const locationLabel = Number.isFinite(d.centerLat) && Number.isFinite(d.centerLon)
        ? `Location: ${d.centerLat.toFixed(3)}, ${d.centerLon.toFixed(3)}`
        : "Location: n/a";
      const html = `<strong>Cluster</strong><br/>Count: ${formatCount(d.count)}${
        metric === "severity" ? `<br/>Avg severity: ${formatSeverity(d.avgSeverity)}` : ""
      }<br/>${topStateLabel}<br/>${locationLabel}`;
      showTooltip(html, event);
    })
    .on("mouseout", hideTooltip)
    .merge(hexes)
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .attr("d", (d) => hexbinGenerator.hexagon(radiusScale(d.count)))
    .attr("fill", (d) => metric === "severity" ? colorScale(d.avgSeverity) : colorScale(d.count))
    .attr("fill-opacity", (d) => {
      const isSelected = state.selectedCluster && state.selectedCluster.id === `${Math.round(d.x)}-${Math.round(d.y)}`;
      return isSelected ? 1 : (metric === "severity" ? 0.9 : 0.8);
    })
    .attr("stroke", (d) => {
      const isSelected = state.selectedCluster && state.selectedCluster.id === `${Math.round(d.x)}-${Math.round(d.y)}`;
      return isSelected ? "#111827" : "#ffffff";
    })
    .attr("stroke-width", (d) => {
      const isSelected = state.selectedCluster && state.selectedCluster.id === `${Math.round(d.x)}-${Math.round(d.y)}`;
      return isSelected ? 1 : 0.6;
    });

  hexes.exit().remove();
}

// Dot rendering removed (aggregation only)

function getHexRadius() {
  const base = 8; // finer clusters
  return base;
}

function updateColorScale(points, bins) {
  const metric = normalizeMetric(state.currentMetric);
  if (metric === "count") {
    const maxVal = bins && bins.length ? d3.max(bins, (d) => d.count) : points.length || 1;
    const minVal = Math.min(1, maxVal || 1);
    const warmRamp = (t) => d3.interpolateYlOrRd(0.25 + 0.75 * t); // avoid very light yellows
    colorScale = d3.scaleSequentialPow(warmRamp).exponent(0.6).domain([minVal, maxVal || 1]).clamp(true);
    state.legendRange = { min: minVal, max: maxVal || 1 };
  } else {
    const sevExtent = d3.extent(points, (d) => +d.data.severity).map((v) => Number.isFinite(v) ? v : null).filter((v) => v !== null);
    const minSev = sevExtent.length ? sevExtent[0] : 1;
    const maxSev = sevExtent.length ? sevExtent[1] : 4;
    const customOranges = (t) => d3.interpolateOranges(0.2 + 0.8 * t);
    colorScale = d3.scaleSequential(customOranges).domain([minSev, maxSev]).clamp(true);
    state.legendRange = { min: minSev, max: maxSev };
  }
}

export function updateLegend() {
  const metric = normalizeMetric(state.currentMetric);
  const lowLabel = metric === "count" ? "Lower density" : "Lower severity";
  const highLabel = metric === "count" ? "Higher density" : "Higher severity";
  const minVal = state.legendRange.min;
  const maxVal = state.legendRange.max;

  d3.select("#legend-label-low").text(lowLabel);
  d3.select("#legend-label-high").text(highLabel);
  d3.select("#legend-gradient").style(
    "background",
    metric === "count"
      ? "linear-gradient(90deg, #fdd49e, #f16913, #7f2704)"
      : "linear-gradient(90deg, #fff7ed, #ea580c)"
  );
  d3.select("#legend-min").text(metric === "count" ? formatCount(minVal) : formatSeverity(minVal));
  d3.select("#legend-max").text(metric === "count" ? formatCount(maxVal) : formatSeverity(maxVal));
}

export function updateMetricDescription(metric) {
  const normalized = normalizeMetric(metric);
  if (normalized === "count") {
    d3.select("#metric-description").text(
      "Hex cluster size and color indicate where more accidents are concentrated."
    );
  } else {
    d3.select("#metric-description").text(
      "Hex color encodes the average severity of nearby accidents (1 = minor, 4 = most severe)."
    );
  }
}

export function updateMapTitle() {
  const container = d3.select("#map-container");
  const subtitle = container.select(".subtitle");
  const weatherLabel = state.weatherFilter && state.weatherFilter !== "all"
    ? (state.weatherFilter === "isRain" ? "Rain/Storm" :
      state.weatherFilter === "isSnow" ? "Snow/Ice" :
        state.weatherFilter === "isFog" ? "Fog/Mist" :
          state.weatherFilter === "isClear" ? "Clear" :
            state.weatherFilter === "isCloud" ? "Cloudy" : state.weatherFilter)
    : "All weather";
  subtitle.html(`
    Filters: <strong>${weatherLabel}</strong>. 
    ${state.selectedCluster?.points?.length ? `Cluster (${state.selectedCluster.points.length} accidents)` : state.selectedState ? `State: <strong>${state.selectedState}</strong>` : "National View"}
    <br/><span style="color:#999; font-size:10px;">(Aggregation view: smaller hexes for more detail)</span>
  `);
}

function normalizeMetric(metric) {
  if (metric === "avgSeverity" || metric === "severity") return "severity";
  return metric === "count" ? "count" : "severity";
}

function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    updateDimensions();
    reprojectPoints();
    renderStates();
    updateMap();
  }, 120);
}
