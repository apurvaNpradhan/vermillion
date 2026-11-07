export type UserAgentDevice = { browser?: string; os?: string };

const browsers: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const systems: Array<[RegExp, string]> = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMacintosh\b|\bMac OS X\b/, "macOS"],
  [/\bWindows\b/, "Windows"],
  [/\bLinux\b/, "Linux"],
];

const first = (value: string, patterns: Array<[RegExp, string]>) =>
  patterns.find(([pattern]) => pattern.test(value))?.[1];

/** Coarse browser and OS names for security emails; never the raw user agent. */
export function parseUserAgent(userAgent: string | null | undefined): UserAgentDevice | undefined {
  if (!userAgent) return undefined;
  const value = userAgent.slice(0, 512);
  const device = { browser: first(value, browsers), os: first(value, systems) };
  return device.browser || device.os ? device : undefined;
}
