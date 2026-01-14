import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "../state.js";
import { getStateNameFromCode, formatNumber, formatPercent, showTooltip, hideTooltip, updateTooltipPosition } from "../utils.js";
import { observeResize, getContainerSize } from "./resize.js";

// Bubble chart globals
let bubbleColorScale;
let bubbleContainer;
let bubbleSvg, bubbleRoot, bubbleGroup, bubbleEmptyText;
let bubbleXScale, bubbleYScale, bubbleSizeScale;
let bubbleXAxisG, bubbleYAxisG, bubbleXAxisLabel, bubbleYAxisLabel;
let bubbleVerticalGuide, bubbleHorizontalGuide, bubbleQuadrantLabelsG;
let bubbleInnerWidth = 0;
let bubbleInnerHeight = 0;
let bubbleResizeCleanup = null;
let bubbleInitialized = false;
const bubbleMargin = { top: 28, right: 28, bottom: 56, left: 64 };
const humiditySplit = 60;
const tempSplit = 10;
const quadrantLabelData = [
  { key: "cold-dry", text: "Cold & Dry", humidity: 18, temp: tempSplit + 14 },
  { key: "cold-humid", text: "Cold & Humid", humidity: 90, temp: tempSplit + 14 },
  { key: "hot-dry", text: "Hot & Dry", humidity: 18, temp: tempSplit - 8 },
  { key: "hot-humid", text: "Hot & Humid", humidity: 90, temp: tempSplit - 8 },
];


export function initWeatherBubble() {
  const container = d3.select("#scatterplot");
  if (container.empty()) return;
  bubbleContainer = container;

  bubbleSvg = container.append("svg");
  bubbleRoot = bubbleSvg.append("g").attr("class", "bubble-root");

  bubbleXScale = d3.scaleLinear().domain([0, 100]);
  bubbleYScale = d3.scaleLinear().domain([-38, 45]);
  bubbleSizeScale = d3.scaleSqrt();
  // bubbleColorScale will be set dynamically in updateWeatherBubble()

  bubbleXAxisG = bubbleRoot.append("g").attr("class", "x-axis");
  bubbleXAxisLabel = bubbleRoot
    .append("text")
    .attr("class", "axis-label")
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563")
    .text("Humidity (%)");

  bubbleYAxisG = bubbleRoot.append("g").attr("class", "y-axis");
  bubbleYAxisLabel = bubbleRoot
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("text-anchor", "middle")
    .attr("fill", "#4b5563")
    .text("Temperature (°C)");

  // Quadrant guide lines
  bubbleVerticalGuide = bubbleRoot
    .append("line")
    .attr("stroke", "#e5e7eb")
    .attr("stroke-dasharray", "4 4");

  bubbleHorizontalGuide = bubbleRoot
    .append("line")
    .attr("stroke", "#e5e7eb")
    .attr("stroke-dasharray", "4 4");

  bubbleQuadrantLabelsG = bubbleRoot.append("g").attr("class", "quadrant-labels");
  bubbleQuadrantLabelsG
    .selectAll("text")
    .data(quadrantLabelData, (d) => d.key)
    .enter()
    .append("text")
    .attr("class", "quadrant-label")
    .attr("text-anchor", "middle")
    .attr("fill", "#9ca3af")
    .attr("font-size", 11)
    .text((d) => d.text);

  bubbleGroup = bubbleRoot.append("g").attr("class", "bubble-group");

  bubbleEmptyText = bubbleRoot
    .append("text")
    .attr("id", "bubble-empty")
    .attr("text-anchor", "middle")
    .attr("fill", "#6b7280")
    .attr("font-size", 12)
    .style("display", "none")
    .text("No data for this state and filter.");

  bubbleInitialized = true;
  handleBubbleResize();

  if (bubbleResizeCleanup) bubbleResizeCleanup();
  bubbleResizeCleanup = observeResize(bubbleContainer.node(), handleBubbleResize, { delay: 120 });
}

