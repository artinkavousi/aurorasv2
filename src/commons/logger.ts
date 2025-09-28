export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_LEVEL: LogLevel = (import.meta.env?.DEV ?? false) ? "debug" : "warn";

export interface Logger {
  level: LogLevel;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (namespace: string) => Logger;
}

const shouldLog = (level: LogLevel, current: LogLevel) => {
  if (level === "silent" || current === "silent") {
    return false;
  }
  return LEVEL_ORDER[level as Exclude<LogLevel, "silent">] >= LEVEL_ORDER[current as Exclude<LogLevel, "silent">];
};

const formatNamespace = (namespace: string | undefined, level: LogLevel) => {
  if (!namespace) {
    return `[${level}]`;
  }
  return `[${level}::${namespace}]`;
};

export const createLogger = (namespace?: string, level: LogLevel = DEFAULT_LEVEL): Logger => {
  const log = (levelName: LogLevel, args: unknown[]) => {
    if (!shouldLog(levelName, level)) {
      return;
    }
    const prefix = formatNamespace(namespace, levelName);
    switch (levelName) {
      case "debug":
        console.debug(prefix, ...args);
        break;
      case "info":
        console.info(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "error":
        console.error(prefix, ...args);
        break;
      default:
        break;
    }
  };

  return {
    level,
    debug: (...args: unknown[]) => log("debug", args),
    info: (...args: unknown[]) => log("info", args),
    warn: (...args: unknown[]) => log("warn", args),
    error: (...args: unknown[]) => log("error", args),
    child: (childNamespace: string) => createLogger(namespace ? `${namespace}:${childNamespace}` : childNamespace, level),
  };
};
