import { useAuthApi } from './useApi';
import { InvoiceSettings } from '@/types';

export function useAdminInvoiceSettings() {
  return useAuthApi<InvoiceSettings>('/api/admin/invoice-settings');
}
