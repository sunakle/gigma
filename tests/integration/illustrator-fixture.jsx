// Create a native AI file in the caller's isolated fixture directory.
(function () {
  var folder = File($.fileName).parent;
  var doc = app.documents.add(DocumentColorSpace.RGB, 360, 240);
  var old = app.userInteractionLevel;
  try {
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    var bottom = doc.layers[0];
    bottom.name = "Земля";
    var ink = new RGBColor();
    ink.red = 24;
    ink.green = 127;
    ink.blue = 63;
    var curve = bottom.pathItems.add();
    curve.setEntirePath([
      [20, 170],
      [130, 200],
      [180, 110]
    ]);
    curve.pathPoints[1].leftDirection = [90, 150];
    curve.pathPoints[1].rightDirection = [160, 220];
    curve.closed = true;
    curve.stroked = false;
    curve.fillColor = ink;
    curve.name = "Кривая";
    var upper = doc.layers.add();
    upper.name = "Лес";
    var sub = upper.layers.add();
    sub.name = "Детали";
    var group = sub.groupItems.add();
    group.name = "Дерево";
    var shape = group.pathItems.ellipse(200, 125, 92, 70);
    shape.fillColor = ink;
    shape.stroked = false;
    shape.name = "Крона";
    var picture = group.placedItems.add();
    picture.file = new File(folder + "/pixels.png");
    picture.position = [150, 160];
    picture.embed();
    var hidden = upper.layers.add();
    hidden.name = "Скрытый";
    var rect = hidden.pathItems.rectangle(225, 300, 30, 30);
    rect.fillColor = ink;
    rect.stroked = false;
    rect.name = "Секрет";
    doc.activeLayer = bottom;
    var empty = bottom.layers.add();
    empty.name = "Заметки";
    doc.activeLayer = bottom;
    var grad = doc.gradients.add();
    grad.type = GradientType.LINEAR;
    grad.gradientStops[0].color = ink;
    var gradientPaint = new GradientColor();
    gradientPaint.gradient = grad;
    var slope = bottom.pathItems.rectangle(70, 25, 120, 24);
    slope.name = "Градиент";
    slope.fillColor = gradientPaint;
    slope.stroked = false;
    var clipping = bottom.groupItems.add();
    clipping.name = "Фото в рамке";
    var linked = clipping.placedItems.add();
    linked.file = new File(folder + "/pixels.png");
    linked.name = "Связанное фото";
    linked.width = 52;
    linked.height = 52;
    linked.position = [216, 192];
    var mask = clipping.pathItems.ellipse(185, 218, 35, 35);
    mask.stroked = false;
    mask.filled = false;
    mask.clipping = true;
    clipping.clipped = true;
    hidden.visible = false;
    hidden.locked = true;
    doc.artboards[0].name = "Первая";
    doc.artboards.add([400, 240, 760, 0]).name = "Вторая";
    var last = bottom.pathItems.rectangle(190, 490, 20, 30);
    last.name = "Дальний";
    last.fillColor = ink;
    last.stroked = false;
    // One link has a public rendition on artboard two. The pasteboard link has none.
    var savedLink = bottom.placedItems.add();
    savedLink.file = new File(folder + "/detachable.png");
    savedLink.name = "Архивное фото";
    savedLink.width = 11.7;
    savedLink.height = 11.7;
    savedLink.position = [540.3, 130.7];
    var offBoard = bottom.placedItems.add();
    offBoard.file = new File(folder + "/detachable.png");
    offBoard.name = "Вне областей";
    offBoard.position = [900, 130];
    var opts = new IllustratorSaveOptions();
    opts.pdfCompatible = true;
    doc.artboards.setActiveArtboardIndex(0);
    doc.saveAs(new File(folder + "/forest.ai"), opts);
    var png = new ExportOptionsPNG24();
    png.artBoardClipping = true;
    png.transparency = true;
    png.horizontalScale = 200;
    png.verticalScale = 200;
    doc.exportFile(new File(folder + "/reference.png"), ExportType.PNG24, png);
  } catch (error) {
    var log = new File(folder + "/fixture-error.txt");
    log.open("w");
    log.write(error.line + " " + error);
    log.close();
    throw error;
  } finally {
    doc.close(SaveOptions.DONOTSAVECHANGES);
    app.userInteractionLevel = old;
  }
})();
