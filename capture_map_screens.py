import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"D:\zenbijoy\screenshots"
ARTIFACT_DIR = r"C:\Users\saha-\.gemini\antigravity\brain\4a5103a0-63a8-4901-9772-3b963b7c6705\screenshots"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

def capture_maps():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            viewport={"width": 393, "height": 852},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()

        # 1. Explore Screen Map Toggle
        print("Navigating to /screens/explore and clicking 'ম্যাপ'...")
        page.goto("http://localhost:8081/screens/explore", wait_until="networkidle", timeout=30000)
        time.sleep(2)
        try:
            map_btn = page.locator("text=ম্যাপ").first
            if map_btn.is_visible():
                map_btn.click()
                time.sleep(3)
        except Exception as e:
            print("Map toggle click error:", e)
        
        path_explore = os.path.join(OUTPUT_DIR, "19_explore_map_active.png")
        page.screenshot(path=path_explore)
        page.screenshot(path=os.path.join(ARTIFACT_DIR, "19_explore_map_active.png"))
        print(f"Saved 19_explore_map_active.png")

        # 2. Emergency Screen Nearby Radar Map
        print("Navigating to /screens/emergency and clicking 'Nearby 15km'...")
        page.goto("http://localhost:8081/screens/emergency", wait_until="networkidle", timeout=30000)
        time.sleep(2)
        try:
            nearby_btn = page.locator("text=Nearby").first
            if nearby_btn.is_visible():
                nearby_btn.click()
                time.sleep(3)
        except Exception as e:
            print("Nearby click error:", e)

        path_emergency = os.path.join(OUTPUT_DIR, "18_emergency_nearby_map.png")
        page.screenshot(path=path_emergency)
        page.screenshot(path=os.path.join(ARTIFACT_DIR, "18_emergency_nearby_map.png"))
        print(f"Saved 18_emergency_nearby_map.png")

        # 3. Bus & Launch Boarding Point Map
        print("Navigating to /screens/bus-launch and clicking 'ম্যাপে দেখুন'...")
        page.goto("http://localhost:8081/screens/bus-launch", wait_until="networkidle", timeout=30000)
        time.sleep(2)
        try:
            bus_map_btn = page.locator("text=ম্যাপে দেখুন").first
            if bus_map_btn.is_visible():
                bus_map_btn.click()
                time.sleep(3)
        except Exception as e:
            print("Bus map click error:", e)

        path_bus = os.path.join(OUTPUT_DIR, "16_bus_launch_map.png")
        page.screenshot(path=path_bus)
        page.screenshot(path=os.path.join(ARTIFACT_DIR, "16_bus_launch_map.png"))
        print(f"Saved 16_bus_launch_map.png")

        browser.close()
        print("Done capturing map views!")

if __name__ == "__main__":
    capture_maps()
