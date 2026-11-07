import { describe, expect, it } from "vitest";

import { avatarFromSeed } from "../lib/captains";
import { captainIdOf, crewOf } from "../lib/crew";
import { buildArmada } from "../lib/model";
import { NOW, project, settledAt, thread } from "./fixtures";

const record = (id: string) => ({
  threadId: id,
  avatar: avatarFromSeed(id),
  createdAt: "2026-01-01T00:00:00.000Z",
});

const threads = [
  thread("cap", { title: "cops" }),
  thread("busy", { parentThreadId: "cap", status: "active" }),
  thread("done", { parentThreadId: "cap" }),
  thread("old", { parentThreadId: "cap", updatedAt: NOW - 30 * 3_600_000, createdAt: NOW - 30 * 3_600_000 }),
  thread("sub", { parentThreadId: "busy" }),
  thread("solo"),
  thread("other", { title: "personal" }),
  thread("theirs", { parentThreadId: "other" }),
];

const model = buildArmada(
  threads,
  [project("proj_a", "Alpha")],
  [record("cap"), record("other")],
  [settledAt("done", NOW - 1000)],
  NOW,
  6 * 3_600_000,
);

describe("a thread's captain", () => {
  it("is the thread itself, its parent, or a captain further up", () => {
    expect(captainIdOf(model, threads, "cap")).toBe("cap");
    expect(captainIdOf(model, threads, "busy")).toBe("cap");
    expect(captainIdOf(model, threads, "sub")).toBe("cap");
    expect(captainIdOf(model, threads, "theirs")).toBe("other");
  });

  it("is missing for a thread no captain launched, or one that is gone", () => {
    expect(captainIdOf(model, threads, "solo")).toBeNull();
    expect(captainIdOf(model, threads, "nope")).toBeNull();
  });
});

describe("a captain's crew", () => {
  it("splits its own workers into active, inactive and settled, leaving out other captains' threads", () => {
    const crew = crewOf(model, "cap")!;
    expect(crew.captain.thread.id).toBe("cap");
    expect(crew.active.map((entry) => entry.thread.id)).toEqual(["busy"]);
    expect(crew.inactive.map((entry) => entry.thread.id)).toEqual(["old"]);
    expect(crew.parked.map((entry) => entry.thread.id)).toEqual(["done"]);
  });

  it("is null for a thread that is not a captain", () => {
    expect(crewOf(model, "solo")).toBeNull();
  });
});
