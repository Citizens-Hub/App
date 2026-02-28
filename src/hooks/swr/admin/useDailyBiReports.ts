import { useAuthApi } from '../useApi';

export interface DailyBiReportItem {
  id: number;
  createdAt: string;
  reportDate?: string;
  report: unknown;
  rawData?: unknown;
}

export interface DailyBiReportsResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  list: DailyBiReportItem[];
}

export function useDailyBiReports(page = 1, limit = 20, reportDate?: string) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (reportDate) {
    params.append('reportDate', reportDate);
  }

  const path = `/api/bi/report?${params.toString()}`;

  return useAuthApi<DailyBiReportsResponse>(path, {
    revalidateOnFocus: false,
    revalidateIfStale: true,
  });
}
