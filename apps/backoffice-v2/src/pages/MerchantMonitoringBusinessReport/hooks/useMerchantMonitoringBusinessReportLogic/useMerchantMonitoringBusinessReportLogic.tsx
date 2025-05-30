import { ParsedBooleanSchema, useReportTabs } from '@ballerine/ui';
import { t } from 'i18next';
import { capitalize } from 'lodash-es';
import { useCallback, useMemo } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { useToggle } from '@/common/hooks/useToggle/useToggle';
import { useZodSearchParams } from '@/common/hooks/useZodSearchParams/useZodSearchParams';
import { safeUrl } from '@/common/utils/safe-url/safe-url';
import { RiskIndicatorLink } from '@/domains/business-reports/components/RiskIndicatorLink/RiskIndicatorLink';
import { MERCHANT_REPORT_STATUSES_MAP } from '@/domains/business-reports/constants';
import { useBusinessReportByIdQuery } from '@/domains/business-reports/hooks/queries/useBusinessReportByIdQuery/useBusinessReportByIdQuery';
import { useCreateNoteMutation } from '@/domains/notes/hooks/mutations/useCreateNoteMutation/useCreateNoteMutation';
import { useNotesByNoteable } from '@/domains/notes/hooks/queries/useNotesByNoteable/useNotesByNoteable';
import { useToggleMonitoringMutation } from '@/pages/MerchantMonitoringBusinessReport/hooks/useToggleMonitoringMutation/useToggleMonitoringMutation';
import { isObject } from '@ballerine/common';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale } from '@/common/hooks/useLocale/useLocale';

const ZodDeboardingSchema = z
  .object({
    reason: z.string().optional(),
    userReason: z.string().optional(),
  })
  .refine(
    ({ reason, userReason }) => {
      if (reason === 'other') {
        return !!userReason && userReason.length >= 5;
      }

      return true;
    },
    ({ reason }) => {
      if (reason === 'other') {
        return {
          message: 'Please provide a reason of at least 5 characters',
          path: ['userReason'],
        };
      }

      return { message: 'Invalid Input' };
    },
  );

const statusToBadgeData = {
  [MERCHANT_REPORT_STATUSES_MAP.completed]: { variant: 'info', text: 'Manual Review' },
  [MERCHANT_REPORT_STATUSES_MAP['in-progress']]: { variant: 'violet', text: 'In-progress' },
  [MERCHANT_REPORT_STATUSES_MAP['quality-control']]: {
    variant: 'violet',
    text: 'Quality Control',
  },
  [MERCHANT_REPORT_STATUSES_MAP['failed']]: { variant: 'destructive', text: 'Failed' },
} as const;

const deboardingReasonOptions = [
  'Fraudulent Activity Detected',
  'Non-Compliance with Regulations',
  'Excessive Chargebacks or Disputes',
  'Business Relationship Ended',
  'Other',
] as const;

export const useMerchantMonitoringBusinessReportLogic = () => {
  const { businessReportId } = useParams();
  const { data: businessReport, isFetching: isFetchingBusinessReport } = useBusinessReportByIdQuery(
    { id: businessReportId ?? '' },
  );

  const { data: notes } = useNotesByNoteable({
    noteableId: businessReportId,
    noteableType: 'Report',
  });

  const [isDeboardModalOpen, setIsDeboardModalOpen] = useToggle(false);
  const [isDropdownOpen, setIsDropdownOpen] = useToggle(false);

  const formDefaultValues = {
    reason: undefined,
    userReason: '',
  } satisfies z.infer<typeof ZodDeboardingSchema>;

  const form = useForm({
    resolver: zodResolver(ZodDeboardingSchema),
    defaultValues: formDefaultValues,
  });

  const onSubmit: SubmitHandler<z.infer<typeof ZodDeboardingSchema>> = async (data, e) => {
    if (!businessReport?.merchantId) {
      throw new Error('Merchant ID is missing');
    }

    return turnOffMonitoringMutation.mutate(businessReport.merchantId);
  };

  const { mutateAsync: mutateCreateNote } = useCreateNoteMutation({ disableToast: true });
  const turnOnMonitoringMutation = useToggleMonitoringMutation({
    state: 'on',
    onSuccess: () => {
      void mutateCreateNote({
        content: 'Monitoring turned on',
        entityId: businessReport?.merchantId ?? '',
        entityType: 'Business',
        noteableId: businessReport?.id ?? '',
        noteableType: 'Report',
        parentNoteId: null,
      });
      toast.success(t(`toast:business_monitoring_on.success`));
    },
    onError: error => {
      toast.error(
        t(`toast:business_monitoring_on.error`, {
          errorMessage: isObject(error) && 'message' in error ? error.message : error,
        }),
      );
    },
  });

  const turnOffMonitoringMutation = useToggleMonitoringMutation({
    state: 'off',
    onSuccess: () => {
      const { reason, userReason } = form.getValues();
      const content = [
        'Monitoring turned off',
        reason ? `with reason: ${capitalize(reason)}` : null,
        userReason ? `(${userReason})` : '',
      ]
        .filter(Boolean)
        .join(' ');
      void mutateCreateNote({
        content,
        entityId: businessReport?.merchantId ?? '',
        entityType: 'Business',
        noteableId: businessReport?.id ?? '',
        noteableType: 'Report',
        parentNoteId: null,
      });
      setIsDeboardModalOpen(false);
      setIsDropdownOpen(false);
      form.reset();
      toast.success(t(`toast:business_monitoring_off.success`));
    },
    onError: error => {
      toast.error(
        t(`toast:business_monitoring_off.error`, {
          errorMessage: isObject(error) && 'message' in error ? error.message : error,
        }),
      );
    },
  });

  const { tabs } = useReportTabs({
    reportVersion: businessReport?.workflowVersion,
    report: businessReport?.data ?? {},
    companyName: businessReport?.companyName,
    Link: RiskIndicatorLink,
  });

  const tabsValues = useMemo(() => tabs.map(tab => tab.value), [tabs]);

  const MerchantMonitoringBusinessReportSearchSchema = z.object({
    isNotesOpen: ParsedBooleanSchema.catch(false),
    activeTab: z
      .enum(
        // @ts-expect-error - zod doesn't like we are using `Array.prototype.map`
        tabsValues,
      )
      .catch(tabsValues[0]!),
  });

  const [{ activeTab, isNotesOpen }] = useZodSearchParams(
    MerchantMonitoringBusinessReportSearchSchema,
    { replace: true },
  );

  const navigate = useNavigate();

  const onNavigateBack = useCallback(() => {
    const previousPath = sessionStorage.getItem(
      'merchant-monitoring:business-report:previous-path',
    );

    if (!previousPath) {
      navigate('../');

      return;
    }

    navigate(previousPath);
    sessionStorage.removeItem('merchant-monitoring:business-report:previous-path');
  }, [navigate]);

  const websiteWithNoProtocol = safeUrl(businessReport?.website)?.hostname;
  const locale = useLocale();

  return {
    onNavigateBack,
    websiteWithNoProtocol,
    businessReport,
    statusToBadgeData,
    tabs,
    notes,
    activeTab,
    isNotesOpen,
    turnOngoingMonitoringOn: turnOnMonitoringMutation.mutate,
    isDeboardModalOpen,
    setIsDeboardModalOpen,
    isDropdownOpen,
    setIsDropdownOpen,
    form,
    onSubmit,
    deboardingReasonOptions,
    isFetchingBusinessReport,
    locale,
  };
};
