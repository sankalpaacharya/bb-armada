import "./app.css";
import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { ArmadaList } from "./components/armada-list";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "armada",
    title: "Armada",
    description:
      "Captain threads on top, every thread once in one list you can filter by project with its captain's face, and shelves for what you settle or snooze.",
    component: ArmadaList,
  });
});
