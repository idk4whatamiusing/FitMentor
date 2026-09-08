import type { ElementType } from "react";

export function SplitReveal({
  as: Tag = "span",
  children,
  className,
}: {
  as?: ElementType;
  children: string;
  className?: string;
}) {
  const words = children.split(" ");
  return (
    <Tag data-abyss-words className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden">
          <span className="inline-block">
            {word}
            {i < words.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </Tag>
  );
}
