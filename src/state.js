// Global state management

export const state = {
  // Data containers
  stateMonthData: [],
  usStates: null,
  stateSummary: new Map(),
  weatherData: [],
  severityWeatherData: [],
  severityCounts: new Map(),
  temporalData: [],

  // UI State
  selectedState: null, // null = "All States"
  selectedCluster: null, // { points: [...raw rows], stateCode }
  weatherFilter: "all", // "all", "is_Rain", etc.
  currentMetric: "severity", // "count" or "severity"
  legendRange: { min: 0, max: 1 },
};
