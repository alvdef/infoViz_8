"""
Preprocess temporal accident patterns (day of week x hour of day) per state, plus overall severity counts.

Outputs:
  - data/us_temporal_patterns_state.csv
      Columns: State, day_of_week (0=Mon), hour_of_day (0-23),
               total_accidents, high_severity_accidents (Severity >=3)
  - data/us_state_severity_counts.csv
      Columns: State, Severity, Count

Run:
  python prepare_temporal_patterns.py
"""

from pathlib import Path
import pandas as pd

RAW_FILENAME = "US_Accidents_March23.csv"
DATA_RAW_DIR = Path("data_raw")
DATA_OUT_DIR = Path("data")
FILTER_SOURCE2 = True


def main() -> None:
    DATA_OUT_DIR.mkdir(exist_ok=True)

    raw_path = DATA_RAW_DIR / RAW_FILENAME
    if not raw_path.exists():
        raise FileNotFoundError(
            f"Raw file not found at {raw_path}. Download the Kaggle CSV into data_raw/."
        )

    usecols = ["State", "Severity", "Start_Time", "Source"]
    df = pd.read_csv(raw_path, usecols=usecols)

    if FILTER_SOURCE2 and "Source" in df.columns:
        df = df[df["Source"] == "Source2"]

    df = df.dropna(subset=["State", "Severity", "Start_Time"])
    df["Severity"] = df["Severity"].astype(int)

    df["Start_Time"] = pd.to_datetime(df["Start_Time"], errors="coerce")
    df = df.dropna(subset=["Start_Time"])
    df["day_of_week"] = df["Start_Time"].dt.dayofweek  # 0 = Monday
    df["hour_of_day"] = df["Start_Time"].dt.hour

    df["is_high_severity"] = df["Severity"] >= 3

    temporal = (
        df.groupby(["State", "day_of_week", "hour_of_day"])
        .agg(
            total_accidents=("Severity", "count"),
            high_severity_accidents=("is_high_severity", "sum"),
        )
        .reset_index()
    )

    temporal_out = DATA_OUT_DIR / "us_temporal_patterns_state.csv"
    temporal.to_csv(temporal_out, index=False)

    severity_counts = (
        df.groupby(["State", "Severity"])
        .size()
        .reset_index(name="Count")
    )

    severity_out = DATA_OUT_DIR / "us_state_severity_counts.csv"
    severity_counts.to_csv(severity_out, index=False)

    print("Temporal preprocessing complete.")
    print(f"Temporal rows exported: {len(temporal):,}")
    print(f"Severity count rows exported: {len(severity_counts):,}")
    print(f"States covered: {temporal['State'].nunique()}")
    print(f"Outputs written to: {temporal_out} and {severity_out}")


if __name__ == "__main__":
    main()
