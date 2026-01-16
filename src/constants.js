/**
 * Shared constants for weather visualization
 */

// Weather categories used across charts
export const WEATHER_CATEGORIES = [
    { label: "Rain / Storm", key: "isRain" },
    { label: "Snow / Ice", key: "isSnow" },
    { label: "Fog / Mist", key: "isFog" },
    { label: "Clear sky", key: "isClear" },
    { label: "Cloudy", key: "isCloud" },
];

// Weather labels for filter display
export const WEATHER_LABELS = {
    all: "All conditions",
    isRain: "Rain / Storm",
    isSnow: "Snow / Ice",
    isFog: "Fog / Mist",
    isClear: "Clear sky",
    isCloud: "Cloudy",
};
