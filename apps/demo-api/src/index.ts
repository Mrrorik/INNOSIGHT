import { makeDemoServer } from './app.js';
const server = makeDemoServer();
server.listen(Number(process.env.DEMO_PORT || 5000), '0.0.0.0', () =>
  console.log('INNOSIGHT Demo GraphQL API listening on :5000/graphql'),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
