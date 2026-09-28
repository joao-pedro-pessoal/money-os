"use client";

import qrcode from "qrcode-generator";

/**
 * A QR code as an SVG path, drawn in the page — no image, no third party.
 *
 * Always black on white whatever the theme: phone cameras read dark modules on
 * a light ground, and an inverted code is one some of them refuse. The four
 * modules of white around it are the quiet zone the standard asks for.
 */
export default function QrCode({ text, size = 240, label }: { text: string; size?: number; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  const span = count + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      style={{ background: "#ffffff", borderRadius: 8, maxWidth: "100%", height: "auto" }}
    >
      <rect width={span} height={span} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
