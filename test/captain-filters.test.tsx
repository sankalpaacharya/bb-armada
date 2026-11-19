// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

import app from "../app";
import type { CaptainRecord } from "../lib/captains";
import { project, thread } from "./fixtures";

const stored = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
  removeItem: (key: string) => void stored.delete(key),
});
beforeEach(() => stored.clear());
afterEach(() => cleanup());

const projects = [
  project("proj_a", "Alpha"),
  project("proj_b", "Beta"),
  project("proj_me", "Personal", true),
  project("empty", "Empty"),
];
const records: CaptainRecord[] = ["a", "b", "p", "quiet"].map((id) => ({
  threadId: id,
  avatar: { style: "micah", seed: id },
  createdAt: "2026-01-01T00:00:00.000Z",
}));
const threads = [
  thread("a", { title: "Captain A", projectId: "proj_a" }),
  thread("b", { title: "Captain B", projectId: "proj_b", indicator: "unread-error" }),
  thread("p", { title: "Personal captain", projectId: "proj_me", isUnread: true }),
  thread("quiet", { title: "Quiet captain", projectId: "proj_a" }),
  thread("worker", { parentThreadId: "a", hasPendingInteraction: true }),
  thread("failed-worker", { parentThreadId: "a", indicator: "unread-error" }),
  thread("loose", { title: "Loose thread", projectId: "proj_b" }),
];

async function render() {
  const loaded = await loadPluginApp(app);
  const registration = loaded.threadLists[0];
  if (registration === undefined) throw new Error("Armada list is missing");
  const view = renderSlot(
    registration,
    {
      activeThreadId: null,
      activeProjectId: "proj_a",
      isCompactViewport: false,
      onNavigate: () => {},
      searchQuery: "",
    },
    {
      sidebarThreads: { status: "ready", projects, threads, sections: [] },
      settings: { inactiveAfterHours: 0 },
      rpc: {
        captains_list: () => records,
        parks_list: () => [],
        parks_evaluate: () => ({ changed: [] }),
        captain_supervisors: () => [],
        project_logos: () => ({}),
      },
    },
  );
  await screen.findByRole("list", { name: "Captains" });
  return view;
}

const filters = () => within(screen.getByRole("group", { name: "Filter captains" }));
const captainIds = () => within(screen.getByRole("list", { name: "Captains" }))
  .getAllByRole("link")
  .map((link) => link.getAttribute("data-sidebar-thread-id"));

it("filters captains by project and restores All without changing the loose thread list", async () => {
  await render();
  expect(filters().getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "All (4)", "Alpha (2)", "Beta (1)", "Personal (1)",
  ]);
  fireEvent.click(filters().getByRole("button", { name: "Beta (1)" }));
  expect(captainIds()).toEqual(["b"]);
  expect(within(screen.getByRole("list", { name: "Threads" })).getByText("Loose thread")).toBeTruthy();
  fireEvent.click(filters().getByRole("button", { name: "All (4)" }));
  expect(captainIds()).toEqual(["a", "b", "p", "quiet"]);
});

it("remembers the selected project after reopening the sidebar", async () => {
  const view = await render();
  fireEvent.click(filters().getByRole("button", { name: "Beta (1)" }));
  view.lifecycle.unmount();
  await render();
  await waitFor(() => expect(captainIds()).toEqual(["b"]));
  expect(filters().getByRole("button", { name: "Beta (1)", pressed: true })).toBeTruthy();
});

it("falls back to All when the saved project is gone", async () => {
  localStorage.setItem("armada/captain-filter", '{"kind":"project","projectId":"gone"}');
  await render();
  expect(captainIds()).toEqual(["a", "b", "p", "quiet"]);
});
