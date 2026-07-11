// Log Manager

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogOptions {
  level?: LogLevel;
  context?: string;
  timestamp?: boolean;
  colorize?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  data?: unknown;
}

class LogManager {
  private minLevel: LogLevel;
  private colorize: boolean;
  private timestamps: boolean;

  constructor(options: LogOptions = {}) {
    this.minLevel = options.level ?? LogLevel.DEBUG;
    this.colorize = options.colorize ?? true;
    // Timestamps are enabled by default
    this.timestamps = options.timestamp ?? true;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private getCallerInfo(): { file: string; line: number } | null {
    const stack = new Error().stack;
    if (!stack) return null;

    // Parse stack trace to find the caller
    // Stack format: "at functionName (file:line:column)" or "at file:line:column"
    const stackLines = stack.split('\n');
    
    // Stack trace structure:
    // 0: Error message
    // 1: getCallerInfo() - this function
    // 2: formatMessage() - format function
    // 3: log() - internal log method
    // 4: info/debug/warn/error() - public method
    // 5: actual caller - this is what we want
    
    // Skip the first 5 lines to get to the actual caller
    for (let i = 5; i < stackLines.length; i++) {
      const line = stackLines[i];
      if (!line) continue;

      // Match patterns like: "at functionName (file:line:column)" or "at file:line:column"
      const match = line.match(/at\s+(?:.*\s+)?\(?(.+):(\d+):(\d+)\)?/);
      if (match) {
        const filePath = match[1];
        const lineNumber = parseInt(match[2], 10);
        
        // Skip if it's from the logger itself
        if (filePath.includes('src/managers/log')) {
          continue;
        }
        
        // Extract just the filename from the path
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
        
        return { file: fileName, line: lineNumber };
      }
    }

    return null;
  }

  private formatMessage(level: string, message: string, context?: string, data?: unknown): string {
    const parts: string[] = [];

    if (this.timestamps) {
      parts.push(`[${this.getTimestamp()}]`);
    }

    parts.push(`[${level}]`);

    // Add file and line number
    const callerInfo = this.getCallerInfo();
    if (callerInfo) {
      parts.push(`[${callerInfo.file}:${callerInfo.line}]`);
    }

    if (context) {
      parts.push(`[${context}]`);
    }

    parts.push(message);

    if (data !== undefined) {
      parts.push(JSON.stringify(data, null, 2));
    }

    return parts.join(' ');
  }

  private getColor(level: LogLevel): string {
    if (!this.colorize) return '';

    switch (level) {
      case LogLevel.DEBUG:
        return '\x1b[36m'; // Cyan
      case LogLevel.INFO:
        return '\x1b[32m'; // Green
      case LogLevel.WARN:
        return '\x1b[33m'; // Yellow
      case LogLevel.ERROR:
        return '\x1b[31m'; // Red
      default:
        return '\x1b[0m'; // Reset
    }
  }

  private getResetColor(): string {
    return this.colorize ? '\x1b[0m' : '';
  }

  private log(level: LogLevel, levelName: string, message: string, context?: string, data?: unknown): void {
    if (level < this.minLevel) {
      return;
    }

    const color = this.getColor(level);
    const reset = this.getResetColor();
    const formattedMessage = this.formatMessage(levelName, message, context, data);

    const logFn = level === LogLevel.ERROR ? console.error : console.log;
    logFn(`${color}${formattedMessage}${reset}`);
  }

  debug(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, context, data);
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.INFO, 'INFO', message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.WARN, 'WARN', message, context, data);
  }

  error(message: string, context?: string, error?: Error | unknown): void {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : error;
    this.log(LogLevel.ERROR, 'ERROR', message, context, errorData);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  setColorize(colorize: boolean): void {
    this.colorize = colorize;
  }

  setTimestamps(timestamps: boolean): void {
    this.timestamps = timestamps;
  }
}

// Create and export a singleton instance with timestamps enabled by default
export const logger = new LogManager();

// Export the class for custom instances if needed
export { LogManager };
