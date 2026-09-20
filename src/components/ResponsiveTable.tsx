import { Children, Fragment, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode, type TableHTMLAttributes } from "react";

type Markup = ReactElement<{ children?: ReactNode; colSpan?: number; rowSpan?: number; "data-label"?: string }>;

/** Inspect only supplied HTML and fragments, never execute a child component. */
function visit(children: ReactNode, callback: (node: Markup) => void) {
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    const node = child as Markup;
    if (typeof node.type !== "string" && node.type !== Fragment) return;
    callback(node);
    visit(node.props.children, callback);
  });
}

function textOf(children: ReactNode): string {
  return Children.toArray(children).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (isValidElement(child)) return textOf((child as Markup).props.children);
    return "";
  }).join("").trim();
}

function mapMarkup(children: ReactNode, transform: (node: Markup) => ReactNode): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement(child)) return child;
    const node = child as Markup;
    if (typeof node.type !== "string" && node.type !== Fragment) return child;
    return transform(cloneElement(node, {}, mapMarkup(node.props.children, transform)));
  });
}

/** Same table and data on desktop; labelled records on phones for wide tables.
 * Labels follow the rendered headers, including hidden/reordered columns and
 * group totals with colSpan. Rendering them on the server avoids a layout jump.
 */
export default function ResponsiveTable({ children, className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  const labels: string[] = [];
  let headerRows = 0;
  let spanningHeader = false;
  visit(children, node => {
    if (node.type !== "thead") return;
    visit(node.props.children, header => {
      if (header.type === "tr") headerRows++;
      if (header.type === "th") {
        labels.push(textOf(header.props.children) || "Actions");
        if ((header.props.colSpan ?? 1) > 1 || (header.props.rowSpan ?? 1) > 1) spanningHeader = true;
      }
    });
  });
  const records = labels.length > 3 && headerRows === 1 && !spanningHeader;
  const content = records ? mapMarkup(children, node => {
    if (node.type !== "tr") return node;
    let column = 0;
    const cells = mapMarkup(node.props.children, cell => {
      if (cell.type !== "td" && cell.type !== "th") return cell;
      const span = cell.props.colSpan ?? 1;
      const label = cell.props["data-label"] ?? labels[column] ?? "";
      column += span;
      if (cell.type === "th") return cell;
      return cloneElement(cell, {
        "data-label": span > 1 ? undefined : label,
        ...{ "data-wide-cell": span > 1 || /^(Name|Symbol|Coin|Company|Instrument|Asset|Description|Tags|Actions)$/i.test(label) || undefined },
      });
    });
    return cloneElement(node, {}, cells);
  }) : children;
  return createElement("table", { ...props, className: `responsive-table ${className ?? ""}`, "data-phone-records": records || undefined }, content);
}
