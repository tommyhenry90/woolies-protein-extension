import Image from "next/image";
import { ProteinBadge } from "./ProteinBadge";
import type { WooliesProduct } from "@/lib/woolies";

export function ProductCard({ product }: { product: WooliesProduct }) {
  return (
    <article className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      <div className="px-3 pt-3">
        <ProteinBadge nutrition={product.nutrition} />
      </div>
      <a
        href={product.productUrl}
        target="_blank"
        rel="noreferrer"
        className="block flex-1 group"
      >
        <div className="relative aspect-square bg-white p-4">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.displayName}
              fill
              sizes="(max-width: 768px) 50vw, 200px"
              className="object-contain"
              unoptimized
            />
          ) : (
            <div className="w-full h-full bg-gray-50 rounded" />
          )}
        </div>
        <div className="p-3 space-y-1">
          <div className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-green-700">
            {product.displayName}
          </div>
          {product.price != null && (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold">${product.price.toFixed(2)}</span>
              {product.cupString && (
                <span className="text-xs text-gray-500">{product.cupString}</span>
              )}
            </div>
          )}
        </div>
      </a>
      <div className="px-3 pb-3">
        <a
          href={product.productUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full text-center px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700"
        >
          View on Woolies →
        </a>
      </div>
    </article>
  );
}
