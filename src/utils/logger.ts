/**
 * Structured Enterprise Logger for ShopnoJatra
 * Replaces unstructured, untyped console.log / console.warn statements.
 * Automatically gates debug and info logs to development environments (__DEV__),
 * while standardizing warnings and errors.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  private formatPrefix(level: LogLevel): string {
    return `[${level.toUpperCase()}]:`;
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

export const logger = new Logger();
export default logger;
