import Image from "next/image";

type BrandMarkProps = {
  size?: number;
};

export function BrandMark({ size = 40 }: BrandMarkProps) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="brand-mark-image"
      draggable={false}
      height={size}
      src="/brand/loophole-mark.png"
      width={size}
    />
  );
}
