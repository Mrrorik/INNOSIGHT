export const demoSDL = /* GraphQL */ `
  interface Node {
    id: ID!
  }
  enum OrderStatus {
    PENDING
    PAID
    SHIPPED
    DELIVERED
    CANCELLED
  }
  enum PaymentStatus {
    AUTHORIZED
    CAPTURED
    REFUNDED
    FAILED
  }
  input ProductFilter {
    search: String
    categoryId: ID
    minPrice: Float
    maxPrice: Float
  }
  input ReviewInput {
    productId: ID!
    userId: ID!
    rating: Int!
    comment: String!
  }
  input OrderInput {
    userId: ID!
    productId: ID!
    quantity: Int!
  }
  "A customer account and its commerce relationships."
  type User implements Node {
    id: ID!
    name: String!
    email: String!
    role: String!
    country: String!
    createdAt: String!
    legacyName: String @deprecated(reason: "Use name instead")
    orders: [Order!]!
    reviews: [Review!]!
    notifications: [Notification!]!
  }
  type Product implements Node {
    id: ID!
    name: String!
    description: String!
    price: Float!
    currency: String!
    sku: String!
    active: Boolean!
    legacyPrice: String @deprecated(reason: "Use price and currency")
    category: Category!
    inventory: Inventory!
    supplier: Supplier!
    reviews: [Review!]!
    averageRating: Float!
  }
  type Category implements Node {
    id: ID!
    name: String!
    slug: String!
    description: String!
    products: [Product!]!
  }
  type Order implements Node {
    id: ID!
    number: String!
    status: OrderStatus!
    total: Float!
    createdAt: String!
    user: User!
    items: [OrderItem!]!
    payment: Payment
    shipment: Shipment
  }
  type OrderItem {
    id: ID!
    quantity: Int!
    unitPrice: Float!
    subtotal: Float!
    product: Product!
  }
  type Payment implements Node {
    id: ID!
    method: String!
    amount: Float!
    currency: String!
    status: PaymentStatus!
    transactionId: String!
  }
  type Review implements Node {
    id: ID!
    rating: Int!
    comment: String!
    createdAt: String!
    author: User!
    product: Product!
  }
  type Inventory {
    available: Int!
    reserved: Int!
    warehouse: String!
    restockDate: String
    lowStock: Boolean!
  }
  type Supplier implements Node {
    id: ID!
    name: String!
    country: String!
    leadTimeDays: Int!
    rating: Float!
    products: [Product!]!
  }
  type Shipment implements Node {
    id: ID!
    carrier: String!
    trackingNumber: String!
    estimatedDelivery: String!
    delivered: Boolean!
  }
  type Notification implements Node {
    id: ID!
    title: String!
    message: String!
    read: Boolean!
    createdAt: String!
  }
  type AnalyticsSummary {
    revenue: Float!
    orderCount: Int!
    userCount: Int!
    productCount: Int!
    averageOrderValue: Float!
    conversionRate: Float!
  }
  union SearchResult = User | Product | Order
  "Local commerce API. All queries use deterministic demo fixtures."
  type Query {
    users(limit: Int = 10, offset: Int = 0): [User!]!
    user(id: ID!): User
    products(filter: ProductFilter, limit: Int = 10, offset: Int = 0): [Product!]!
    product(id: ID!): Product
    categories: [Category!]!
    orders(status: OrderStatus, limit: Int = 10, offset: Int = 0): [Order!]!
    order(id: ID!): Order
    suppliers: [Supplier!]!
    analytics: AnalyticsSummary!
    search(term: String!): [SearchResult!]!
    node(id: ID!): Node
    slowAnalytics(delayMs: Int = 700): AnalyticsSummary!
    unstablePayment: Payment
  }
  type Mutation {
    createReview(input: ReviewInput!): Review!
    createOrder(input: OrderInput!): Order!
    markNotificationRead(id: ID!): Notification!
    updateOrderStatus(id: ID!, status: OrderStatus!): Order!
  }
`;
export const candidateSDL = demoSDL
  .replace('email: String!', 'email: Int!')
  .replace('legacyPrice: String @deprecated(reason: "Use price and currency")', '')
  .replace('sku: String!', 'sku: String! barcode: String');
