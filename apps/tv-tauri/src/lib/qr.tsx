import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** Renders `value` as a QR code (data-URL image — no network). Faithful port of tv-web `lib/qr.tsx`. */
export function Qr({ value, size = 208 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => active && setDataUrl(url))
      .catch(() => active && setDataUrl(null));
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div className="animate-pulse rounded-lg bg-zinc-800" style={{ width: size, height: size }} />;
  }
  return <img src={dataUrl} width={size} height={size} alt="Scan to sign in" className="rounded-lg" />;
}
