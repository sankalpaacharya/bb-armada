import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { ArmadaList } from "./components/armada-list";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "armada",
    title: "Armada",
    description:
      "Captain threads with their workers nested under them, every other thread in one list you can filter by project, and shelves for what you settle or snooze.",
    component: ArmadaList,
  });
});
