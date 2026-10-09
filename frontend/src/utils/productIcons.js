import {
  Box,
  CupSoda,
  GlassWater,
  Layers3,
  Package,
  PartyPopper,
  ScrollText,
  ShoppingBag,
  Soup,
  SprayCan,
  Utensils,
} from "lucide-react";

export const PRODUCT_ICON_OPTIONS = [
  { key: "Package", Icon: Package, label: "Genérico" },
  { key: "CupSoda", Icon: CupSoda, label: "Vasos" },
  { key: "GlassWater", Icon: GlassWater, label: "Copas" },
  { key: "Utensils", Icon: Utensils, label: "Cubiertos" },
  { key: "Soup", Icon: Soup, label: "Potes" },
  { key: "Layers3", Icon: Layers3, label: "Bandejas" },
  { key: "ShoppingBag", Icon: ShoppingBag, label: "Bolsas" },
  { key: "Box", Icon: Box, label: "Cajas" },
  { key: "ScrollText", Icon: ScrollText, label: "Papel" },
  { key: "PartyPopper", Icon: PartyPopper, label: "Cotillón" },
  { key: "SprayCan", Icon: SprayCan, label: "Limpieza" },
];

export const PRODUCT_ICON_MAP = Object.fromEntries(
  PRODUCT_ICON_OPTIONS.map(({ key, Icon }) => [key, Icon])
);

export function getProductIcon(icon) {
  return PRODUCT_ICON_MAP[icon] || Package;
}
