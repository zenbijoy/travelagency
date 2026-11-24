import os

def patch_file(filepath, search_str, replace_str):
    with open(filepath, 'rb') as f:
        content = f.read()
    search_bytes = search_str.encode('utf-8')
    replace_bytes = replace_str.encode('utf-8')
    if search_bytes not in content:
        print(f"[WARN] search string not found in {filepath}")
        return False
    content = content.replace(search_bytes, replace_bytes, 1)
    with open(filepath, 'wb') as f:
        f.write(content)
    print(f"[OK] Successfully patched {filepath}")
    return True

# 1. Fix PackageScreen slide width
pkg_path = r"D:\zenbijoy\src\screens\PackageScreen.tsx"
pkg_old = '  slide: {\r\n    width: "100%",\r\n    height: 200,\r\n  },\r\n  image: {\r\n    width: "100%",\r\n    height: "100%",\r\n  },'
pkg_new = '  slide: {\r\n    width: SCREEN_WIDTH - 32,\r\n    height: 200,\r\n  },\r\n  image: {\r\n    width: SCREEN_WIDTH - 32,\r\n    height: 200,\r\n  },'
patch_file(pkg_path, pkg_old, pkg_new)

# 2. Fix RecommendedToursScreen slide width
tours_path = r"D:\zenbijoy\src\screens\RecommendedToursScreen.tsx"
tours_old = '  slide: {\r\n    width: "100%",\r\n    height: 200,\r\n  },\r\n  image: {\r\n    width: "100%",\r\n    height: "100%",\r\n  },'
tours_new = '  slide: {\r\n    width: Dimensions.get("window").width - 32,\r\n    height: 200,\r\n  },\r\n  image: {\r\n    width: Dimensions.get("window").width - 32,\r\n    height: 200,\r\n  },'
patch_file(tours_path, tours_old, tours_new)

# 3. Fix CarRentalsScreen trust badges spacing
car_path = r"D:\zenbijoy\src\screens\CarRentalsScreen.tsx"
car_old = '  perkItem: {\r\n    alignItems: "center",\r\n    gap: 4,\r\n  },\r\n  perkText: {\r\n    fontSize: 12,\r\n    fontWeight: "700",\r\n    color: "#4B5563",\r\n  },'
car_new = '  perkItem: {\r\n    flex: 1,\r\n    alignItems: "center",\r\n    gap: 4,\r\n    paddingHorizontal: 2,\r\n  },\r\n  perkText: {\r\n    fontSize: 10,\r\n    fontWeight: "700",\r\n    color: "#4B5563",\r\n    textAlign: "center",\r\n  },'
patch_file(car_path, car_old, car_new)

print("Patching complete!")

# 4. Fix OptimizedImage styling for web
opt_path = r"D:\zenbijoy\src\components\common\OptimizedImage.tsx"
opt_old = '        style={[styles.container, containerStyle]}\r\n        onLayout={handleLayout}'
opt_new = '        style={[styles.container, style, containerStyle]}\r\n        onLayout={handleLayout}'
patch_file(opt_path, opt_old, opt_new)

opt_fade_old = '                opacity: fadeAnim,'
opt_fade_new = '                opacity: Platform.OS === "web" ? 1 : fadeAnim,'
patch_file(opt_path, opt_fade_old, opt_fade_new)
