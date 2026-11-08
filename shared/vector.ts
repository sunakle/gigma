// A document can contain Illustrator artwork. Store only passive SVG drawing primitives.
import { z } from "zod";
export const vectorTags =
  "g svg defs path rect ellipse circle polygon polyline line image use symbol linearGradient radialGradient stop pattern clipPath mask filter feGaussianBlur feOffset feColorMatrix feBlend feComposite feFlood feMerge feMergeNode feComponentTransfer feFuncR feFuncG feFuncB feFuncA feImage feTurbulence feDisplacementMap marker".split(
    " ",
  );
const attributes = new Set(
  "id x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height d points transform viewBox preserveAspectRatio opacity fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset clip-path clip-rule mask filter color display visibility color-interpolation color-interpolation-filters color-rendering shape-rendering image-rendering vector-effect gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits filterUnits primitiveUnits href in in2 result stdDeviation dx dy values type operator mode flood-color flood-opacity k1 k2 k3 k4 slope intercept amplitude exponent tableValues baseFrequency numOctaves seed scale xChannelSelector yChannelSelector marker-start marker-mid marker-end markerUnits markerWidth markerHeight refX refY orient overflow enable-background".split(
    " ",
  ),
);
const reference = /^#[A-Za-z_][\w.:-]*$/;
const raster = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export function allowedAttribute(key: string, value: string) {
  if (key === "style")
    return /^(?:(?:mix-blend-mode:(?:normal|multiply|screen|overlay|darken|lighten|difference|soft-light|hard-light|color-dodge|color-burn|exclusion|hue|saturation|color|luminosity)|isolation:isolate);?)+$/.test(
      value,
    );
  if (!attributes.has(key)) return false;
  if (key === "href") return reference.test(value) || raster.test(value);
  if (key === "id") return reference.test("#" + value);
  // Permit local paint servers, masks and clips only. Unquoted plain SVG values suffice.
  if (/url\s*\(/i.test(value))
    return /^url\(#[\w.:-]+\)(?:\s+(?:none|#[0-9a-f]+))?$/i.test(value);
  return /^[\w\s#.,+%():-]*$/.test(value) && !/\/|\\|:.*\(/.test(value);
}
export type VectorElement = {
  tag: string;
  attrs: Record<string, string>;
  children: VectorElement[];
};
const element: z.ZodType<VectorElement> = z.lazy(() =>
  z.object({
    tag: z.string().refine((t) => vectorTags.includes(t)),
    attrs: z
      .record(z.string(), z.string())
      .refine((a) =>
        Object.entries(a).every(([k, v]) => allowedAttribute(k, v)),
      ),
    children: z.array(element),
  }),
);
export const artworkSchema = z.object({
  editablePaint: z.boolean().optional(),
  box: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().positive(),
    z.number().positive(),
  ]),
  elements: z.array(element).min(1),
});
export type Artwork = z.infer<typeof artworkSchema>;
export function vectorXML(item: VectorElement, prefix: string): string {
  const attrs = Object.entries(item.attrs)
    .map(([k, raw]) => {
      let v = raw;
      if (k === "id") v = prefix + v;
      else if (k === "href" && v.startsWith("#")) v = "#" + prefix + v.slice(1);
      else if (v.startsWith("url(#")) v = "url(#" + prefix + v.slice(5);
      const key = k === "href" ? "xlink:href" : k;
      return (
        " " +
        key +
        '="' +
        v
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;")
          .replaceAll("<", "&lt;") +
        '"'
      );
    })
    .join("");
  return (
    "<" +
    item.tag +
    attrs +
    ">" +
    item.children.map((c) => vectorXML(c, prefix)).join("") +
    "</" +
    item.tag +
    ">"
  );
}
