import { beforeAll } from 'vitest';
import { installNoNetworkGuard } from './no-network.js';

beforeAll(() => {
	installNoNetworkGuard();
});
