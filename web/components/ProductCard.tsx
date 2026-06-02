import Image from "next/image";
import { ProteinBadge } from "./ProteinBadge";
import type { WooliesProduct } from "@/lib/woolies";
import { formatPrice, pricePer100gProtein, pricePerKg } from "@/lib/pricing";

export function ProductCard({ product }: { product: WooliesProduct }) {
  const perKg = pricePerKg(product);
  const per100gP = pricePer100gProtein(product);
  return (
    <article className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-row sm:flex-col">
      {/* Image — square thumbnail on mobile, hero on larger screens */}
      <a
        href={product.productUrl}
        target="_blank"
        rel="noreferrer"
        className="group relative shrink-0 w-32 sm:w-auto bg-white p-3 sm:p-4 flex items-center justify-center sm:block"
      >
        <div className="relative w-full aspect-square">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.displayName}
              fill
              sizes="(max-width: 640px) 128px, 240px"
              className="object-contain"
              unoptimized
            />
          ) : (
            <div className="w-full h-full bg-gray-50 rounded" />
          )}
        </div>
      </a>

      {/* Body */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-3 pt-3 pb-2">
          <ProteinBadge nutrition={product.nutrition} />
        </div>
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 flex-1 block group"
        >
          <div className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-green-700">
            {product.displayName}
          </div>
          {product.price != null && (
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-lg font-semibold">${product.price.toFixed(2)}</span>
              {product.packageSize && (
                <span className="text-xs text-gray-500">{product.packageSize}</span>
              )}
            </div>
          )}
          <dl className="text-xs text-gray-600 mt-1.5 space-y-0.5">
            {perKg != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">per kg</dt>
                <dd className="font-medium">{formatPrice(perKg, { suffix: " /kg" })}</dd>
              </div>
            )}
            {per100gP != null && (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">per 100 g protein</dt>
                <dd className="font-medium text-gray-900">{formatPrice(per100gP, { suffix: "" })}</dd>
              </div>
            )}
          </dl>
        </a>
        <div className="px-3 py-3">
          <a
            href={product.productUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full text-center px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700"
          >
            View on Woolies →
          </a>
        </div>
      </div>
    </article>
  );
}
