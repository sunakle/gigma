// This script only edits the temporary AI copy opened by the desktop bridge.
(function () {
  var records = [],
    serial = 0;
  function row(values) {
    records.push(values.join("\t"));
  }
  function label(s) {
    return encodeURIComponent(String(s || ""));
  }
  // Illustrator displays process gray as black ink. Its SVG exporter otherwise maps
  // 100% gray to RGB 0,0,0 even when the document profile displays a softer black.
  function screenColor(c) {
    if (!c || d.documentColorSpace !== DocumentColorSpace.RGB) return null;
    var ink;
    if (c.typename === "GrayColor") ink = [0, 0, 0, c.gray];
    else if (c.typename === "CMYKColor")
      ink = [c.cyan, c.magenta, c.yellow, c.black];
    else return null;
    var values = app.convertSampleColor(
      ImageColorSpace.CMYK,
      ink,
      ImageColorSpace.RGB,
      ColorConvertPurpose.defaultpurpose
    );
    var color = new RGBColor();
    color.red = values[0];
    color.green = values[1];
    color.blue = values[2];
    return color;
  }
  function convertPaint(path) {
    var color = path.filled && screenColor(path.fillColor);
    if (color) path.fillColor = color;
    color = path.stroked && screenColor(path.strokeColor);
    if (color) path.strokeColor = color;
  }
  function visit(obj, parent, depth) {
    if (depth > 60 || serial >= 19800)
      throw Error("Слишком много объектов или уровней вложенности.");
    var type = obj.typename,
      isLayer = type === "Layer";
    var id = "GigmaNode" + ++serial,
      name = obj.name;
    var hidden = isLayer ? !obj.visible : obj.hidden,
      locked = obj.locked;
    obj.locked = false;
    if (isLayer) obj.visible = true;
    else obj.hidden = false;
    if (type === "PlacedItem") {
      var linked;
      try {
        linked = obj.file;
      } catch (_) {}
      if (!linked || !linked.exists)
        throw Error(
          "Не найдена связанная иллюстрация: " +
            (name || (linked && linked.name) || "PlacedItem")
        );
    }
    obj.name = id;
    var b = !isLayer && obj.visibleBounds;
    var isClip =
      (type === "PathItem" && obj.clipping) ||
      (type === "CompoundPathItem" &&
        obj.pathItems.length &&
        obj.pathItems[0].clipping);
    row([
      "N",
      id,
      parent,
      isClip ? "ClippingPath" : type,
      label(name),
      hidden ? 1 : 0,
      locked ? 1 : 0,
      b ? [b[0], b[1], b[2], b[3]].join(",") : ""
    ]);
    var i, item;
    if (type === "PathItem") convertPaint(obj);
    if (type === "CompoundPathItem" && obj.pathItems.length)
      convertPaint(obj.pathItems[0]);
    if (isLayer)
      for (i = obj.layers.length - 1; i >= 0; --i)
        visit(obj.layers[i], id, depth + 1);
    if (isLayer || type === "GroupItem") {
      for (i = obj.pageItems.length - 1; i >= 0; --i) {
        item = obj.pageItems[i];
        if (
          item.parent == obj &&
          !(item.typename === "PathItem" && item.guides)
        )
          visit(item, id, depth + 1);
      }
    }
  }
  var coords = app.coordinateSystem;
  try {
    app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
    var i, board, rect;
    for (i = 0; i < d.artboards.length; i++) {
      board = d.artboards[i];
      rect = board.artboardRect;
      row([
        "B",
        label(board.name),
        [rect[0], rect[1], rect[2], rect[3]].join(",")
      ]);
    }
    for (i = d.layers.length - 1; i >= 0; --i) visit(d.layers[i], "", 1);
    for (i = 0; i < d.gradients.length; i++) {
      var stops = d.gradients[i].gradientStops;
      for (var j = 0; j < stops.length; j++) {
        var color = screenColor(stops[j].color);
        if (color) stops[j].color = color;
      }
    }
    var layer = d.layers.add();
    layer.name = "GigmaCalibration";
    rect = d.artboards[0].artboardRect;
    var mark = layer.pathItems.rectangle(rect[1], rect[0], 1, 1);
    mark.stroked = false;
    mark.filled = true;
    mark.name = "GigmaOrigin";
    var opt = new ExportOptionsSVG();
    opt.documentEncoding = SVGDocumentEncoding.UTF8;
    opt.embedRasterImages = true;
    opt.coordinatePrecision = 7;
    opt.fontType = SVGFontType.OUTLINEFONT;
    opt.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
    d.exportFile(new File(root + "/result.svg"), ExportType.SVG, opt);
    var manifest = new File(root + "/layers.tsv");
    manifest.encoding = "UTF-8";
    if (!manifest.open("w")) throw Error("Не удалось записать дерево слоёв.");
    try {
      manifest.write(records.join("\n"));
    } finally {
      manifest.close();
    }
  } finally {
    app.coordinateSystem = coords;
  }
})();
