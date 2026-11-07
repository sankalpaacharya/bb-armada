import type { BbPluginApi } from "@get-bb/plugin-sdk";

type Kv = BbPluginApi["storage"]["kv"];

export async function listRecords<T>(
  kv: Kv,
  prefix: string,
  parse: (raw: unknown) => T | null,
  warn: (message: string) => void,
): Promise<T[]> {
  const keys = await kv.list(prefix);
  const records: T[] = [];
  for (const key of keys) {
    const record = parse(await kv.get<unknown>(key));
    if (record === null) warn(`skipping unreadable record at ${key}`);
    else records.push(record);
  }
  return records;
}
