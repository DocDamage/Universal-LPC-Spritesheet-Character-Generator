import m from "mithril";
import { licensePrinciples, productRoadmap } from "./workflow-helpers.ts";

export const ProductInfoPanel: m.Component = {
  view() {
    return m("div.workflow-tier", [
      m("h4", "Product Trust"),
      m("div.workflow-info-grid", [
        m("article.workflow-info-card", [
          m("h5", "Roadmap"),
          m(
            "ul",
            productRoadmap.slice(0, 6).map((item) => m("li", item)),
          ),
        ]),
        m("article.workflow-info-card", [
          m("h5", "Asset Policy"),
          m(
            "ul",
            licensePrinciples.map((item) => m("li", item)),
          ),
        ]),
      ]),
    ]);
  },
};
