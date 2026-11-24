import os
import sys
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"D:\zenbijoy\screenshots"
os.makedirs(OUTPUT_DIR, exist_ok=True)

SCREENS = [
    {"name": "01_home_screen", "path": "/"},
    {"name": "02_hotels_homes", "path": "/screens/hotels-homes"},
    {"name": "03_flights", "path": "/screens/flights"},
    {"name": "04_packages", "path": "/screens/packages"},
    {"name": "05_trains", "path": "/screens/trains"},
    {"name": "06_search_bali", "path": "/screens/search?q=Bali"},
    {"name": "07_car_rentals", "path": "/screens/car-rentals"},
    {"name": "08_recommended_tours", "path": "/screens/recommended-tours"},
    {"name": "09_events", "path": "/screens/events"},
    {"name": "10_rewards_deals", "path": "/screens/rewards"},
    {"name": "11_trip_planner", "path": "/screens/trip-planner"},
    {"name": "12_messages", "path": "/messages"},
    {"name": "13_community", "path": "/community"},
    {"name": "14_my_trips", "path": "/trips"},
    {"name": "15_account_signin", "path": "/account"},
]

def run():
    print(f"Starting screenshot capture to: {OUTPUT_DIR}", flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            viewport={"width": 393, "height": 852},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        )
        page = context.new_page()

        # Listen to console messages for debugging
        page.on("console", lambda msg: print(f"[Browser Console] {msg.type}: {msg.text[:120]}", flush=True))
        page.on("pageerror", lambda err: print(f"[Browser Error] {err}", flush=True))

        for idx, screen in enumerate(SCREENS):
            target_url = f"http://localhost:8081{screen['path']}"
            output_path = os.path.join(OUTPUT_DIR, f"{screen['name']}.png")
            print(f"[{idx+1}/{len(SCREENS)}] Navigating to {screen['name']} ({target_url})...", flush=True)
            try:
                page.goto(target_url, wait_until="domcontentloaded", timeout=45000)
                # Allow React Native Web bundle & animations to settle
                time.sleep(3.5)
                page.screenshot(path=output_path, full_page=False)
                size_kb = os.path.getsize(output_path) // 1024
                print(f" -> Successfully saved: {screen['name']}.png ({size_kb} KB)", flush=True)
            except Exception as e:
                print(f" -> Error on {screen['name']}: {e}", flush=True)

        browser.close()
    print("ALL SCREENSHOTS COMPLETED SUCCESSFULLY!", flush=True)

if __name__ == "__main__":
    run()
