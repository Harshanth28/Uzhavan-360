/**
 * Uzhavan 360 — Gemini Function-Calling Schema Generator
 * Level 4 Architecture Reference: Section 6, 7, 8
 *
 * Converts the 23-tool Uzhavan registry into Gemini-compatible FunctionDeclaration
 * schemas so the LLM can select and invoke tools via structured function-calling.
 *
 * CRITICAL: Gemini NEVER accesses MongoDB directly.
 * Gemini extracts intent + args → our tool gateway enforces auth → same business services.
 */

// Map Uzhavan tool names to their Gemini FunctionDeclaration schemas
export function buildGeminiFunctionDeclarations() {
  return [
    // ── Discovery & Search ────────────────────────────────────────────────────
    {
      name: 'searchProducts',
      description: 'Search nearby produce listings on the marketplace. Use when the user wants to find crops, vegetables, or farm produce near them.',
      parameters: {
        type: 'OBJECT',
        properties: {
          lat: { type: 'NUMBER', description: 'Latitude of buyer location' },
          lng: { type: 'NUMBER', description: 'Longitude of buyer location' },
          radius: { type: 'NUMBER', description: 'Search radius in kilometers. Default 25.' },
          category: { type: 'STRING', description: 'Crop category filter: LEAFY, FRUITING, TUBER, ROOT, GRAIN, CITRUS, OTHER' }
        }
      }
    },
    {
      name: 'getProductDetails',
      description: 'Get full details of a specific produce listing by its ID.',
      parameters: {
        type: 'OBJECT',
        required: ['productId'],
        properties: {
          productId: { type: 'STRING', description: 'MongoDB ID of the product listing' }
        }
      }
    },
    {
      name: 'getDemandSignals',
      description: 'Show market demand trends for a crop category or commodity in a district.',
      parameters: {
        type: 'OBJECT',
        properties: {
          category: { type: 'STRING', description: 'Crop category: LEAFY, FRUITING, TUBER, ROOT, GRAIN, CITRUS, OTHER' },
          district: { type: 'STRING', description: 'District name, default is Coimbatore' }
        }
      }
    },
    {
      name: 'searchByproducts',
      description: 'Search for available harvest byproducts (straw, bagasse, shells, stalks) from nearby farmers.',
      parameters: {
        type: 'OBJECT',
        properties: {
          lat: { type: 'NUMBER', description: 'Latitude' },
          lng: { type: 'NUMBER', description: 'Longitude' },
          category: { type: 'STRING', description: 'Byproduct category' }
        }
      }
    },

    // ── Farmer: Catalog ───────────────────────────────────────────────────────
    {
      name: 'createProduct',
      description: 'Create a new produce listing on the marketplace. FARMER ONLY. Call when farmer wants to add tomatoes, onions, etc. to sell.',
      parameters: {
        type: 'OBJECT',
        required: ['name', 'category', 'pricePerUnit', 'totalStock', 'availableStock', 'harvestDate', 'locationLat', 'locationLng'],
        properties: {
          name: { type: 'STRING', description: 'Name of the crop/produce. Can be in Tamil or English.' },
          category: { type: 'STRING', description: 'LEAFY | FLOWER | FRUITING | TUBER | ROOT | GRAIN | CITRUS | OTHER' },
          unit: { type: 'STRING', description: 'Unit: KG | GRAM | TON | LITRE | BUNCH | PIECE | BAG | BOX | CRATE. Default KG.' },
          pricePerUnit: { type: 'NUMBER', description: 'Price per unit in INR (₹)' },
          totalStock: { type: 'NUMBER', description: 'Total harvested quantity available' },
          availableStock: { type: 'NUMBER', description: 'Quantity available for buyers (same as totalStock for new listing)' },
          harvestDate: { type: 'STRING', description: 'Harvest date in ISO format (YYYY-MM-DD). Default today.' },
          locationLat: { type: 'NUMBER', description: 'Farm latitude (WGS84)' },
          locationLng: { type: 'NUMBER', description: 'Farm longitude (WGS84)' },
          description: { type: 'STRING', description: 'Optional description of the produce' }
        }
      }
    },
    {
      name: 'updateProduct',
      description: 'Update an existing produce listing. FARMER ONLY. For price updates, description changes.',
      parameters: {
        type: 'OBJECT',
        required: ['productId'],
        properties: {
          productId: { type: 'STRING', description: 'Product ID to update' },
          pricePerUnit: { type: 'NUMBER', description: 'New price per unit' },
          description: { type: 'STRING', description: 'Updated description' }
        }
      }
    },
    {
      name: 'deleteProduct',
      description: 'Delete a produce listing. FARMER ONLY. DESTRUCTIVE — requires confirmation.',
      parameters: {
        type: 'OBJECT',
        required: ['productId'],
        properties: {
          productId: { type: 'STRING', description: 'Product ID to delete' }
        }
      }
    },
    {
      name: 'getMyProducts',
      description: 'List all produce batches posted by the logged-in farmer.',
      parameters: { type: 'OBJECT', properties: {} }
    },

    // ── Farmer: Inventory ─────────────────────────────────────────────────────
    {
      name: 'addHarvest',
      description: 'Add additional harvest stock to an existing product batch. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        required: ['productId', 'quantity'],
        properties: {
          productId: { type: 'STRING', description: 'Product ID to replenish' },
          quantity: { type: 'NUMBER', description: 'Amount to add (in listed unit)' },
          reason: { type: 'STRING', description: 'Optional reason for addition' }
        }
      }
    },
    {
      name: 'recordOffPlatformSale',
      description: 'Record a direct farmgate or village market cash sale that happened outside Uzhavan 360. FARMER ONLY. DESTRUCTIVE — requires confirmation.',
      parameters: {
        type: 'OBJECT',
        required: ['productId', 'quantity'],
        properties: {
          productId: { type: 'STRING', description: 'Product ID sold externally' },
          quantity: { type: 'NUMBER', description: 'Amount sold outside platform' },
          reason: { type: 'STRING', description: 'Notes e.g. "sold at Coimbatore sandhai"' }
        }
      }
    },
    {
      name: 'getInventoryHistory',
      description: 'View the complete double-entry inventory audit ledger for a product. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        required: ['productId'],
        properties: {
          productId: { type: 'STRING', description: 'Product ID whose ledger to view' }
        }
      }
    },

    // ── Buyer: Requests ───────────────────────────────────────────────────────
    {
      name: 'submitRequest',
      description: 'Send a purchase interest request to a farmer. BUYER ONLY. Called when buyer wants to buy or inquire about a product.',
      parameters: {
        type: 'OBJECT',
        required: ['productId'],
        properties: {
          productId: { type: 'STRING', description: 'ID of the product the buyer is interested in' },
          note: { type: 'STRING', description: 'Optional message to the farmer' }
        }
      }
    },
    {
      name: 'cancelRequest',
      description: 'Cancel a pending purchase request. BUYER ONLY. DESTRUCTIVE — requires confirmation.',
      parameters: {
        type: 'OBJECT',
        required: ['requestId'],
        properties: {
          requestId: { type: 'STRING', description: 'Request ID to cancel' },
          reason: { type: 'STRING', description: 'Reason for cancellation' }
        }
      }
    },

    // ── Farmer: Requests ──────────────────────────────────────────────────────
    {
      name: 'getFarmerRequests',
      description: 'View all incoming buyer requests for the farmer\'s produce. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        properties: {
          status: { type: 'STRING', description: 'Filter by status: REQUESTED | ACCEPTED | REJECTED | CANCELLED' }
        }
      }
    },
    {
      name: 'acceptRequest',
      description: 'Accept a buyer\'s produce purchase request. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        required: ['requestId'],
        properties: {
          requestId: { type: 'STRING', description: 'Request ID to accept' }
        }
      }
    },
    {
      name: 'rejectRequest',
      description: 'Reject a buyer request with a reason. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        required: ['requestId'],
        properties: {
          requestId: { type: 'STRING', description: 'Request ID to reject' },
          reason: { type: 'STRING', description: 'Reason for rejection' }
        }
      }
    },

    // ── Orders ────────────────────────────────────────────────────────────────
    {
      name: 'confirmQuantity',
      description: 'Confirm the exact quantity to buy and atomically reserve stock. BUYER ONLY.',
      parameters: {
        type: 'OBJECT',
        required: ['requestId', 'quantity'],
        properties: {
          requestId: { type: 'STRING', description: 'Accepted request ID to confirm' },
          quantity: { type: 'NUMBER', description: 'Quantity to reserve' },
          idempotencyKey: { type: 'STRING', description: 'Optional unique key to prevent duplicate reservations' }
        }
      }
    },
    {
      name: 'getMyOrders',
      description: 'List orders for the current user (farmer sees their sales, buyer sees their purchases).',
      parameters: {
        type: 'OBJECT',
        properties: {
          status: { type: 'STRING', description: 'Filter by order status' }
        }
      }
    },
    {
      name: 'completeOrder',
      description: 'Mark an order as completed and finalize the sale in the inventory ledger. FARMER ONLY. DESTRUCTIVE — requires confirmation.',
      parameters: {
        type: 'OBJECT',
        required: ['orderId'],
        properties: {
          orderId: { type: 'STRING', description: 'Order ID to complete' },
          fulfilledQuantity: { type: 'NUMBER', description: 'Actual quantity delivered (may differ from reserved for partial fulfillment)' }
        }
      }
    },
    {
      name: 'markNoShow',
      description: 'Mark buyer as no-show and release reserved stock back to available. FARMER ONLY. DESTRUCTIVE — requires confirmation.',
      parameters: {
        type: 'OBJECT',
        required: ['orderId'],
        properties: {
          orderId: { type: 'STRING', description: 'Order ID of the no-show buyer' }
        }
      }
    },

    // ── Demand & Byproducts ───────────────────────────────────────────────────
    {
      name: 'sellMyHarvestMatch',
      description: 'Find best buyer demand opportunities matching the farmer\'s current harvest stock. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        properties: {
          district: { type: 'STRING', description: 'District to search demand signals in' }
        }
      }
    },
    {
      name: 'listByproduct',
      description: 'List a harvest byproduct (paddy straw, coconut shells, banana stalks) for sale. FARMER ONLY.',
      parameters: {
        type: 'OBJECT',
        required: ['name', 'category', 'quantity', 'unit'],
        properties: {
          name: { type: 'STRING', description: 'Name of the byproduct' },
          category: { type: 'STRING', description: 'PADDY_STRAW | COCONUT_SHELL | BANANA_STALK | BAGASSE | GROUNDNUT_SHELL | OTHER' },
          quantity: { type: 'NUMBER', description: 'Quantity available' },
          unit: { type: 'STRING', description: 'Unit: KG | TON | BUNDLE | PIECE' },
          expectedPrice: { type: 'NUMBER', description: 'Expected price per unit' }
        }
      }
    }
  ];
}

