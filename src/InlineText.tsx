import { useLayoutEffect, useRef, useState } from "react";
import type { DesignNode } from "../shared/model";
import { fitText, nativeBaseline } from "./core/text-layout";
import { nodeSVG } from "./core/svg";

export function InlineText({
  node,
  commit,
}: {
  node: DesignNode;
  commit: (value: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(node.text);
  const draft = { ...node, text: value };
  if (value !== node.text) {
    draft.textLayout ??= "auto";
    fitText(draft);
  }
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);
  const offset = draft.fontSize - nativeBaseline(draft);
  return (
    <>
      <g
        aria-hidden="true"
        pointerEvents="none"
        dangerouslySetInnerHTML={{ __html: nodeSVG(draft) }}
      />
      <g
        transform={`translate(${draft.x} ${draft.y}) rotate(${draft.rotation} ${draft.width / 2} ${draft.height / 2})`}
      >
        <rect
          width={draft.width}
          height={draft.height}
          fill="none"
          stroke="#0d99ff"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <foreignObject
          x={0}
          y={offset}
          width={draft.width}
          height={Math.max(draft.height, draft.fontSize * 1.3) + 1}
          overflow="visible"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <textarea
            ref={input}
            aria-label="Текст на холсте"
            className="inline-text-input"
            value={value}
            maxLength={100000}
            spellCheck={false}
            wrap={draft.textLayout === "wrap" ? "soft" : "off"}
            style={{
              fontFamily: draft.fontFamily + ", sans-serif",
              fontSize: draft.fontSize,
              fontWeight: draft.fontWeight,
              lineHeight: draft.fontSize * 1.3 + "px",
              textAlign: draft.textAlign,
              whiteSpace: draft.textLayout === "wrap" ? "pre-wrap" : "pre",
              caretColor: draft.fill === "none" ? "#0d99ff" : draft.fill,
            }}
            onChange={(e) => setValue(e.currentTarget.value)}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (
                !e.nativeEvent.isComposing &&
                (e.key === "Escape" ||
                  (e.key === "Enter" && (e.ctrlKey || e.metaKey)))
              ) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </foreignObject>
      </g>
    </>
  );
}
