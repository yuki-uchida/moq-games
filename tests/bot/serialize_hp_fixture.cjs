// Exercise the real TypeScript serializer before the Python wire validator.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (module, file) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText,
    file,
  );
};
const src = path.resolve(
  __dirname,
  "../../examples/games/tower_diffence_with_jev/src",
);
const { GameEngine } = require(path.join(src, "game/GameEngine.ts"));
const { freshSave } = require(path.join(src, "progression/UpgradeSystem.ts"));
const { serializeStateForAI, FIELDS } = require(
  path.join(src, "game/model.ts"),
);
const battlefieldVersion = Number(process.argv[3] || 2);
const engine = new GameEngine(
  { decide: async () => null },
  freshSave(),
  "meadow",
  42,
  () => 0,
  undefined,
  battlefieldVersion,
  1,
);
if (
  !engine.place(
    "archer",
    battlefieldVersion === 2 ? { x: 295, y: 405 } : FIELDS.meadow.slots[0].id,
  )
)
  throw new Error("Fixture placement failed");
if (!engine.startAssault()) throw new Error("Fixture assault failed");
engine.state.units[0].hp = Number(process.argv[2]);
process.stdout.write(JSON.stringify(serializeStateForAI(engine.state)));
