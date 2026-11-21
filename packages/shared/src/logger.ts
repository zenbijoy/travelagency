/**
 * Shared Logger for Monorepo (Root, AGEN, Hotel)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export class SharedLogger {
  private formatPrefix(level: LogLevel): string {
    return `[ShopnoJatra] [${level.toUpperCase()}]:`;
  }

  debug(...args: unknown[]): void {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log(this.formatPrefix("debug"), ...args);
    }
  }

  info(...args: unknown[]): void {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.info(this.formatPrefix("info"), ...args);
    }
  }

  warn(...args: unknown[]): void {
    console.warn(this.formatPrefix("warn"), ...args);
  }

  error(...args: unknown[]): void {
    console.error(this.formatPrefix("error"), ...args);
  }
}

export const sharedLogger = new SharedLogger();
