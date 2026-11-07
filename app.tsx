import "./app.css";
import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { ArmadaList } from "./components/armada-list";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "armada",
    title: "Armada",
    description:
      "Captain threads with their workers nested under them, and every other thread grouped by project.",
    component: ArmadaList,
  });
});
