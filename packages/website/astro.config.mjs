import starlight from "@astrojs/starlight";
import starlightLinksValidator from "starlight-links-validator";
import { defineConfig } from "astro/config";
// TODO: Re-enable starlight-typedoc once TypeScript errors in storybook stories are resolved.
// import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

export default defineConfig({
  site: "https://www.sigmajs.org",
  redirects: {
    "/docs": "/get-started/quickstart/",
    "/docs/": "/get-started/quickstart/",
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
      plugins: [starlightLinksValidator()],
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
      customCss: ["./src/styles/custom.css"],
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
              items: [
                { slug: "how-to/edges/types-colors" },
                { slug: "how-to/edges/labels" },
              ],
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
              items: [
                { slug: "how-to/technical/custom-sizes" },
                { slug: "how-to/technical/shadow-dom" },
              ],
            },
          ],
        },
        {
          label: "Examples",
          items: [
            { slug: "examples/bipartite-network" },
            { slug: "examples/cluster-labels" },
            { slug: "examples/layouts" },
            { slug: "examples/load-rdf" },
          ],
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
          items: [
            { slug: "reference/settings" },
            { slug: "reference/events" },
            { slug: "reference/attributes" },
            // TODO: Re-enable once TypeDoc integration is fixed
            // typeDocSidebarGroup,
          ],
        },
        {
          label: "Contributing",
          items: [{ slug: "contributing/publish" }, { slug: "contributing/new-packages" }],
        },
      ],
    }),
  ],
});
