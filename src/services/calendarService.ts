import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { openLink } from "../utils/openLink";
import { TripPlan } from "./ai/types";

export interface CalendarEventPayload {
  title: string;
  description: string;
  location?: string;
  startDate: Date;
  endDate?: Date;
  notes?: string;
}

function formatDateToIcsString(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export const calendarService = {
  /**
   * Generates a Google Calendar Web Intent URL
   */
  getGoogleCalendarUrl(event: CalendarEventPayload): string {
    const end = event.endDate || new Date(event.startDate.getTime() + 2 * 60 * 60 * 1000);
    const startIso = formatDateToIcsString(event.startDate);
    const endIso = formatDateToIcsString(end);

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${startIso}/${endIso}`,
      details: event.description,
      location: event.location || "Bangladesh",
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  },

  /**
   * Generates an iCalendar (.ics) string for Apple Calendar / Outlook / device calendar
   */
  generateIcsContent(event: CalendarEventPayload): string {
    const end = event.endDate || new Date(event.startDate.getTime() + 2 * 60 * 60 * 1000);
    const startIcs = formatDateToIcsString(event.startDate);
    const endIcs = formatDateToIcsString(end);
    const nowIcs = formatDateToIcsString(new Date());
    const uid = `shopno-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@shopno.travel`;

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Shopno Travel Agency//Travel Ticket Calendar//BN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${nowIcs}`,
      `DTSTART:${startIcs}`,
      `DTEND:${endIcs}`,
      `SUMMARY:${event.title.replace(/\n/g, " ")}`,
      `DESCRIPTION:${event.description.replace(/\n/g, "\\n")}`,
      `LOCATION:${(event.location || "").replace(/\n/g, " ")}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      "DESCRIPTION:২৪ ঘণ্টা পূর্বে যাত্রার রিমাইন্ডার",
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      "DESCRIPTION:২ ঘণ্টা পূর্বে যাত্রার রিমাইন্ডার",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  },

  /**
   * Adds the event to the user's calendar:
   * Opens Google Calendar directly or shares the .ics calendar file natively
   */
  async addToCalendar(event: CalendarEventPayload): Promise<boolean> {
    try {
      const googleCalUrl = this.getGoogleCalendarUrl(event);

      // On Web or fallback to Google Calendar
      if (Platform.OS === "web") {
        await openLink(googleCalUrl, { label: "Google Calendar", copyValue: googleCalUrl });
        return true;
      }

      // On Native iOS / Android:
      // Create .ics file in cache and invoke native sharing/calendar importer
      const icsString = this.generateIcsContent(event);
      const filename = `trip-${Date.now()}.ics`;
      const filePath = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(filePath, icsString, {
        encoding: "utf8" as any,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: "text/calendar",
          dialogTitle: "ক্যালেন্ডারে ট্রিপ যোগ করুন",
          UTI: "com.apple.ical.ics",
        });
        return true;
      } else {
        // Fallback to Google Calendar URL
        await Linking.openURL(googleCalUrl);
        return true;
      }
    } catch (err) {
      console.warn("Failed to add to calendar via .ics:", err);
      // Safe fallback
      try {
        const url = this.getGoogleCalendarUrl(event);
        await openLink(url, { label: "Google Calendar", copyValue: url });
        return true;
      } catch (e2) {
        console.error("Failed to open calendar URL fallback:", e2);
        return false;
      }
    }
  },

  /**
   * Generates a multi-event iCalendar (.ics) string for a complete Trip Plan
   */
  generateTripPlanIcs(plan: TripPlan): string {
    const nowIcs = formatDateToIcsString(new Date());
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 1);
    baseDate.setHours(9, 0, 0, 0);

    const events: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      `PRODID:-//Shopno Travel Agency//Trip Plan: ${plan.title || "Travel Plan"}//BN`,
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    (plan.days || []).forEach((day, index) => {
      const dayStart = new Date(baseDate.getTime() + index * 24 * 60 * 60 * 1000);
      dayStart.setHours(9, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 10 * 60 * 60 * 1000);

      const startIcs = formatDateToIcsString(dayStart);
      const endIcs = formatDateToIcsString(dayEnd);
      const uid = `shopno-trip-${plan.id || "trip"}-day${day.day || index + 1}-${Date.now()}@shopno.travel`;

      const activityList = (day.activities || [])
        .map((a, i) => `${i + 1}. [${a.time || "Activity"}] ${a.activity} (${a.location || plan.destination})`)
        .join("\\n");

      events.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${nowIcs}`,
        `DTSTART:${startIcs}`,
        `DTEND:${endIcs}`,
        `SUMMARY:Day ${day.day || index + 1}: ${day.theme || day.title || plan.title}`,
        `DESCRIPTION:${day.description || ""}\\n\\nActivities:\\n${activityList}`,
        `LOCATION:${plan.destination}`,
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-PT2H",
        "ACTION:DISPLAY",
        `DESCRIPTION:Reminder for Day ${day.day || index + 1} of ${plan.title}`,
        "END:VALARM",
        "END:VEVENT"
      );
    });

    events.push("END:VCALENDAR");
    return events.join("\r\n");
  },

  /**
   * Exports full multi-day Trip Plan to device calendar (.ics file / Google Calendar)
   */
  async addTripPlanToCalendar(plan: TripPlan): Promise<boolean> {
    try {
      const icsString = this.generateTripPlanIcs(plan);
      const safeTitle = (plan.title || "trip_plan").replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `${safeTitle}-${Date.now()}.ics`;
      const filePath = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(filePath, icsString, {
        encoding: "utf8" as any,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: "text/calendar",
          dialogTitle: `${plan.title} ক্যালেন্ডারে যোগ করুন`,
          UTI: "com.apple.ical.ics",
        });
        return true;
      } else {
        const googleUrl = this.getGoogleCalendarUrl({
          title: `Trip: ${plan.title} (${plan.destination})`,
          description: `${plan.summary || ""}\nDuration: ${plan.durationDays} Days`,
          location: plan.destination,
          startDate: new Date(),
        });
        await openLink(googleUrl, { label: "Google Calendar", copyValue: googleUrl });
        return true;
      }
    } catch (err) {
      console.warn("Failed to add trip plan to calendar:", err);
      return false;
    }
  },
};
