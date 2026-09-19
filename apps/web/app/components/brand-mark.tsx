import Image from "next/image";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image src="/icon.png" alt="" width={38} height={38} unoptimized />
    </span>
  );
}
