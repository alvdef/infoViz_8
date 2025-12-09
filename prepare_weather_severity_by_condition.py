"""
Preprocess accidents by weather condition and severity per state for the stacked bar chart.

How to run:
    python prepare_weather_severity_by_condition.py

Output:
    data/us_severity_by_weather_state.csv
"""

from pathlib import Path
import pandas as pd

RAW_FILENAME = "US_Accidents_March23.csv"
DATA_RAW_DIR = Path("data_raw")
DATA_OUT_DIR = Path("data")

# Toggle to restrict to Source2 for consistency with other weather samples.
FILTER_SOURCE2 = True


def main() -> None:
    DATA_OUT_DIR.mkdir(exist_ok=True)

    raw_path = DATA_RAW_DIR / RAW_FILENAME
    if not raw_path.exists():
        raise FileNotFoundError(
            f"Raw file not found at {raw_path}. Download the Kaggle CSV into data_raw/."
        )

    usecols = ["State", "Severity", "Weather_Condition", "Source"]
    df = pd.read_csv(raw_path, usecols=usecols)

    if FILTER_SOURCE2 and "Source" in df.columns:
        df = df[df["Source"] == "Source2"]

    df = df.dropna(subset=["State", "Severity", "Weather_Condition"])
    df["Severity"] = df["Severity"].astype(int)
    df = df[df["Severity"].between(1, 4)]

    # Restrict to the globally most common weather conditions for a compact legend.
    top_conditions = df["Weather_Condition"].value_counts().head(5).index
    df = df[df["Weather_Condition"].isin(top_conditions)]

    grouped = (
        df.groupby(["State", "Weather_Condition", "Severity"])
        .size()
        .reset_index(name="Count")
    )

    out_path = DATA_OUT_DIR / "us_severity_by_weather_state.csv"
    grouped.to_csv(out_path, index=False)

    print("Severity-by-weather preprocessing complete.")
    print(f"Rows exported: {len(grouped):,}")
    print(f"Unique states: {grouped['State'].nunique()}")
    print(f"Weather conditions kept: {', '.join(top_conditions)}")
    print(f"Output written to {out_path}")


if __name__ == "__main__":
    main()
