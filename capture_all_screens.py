import os
import shutil
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = r"D:\zenbijoy\screenshots"
ARTIFACT_DIR = r"C:\Users\saha-\.gemini\antigravity\brain\4a5103a0-63a8-4901-9772-3b963b7c6705\screenshots"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ARTIFACT_DIR, exist_ok=True)

SCREENS = [
    {"name": "01_home_screen", "path": "/(tabs)"},
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
    {"name": "12_messages", "path": "/(tabs)/messages"},
    {"name": "13_community", "path": "/(tabs)/community"},
    {"name": "14_my_trips", "path": "/(tabs)/trips"},
    {"name": "15_account_signin", "path": "/(tabs)/account"},
    {"name": "16_bus_launch", "path": "/screens/bus-launch"},
    {"name": "17_digital_passport", "path": "/screens/digital-passport"},
    {"name": "18_emergency_sos", "path": "/screens/emergency"},
    {"name": "19_explore_destinations", "path": "/screens/explore"},
    {"name": "20_admin_portal", "path": "/admin"},
]

HIDE_OVERLAYS_CSS = """
    div[class*="ErrorOverlay"], 
    div[class*="Toast"], 
    #expo-error-overlay, 
    div[role="alert"],
    div[data-testid="error-toast"],
    div[style*="z-index: 999999"],
    div[style*="zIndex: 999999"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
    }
"""

def remove_dev_banners(page):
    try:
        page.evaluate('''() => {
            // 1. Click all close / dismiss buttons
            const buttons = document.querySelectorAll('button, div[role="button"]');
            for (const b of buttons) {
                const txt = (b.innerText || b.textContent || '').trim();
                if (txt === '✕' || txt === '×' || txt === 'x' || b.getAttribute('aria-label') === 'Close' || b.getAttribute('aria-label') === 'Dismiss') {
                    try { b.click(); } catch(e) {}
                }
            }
            // 2. Remove any sibling divs directly under body that are not #root
            Array.from(document.body.children).forEach(child => {
                if (child.id !== 'root' && child.tagName !== 'SCRIPT') {
                    try { child.remove(); } catch(e) {}
                }
            });
            // 3. Remove any toast or overlay container from root or body
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                const t = el.textContent || '';
                if (
                    t.includes("Can't perform a React") ||
                    t.includes("React state update") ||
                    t.includes("Supabase Dev") ||
                    t.includes("Network request failed") ||
                    t.includes("LogBox")
                ) {
                    let box = el;
                    while (box.parentElement && box.parentElement !== document.body && box.parentElement.id !== 'root') {
                        if (box.parentElement.parentElement === document.body) {
                            break;
                        }
                        box = box.parentElement;
                    }
                    try { box.remove(); } catch(e) {}
                }
            }
        }''')
    except Exception:
        pass

def capture_all():
    print(f"Starting batch capture of {len(SCREENS)} screens in Light Mode + Dark Mode...", flush=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)

        # ─── PART 1: LIGHT MODE CAPTURES ─────────────────────────────────────
        context_light = browser.new_context(
            viewport={"width": 393, "height": 852},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            color_scheme="light",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        )
        page_light = context_light.new_page()

        page_light.add_init_script("""
            window.console.error = function() {};
            window.console.warn = function() {};
            window.localStorage.setItem('@app:has_seen_onboarding', 'true');
            window.localStorage.setItem('@app:demo_mode', 'true');
            window.localStorage.setItem('travel_app_unified_settings_v2', JSON.stringify({
                state: { themeMode: 'light', language: 'en', currency: 'USD' },
                version: 0
            }));
        """)

        # Initial warm load
        print("Warming up light session...", flush=True)
        page_light.goto("http://localhost:8081/(tabs)", wait_until="domcontentloaded", timeout=90000)
        time.sleep(3)
        page_light.add_style_tag(content=HIDE_OVERLAYS_CSS)
        remove_dev_banners(page_light)

        for idx, screen in enumerate(SCREENS):
            target_url = f"http://localhost:8081{screen['path']}"
            output_file = f"{screen['name']}.png"
            local_path = os.path.join(OUTPUT_DIR, output_file)
            artifact_path = os.path.join(ARTIFACT_DIR, output_file)

            print(f"[{idx+1}/{len(SCREENS)}] Capturing {screen['name']} from {target_url}...", flush=True)
            try:
                page_light.goto(target_url, wait_until="domcontentloaded", timeout=30000)
                page_light.wait_for_timeout(3000)
                page_light.add_style_tag(content=HIDE_OVERLAYS_CSS)
                remove_dev_banners(page_light)
                page_light.screenshot(path=local_path, full_page=False)
                shutil.copy2(local_path, artifact_path)
                file_size_kb = os.path.getsize(local_path) / 1024
                print(f"  -> Saved {output_file} ({file_size_kb:.1f} KB)", flush=True)
            except Exception as e:
                print(f"  -> Error capturing {screen['name']}: {e}", flush=True)

        context_light.close()

        # ─── PART 2: DARK MODE HOME SCREEN CAPTURE ────────────────────────────
        print("Capturing Dark Mode Home Screen (media_1794315121667_0dab88bb reference)...", flush=True)
        context_dark = browser.new_context(
            viewport={"width": 393, "height": 852},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            color_scheme="dark",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        )
        page_dark = context_dark.new_page()

        page_dark.add_init_script("""
            window.console.error = function() {};
            window.console.warn = function() {};
            window.localStorage.setItem('@app:has_seen_onboarding', 'true');
            window.localStorage.setItem('@app:demo_mode', 'true');
            window.localStorage.setItem('travel_app_unified_settings_v2', JSON.stringify({
                state: { themeMode: 'dark', language: 'en', currency: 'USD' },
                version: 0
            }));
        """)

        page_dark.goto("http://localhost:8081/(tabs)", wait_until="domcontentloaded", timeout=45000)
        page_dark.wait_for_timeout(3500)
        page_dark.add_style_tag(content=HIDE_OVERLAYS_CSS)
        remove_dev_banners(page_dark)

        dark_local = os.path.join(OUTPUT_DIR, "01_home_screen_dark.png")
        dark_artifact = os.path.join(ARTIFACT_DIR, "01_home_screen_dark.png")
        page_dark.screenshot(path=dark_local, full_page=False)
        shutil.copy2(dark_local, dark_artifact)
        print(f"  -> Saved 01_home_screen_dark.png ({os.path.getsize(dark_local) / 1024:.1f} KB)", flush=True)

        context_dark.close()
        browser.close()

    print("Capture complete across all modes!", flush=True)

if __name__ == "__main__":
    capture_all()
