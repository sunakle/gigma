// ExtendScript. Only the temporary native document and our public PDF copy are edited.
function recoverIllustratorLinks(doc, root, pixels) {
  var placed = doc.placedItems,
    missing = [],
    groups = [],
    spatial = {};
  var result = { restored: 0, unavailable: 0 },
    i;
  function linked(item) {
    try {
      return item.file && item.file.exists;
    } catch (_) {
      return false;
    }
  }
  for (i = 0; i < placed.length; i++)
    if (!linked(placed[i])) missing.push(placed[i]);
  if (!missing.length) return result;
  if (!new File(root + "/links.ready").exists) {
    var signal = new File(root + "/links.request");
    if (!signal.open("w"))
      throw Error("Не удалось начать восстановление связей.");
    signal.close();
    return null;
  }

  // Native and PDF bounds can differ by a fraction of a point after serialization.
  var tolerance = 0.02;
  function findGroup(b) {
    var key = Math.floor(b[0]),
      j,
      k,
      near,
      g,
      r;
    for (k = key - 1; k <= key + 1; k++) {
      near = spatial["x" + k] || [];
      for (j = 0; j < near.length; j++) {
        g = near[j];
        r = g.box;
        if (
          Math.abs(r[0] - b[0]) <= tolerance &&
          Math.abs(r[1] - b[1]) <= tolerance &&
          Math.abs(r[2] - b[2]) <= tolerance &&
          Math.abs(r[3] - b[3]) <= tolerance
        )
          return g;
      }
    }
    return null;
  }
  function register(item, absent) {
    var b = item.geometricBounds,
      group = findGroup(b);
    if (!group) {
      group = {
        box: b,
        entries: [],
        needed: 0,
        done: false,
        mixed: false,
        kind: item.typename
      };
      var key = "x" + Math.floor(b[0]);
      if (!spatial[key]) spatial[key] = [];
      spatial[key].push(group);
      groups.push(group);
    }
    group.entries.push({ item: item, absent: absent });
    if (absent) group.needed++;
    if (item.typename !== group.kind) group.mixed = true;
  }
  // Keep the top-to-bottom paint order, including intact links. Coincident images
  // may have identical geometry but entirely different pixels.
  for (i = 0; i < placed.length; i++) register(placed[i], !linked(placed[i]));
  for (i = 0; i < doc.rasterItems.length; i++)
    register(doc.rasterItems[i], false);

  function replace(target, raster) {
    var box = target.geometricBounds,
      name = target.name,
      locked = target.locked,
      hidden = target.hidden;
    var ancestors = [],
      p = target.parent,
      created = null,
      finished = false;
    while (p && p.typename !== "Document") {
      ancestors.push({
        node: p,
        locked: p.locked,
        hidden: p.typename === "Layer" ? !p.visible : p.hidden
      });
      p = p.parent;
    }
    function state(a, lock, hide) {
      a.locked = false;
      if (a.typename === "Layer") a.visible = !hide;
      else a.hidden = hide;
      a.locked = lock;
    }
    try {
      for (var k = ancestors.length - 1; k >= 0; k--)
        state(ancestors[k].node, false, false);
      state(target, false, false);
      if (raster) {
        // Cross-document duplication requires a container. Restore the exact stacking
        // position only after the embedded raster belongs to the native document.
        created = raster.duplicate(
          target.parent,
          ElementPlacement.PLACEATBEGINNING
        );
        doc.activate();
        created.move(target, ElementPlacement.PLACEBEFORE);
        created.position = [box[0], box[1]];
        created.opacity = target.opacity;
        created.blendingMode = target.blendingMode;
        created.name = name || "Изображение";
      } else {
        created = target.parent.pathItems.rectangle(
          box[1],
          box[0],
          Math.max(1, box[2] - box[0]),
          Math.max(1, box[1] - box[3])
        );
        created.move(target, ElementPlacement.PLACEBEFORE);
        var outline = new RGBColor();
        outline.red = 224;
        outline.green = 132;
        outline.blue = 48;
        created.filled = false;
        created.stroked = true;
        created.strokeColor = outline;
        created.strokeWidth = 1;
        created.name = "Нет связанного файла" + (name ? " — " + name : "");
      }
      state(created, locked, hidden);
      target.remove();
      finished = true;
      return created;
    } finally {
      if (!finished) {
        if (created) {
          created.locked = false;
          created.remove();
        }
        state(target, locked, hidden);
      }
      for (var a = 0; a < ancestors.length; a++)
        state(ancestors[a].node, ancestors[a].locked, ancestors[a].hidden);
    }
  }
  var pdf = new File(root + "/recovery.pdf");
  if (pdf.exists) {
    var prefs = app.preferences.PDFFileOptions,
      oldPage = prefs.pageToOpen,
      oldBox = prefs.pDFCropToBox;
    try {
      prefs.pDFCropToBox = PDFBoxType.PDFTRIMBOX;
      for (
        var board = 0;
        board < doc.artboards.length && result.restored < missing.length;
        board++
      ) {
        var nativeBox = doc.artboards[board].artboardRect,
          needed = false;
        for (i = 0; i < groups.length; i++) {
          var g = groups[i],
            r = g.box;
          g.candidates = [];
          if (
            g.needed &&
            !g.done &&
            r[0] < nativeBox[2] &&
            r[2] > nativeBox[0] &&
            r[1] > nativeBox[3] &&
            r[3] < nativeBox[1]
          )
            needed = true;
        }
        if (!needed) continue;
        var page = null;
        try {
          prefs.pageToOpen = board + 1;
          page = app.open(pdf, DocumentColorSpace.RGB);
          var paper = page.artboards[0].artboardRect,
            dx = nativeBox[0] - paper[0],
            dy = nativeBox[1] - paper[1];
          for (var j = 0; j < page.rasterItems.length; j++) {
            var image = page.rasterItems[j],
              b = image.geometricBounds;
            var match = findGroup([b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]);
            if (match && match.needed && !match.done)
              match.candidates.push(image);
          }
          for (i = 0; i < groups.length; i++) {
            var group = groups[i];
            if (
              !group.needed ||
              group.done ||
              group.mixed ||
              group.entries.length !== group.candidates.length
            )
              continue;
            for (var t = 0; t < group.entries.length; t++) {
              var entry = group.entries[t];
              if (entry.absent) {
                try {
                  var source = group.candidates[t];
                  var destination = replace(entry.item, source);
                  entry.absent = false;
                  result.restored++;
                  cachePixels(source, destination, pixels);
                } catch (_) {
                  /* Other matched images can still be restored. */
                }
              }
            }
            group.done = true;
          }
        } catch (_) {
          /* The next artboard may contain a usable copy. */
        } finally {
          if (page) page.close(SaveOptions.DONOTSAVECHANGES);
          doc.activate();
        }
      }
    } finally {
      prefs.pageToOpen = oldPage;
      prefs.pDFCropToBox = oldBox;
    }
  }
  for (i = 0; i < groups.length; i++) {
    var entries = groups[i].entries;
    for (var j = 0; j < entries.length; j++)
      if (entries[j].absent) {
        replace(entries[j].item, null);
        result.unavailable++;
      }
  }
  return result;
}

// Keep an unscaled RGB copy directly from the PDF. Passing it through a CMYK
// document first would round the color channels, even if the later export is RGB.
function cachePixels(source, destination, pixels) {
  if (!pixels.doc)
    pixels.doc = app.documents.add(DocumentColorSpace.RGB, 1000, 1000);
  var scratch = pixels.doc;
  var copy = source.duplicate(scratch.layers[0], ElementPlacement.PLACEATEND);
  scratch.activate();
  copy.locked = false;
  copy.hidden = false;
  copy.opacity = 100;
  copy.matrix = app.getIdentityMatrix();
  var board = scratch.artboards[0].artboardRect;
  copy.position = [Math.round(board[0]), Math.round(board[1])];
  pixels.pairs.push({ source: copy, destination: destination });
}
function exportRecoveredPixels(root, pixels, options) {
  if (!pixels.pairs.length) return;
  pixels.doc.activate();
  for (var i = 0; i < pixels.pairs.length; i++)
    pixels.pairs[i].source.name = pixels.pairs[i].destination.name;
  pixels.doc.exportFile(
    new File(root + "/pixels.svg"),
    ExportType.SVG,
    options
  );
}
