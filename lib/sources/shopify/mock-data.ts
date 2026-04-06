/**
 * Deterministic storefront JSON–shaped fixtures for offline ingestion.
 */

import type { ShopifyCollectionRawPayload, ShopifyProductRawPayload } from "@/types";

export const MOCK_SHOPIFY_PRODUCTS: ShopifyProductRawPayload[] = [
  {
    id: 900_001,
    title: "Mock Wool Rug (Local)",
    handle: "mock-wool-rug-local",
    body_html: "<p>Fixture product for local development.</p>",
    vendor: "Mock Vendor",
    product_type: "Rug",
    tags: "mock,local-dev,collection:mock-collection-local",
    variants: [
      { id: 1, title: "Default", price: "199.00", available: true },
      { id: 2, title: "Large", price: "249.00", available: false },
    ],
    images: [{ id: 1, src: "https://cdn.shopify.com/static/images/example-product-1.jpg", position: 1 }],
    published_at: "2025-03-01T00:00:00Z",
  },
  {
    id: 900_002,
    title: "Mock Kilim Pillow",
    handle: "mock-kilim-pillow",
    vendor: "Mock Vendor",
    variants: [{ id: 3, title: "Default", price: "45.00", available: true }],
    images: [],
  },
];

export const MOCK_SHOPIFY_COLLECTIONS: ShopifyCollectionRawPayload[] = [
  {
    id: 800_001,
    handle: "mock-collection-local",
    title: "Mock Collection",
    description: "Local fixture collection",
    products_count: 2,
    image: { src: "https://cdn.shopify.com/static/images/example-collection-1.jpg" },
  },
];
