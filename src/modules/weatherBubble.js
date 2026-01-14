import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { state } from "../state.js";
import { getStateNameFromCode, formatNumber, formatPercent, showTooltip, hideTooltip, updateTooltipPosition } from "../utils.js";

// Bubble chart globals
let bubbleColorScale;
let bubbleSvg, bubbleGroup, bubbleEmptyText;
let bubbleXScale, bubbleYScale, bubbleSizeScale;
let bubbleInitialized = false;
const bubbleMargin = { top: 28, right: 28, bottom: 56, left: 64 };


export function initWeatherBubble() {
  const container = d3.select("#scatterplot");
  if (container.empty()) return;

  const width = 760;
  const height = 280;
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
  bubbleYScale = d3.scaleLinear().domain([-38, 45]).range([innerHeight, 0]);
  bubbleSizeScale = d3.scaleSqrt().range([2, 20]);
  // bubbleColorScale will be set dynamically in updateWeatherBubble()

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
