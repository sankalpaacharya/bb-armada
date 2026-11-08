import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { ArmadaList } from "./components/armada-list";
import { CrewTab } from "./components/crew-tab";
import { StepsTab } from "./components/steps-tab";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "armada",
    title: "Armada",
    description:
      "Captain threads on top, every thread once in one list you can filter by project with its captain's face, and shelves for what you settle or snooze.",
    component: ArmadaList,
  });
  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "action",
    id: "crew",
    title: "Crew",
    tooltip: "A captain's workers",
    icon: "Layers",
    layout: "flush",
    component: CrewTab,
  });
  app.slots.experimental_tab({
    context: { kind: "thread" },
    availability: "action",
    id: "steps",
    title: "Steps",
    tooltip: "Where this thread's time went",
    icon: "Clock",
    layout: "flush",
    component: StepsTab,
  });
});
