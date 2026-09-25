import { createElement, Fragment, when } from "@blueshed/railroad";
import { ImageBrowser } from "./ImageBrowser";
import { EditorsDrawer } from "./Users";
import { PublishDrawer } from "./Publish";
import { HelpDrawer } from "./Help";
import { drawer, leftDrawer } from "../store";

// The drawer at the left, when a pane has put something in it: a chosen
// work's properties. Built as it is shown, from what the pane handed over.
export function LeftDrawer() {
  return when(leftDrawer, () => leftDrawer.peek()!());
}

// Whichever drawer the header opened: one at a time, each built as it is shown.
export function Drawers() {
  return (
    <>
      {when(() => drawer.get() === "resources", () => <ImageBrowser />)}
      {when(() => drawer.get() === "editors", () => <EditorsDrawer />)}
      {when(() => drawer.get() === "publish", () => <PublishDrawer />)}
      {when(() => drawer.get() === "help", () => <HelpDrawer />)}
    </>
  );
}
