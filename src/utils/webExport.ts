import { Platform, Share } from "react-native";

/**
 * Cross-platform file export helper.
 * On Web: triggers a direct browser file download using Blob + ObjectURL.
 * On Native (iOS/Android): falls back to OS Share sheet.
 */
export async function exportCsvOrTextFile(params: {
  filename: string;
  content: string;
  mimeType?: string;
  title?: string;
}): Promise<{ method: "download" | "share" }> {
  const {
    filename,
    content,
    mimeType = "text/csv;charset=utf-8;",
    title = filename,
  } = params;

  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof Blob !== "undefined"
  ) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.setAttribute("download", filename);
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { method: "download" };
  }

  await Share.share({
    message: content,
    title,
  });
  return { method: "share" };
}