/**
 * System instructions for Gemini — defines Uzhavan's persona and behavior
 */
export function buildUzhavanSystemInstruction(user) {
  const roleContext = user?.role === 'ROLE_FARMER'
    ? 'The user is a FARMER (உழவர்). They can: create/update/delete produce listings, manage inventory, view and respond to buyer requests, complete orders, record external sales.'
    : user?.role === 'ROLE_BUYER'
      ? 'The user is a BUYER (வாங்குபவர்). They can: search marketplace, view produce, send purchase requests, confirm quantities, view orders.'
      : 'The user role is unknown. Only allow public discovery tools.';

  return `You are Uzhavan (உழவன்), the AI assistant for Uzhavan 360 — a smart agricultural marketplace connecting Tamil Nadu farmers directly with buyers.

Your personality:
- Warm, helpful, and efficient
- Deeply familiar with agricultural terminology in Tamil, English, and Tanglish
- You understand crop names in Tamil (தக்காளி = Tomato, வெங்காயம் = Onion, கீரை = Greens)
- You always protect farmer and buyer privacy

${roleContext}

Behavior rules:
1. When a user says something like "Tomato add pannunga" — ask clarifying questions (quantity, price, harvest date) before calling createProduct.
2. For DESTRUCTIVE operations (deleteProduct, completeOrder, markNoShow, recordOffPlatformSale, cancelRequest) — always confirm with the user BEFORE calling the tool.
3. If missing required fields — ask for them before calling a tool.
4. Respond in the same language as the user (Tamil/English/Tanglish).
5. Keep responses concise and action-oriented.
6. NEVER reveal internal IDs, system errors, or API keys to users.
7. Use ₹ for prices. Use kg, ton, kg etc. for quantities.

Important: You do not access databases directly. You use approved tools that go through the business logic layer.`;
}
