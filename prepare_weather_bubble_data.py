"""
Preprocess weather-related accident samples for the bubble chart.

How to run:
1) Download the Kaggle CSV (e.g., US_Accidents_March23.csv) into data_raw/.
2) Run: python3 prepare_weather_bubble_data.py
3) Output: data/us_weather_bubble_sample.csv (browser-friendly sample with weather flags).
"""

from pathlib import Path
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
RAW_FILENAME = "US_Accidents_March23.csv"
SAMPLE_SIZE = 200_000
DATA_RAW_DIR = Path("data_raw")
DATA_OUT_DIR = Path("data")


def main() -> None:
    DATA_OUT_DIR.mkdir(exist_ok=True)

    raw_path = DATA_RAW_DIR / RAW_FILENAME
    if not raw_path.exists():
        raise FileNotFoundError(
            f"Raw file not found at {raw_path}. Download the Kaggle CSV into data_raw/."
        )

    usecols = [
        "Source",
        "State",
        "Severity",
        "Temperature(F)",
        "Humidity(%)",
        "Weather_Condition",
        "Start_Time",
    ]

    df = pd.read_csv(raw_path, usecols=usecols)

    # Keep only Source2 rows and drop missing key fields.
    df = df[df["Source"] == "Source2"]
    df = df.dropna(
        subset=[
            "State",
            "Severity",
            "Temperature(F)",
            "Humidity(%)",
            "Weather_Condition",
            "Start_Time",
        ]
    )

    # Parse time to filter recent records, then drop the timestamp.
    df["Start_Time"] = pd.to_datetime(df["Start_Time"], errors="coerce")
    df = df[df["Start_Time"] > "2019-03-10"]
    df = df.drop(columns=["Start_Time"])

    # Convert temperature to Celsius and filter ranges for stability.
    df["Temperature(C)"] = (df["Temperature(F)"] - 32) / 1.8
    df = df[df["Humidity(%)"].between(0, 100)]
    df = df[df["Temperature(C)"].between(-35, 45)]

    # Normalize weather condition to string for flag extraction.
    condition_series = df["Weather_Condition"].astype(str).str.lower()

    df["is_Rain"] = condition_series.str.contains("rain|storm|shower|thunder", case=False, regex=True)
    df["is_Snow"] = condition_series.str.contains(
        "snow|sleet|ice|blizzard|squalls|pellets", case=False, regex=True
    )
    df["is_Fog"] = condition_series.str.contains("fog|mist|haze", case=False, regex=True)
    df["is_Clear"] = condition_series.str.contains("clear|fair", case=False, regex=True)
    df["is_Cloud"] = condition_series.str.contains("cloud|overcast", case=False, regex=True)

    df["HighSeverity"] = (df["Severity"] == 4).astype(int)

    cols_to_export = [
        "State",
        "Severity",
        "Humidity(%)",
        "Temperature(C)",
        "Weather_Condition",
        "is_Rain",
        "is_Snow",
        "is_Fog",
        "is_Clear",
        "is_Cloud",
        "HighSeverity",
    ]

    sample_n = min(SAMPLE_SIZE, len(df))
    df_sample = df[cols_to_export].sample(n=sample_n, random_state=42)

    out_path = DATA_OUT_DIR / "us_weather_bubble_sample.csv"
    df_sample.to_csv(out_path, index=False)

    print("Weather bubble preprocessing complete.")
    print(f"Sampled rows: {len(df_sample):,}")
    print(f"Output written to {out_path}")


if __name__ == "__main__":
  main()
