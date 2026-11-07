import type { BbPluginApi } from "@get-bb/plugin-sdk";

type Kv = BbPluginApi["storage"]["kv"];

export async function listRecords<T>(
  kv: Kv,
  prefix: string,
  parse: (raw: unknown) => T | null,
  warn: (message: string) => void,
): Promise<T[]> {
  const keys = await kv.list(prefix);
  const values = await Promise.all(keys.map((key) => kv.get<unknown>(key)));
  return keys.flatMap((key, index) => {
    const record = parse(values[index]);
    if (record === null) warn(`skipping unreadable record at ${key}`);
    return record === null ? [] : [record];
  });
}

/**
 * Runs the tasks for one key one after another, so a read-then-write on a
 * record cannot interleave with another write to it from a second client.
 */
export function queueByKey(): <T>(key: string, task: () => Promise<T>) => Promise<T> {
  const tails = new Map<string, Promise<unknown>>();
  return (key, task) => {
    const result = (tails.get(key) ?? Promise.resolve()).then(task);
    const tail = result.catch(() => undefined);
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}
