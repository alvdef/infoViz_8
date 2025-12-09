"""
Preprocess the US Accidents (2016-2023) dataset for lightweight browser use.

How to run:
1) Download the Kaggle CSV (e.g., US_Accidents_Dec21_updated.csv) into data_raw/.
2) Optional: place a newer CSV with the same schema in data_raw/ and update RAW_FILENAME below.
3) Run: python3 prepare_data.py
4) Generated output will be saved in data/:
   - us_accidents_state_month.csv (aggregated per state and year-month; used by the map)
"""

from pathlib import Path
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
RAW_FILENAME = "US_Accidents_March23.csv" 
SAMPLE_SIZE = 10_000_000  
DATA_RAW_DIR = Path("data_raw")
DATA_OUT_DIR = Path("data")


def main() -> None:
    DATA_OUT_DIR.mkdir(exist_ok=True)

    raw_path = DATA_RAW_DIR / RAW_FILENAME
    if not raw_path.exists():
        raise FileNotFoundError(
            f"Raw file not found at {raw_path}. Download the Kaggle CSV into data_raw/."
        )

    # Load only the columns needed for aggregation to reduce memory footprint.
    usecols = ["ID", "Start_Time", "State", "Severity"]
    df = pd.read_csv(raw_path, usecols=usecols)

    # Randomly sample rows to keep the browser workload light.
    sample_n = min(SAMPLE_SIZE, len(df))
    df_sampled = df.sample(n=sample_n, random_state=42)

    # Parse timestamps and derive helpful time columns.
    # Parse timestamps (handles strings with fractional seconds like ".000000000").
    df_sampled["Start_Time"] = pd.to_datetime(
        df_sampled["Start_Time"], errors="coerce"
    )
    # Drop rows that could not be parsed to keep downstream outputs clean.
    missing_times = df_sampled["Start_Time"].isna().sum()
    if missing_times:
        print(f"Warning: {missing_times} rows had unparseable Start_Time and were dropped.")
        df_sampled = df_sampled.dropna(subset=["Start_Time"])
    df_sampled["year"] = df_sampled["Start_Time"].dt.year
    df_sampled["year_month"] = df_sampled["Start_Time"].dt.strftime("%Y-%m")

    # Aggregate by state and year_month.
    agg = (
        df_sampled.groupby(["State", "year_month", "year"])
        .agg(count_accidents=("ID", "count"), avg_severity=("Severity", "mean"))
        .reset_index()
    )
    agg.rename(columns={"State": "state"}, inplace=True)
    agg.to_csv(DATA_OUT_DIR / "us_accidents_state_month.csv", index=False)

    # Summary information for sanity-checking.
    date_min = df_sampled["Start_Time"].min()
    date_max = df_sampled["Start_Time"].max()
    num_states = df_sampled["State"].nunique()
    print("Preprocessing complete.")
    print(f"Sampled rows: {len(df_sampled):,}")
    print(f"Date range: {date_min.date()} to {date_max.date()}")
    print(f"States present: {num_states}")


if __name__ == "__main__":
    main()
