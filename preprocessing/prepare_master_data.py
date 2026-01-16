import pandas as pd
import numpy as np
from pathlib import Path

# Paths
RAW_DATA_PATH = Path("raw_data.csv")
OUTPUT_PATH = Path("../data.csv")
SAMPLE_SIZE = 1_000

def main():
    if not RAW_DATA_PATH.exists():
        print(f"Error: {RAW_DATA_PATH} not found. Please ensure you are in the preprocessing/ directory.")
        return

    print("Loading raw data...")
    cols_to_keep = [
        "Source",
        "Severity",
        "State",
        "Temperature(F)",
        "Humidity(%)",
        "Weather_Condition",
        "Start_Time",
        "Start_Lat",
        "Start_Lng",
    ]
    
    # Load data
    try:
        raw_df = pd.read_csv(RAW_DATA_PATH, usecols=cols_to_keep)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    print(f"Processing {len(raw_df)} rows...")
    
    # Filter for Source2 (matched existing notebook logic)
    df = raw_df.loc[raw_df["Source"] == "Source2",].copy()
    df = df.drop(["Source"], axis=1)
    
    # Drop NAs in critical columns
    df = df.dropna(subset=[
        'Humidity(%)', "Temperature(F)", "Severity", "Weather_Condition",
        "Start_Time", "State", "Start_Lat", "Start_Lng"
    ])
    
    # Temperature conversion
    df["Temperature(C)"] = (df["Temperature(F)"] - 32) * 5 / 9
    
    # Range filtering
    df = df[(df['Humidity(%)'] >= 0) & (df['Humidity(%)'] <= 100)] 
    df = df[(df["Temperature(C)"] > -35) & (df["Temperature(C)"] < 45)]
    # Basic coordinate sanity check (continental US-ish bounds)
    df = df[(df["Start_Lat"].between(18, 72)) & (df["Start_Lng"].between(-180, -50))]
    
    # Weather binary flags (refined based on full condition list)
    print("Creating weather flags...")
    df["is_Rain"] = df["Weather_Condition"].str.contains("Rain|Storm|Shower|Thunder|Drizzle|T-Storm|Hail", case=False, na=False)
    df["is_Snow"] = df["Weather_Condition"].str.contains("Snow|Sleet|Ice|Blizzard|Squalls|Pellets|Wintry|Mix", case=False, na=False)
    df["is_Fog"] = df["Weather_Condition"].str.contains("Fog|Mist|Haze|Smoke|Dust|Sand", case=False, na=False)
    df["is_Clear"] = df["Weather_Condition"].str.contains("Clear|Fair", case=False, na=False)
    df["is_Cloud"] = df["Weather_Condition"].str.contains("Cloud|Overcast", case=False, na=False)
    
    # Time components derivation
    print("Parsing timestamps...")
    df['Start_Time'] = pd.to_datetime(df['Start_Time'], errors='coerce')
    df = df.dropna(subset=['Start_Time'])
    df['day_of_week'] = df['Start_Time'].dt.dayofweek
    df['hour_of_day'] = df['Start_Time'].dt.hour
    
    # HighSeverity definition (consistent with Dashboard: 3-4)
    df['HighSeverity'] = (df['Severity'] >= 3).astype(int)
    
    # Sample data
    print(f"Sampling {SAMPLE_SIZE} records...")
    cols_to_export = [
        'State',
        'Severity', 
        'Humidity(%)', 
        'Temperature(C)', 
        'Weather_Condition', 
        'is_Rain', 'is_Snow', 'is_Fog', 'is_Clear', 'is_Cloud', 
        'HighSeverity', 
        'day_of_week', 
        'hour_of_day',
        'Start_Lat',
        'Start_Lng'
    ]
    
    df_sample = df[cols_to_export].sample(n=min(SAMPLE_SIZE, len(df)), random_state=42)
    
    # Export
    df_sample.to_csv(OUTPUT_PATH, index=False)
    print(f"Extraction complete! Consolidated file saved to: {OUTPUT_PATH}")
    print(f"Final schema: {df_sample.columns.tolist()}")

if __name__ == "__main__":
    main()
