// Typed readers for widget parameters. The loader has already validated the
// types, so these only apply defaults.
type P = Record<string, unknown>;
export const str = (p: P, k: string, d: string): string => (typeof p[k] === "string" ? (p[k] as string) : d);
export const num = (p: P, k: string, d: number): number => (typeof p[k] === "number" ? (p[k] as number) : d);
export const bool = (p: P, k: string, d: boolean): boolean => (typeof p[k] === "boolean" ? (p[k] as boolean) : d);
export const list = <T = string>(p: P, k: string, d: T[]): T[] => (Array.isArray(p[k]) ? (p[k] as T[]) : d);
