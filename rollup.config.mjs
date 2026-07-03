import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import { glob } from "glob";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const flexPlugin = "dev.sese.flexbar_claude_code_usage.plugin";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
    input: "src/plugin.ts",
    output: {
        file: `${flexPlugin}/backend/plugin.cjs`,
        format: "cjs",
        sourcemap: isWatching,
        sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
            return url.pathToFileURL(
                path.resolve(path.dirname(sourcemapPath), relativeSourcePath)
            ).href;
        },
    },
    plugins: [
        typescript(),
        json(),
        {
            name: "watch-externals",
            buildStart: function () {
                this.addWatchFile(`${flexPlugin}/manifest.json`);
                const vueFiles = glob.sync(`${flexPlugin}/ui/*.vue`);
                vueFiles.forEach((file) => {
                    this.addWatchFile(file);
                });
            },
        },
        nodeResolve({
            browser: false,
            exportConditions: ["node"],
            preferBuiltins: true,
        }),
        commonjs(),
        !isWatching && terser(),
        {
            name: "emit-module-package-file",
            generateBundle() {
                this.emitFile({
                    fileName: "package.json",
                    source: `{ "type": "module" }`,
                    type: "asset",
                });
            },
        },
    ],
    // @napi-rs/canvas ships native bindings and is pre-integrated in the
    // FlexDesigner backend runtime, so it must not be bundled.
    external: (id) => id.endsWith(".node") || id === "@napi-rs/canvas",
};

export default config;
