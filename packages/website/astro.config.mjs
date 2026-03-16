import starlight from "@astrojs/starlight";
import icon from "astro-icon";
import { defineConfig } from "astro/config";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import starlightLinksValidator from "starlight-links-validator";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const starlightDir = path.dirname(require.resolve("@astrojs/starlight"));

// eslint-disable-next-line no-undef
const isDev = process.argv.includes("dev");

export default defineConfig({
  site: "https://www.sigmajs.org",
  vite: {
    server: { strictPort: true },
    resolve: {
      alias: [
        // Bypass Starlight's exports map so our custom Icon can import its icon data
        { find: "@astrojs/starlight/components/Icons", replacement: path.join(starlightDir, "components/Icons.ts") },
      ],
    },
    plugins: [
      {
        name: "phosphor-icon-override",
        enforce: "pre",
        resolveId(source, importer) {
          // Intercept Starlight's internal Icon imports and redirect to our custom component
          if (importer?.includes("@astrojs/starlight") && source.endsWith("user-components/Icon.astro")) {
            return path.resolve(__dirname, "src/components/StarlightIconOverride.astro");
          }
        },
      },
    ],
  },
  redirects: {
    "/docs": "/get-started/quickstart/",
    "/docs/quickstart": "/get-started/quickstart/",
    "/docs/resources": "/get-started/quickstart/",
    "/docs/advanced/coordinate-systems": "/concepts/coordinate-systems/",
    "/docs/advanced/customization": "/how-to/nodes/colors-sizes-shapes/",
    "/docs/advanced/data": "/get-started/loading-data/",
    "/docs/advanced/events": "/how-to/interactivity/events/",
    "/docs/advanced/lifecycle": "/concepts/lifecycle/",
    "/docs/advanced/layers": "/concepts/layers/",
    "/docs/advanced/migration-v2-v3": "/get-started/migration-v3-v4/",
    "/docs/advanced/renderers": "/concepts/rendering/",
    "/docs/advanced/publish": "/contributing/publish/",
  },
  integrations: [
    starlight({
      plugins: [
        starlightLinksValidator({
          exclude: ({ link }) => link.includes("/api/"),
        }),
        ...(isDev
          ? []
          : [
              starlightTypeDoc({
                entryPoints: [
                  "../sigma/src/index.ts",
                  "../sigma/src/settings.ts",
                  "../sigma/src/rendering/index.ts",
                  "../sigma/src/utils/index.ts",
                  "../layer-leaflet/src/index.ts",
                  "../layer-maplibre/src/index.ts",
                  "../layer-webgl/src/index.ts",
                  "../node-border/src/index.ts",
                  "../node-image/src/index.ts",
                  "../node-piechart/src/index.ts",
                  "../export-image/src/index.ts",
                ],
                tsconfig: "./tsconfig.typedoc.json",
                sidebar: {
                  label: "API reference",
                  collapsed: true,
                },
                typeDoc: {
                  entryFileName: "index",
                },
              }),
            ]),
      ],
      title: "sigma.js",
      tagline: "A JavaScript library aimed at visualizing graphs of thousands of nodes and edges",
      favicon: "/img/favicon-32x32.png",
      logo: {
        src: "./src/assets/logo-sigma-ruby.svg",
        alt: "sigma.js",
      },
      social: {
        github: "https://github.com/jacomyal/sigma.js",
        mastodon: "https://vis.social/@sigmajs",
      },
      head: [
        {
          tag: "script",
          content: `var _paq=window._paq=window._paq||[];_paq.push(["trackPageView"]);_paq.push(["enableLinkTracking"]);(function(){var u="https://matomo.ouestware.com/";_paq.push(["setTrackerUrl",u+"matomo.php"]);_paq.push(["setSiteId","26"]);var d=document,g=d.createElement("script"),s=d.getElementsByTagName("script")[0];g.async=true;g.src=u+"matomo.js";s.parentNode.insertBefore(g,s)})();`,
        },
      ],
      customCss: ["./src/styles/base.css", "./src/styles/custom.css"],
      sidebar: [
        {
          label: "Get started",
          items: [
            { slug: "get-started/quickstart" },
            { slug: "get-started/loading-data" },
            { slug: "get-started/migration-v3-v4" },
          ],
        },
        {
          label: "How-to guides",
          items: [
            {
              label: "Nodes",
              items: [
                { slug: "how-to/nodes/colors-sizes-shapes" },
                { slug: "how-to/nodes/images-pictograms" },
                { slug: "how-to/nodes/borders" },
                { slug: "how-to/nodes/piecharts" },
              ],
            },
            {
              label: "Edges",
              items: [{ slug: "how-to/edges/types-colors" }, { slug: "how-to/edges/labels" }],
            },
            {
              label: "Labels",
              items: [{ slug: "how-to/labels/styles-backdrops-attachments" }],
            },
            {
              label: "Interactivity",
              items: [
                { slug: "how-to/interactivity/events" },
                { slug: "how-to/interactivity/hover-search" },
                { slug: "how-to/interactivity/drag-drop" },
              ],
            },
            {
              label: "Camera & viewport",
              items: [{ slug: "how-to/camera/controls" }],
            },
            {
              label: "Performance",
              items: [{ slug: "how-to/performance/large-graphs" }],
            },
            {
              label: "Additional packages",
              items: [
                { slug: "how-to/packages/map-layers" },
                { slug: "how-to/packages/webgl-layers" },
                { slug: "how-to/packages/export-image" },
              ],
            },
            {
              label: "Technical",
              items: [{ slug: "how-to/technical/custom-sizes" }, { slug: "how-to/technical/shadow-dom" }],
            },
          ],
        },
        {
          label: "Examples",
          items: [{ slug: "examples", label: "All examples" }],
        },
        {
          label: "Concepts",
          items: [
            { slug: "concepts/styles-and-primitives" },
            { slug: "concepts/lifecycle" },
            { slug: "concepts/coordinate-systems" },
            { slug: "concepts/sizes" },
            { slug: "concepts/rendering" },
            { slug: "concepts/layers" },
          ],
        },
        {
          label: "Reference",
          items: [{ slug: "reference/settings" }, { slug: "reference/events" }, { slug: "reference/attributes" }],
        },
        ...(isDev ? [] : [typeDocSidebarGroup]),
        {
          label: "Contributing",
          items: [{ slug: "contributing/publish" }, { slug: "contributing/new-packages" }],
        },
      ],
    }),
    icon(),
  ],
});
