import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { captainPrompt, captainTitle } from "./lib/captain-text";
import { parseRegistry } from "./lib/captain-schema";
import { REGISTRY_CHANNEL, REGISTRY_KEY, type CaptainRecord, type CaptainRegistry } from "./lib/captains";
import { rpcContract } from "./lib/rpc";

export default async function plugin(bb: BbPluginApi) {
  const read = async (): Promise<CaptainRegistry> => parseRegistry(await bb.storage.kv.get<unknown>(REGISTRY_KEY));

  let queue: Promise<unknown> = Promise.resolve();
  function mutate<T>(change: (registry: CaptainRegistry) => { registry: CaptainRegistry; result: T }): Promise<T> {
    const run = queue.then(async () => {
      const { registry, result } = change(await read());
      await bb.storage.kv.set(REGISTRY_KEY, registry);
      bb.realtime.publish(REGISTRY_CHANNEL, registry);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  }

  const withRecord = (registry: CaptainRegistry, record: CaptainRecord): CaptainRegistry => ({
    version: 1,
    captains: { ...registry.captains, [record.threadId]: record },
  });

  bb.rpc.register(rpcContract, {
    captains_list: read,

    captains_create: async ({ projectId, projectName, logo, color }) => {
      const thread = await bb.sdk.threads.spawn({
        projectId,
        environment: { type: "project-default" },
        title: captainTitle(projectName),
        prompt: captainPrompt(projectName),
      });
      const record: CaptainRecord = { threadId: thread.id, logo, color, createdAt: new Date().toISOString() };
      return mutate((registry) => ({ registry: withRecord(registry, record), result: record }));
    },

    captains_adopt: ({ threadId, logo, color }) =>
      mutate((registry) => {
        const createdAt = registry.captains[threadId]?.createdAt ?? new Date().toISOString();
        const record: CaptainRecord = { threadId, logo, color, createdAt };
        return { registry: withRecord(registry, record), result: record };
      }),

    captains_update: ({ threadId, logo, color }) =>
      mutate((registry) => {
        const current = registry.captains[threadId];
        if (current === undefined) throw new Error(`Thread ${threadId} is not a captain`);
        const record: CaptainRecord = { ...current, logo: logo ?? current.logo, color: color ?? current.color };
        return { registry: withRecord(registry, record), result: record };
      }),

    captains_remove: ({ threadId }) =>
      mutate((registry) => {
        const { [threadId]: _removed, ...captains } = registry.captains;
        return { registry: { version: 1, captains }, result: null };
      }),
  });

  bb.log.info("loaded");
}
