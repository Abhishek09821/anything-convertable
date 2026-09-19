import Image from "next/image";
import brandIcon from "../icon.png";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Image src={brandIcon} alt="" sizes="38px" />
    </span>
  );
}
