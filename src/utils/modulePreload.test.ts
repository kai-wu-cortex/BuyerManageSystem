import assert from 'node:assert/strict';
import { createModulePreloader } from './modulePreload';

let dashboardLoads = 0;
let ledgerLoads = 0;

const preload = createModulePreloader({
  dashboard: () => {
    dashboardLoads += 1;
    return Promise.resolve('dashboard-module');
  },
  ledger: () => {
    ledgerLoads += 1;
    return Promise.resolve('ledger-module');
  },
});

const firstDashboard = preload('dashboard');
const secondDashboard = preload('dashboard');
const ledger = preload('ledger');

assert.equal(firstDashboard, secondDashboard, 'same module should reuse the in-flight preload promise');
assert.notEqual(firstDashboard, ledger, 'different modules should keep independent preload promises');
assert.equal(dashboardLoads, 1, 'dashboard loader should run once');
assert.equal(ledgerLoads, 1, 'ledger loader should run once');
