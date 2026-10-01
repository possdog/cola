// Design preview tab: the palette dropped into contemporary graphic design
// scenarios — posters, an editorial spread, album art, patterns, and a type
// specimen. Unlike Landing (which walks the ramps through one product's
// UI registers), this tab exercises the ramps as flat graphic compositions:
// large solid grounds, oversized type, and hard geometric shapes.

import { store } from "../store.js";
import { $, esc } from "../util.js";
import { hexOf } from "../swatch.js";
import { hexFor, levelFor, schemeToggle } from "./scheme.js";

export function renderDesign() {
  // Scheme-bound lookups: the page itself (background, section headings,
  // editorial spread, type specimen) is authored on its light face, and the
  // toggle complements every level so it flips dark. The finished artwork —
  // posters, album covers, duotones, pattern tiles — is not part of that
  // flip: those figures are treated as pre-rendered graphics and render
  // identically in both schemes, via the raw hexOf lookup below. lvl keeps
  // the section copy naming the levels actually on screen.
  const hex = hexFor("design");
  const lvl = (n) => levelFor("design", n);
  const chrom = store.view.colors.filter((c) => c.name !== "base");

  // Section heading, same convention as the Landing tab: each demo block
  // reads as a labeled scenario rather than a pile of unlabeled swatches.
  const sec = (title, sub) => `
    <div class="design-sec">
      <h3 style="color:${hex("base", 950)}">${title}</h3>
      <p style="color:${hex("base", 500)}">${sub}</p>
    </div>`;

  // Poster series: one Swiss-style poster per chromatic ramp. The 500 step
  // is the ground (the mid step is where a ramp's chroma peaks, so the
  // poster reads as "the hue itself"), with oversized level-50 ink and a
  // level-200 disc as the geometric accent. Posters survive the grayscale
  // filter only if the disc's level stays visibly lighter than the ground.
  // Raw hexOf: a poster is finished artwork, identical in both schemes.
  const posters = chrom.map((c, i) => `
    <figure class="design-poster" style="background:${hexOf(c.name, 500)}">
      <figcaption class="design-poster-meta" style="color:${hexOf(c.name, 100)}">
        <span>COLA STUDIO</span><span>No. ${String(i + 1).padStart(2, "0")}</span>
      </figcaption>
      <span class="design-poster-disc" style="background:${hexOf(c.name, 200)}"></span>
      <span class="design-poster-word" style="color:${hexOf("base", 50)}">${esc(c.name).toUpperCase()}</span>
      <figcaption class="design-poster-meta" style="color:${hexOf("base", 50)}">
        <span>OKLCH ${Math.round(c.swatches[5] ? c.swatches[5].h : 0)}</span><span>13 STEPS</span>
      </figcaption>
    </figure>`).join("");

  // Editorial spread: a magazine page mock on the light end. Body copy is
  // drawn as tinted bars (a wireframe convention) so the palette carries the
  // layout, not placeholder prose; the drop cap, kicker, and pull quote are
  // the three chromatic notes a spread leans on.
  // bars alternate between the 200 and 300 tints so a paragraph reads as
  // having highlight lines rather than one flat gray block.
  // The abstract "photo" plate is a stand-in for an image: like the posters
  // and covers it is finished art, rendered through raw hexOf so it keeps
  // its colors in both schemes.
  const col = () => Array.from({ length: 9 }, (_, i) =>
    `<span style="background:${hex("base", i % 5 === 4 ? 300 : 200)}"></span>`).join("");
  const spread = `
    <div class="design-mag" style="background:${hex("base", 50)}">
      <div class="design-mag-page">
        <p class="design-kicker" style="color:${hex("red", 600)}">Field Notes — Issue 07</p>
        <h2 class="design-mag-head" style="color:${hex("base", 950)}">The quiet arithmetic of color.</h2>
        <div class="design-mag-cols">
          <p class="design-mag-lede" style="color:${hex("base", 700)}"><span class="design-dropcap" style="background:${hex("cyan", 600)};color:${hex("base", 50)}">E</span>very level of a Cola palette sits at a fixed Oklab lightness. Drag a hue slider and the ramp swings around the wheel without ever wobbling in brightness — the property this spread is set in.</p>
          <div class="design-mag-text">${col()}</div>
          <div class="design-mag-text">${col()}</div>
        </div>
        <blockquote class="design-pull" style="border-color:${hex("cyan", 500)}">
          <p style="color:${hex("cyan", 800)}">"Equal lightness, thirteen steps, no muddy endpoints."</p>
        </blockquote>
        <div class="design-mag-text">${col()}</div>
        <div class="design-mag-foot" style="color:${hex("base", 400)}">cola · perceptually uniform since day one</div>
      </div>
      <div class="design-mag-page" style="background:${hex("base", 100)}">
        <span class="design-mag-photo" style="background:${hexOf("purple", 600)}">
          <span class="design-mag-shape" style="background:${hexOf("purple", 300)}"></span>
          <span class="design-mag-shape design-mag-shape2" style="background:${hexOf("yellow", 300)}"></span>
        </span>
        <div class="design-mag-text">${col()}</div>
        <div class="design-mag-text">${col()}</div>
      </div>
    </div>`;

  // Album art: the contemporary staple — a two-step gradient per ramp. The
  // 400→800 span is the ramp's expressive middle, and the CSS gradient
  // interpolates in sRGB, which is exactly what a designer would ship, so
  // the preview shows the blend honestly rather than re-deriving it.
  // Raw hexOf: cover art ships as-is, identical in both schemes.
  const covers = chrom.map((c, i) => `
    <figure class="design-cover" style="background:linear-gradient(135deg, ${hexOf(c.name, 400)} 0%, ${hexOf(c.name, 800)} 100%)">
      <figcaption class="design-cover-title" style="color:${hexOf("base", 50)}">Signal ${String(i + 1).padStart(2, "0")}</figcaption>
      <figcaption class="design-cover-artist" style="color:${hexOf(c.name, 100)}">${esc(c.name)} era</figcaption>
    </figure>`).join("");

  // Duotones: cross-hue gradients — each chromatic ramp blended into its
  // wheel neighbor at the shared 500 step. Because both stops sit at one
  // Oklab L, the blend crosses hue without crossing lightness, so under the
  // grayscale filter each tile should collapse toward a single flat gray —
  // the equal-lightness property in one glance, the inverse of the posters'
  // and usage bars' distinct-gray checks. The pair wraps cyclically so the
  // last ramp blends back into the first. Raw hexOf: like the covers, the
  // tiles are finished art and identical in both schemes.
  const duos = chrom.map((c, i) => {
    const next = chrom[(i + 1) % chrom.length].name;
    return `
    <figure class="design-cover" style="background:linear-gradient(135deg, ${hexOf(c.name, 500)} 0%, ${hexOf(next, 500)} 100%)">
      <figcaption class="design-cover-title" style="color:${hexOf("base", 50)}">${esc(c.name)} × ${esc(next)}</figcaption>
      <figcaption class="design-cover-artist" style="color:${hexOf("base", 100)}">level 500 · cross-hue</figcaption>
    </figure>`;
  }).join("");

  // Pattern tiles: flat geometric shapes (disc, half disc, quarter, bars)
  // in the 300/600 pair on a 100 ground — the Bauhaus-derived vocabulary
  // behind a lot of current packaging and web illustration. Raw hexOf:
  // packaging art, identical in both schemes.
  const tiles = chrom.map((c) => `
    <div class="design-tile" style="background:${hexOf(c.name, 100)}">
      <span class="design-tile-disc" style="background:${hexOf(c.name, 600)}"></span>
      <span class="design-tile-half" style="background:${hexOf(c.name, 300)}"></span>
      <span class="design-tile-quarter" style="background:${hexOf(c.name, 800)}"></span>
      <span class="design-tile-bars">
        <span style="background:${hexOf(c.name, 600)}"></span>
        <span style="background:${hexOf(c.name, 300)}"></span>
        <span style="background:${hexOf(c.name, 800)}"></span>
      </span>
    </div>`).join("");

  // Type specimen: one ramp's mid steps as display type on its own lightest
  // ground. The 300/600/900 trio shows how a ramp separates weight classes
  // — the light ink must hold against the dark, and the dark against the
  // light, with no re-tuning.
  const specimen = chrom.map((c) => `
    <div class="design-spec-row" style="border-color:${hex("base", 200)}">
      <span class="design-spec-aa" style="color:${hex(c.name, 600)}">Aa</span>
      <span class="design-spec-meta">
        <span style="color:${hex("base", 900)}">${esc(c.name)} ${lvl(600)}</span>
        <span style="color:${hex(c.name, 300)}">Aa ${esc(c.name)} ${lvl(300)}</span>
        <span style="color:${hex(c.name, 900)}">${esc(c.name)} ${lvl(900)} heavy</span>
      </span>
      <span class="design-spec-hex" style="color:${hex("base", 400)}">${hex(c.name, 600)}</span>
    </div>`).join("");

  $("#design-preview").innerHTML = `
    <div class="preview-tools">${schemeToggle("design")}</div>
    <div class="design-page" style="background:${hex("base", 50)}">
      ${sec("Posters", "One poster per ramp: the 500 step as ground, oversized level-50 ink, a 200-step disc. Under the grayscale filter the disc must stay visibly lighter than its ground. The posters are finished art and render identically in both schemes.")}
      <div class="design-posters">${posters}</div>
      ${sec("Editorial", `A magazine spread on the ${lvl(50) === 50 ? "light" : "dark"} end of base: red kicker, cyan drop cap and pull quote, body copy drawn as tinted bars.`)}
      ${spread}
      ${sec("Album art", "Two-step gradients (400 to 800) — the expressive middle of every ramp, blended the way CSS actually ships them. Like the posters, the covers are identical in both schemes.")}
      <div class="design-covers">${covers}</div>
      ${sec("Duotones", "Adjacent hues blended at the shared 500 step — a gradient that crosses hue but not lightness. Under the grayscale filter each tile should flatten to a single gray: the equal-lightness check in reverse. Static art, identical in both schemes.")}
      <div class="design-covers">${duos}</div>
      ${sec("Patterns", "Flat geometric shapes per ramp: the 300/600/800 trio on a 100 ground — the vocabulary behind current packaging and illustration. Static art, identical in both schemes.")}
      <div class="design-tiles">${tiles}</div>
      ${sec("Type specimen", `Display type per ramp on the ${lvl(50) === 50 ? "lightest" : "darkest"} ground: the ${lvl(300)}/${lvl(600)}/${lvl(900)} trio as weight classes that must hold without re-tuning.`)}
      <div class="design-specimen">${specimen}</div>
    </div>`;
}
