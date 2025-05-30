import { BaseSearchSchema } from '@/common/hooks/useSearchParamsByEntity/validation-schemas';
import { z } from 'zod';
import { AlertStatus, AlertStatuses, TAlertsList } from '@/domains/alerts/fetchers';
import { BooleanishRecordSchema } from '@ballerine/ui';

export const getAlertsSearchSchema = () =>
  BaseSearchSchema.extend({
    sortBy: z
      .enum(['dataTimestamp', 'status'] as const satisfies ReadonlyArray<
        Extract<keyof TAlertsList[number], 'dataTimestamp' | 'status'>
      >)
      .catch('dataTimestamp'),
    filter: z
      .object({
        assigneeId: z.array(z.string().nullable()).catch([]),
        status: z.array(z.enum(AlertStatuses)).catch([AlertStatus.NEW]),
        state: z.array(z.string().nullable()).catch([]),
        correlationIds: z.array(z.string()).catch([]),
      })
      .catch({
        assigneeId: [],
        status: [AlertStatus.NEW],
        state: [],
        correlationIds: [],
      }),
    selected: BooleanishRecordSchema.optional(),
    businessId: z.string().optional(),
    counterpartyId: z.string().optional(),
  });
