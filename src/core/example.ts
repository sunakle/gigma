import {
  newDocument,
  newNode,
  type DesignPage,
  type Kind,
  type DesignNode,
} from "../../shared/model";
export function exampleDocument() {
  const d = newDocument("Forma · первый дизайн"),
    p = d.pages[0];
  p.name = "Дизайн";
  const make = (
    kind: Kind,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
    parent: string | null = null,
    extra: Partial<DesignNode> = {},
  ) => {
    const n = {
      ...newNode(kind, x, y, w, h),
      name,
      fill,
      parentId: parent,
      ...extra,
    };
    p.nodes.push(n);
    return n.id;
  };
  const frame = make(
    "frame",
    "Главная · Desktop",
    120,
    80,
    960,
    720,
    "#f9f8f3",
  );
  make("text", "Логотип", 160, 111, 180, 36, "#233d35", frame, {
    text: "forma®",
    fontSize: 26,
    fontWeight: "700",
  });
  make("text", "Навигация", 610, 117, 370, 24, "#626a60", frame, {
    text: "О пространстве     Проекты     Контакты",
    fontSize: 14,
  });
  make("rect", "Главный блок", 152, 181, 896, 380, "#dae3d1", frame, {
    radius: 20,
  });
  make("text", "Категория", 184, 214, 280, 20, "#526747", frame, {
    text: "МЕСТО ДЛЯ НОВЫХ ИДЕЙ",
    fontSize: 11,
    fontWeight: "600",
  });
  make("text", "Заголовок", 184, 256, 510, 150, "#233d35", frame, {
    text: "Пространство\nдля ваших идей.",
    fontSize: 43,
    fontWeight: "600",
  });
  make("text", "Описание", 184, 404, 390, 50, "#63735c", frame, {
    text: "Собирайте смыслы, пробуйте новое\nи создавайте вещи, которые важны.",
    fontSize: 15,
  });
  make("rect", "Кнопка", 184, 484, 170, 42, "#233d35", frame, { radius: 21 });
  make("text", "Текст кнопки", 202, 495, 140, 20, "#ffffff", frame, {
    text: "Начать создавать  ↗",
    fontSize: 13,
    fontWeight: "500",
  });
  make("ellipse", "Форма · тень", 761, 295, 200, 208, "#b0c39f", frame);
  make("ellipse", "Форма · свет", 727, 251, 205, 211, "#f5f7e8", frame);
  make("ellipse", "Форма · акцент", 816, 354, 104, 104, "#e6a679", frame);
  make("rect", "Плашка", 757, 452, 183, 35, "#ffffff", frame, { radius: 8 });
  make("text", "Подпись", 777, 461, 155, 20, "#46533e", frame, {
    text: "идеи растут здесь  ✳",
    fontSize: 12,
  });
  for (let i = 0; i < 3; i++) {
    const x = 152 + i * 304;
    make(
      "rect",
      "Карточка " + (i + 1),
      x,
      585,
      288,
      166,
      ["#f0e6d6", "#e2e8eb", "#e4e8dc"][i],
      frame,
      { radius: 14 },
    );
    make("text", "Номер " + (i + 1), x + 20, 604, 60, 20, "#8d9486", frame, {
      text: "0" + (i + 1),
      fontSize: 12,
    });
    make(
      "text",
      "Название " + (i + 1),
      x + 20,
      643,
      247,
      29,
      "#34483b",
      frame,
      {
        text: ["Меньше шума.", "Больше смысла.", "Ближе к своему."][i],
        fontSize: 22,
        fontWeight: "500",
      },
    );
    make("text", "Описание карточки", x + 20, 692, 235, 20, "#7c8274", frame, {
      text: [
        "Начните с чистого листа",
        "Позвольте идее раскрыться",
        "Сохраните свой результат",
      ][i],
      fontSize: 12,
    });
  }
  const mobile = make(
    "frame",
    "Мобильная версия",
    1180,
    80,
    360,
    720,
    "#f9f8f3",
  );
  make("text", "Логотип mobile", 1204, 107, 240, 34, "#233d35", mobile, {
    text: "forma®",
    fontSize: 25,
    fontWeight: "700",
  });
  make("rect", "Hero mobile", 1200, 170, 320, 502, "#dae3d1", mobile, {
    radius: 18,
  });
  make("text", "Заголовок mobile", 1220, 201, 280, 136, "#233d35", mobile, {
    text: "Ваши идеи.\nВаша форма.",
    fontSize: 37,
    fontWeight: "600",
  });
  make("ellipse", "Фигура mobile", 1240, 366, 210, 210, "#f5f7e8", mobile);
  make("ellipse", "Акцент mobile", 1350, 470, 102, 102, "#e6a679", mobile);
  make("rect", "Кнопка mobile", 1220, 605, 280, 42, "#233d35", mobile, {
    radius: 21,
  });
  make("text", "Начать mobile", 1290, 616, 180, 22, "#ffffff", mobile, {
    text: "Начать создавать  ↗",
    fontSize: 13,
  });
  for (const n of p.nodes)
    if (n.name === "Кнопка" || n.name === "Текст кнопки") n.linkTo = mobile;
  p.view = { x: 40, y: 100, zoom: 0.57 };
  return d;
}
