import FifthEdition from "../system/fifth-edition.js"

export default function () {
  Hooks.on("setup", () => {
    FifthEdition.registerContentModules();
  });
}
