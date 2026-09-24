import { createApp } from './app.js';
import { DeterministicMockProvider } from './provider.js';
import { OrderStore } from './store.js';

const port = Number(process.env.PORT ?? 3000);
const store = new OrderStore(process.env.DATABASE_PATH ?? 'data/orders.sqlite');
createApp(store, new DeterministicMockProvider()).listen(port, () => console.log(`Listening on ${port}`));
