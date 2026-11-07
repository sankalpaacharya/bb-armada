import { useCallback, useEffect, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@get-bb/plugin-sdk/app";

import {
  EMPTY_REGISTRY,
  REGISTRY_CHANNEL,
  type CaptainRegistry,
} from "@/lib/captains";
import type { rpcContract } from "@/lib/rpc";
import { readStored, writeStored } from "@/lib/storage";

const STORAGE_KEY = "armada/captains";
const RETRIES = [1_000, 3_000, 10_000];

function isRegistry(value: unknown): value is CaptainRegistry {
  return (
    typeof value === "object" &&
    value !== null &&
    "captains" in value &&
    typeof value.captains === "object" &&
    value.captains !== null
  );
}

let remembered: CaptainRegistry | null = null;

function recall(): CaptainRegistry {
  remembered ??= readStored(
    STORAGE_KEY,
    (raw) => {
      const value: unknown = JSON.parse(raw);
      return isRegistry(value) ? value : undefined;
    },
    EMPTY_REGISTRY,
  );
  return remembered;
}

function remember(registry: CaptainRegistry): void {
  remembered = registry;
  writeStored(STORAGE_KEY, JSON.stringify(registry));
}

export function useCaptainRegistry(): CaptainRegistry {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [registry, setRegistryState] = useState<CaptainRegistry>(recall);
  const setRegistry = useCallback((next: CaptainRegistry) => {
    remember(next);
    setRegistryState(next);
  }, []);

  const connection = useRealtimeConnectionState();
  const wasConnected = useRef(connection === "connected");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const connected = connection === "connected";
    if (connected && !wasConnected.current) setGeneration((value) => value + 1);
    wasConnected.current = connected;
  }, [connection]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = (index: number) => {
      rpcRef.current.call("captains_list", null).then(
        (next) => {
          if (alive) setRegistry(next);
        },
        () => {
          const delay = RETRIES[index];
          if (alive && delay !== undefined)
            timer = setTimeout(() => attempt(index + 1), delay);
        },
      );
    };
    attempt(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [generation, setRegistry]);

  useRealtime(REGISTRY_CHANNEL, (payload) => {
    if (isRegistry(payload)) setRegistry(payload);
  });

  return registry;
}
