import { lazy, type ComponentType } from 'react';
import { createModulePreloader } from './utils/modulePreload';

export type AppTab = 'dashboard' | 'ledger' | 'inventory' | 'notes' | 'noteboard' | 'supplier-summary' | 'supplier-quotes';

type ComponentModule = { default: ComponentType<any> };

const moduleLoaders: Record<AppTab, () => Promise<ComponentModule>> = {
  dashboard: () => import('./components/Dashboard'),
  ledger: () => import('./components/POList'),
  inventory: () => import('./components/SampleTracker'),
  notes: () => import('./components/SkeuomorphicNotes'),
  noteboard: () => import('./components/NoteboardCanvas'),
  'supplier-summary': () => import('./components/SupplierSummaryApp'),
  'supplier-quotes': () => import('./components/supplierQuotes/SupplierQuotationApp'),
};

export const Dashboard = lazy(moduleLoaders.dashboard);
export const POList = lazy(moduleLoaders.ledger);
export const SampleTracker = lazy(moduleLoaders.inventory);
export const SkeuomorphicNotes = lazy(moduleLoaders.notes);
export const NoteboardCanvas = lazy(moduleLoaders.noteboard);
export const SupplierSummaryApp = lazy(moduleLoaders['supplier-summary']);
export const SupplierQuotationApp = lazy(moduleLoaders['supplier-quotes']);

export const preloadAppModule = createModulePreloader<AppTab>(moduleLoaders);
