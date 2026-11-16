import { createServer } from 'node:http';
import { createSchema, createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { randomUUID } from 'node:crypto';
import { demoSDL } from './schema.js';
import { createData } from './data.js';
export function makeDemoServer() {
  let db = createData();
  const page = <T>(items: T[], { limit = 10, offset = 0 }: { limit?: number; offset?: number }) => {
    if (limit < 0 || limit > 100 || offset < 0)
      throw new GraphQLError('Pagination requires 0 ≤ limit ≤ 100 and offset ≥ 0', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    return items.slice(offset, offset + limit);
  };
  const summary = () => {
    const paid = db.orders.filter(
      (o) => o.status === 'PAID' || o.status === 'DELIVERED' || o.status === 'SHIPPED',
    );
    const revenue = paid.reduce((s, o) => s + o.total, 0);
    return {
      revenue,
      orderCount: db.orders.length,
      userCount: db.users.length,
      productCount: db.products.length,
      averageOrderValue: paid.length ? revenue / paid.length : 0,
      conversionRate: db.users.length ? paid.length / db.users.length : 0,
    };
  };
  const resolvers = {
    Query: {
      users: (_: unknown, args: any) => page(db.users, args),
      user: (_: unknown, { id }: any) => db.users.find((u) => u.id === id),
      products: (_: unknown, args: any) => {
        const f = args.filter || {};
        return page(
          db.products.filter(
            (p) =>
              (!f.search || p.name.toLowerCase().includes(f.search.toLowerCase())) &&
              (!f.categoryId || p.categoryId === f.categoryId) &&
              (f.minPrice == null || p.price >= f.minPrice) &&
              (f.maxPrice == null || p.price <= f.maxPrice),
          ),
          args,
        );
      },
      product: (_: unknown, { id }: any) => db.products.find((p) => p.id === id),
      categories: () => db.categories,
      orders: (_: unknown, args: any) =>
        page(
          db.orders.filter((o) => !args.status || o.status === args.status),
          args,
        ),
      order: (_: unknown, { id }: any) => db.orders.find((o) => o.id === id),
      suppliers: () => db.suppliers,
      analytics: summary,
      slowAnalytics: async (_: unknown, { delayMs }: any) => {
        await new Promise((r) => setTimeout(r, Math.min(2000, Math.max(0, delayMs))));
        return summary();
      },
      unstablePayment: () => {
        throw new GraphQLError('Controlled demo incident: payment provider unavailable', {
          extensions: { code: 'PAYMENT_PROVIDER_UNAVAILABLE' },
        });
      },
      search: (_: unknown, { term }: any) => [
        ...db.users
          .filter((u) => u.name.toLowerCase().includes(term.toLowerCase()))
          .map((u) => ({ ...u, __typename: 'User' })),
        ...db.products
          .filter((p) => p.name.toLowerCase().includes(term.toLowerCase()))
          .map((p) => ({ ...p, __typename: 'Product' })),
        ...db.orders.filter((o) => o.number.includes(term)).map((o) => ({ ...o, __typename: 'Order' })),
      ],
      node: (_: unknown, { id }: any) => {
        const groups = [
          ['User', db.users],
          ['Product', db.products],
          ['Order', db.orders],
        ] as const;
        for (const [__typename, items] of groups) {
          const item = items.find((i) => i.id === id);
          if (item) return { ...item, __typename };
        }
        return null;
      },
    },
    User: {
      legacyName: (u: any) => u.name,
      orders: (u: any) => db.orders.filter((o) => o.userId === u.id),
      reviews: (u: any) => db.reviews.filter((r) => r.userId === u.id),
      notifications: (u: any) => db.notifications.filter((n) => n.userId === u.id),
    },
    Product: {
      legacyPrice: (p: any) => `${p.price} ${p.currency}`,
      category: (p: any) => db.categories.find((c) => c.id === p.categoryId),
      supplier: (p: any) => db.suppliers.find((s) => s.id === p.supplierId),
      reviews: (p: any) => db.reviews.filter((r) => r.productId === p.id),
      averageRating: (p: any) => {
        const reviews = db.reviews.filter((r) => r.productId === p.id);
        return reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
      },
    },
    Category: { products: (c: any) => db.products.filter((p) => p.categoryId === c.id) },
    Supplier: { products: (s: any) => db.products.filter((p) => p.supplierId === s.id) },
    Order: {
      user: (o: any) => db.users.find((u) => u.id === o.userId),
      payment: (o: any) => db.payments.find((p) => p.id === o.paymentId),
      shipment: (o: any) => db.shipments.find((s) => s.id === o.shipmentId),
    },
    OrderItem: {
      product: (i: any) => db.products.find((p) => p.id === i.productId),
      subtotal: (i: any) => i.quantity * i.unitPrice,
    },
    Review: {
      author: (r: any) => db.users.find((u) => u.id === r.userId),
      product: (r: any) => db.products.find((p) => p.id === r.productId),
    },
    Mutation: {
      markNotificationRead: (_: unknown, { id }: any) => {
        const n = db.notifications.find((n) => n.id === id);
        if (!n) throw new GraphQLError('Notification not found');
        n.read = true;
        return n;
      },
      updateOrderStatus: (_: unknown, { id, status }: any) => {
        const order = db.orders.find((o) => o.id === id);
        if (!order) throw new GraphQLError('Order not found');
        order.status = status;
        return order;
      },
      createReview: (_: unknown, { input }: any) => {
        if (
          !db.users.some((u) => u.id === input.userId) ||
          !db.products.some((p) => p.id === input.productId) ||
          input.rating < 1 ||
          input.rating > 5 ||
          input.comment.length > 2000
        )
          throw new GraphQLError('Invalid review input');
        const review = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
        db.reviews.push(review);
        return review;
      },
      createOrder: (_: unknown, { input }: any) => {
        const p = db.products.find((p) => p.id === input.productId);
        if (
          !p ||
          !db.users.some((u) => u.id === input.userId) ||
          !Number.isInteger(input.quantity) ||
          input.quantity < 1 ||
          input.quantity > 100
        )
          throw new GraphQLError('Invalid order input');
        const order = {
          id: randomUUID(),
          number: `IS-${1001 + db.orders.length}`,
          status: 'PENDING',
          total: p.price * input.quantity,
          createdAt: new Date().toISOString(),
          userId: input.userId,
          items: [{ id: randomUUID(), productId: p.id, quantity: input.quantity, unitPrice: p.price }],
          paymentId: null,
          shipmentId: null,
        };
        db.orders.push(order);
        return order;
      },
    },
  };
  const yoga = createYoga({
    schema: createSchema({ typeDefs: demoSDL, resolvers }),
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    logging: false,
    graphiql: true,
  });
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'innosight-demo' }));
      return;
    }
    if (req.url === '/internal/reset' && req.method === 'POST') {
      const token = process.env.DEMO_INTERNAL_TOKEN || 'local-demo-internal';
      if (req.headers['x-demo-token'] !== token) {
        res.writeHead(403);
        res.end();
        return;
      }
      db = createData();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"reset":true}');
      return;
    }
    return yoga(req, res);
  });
  return server;
}