export function updateWeatherBubble() {
  if (!bubbleInitialized) return;

  const stateCode = (state.selectedState || "").toUpperCase();
  const stateName = stateCode ? getStateNameFromCode(stateCode) : "USA";

  const baseData = state.selectedCluster?.points?.length
    ? state.selectedCluster.points
    : (state.selectedState
      ? state.weatherData.filter((d) => d.state === stateCode)
      : state.weatherData);

  const filtered =
    state.weatherFilter === "all"
      ? baseData
      : baseData.filter((d) => d[state.weatherFilter] === true);

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

  // Dynamic color scale based on actual riskRatio range in this data subset
  const riskExtent = d3.extent(binnedArray, d => d.riskRatio);
  const minRisk = riskExtent[0] || 0;
  const maxRisk = riskExtent[1] || 0.1;
  // Use Oranges for consistency with other severity charts
  // Custom interpolator to avoid too-light colors
  const customOranges = (t) => d3.interpolateOranges(0.2 + 0.8 * t);
  bubbleColorScale = d3.scaleSequential(customOranges).domain([minRisk, maxRisk]).clamp(true);

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
      updateTooltipPosition(event);
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
    isRain: "Rain / Storm",
    isSnow: "Snow / Ice",
    isFog: "Fog / Mist",
    isClear: "Clear sky",
    isCloud: "Cloudy",
  };

  const captionFilter =
    state.weatherFilter === "all" ? "" : ` | Filter: ${filterLabels[state.weatherFilter] || state.weatherFilter}`;

  // Simplified caption logic
  const countStr = formatNumber(baseData.length);
  const locationStr = state.selectedCluster?.points?.length
    ? `Cluster (${formatNumber(baseData.length)} pts) ${state.selectedState ? `– ${stateCode}` : ""}`
    : (state.selectedState ? `${stateCode} – ${stateName}` : "National View");

  d3.select("#bubble-state-caption").text(
    `${locationStr}: ${countStr} accidents${captionFilter}`
  );

  if (binnedArray.length === 0) {
    bubbleEmptyText.style("display", "block");
  } else {
    bubbleEmptyText.style("display", "none");
  }
}

function handleBubbleResize() {
  if (!bubbleContainer) return;
  const { width, height } = getContainerSize(bubbleContainer.node(), { minW: 320, minH: 220 });
  bubbleInnerWidth = Math.max(1, width - bubbleMargin.left - bubbleMargin.right);
  bubbleInnerHeight = Math.max(1, height - bubbleMargin.top - bubbleMargin.bottom);

  bubbleSvg.attr("width", width).attr("height", height);
  bubbleRoot.attr("transform", `translate(${bubbleMargin.left},${bubbleMargin.top})`);

  bubbleXScale.range([0, bubbleInnerWidth]);
  bubbleYScale.range([bubbleInnerHeight, 0]);
  bubbleSizeScale.range([2, clampValue(bubbleInnerWidth / 35, 10, 24)]);

  const xTicks = bubbleInnerWidth < 480 ? 5 : 10;
  const yTicks = bubbleInnerHeight < 200 ? 6 : 10;

  bubbleXAxisG
    .attr("transform", `translate(0,${bubbleInnerHeight})`)
    .call(d3.axisBottom(bubbleXScale).ticks(xTicks).tickFormat((d) => `${d}%`));

  bubbleYAxisG.call(d3.axisLeft(bubbleYScale).ticks(yTicks).tickFormat((d) => `${d}°C`));

  bubbleXAxisLabel
    .attr("x", bubbleInnerWidth / 2)
    .attr("y", bubbleInnerHeight + 40);

  bubbleYAxisLabel
    .attr("x", -(bubbleInnerHeight / 2))
    .attr("y", -46);

  bubbleVerticalGuide
    .attr("x1", bubbleXScale(humiditySplit))
    .attr("x2", bubbleXScale(humiditySplit))
    .attr("y1", 0)
    .attr("y2", bubbleInnerHeight);

  bubbleHorizontalGuide
    .attr("x1", 0)
    .attr("x2", bubbleInnerWidth)
    .attr("y1", bubbleYScale(tempSplit))
    .attr("y2", bubbleYScale(tempSplit));

  bubbleQuadrantLabelsG
    .selectAll("text")
    .data(quadrantLabelData, (d) => d.key)
    .attr("x", (d) => bubbleXScale(d.humidity))
    .attr("y", (d) => bubbleYScale(d.temp));

  bubbleEmptyText
    .attr("x", bubbleInnerWidth / 2)
    .attr("y", bubbleInnerHeight / 2);

  updateWeatherBubble();
}

function clampValue(value, min, max) {
  return Math.max(min, Math.min(value, max));
}
