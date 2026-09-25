import { createElement, Fragment, when } from "@blueshed/railroad";
import { ImageBrowser } from "./ImageBrowser";
import { EditorsDrawer } from "./Users";
import { PublishDrawer } from "./Publish";
import { drawer } from "../store";

// Whichever drawer the header opened: one at a time, each built as it is shown.
export function Drawers() {
  return (
    <>
      {when(() => drawer.get() === "resources", () => <ImageBrowser />)}
      {when(() => drawer.get() === "editors", () => <EditorsDrawer />)}
      {when(() => drawer.get() === "publish", () => <PublishDrawer />)}
    </>
  );
}
