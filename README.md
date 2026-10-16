# SIED editor bridge

Source code of the changes SIED makes to the document editor it serves.

The editor is [ranuts/document](https://github.com/ranuts/document) (the ONLYOFFICE
editors running in the browser, version 9.3.0.133), taken unmodified. SIED adds a set
of scripts, the **bridge**, to the editor page. They run next to the engine and talk to
it only through the messages it already exchanges and its public automation interface.
The bridge is generic: it knows nothing about what the text means. The host application
tells it which text ranges to highlight and which labels to put in the margin; the bridge
draws them, forwards keyboard events, reads and writes text, and adds menus, a button for a
host panel in the left bar, a home button and a shortened About pane.

This is not an official ONLYOFFICE product and is not affiliated with Ascensio System SIA.
ONLYOFFICE is a trademark of Ascensio System SIA.

## Licence

GNU Affero General Public License, version 3 (`LICENSE`), the same licence as the
engine. This repository is the corresponding source of the SIED changes. The engine's own
copyright and attribution notices are in its `NOTICE` file.

## What is here

| Path | What |
|---|---|
| `bridge/` | The scripts that run on the editor page (one module per feature). |
| `bridge/icones/` | Icons for the menu buttons. |
| `motor/` | Which version of the engine this runs on (`BASE.md`) and the few files of it that differ from the original (`NOTICE`, `bin/vercel-postbuild.mjs`). |
| `vite.config.ts` | Development: the engine's own Vite config plus the bridge. |
| `depois-do-build.mjs` | After the engine's build: copies `bridge/` into `dist/` and adds the script tag to `dist/editor.html`. |
| `LEIA-ME.md` | Notes on the bridge, in Portuguese. |

## Build

Get `ranuts/document` (the engine), then from its folder:

```
pnpm install --frozen-lockfile
pnpm build && node bin/vercel-postbuild.mjs dist && node ../editor-v3-bridge/depois-do-build.mjs dist
```

For development, `pnpm exec vite --host --port 5180 --configLoader native --config ../editor-v3-bridge/vite.config.ts`.
