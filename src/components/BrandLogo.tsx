import logo from '../assets/brand/kirimure-horizontal-light.png';

export function BrandLogo() {
  return (
    <img
      className="brand-logo"
      src={logo}
      alt="Kirimurê — Laboratório Digital Marinho"
      width={2172}
      height={724}
      decoding="async"
      draggable={false}
    />
  );
}
