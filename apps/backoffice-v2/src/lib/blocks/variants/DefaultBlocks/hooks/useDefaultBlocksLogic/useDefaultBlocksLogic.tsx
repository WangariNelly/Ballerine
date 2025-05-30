import { MotionButton } from '@/common/components/molecules/MotionButton/MotionButton';
import { useSearchParamsByEntity } from '@/common/hooks/useSearchParamsByEntity/useSearchParamsByEntity';
import { ctw } from '@/common/utils/ctw/ctw';
import { omitPropsFromObjectWhitelist } from '@/common/utils/omit-props-from-object-whitelist/omit-props-from-object-whitelist';
import { useAuthenticatedUserQuery } from '@/domains/auth/hooks/queries/useAuthenticatedUserQuery/useAuthenticatedUserQuery';
import { useRevisionTaskByIdMutation } from '@/domains/entities/hooks/mutations/useRevisionTaskByIdMutation/useRevisionTaskByIdMutation';
import { useStorageFilesQuery } from '@/domains/storage/hooks/queries/useStorageFilesQuery/useStorageFilesQuery';
import { TWorkflowById } from '@/domains/workflows/fetchers';
import { useEventMutation } from '@/domains/workflows/hooks/mutations/useEventMutation/useEventMutation';
import { useAmlBlock } from '@/lib/blocks/components/AmlBlock/hooks/useAmlBlock/useAmlBlock';
import { createBlocksTyped } from '@/lib/blocks/create-blocks-typed/create-blocks-typed';
import { useAddressBlock } from '@/lib/blocks/hooks/useAddressBlock/useAddressBlock';
import { useAssociatedCompaniesInformationBlock } from '@/lib/blocks/hooks/useAssociatedCompaniesInformationBlock/useAssociatedCompaniesInformationBlock';
import { associatedCompanyAdapter } from '@/lib/blocks/hooks/useAssosciatedCompaniesBlock/associated-company-adapter';
import { associatedCompanyToWorkflowAdapter } from '@/lib/blocks/hooks/useAssosciatedCompaniesBlock/associated-company-to-workflow-adapter';
import {
  motionButtonProps,
  useAssociatedCompaniesBlock,
} from '@/lib/blocks/hooks/useAssosciatedCompaniesBlock/useAssociatedCompaniesBlock';
import { useBankingDetailsBlock } from '@/lib/blocks/hooks/useBankingDetailsBlock/useBankingDetailsBlock';
import { useCaseInfoBlock } from '@/lib/blocks/hooks/useCaseInfoBlock/useCaseInfoBlock';
import { useCaseOverviewBlock } from '@/lib/blocks/hooks/useCaseOverviewBlock/useCaseOverviewBlock';
import { useCompanySanctionsBlock } from '@/lib/blocks/hooks/useCompanySanctionsBlock/useCompanySanctionsBlock';
import { useDirectorsRegistryProvidedBlock } from '@/lib/blocks/hooks/useDirectorsRegistryProvidedBlock/useDirectorsRegistryProvidedBlock';
import { useDirectorsUserProvidedBlock } from '@/lib/blocks/hooks/useDirectorsUserProvidedBlock/useDirectorsUserProvidedBlock';
import { useDocumentBlocks } from '@/lib/blocks/hooks/useDocumentBlocks/useDocumentBlocks';
import { useDocumentPageImages } from '@/lib/blocks/hooks/useDocumentPageImages';
import { useDocumentReviewBlocks } from '@/lib/blocks/hooks/useDocumentReviewBlocks/useDocumentReviewBlocks';
import { useKYCBusinessInformationBlock } from '@/lib/blocks/hooks/useKYCBusinessInformationBlock/useKYCBusinessInformationBlock';
import { useKybRegistryInfoBlock } from '@/lib/blocks/hooks/useKybRegistryInfoBlock/useKybRegistryInfoBlock';
import { useMainContactBlock } from '@/lib/blocks/hooks/useMainContactBlock/useMainContactBlock';
import { useMainRepresentativeBlock } from '@/lib/blocks/hooks/useMainRepresentativeBlock/useMainRepresentativeBlock';
import { useMapBlock } from '@/lib/blocks/hooks/useMapBlock/useMapBlock';
import { useMerchantScreeningBlock } from '@/lib/blocks/hooks/useMerchantScreeningBlock/useMerchantScreeningBlock';
import { useObjectEntriesBlock } from '@/lib/blocks/hooks/useObjectEntriesBlock/useObjectEntriesBlock';
import { useProcessingDetailsBlock } from '@/lib/blocks/hooks/useProcessingDetailsBlock/useProcessingDetailsBlock';
import { useRegistryInfoBlock } from '@/lib/blocks/hooks/useRegistryInfoBlock/useRegistryInfoBlock';
import { useStoreInfoBlock } from '@/lib/blocks/hooks/useStoreInfoBlock/useStoreInfoBlock';
import { useUbosRegistryProvidedBlock } from '@/lib/blocks/hooks/useUbosRegistryProvidedBlock/useUbosRegistryProvidedBlock';
import { useUbosUserProvidedBlock } from '@/lib/blocks/hooks/useUbosUserProvidedBlock/useUbosUserProvidedBlock';
import { useWebsiteBasicRequirementBlock } from '@/lib/blocks/hooks/useWebsiteBasicRequirementBlock/useWebsiteBasicRequirementBlock';
import { useWebsiteMonitoringBlock } from '@/lib/blocks/hooks/useWebsiteMonitoringBlock/useWebsiteMonitoringBlock';
import { useCaseBlocks } from '@/lib/blocks/variants/DefaultBlocks/hooks/useCaseBlocksLogic/useCaseBlocks';
import { useWebsiteMonitoringReportBlock } from '@/lib/blocks/variants/WebsiteMonitoringBlocks/hooks/useWebsiteMonitoringReportBlock/useWebsiteMonitoringReportBlock';
import { useCaseDecision } from '@/pages/Entity/components/Case/hooks/useCaseDecision/useCaseDecision';
import { useCaseState } from '@/pages/Entity/components/Case/hooks/useCaseState/useCaseState';
import { getAddressDeep } from '@/pages/Entity/hooks/useEntityLogic/utils/get-address-deep/get-address-deep';
import { selectDirectorsDocuments } from '@/pages/Entity/selectors/selectDirectorsDocuments';
import { Send } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useManageUbosBlock } from '@/lib/blocks/hooks/useManageUbosBlock/useManageUbosBlock';
import { useCurrentCaseQuery } from '@/pages/Entity/hooks/useCurrentCaseQuery/useCurrentCaseQuery';
import { Button } from '@ballerine/ui';
import { toast } from 'sonner';
import { useRemoveDecisionTaskByIdMutation } from '@/domains/entities/hooks/mutations/useRemoveDecisionTaskByIdMutation/useRemoveDecisionTaskByIdMutation';
import { useApproveTaskByIdMutation } from '@/domains/entities/hooks/mutations/useApproveTaskByIdMutation/useApproveTaskByIdMutation';
import { directorAdapter } from '@/lib/blocks/components/DirectorBlock/hooks/useDirectorBlock/helpers';
import { createDirectorsBlocks } from '@/lib/blocks/components/DirectorBlock/hooks/useDirectorBlock/create-directors-blocks';
import { useBankAccountVerificationBlock } from '@/lib/blocks/hooks/useBankAccountVerificationBlock/useBankAccountVerificationBlock';
import { useCommercialCreditCheckBlock } from '@/lib/blocks/hooks/useCommercialCreditCheckBlock/useCommercialCreditCheckBlock';

const registryInfoWhitelist = ['open_corporates'] as const;

export const useDefaultBlocksLogic = () => {
  const [{ activeTab }] = useSearchParamsByEntity();
  const { search } = useLocation();
  const { data: workflow, isLoading } = useCurrentCaseQuery();
  const { data: session } = useAuthenticatedUserQuery();
  const caseState = useCaseState(session?.user, workflow);
  const { noAction } = useCaseDecision();
  const isWorkflowLevelResolution =
    workflow?.workflowDefinition?.config?.workflowLevelResolution ??
    workflow?.context?.entity?.type === 'business';
  const { mutate: mutateRevisionTaskById, isLoading: isLoadingReuploadNeeded } =
    useRevisionTaskByIdMutation();
  const onReuploadNeeded = useCallback(
    ({
        workflowId,
        documentId,
        reason,
      }: Pick<
        Parameters<typeof mutateRevisionTaskById>[0],
        'workflowId' | 'documentId' | 'reason'
      >) =>
      () => {
        if (!documentId) {
          toast.error('Invalid task id');

          return;
        }

        mutateRevisionTaskById({
          workflowId,
          documentId,
          reason,
          contextUpdateMethod: 'base',
        });
      },
    [mutateRevisionTaskById],
  );

  const {
    store,
    bank: bankDetails,
    ubos: _ubosUserProvided,
    directors: directorsUserProvided = [],
    mainRepresentative,
    mainContact,
    openCorporate: _openCorporate,
    associatedCompanies: _associatedCompanies,
    ...entityDataAdditionalInfo
  } = workflow?.context?.entity?.data?.additionalInfo ?? {};
  const { website: websiteBasicRequirement, processingDetails, ...storeInfo } = store ?? {};

  const kybChildWorkflows = workflow?.childWorkflows?.filter(
    childWorkflow => childWorkflow?.context?.entity?.type === 'business',
  );

  const registryInfo = useMemo(
    () =>
      omitPropsFromObjectWhitelist({
        object: workflow?.context?.pluginsOutput,
        whitelist: registryInfoWhitelist,
      }),
    [workflow?.context?.pluginsOutput],
  );

  const directorsDocuments = useMemo(() => selectDirectorsDocuments(workflow), [workflow]);
  const directorDocumentPages = useMemo(
    () =>
      directorsDocuments.flatMap(({ pages }) =>
        pages?.map(({ ballerineFileId }) => ballerineFileId),
      ),
    [directorsDocuments],
  );

  const directorsStorageFilesQueryResult = useStorageFilesQuery(directorDocumentPages);
  const directorsDocumentPagesResults: string[][] = useDocumentPageImages(
    directorsDocuments,
    directorsStorageFilesQueryResult,
  );

  const companySanctions = workflow?.context?.pluginsOutput?.companySanctions?.data?.map(
    sanction => ({
      sources: sanction?.entity?.sources,
      officialLists: sanction?.entity?.officialLists,
      fullReport: sanction,
      linkedIndividuals: sanction?.entity?.linkedIndividuals,
      lastReviewed: sanction?.entity?.lastReviewed,
      primaryName: sanction?.entity?.name,
      labels: sanction?.entity?.categories,
      reasonsForMatch: sanction?.matchedFields,
      furtherInformation: sanction?.entity?.furtherInformation,
      alternativeNames: sanction?.entity?.otherNames,
      places: sanction?.entity?.places,
    }),
  );

  const directorsRegistryProvided = workflow?.context?.pluginsOutput?.directors?.data?.map(
    ({ name, position }) => ({
      name,
      position,
    }),
  );

  const registryInfoBlock = useRegistryInfoBlock({
    registryInfo,
    workflowId: workflow?.id,
    documents: workflow?.context?.documents,
  });

  const kybRegistryInfoBlock = useKybRegistryInfoBlock({
    pluginsOutput: workflow?.context?.pluginsOutput,
    workflow,
  });

  const bankAccountVerificationBlock = useBankAccountVerificationBlock({
    pluginsOutput: workflow?.context?.pluginsOutput,
  });

  const commercialCreditCheckBlock = useCommercialCreditCheckBlock({
    pluginsOutput: workflow?.context?.pluginsOutput,
  });

  const parentDocumentBlocks = useDocumentBlocks({
    workflow,
    parentMachine: workflow?.context?.parentMachine,
    noAction,
    caseState,
    withEntityNameInHeader: false,
    onReuploadNeeded,
    isLoadingReuploadNeeded,
    dialog: {
      reupload: {
        Description: () => (
          <p className="text-sm">
            {isWorkflowLevelResolution && (
              <>
                Once marked, you can use the “Ask for all re-uploads” button at the top of the
                screen to initiate a request for the customer to re-upload all of the documents you
                have marked for re-upload.
              </>
            )}
            {!isWorkflowLevelResolution && (
              <>
                <span className="mb-[10px] block">
                  By clicking the button below, an email with a link will be sent to the customer,
                  directing them to re-upload the documents you have marked as “re-upload needed”.
                </span>
                <span>
                  The case’s status will then change to “Revisions” until the customer will provide
                  the needed documents and fixes.
                </span>
              </>
            )}
          </p>
        ),
      },
    },
  });

  const entityInfoBlock = useCaseInfoBlock({
    entity: workflow?.context?.entity,
    entityDataAdditionalInfo,
    workflow,
  });

  const mapBlock = useMapBlock({
    address: getAddressDeep(registryInfo, {
      propertyName: 'registeredAddressInFull',
    }),
    entityType: workflow?.context?.entity?.type,
    workflow,
  });

  const addressBlock = useAddressBlock({
    address: workflow?.context?.entity?.data?.additionalInfo?.headquarters,
    entityType: workflow?.context?.entity?.type,
    workflow,
  });

  const addressWithContainerBlock = useMemo(() => {
    if (!addressBlock?.length) {
      return [];
    }

    return createBlocksTyped()
      .addBlock()
      .addCell({
        type: 'block',
        value: addressBlock.flat(1),
      })
      .build();
  }, [addressBlock]);

  const storeInfoBlock = useStoreInfoBlock({
    storeInfo,
    workflow,
  });

  const websiteBasicRequirementBlock = useWebsiteBasicRequirementBlock({
    websiteBasicRequirement,
    workflow,
  });

  const bankingDetailsBlock = useBankingDetailsBlock({
    bankDetails,
    workflow,
  });

  const processingDetailsBlock = useProcessingDetailsBlock({
    processingDetails,
    workflow,
  });

  const mainRepresentativeBlock = useMainRepresentativeBlock({
    mainRepresentative,
    workflow,
  });

  const mainContactBlock = useMainContactBlock({
    mainContact,
    workflow,
  });

  const companySanctionsBlock = useCompanySanctionsBlock(companySanctions);

  const childWorkflowToUboAdapter = (childWorkflow: TWorkflowById) => {
    return {
      name: [
        childWorkflow?.context?.entity?.data?.firstName,
        childWorkflow?.context?.entity?.data?.lastName,
      ]
        .filter(Boolean)
        .join(' '),
      nationality: childWorkflow?.context?.entity?.data?.additionalInfo?.nationality,
      email: childWorkflow?.context?.entity?.data?.email,
      identityNumber: childWorkflow?.context?.entity?.data?.nationalId,
      percentageOfOwnership:
        childWorkflow?.context?.entity?.data?.percentageOfOwnership ??
        childWorkflow?.context?.entity?.data?.ownershipPercentage ??
        childWorkflow?.context?.entity?.data?.additionalInfo?.percentageOfOwnership ??
        childWorkflow?.context?.entity?.data?.additionalInfo?.ownershipPercentage,
      address: childWorkflow?.context?.entity?.data?.additionalInfo?.fullAddress,
    } satisfies Parameters<typeof useUbosUserProvidedBlock>[0][number];
  };

  const ubosUserProvided = useMemo(() => {
    return (
      workflow?.childWorkflows
        ?.filter(childWorkflow => childWorkflow?.context?.entity?.variant === 'ubo')
        ?.map(childWorkflowToUboAdapter) ?? []
    );
  }, [workflow?.childWorkflows]);
  const ubosUserProvidedBlock = useUbosUserProvidedBlock(ubosUserProvided);

  const ubosRegistryProvidedBlock = useUbosRegistryProvidedBlock({
    nodes: workflow?.context?.pluginsOutput?.ubo?.data?.nodes ?? [],
    edges: workflow?.context?.pluginsOutput?.ubo?.data?.edges ?? [],
    message:
      workflow?.context?.pluginsOutput?.ubo?.message ??
      workflow?.context?.pluginsOutput?.ubo?.data?.message,
    isRequestTimedOut: workflow?.context?.pluginsOutput?.ubo?.isRequestTimedOut,
  });

  const manageUbosBlock = useManageUbosBlock({
    create: {
      ...workflow?.workflowDefinition?.config?.ubos?.create,
      enabled: workflow?.workflowDefinition?.config?.ubos?.create?.enabled ?? false,
    },
  });

  const directorsUserProvidedBlock = useDirectorsUserProvidedBlock(directorsUserProvided);

  const { mutate: mutateRemoveDecisionTaskById } = useRemoveDecisionTaskByIdMutation(workflow?.id);
  const { mutate: mutateApproveTaskById, isLoading: isLoadingApproveTaskById } =
    useApproveTaskByIdMutation(workflow?.id);

  const onMutateRevisionTaskByIdDirectors = useCallback(
    ({
        workflowId,
        directorId,
        documentId,
        reason,
      }: Pick<
        Parameters<typeof mutateRevisionTaskById>[0],
        'workflowId' | 'directorId' | 'documentId' | 'reason'
      >) =>
      () => {
        if (!documentId) {
          toast.error('Invalid task id');

          return;
        }

        mutateRevisionTaskById({
          workflowId,
          directorId,
          documentId,
          reason,
          contextUpdateMethod: 'director',
        });
      },
    [mutateRevisionTaskById],
  );

  const onMutateApproveTaskByIdDirectors = useCallback(
    ({ directorId, documentId }: { directorId: string; documentId: string }) =>
      mutateApproveTaskById({ directorId, documentId, contextUpdateMethod: 'director' }),
    [mutateApproveTaskById],
  );
  const onMutateRemoveDecisionTaskByIdDirectors = useCallback(
    ({ directorId, documentId }: { directorId: string; documentId: string }) =>
      mutateRemoveDecisionTaskById({ directorId, documentId, contextUpdateMethod: 'director' }),
    [mutateRemoveDecisionTaskById],
  );

  const directors = workflow?.context?.entity?.data?.additionalInfo?.directors?.map(
    directorAdapter(directorsDocumentPagesResults),
  );
  const revisionReasons =
    workflow?.workflowDefinition?.contextSchema?.schema?.properties?.documents?.items?.properties?.decision?.properties?.revisionReason?.anyOf?.find(
      ({ enum: enum_ }) => !!enum_,
    )?.enum ?? [];
  const directorsDocumentsBlocks = createDirectorsBlocks({
    workflowId: workflow?.id ?? '',
    onReuploadNeeded: onMutateRevisionTaskByIdDirectors,
    onRemoveDecision: onMutateRemoveDecisionTaskByIdDirectors,
    onApprove: onMutateApproveTaskByIdDirectors,
    directors,
    tags: workflow?.tags ?? [],
    revisionReasons,
    isEditable: caseState.writeEnabled,
    isApproveDisabled: isLoadingApproveTaskById,
    isLoadingDocuments: directorsStorageFilesQueryResult?.some(file => file?.isLoading),
    // Remove once callToActionLegacy is removed
    workflow,
  });

  const directorsRegistryProvidedBlock =
    useDirectorsRegistryProvidedBlock(directorsRegistryProvided);

  const websiteMonitoringBlock = useWebsiteMonitoringBlock({
    pluginsOutput: workflow?.context?.pluginsOutput,
    workflow,
  });
  const { mutate: mutateEvent, isLoading: isLoadingEvent } = useEventMutation();
  const onClose = useCallback(
    (associatedCompany: ReturnType<typeof associatedCompanyAdapter>) => () => {
      mutateEvent({
        workflowId: associatedCompany?.workflowId,
        event: 'START_ASSOCIATED_COMPANY_KYB',
      });
    },
    [mutateEvent],
  );

  const associatedCompanies =
    !kybChildWorkflows?.length &&
    !workflow?.workflowDefinition?.config?.isAssociatedCompanyKybEnabled
      ? workflow?.context?.entity?.data?.additionalInfo?.associatedCompanies?.map(
          associatedCompanyToWorkflowAdapter,
        )
      : kybChildWorkflows;

  const associatedCompaniesBlock = useAssociatedCompaniesBlock({
    workflows: associatedCompanies,
    onClose,
    isLoadingOnClose: isLoadingEvent,
    dialog: {
      Trigger: props => (
        <MotionButton
          {...motionButtonProps}
          animate={{
            ...motionButtonProps.animate,
            opacity: !caseState.actionButtonsEnabled ? 0.5 : motionButtonProps.animate.opacity,
          }}
          variant="outline"
          className={'ms-3.5'}
          disabled={!caseState.actionButtonsEnabled}
          {...props}
        >
          Initiate KYB
        </MotionButton>
      ),
      Title: ({ associatedCompany }) => <>Initiate KYB for {associatedCompany.companyName}</>,
      Description: ({ associatedCompany }) => (
        <p className={`text-sm`}>
          By clicking the button below, an email with a link will be sent to{' '}
          {associatedCompany.companyName} &apos;s contact person, {associatedCompany.contactPerson},
          directing them to provide information about their company. The case status will then
          change to &ldquo;Collection in Progress&ldquo; until the contact person will provide the
          needed information.
        </p>
      ),
      Close: ({ associatedCompany }) => (
        <Button
          className={ctw(`gap-x-2`, {
            loading: isLoadingEvent,
          })}
          onClick={onClose(associatedCompany)}
        >
          <Send size={18} />
          Send email
        </Button>
      ),
    },
    isAssociatedCompanyKybEnabled:
      !!workflow?.workflowDefinition?.config?.isAssociatedCompanyKybEnabled,
  });

  const associatedCompaniesInformationBlock = useAssociatedCompaniesInformationBlock(
    associatedCompanies ?? [],
  );

  const websiteMonitoringBlocks = useWebsiteMonitoringReportBlock();
  const documentReviewBlocks = useDocumentReviewBlocks();
  const businessInformationBlocks = useKYCBusinessInformationBlock();

  const caseOverviewBlock = useCaseOverviewBlock();

  const customDataBlock = useObjectEntriesBlock({
    object: workflow?.context?.customData ?? {},
    heading: 'Custom Data',
  });

  const amlData = useMemo(() => [workflow?.context?.aml], [workflow?.context?.aml]);

  const amlBlock = useAmlBlock({
    data: amlData,
    vendor: workflow?.context?.aml?.vendor ?? '',
  });

  const amlWithContainerBlock = useMemo(() => {
    if (!amlBlock?.length) {
      return [];
    }

    return createBlocksTyped()
      .addBlock()
      .addCell({
        type: 'block',
        value: amlBlock,
      })
      .build();
  }, [amlBlock]);

  const merchantScreeningBlock = useMerchantScreeningBlock({
    terminatedMatchedMerchants:
      workflow?.context?.pluginsOutput?.merchantScreening?.processed?.terminatedMatchedMerchants ??
      [],
    inquiredMatchedMerchants:
      workflow?.context?.pluginsOutput?.merchantScreening?.processed?.inquiredMatchedMerchants ??
      [],
    merchantScreeningInput:
      workflow?.context?.pluginsInput?.merchantScreening?.requestPayload || {},
    logoUrl: workflow?.context?.pluginsOutput?.merchantScreening?.logoUrl,
    rawData: workflow?.context?.pluginsOutput?.merchantScreening?.raw,
    checkDate: workflow?.context?.pluginsOutput?.merchantScreening?.processed?.checkDate,
  });

  const allBlocks = useMemo(() => {
    if (!workflow?.context?.entity) {
      return [];
    }

    return [
      websiteMonitoringBlock,
      entityInfoBlock,
      registryInfoBlock,
      kybRegistryInfoBlock,
      companySanctionsBlock,
      ubosUserProvidedBlock,
      ubosRegistryProvidedBlock,
      directorsUserProvidedBlock,
      directorsRegistryProvidedBlock,
      directorsDocumentsBlocks,
      storeInfoBlock,
      websiteBasicRequirementBlock,
      bankingDetailsBlock,
      processingDetailsBlock,
      mainContactBlock,
      mainRepresentativeBlock,
      mapBlock,
      addressWithContainerBlock,
      parentDocumentBlocks,
      associatedCompaniesBlock,
      associatedCompaniesInformationBlock,
      websiteMonitoringBlocks,
      documentReviewBlocks,
      businessInformationBlocks,
      caseOverviewBlock,
      customDataBlock,
      amlWithContainerBlock,
      merchantScreeningBlock,
      manageUbosBlock,
      bankAccountVerificationBlock,
      commercialCreditCheckBlock,
    ];
  }, [
    associatedCompaniesBlock,
    associatedCompaniesInformationBlock,
    bankingDetailsBlock,
    companySanctionsBlock,
    directorsDocumentsBlocks,
    directorsRegistryProvidedBlock,
    directorsUserProvidedBlock,
    entityInfoBlock,
    kybRegistryInfoBlock,
    mainContactBlock,
    mainRepresentativeBlock,
    mapBlock,
    addressWithContainerBlock,
    parentDocumentBlocks,
    processingDetailsBlock,
    registryInfoBlock,
    storeInfoBlock,
    ubosUserProvidedBlock,
    ubosRegistryProvidedBlock,
    websiteBasicRequirementBlock,
    websiteMonitoringBlock,
    websiteMonitoringBlocks,
    documentReviewBlocks,
    businessInformationBlocks,
    caseOverviewBlock,
    customDataBlock,
    amlWithContainerBlock,
    merchantScreeningBlock,
    workflow?.context?.entity,
    manageUbosBlock,
    bankAccountVerificationBlock,
    commercialCreditCheckBlock,
  ]);

  const { blocks, tabs } = useCaseBlocks({
    workflow,
    config: workflow?.workflowDefinition?.config,
    blocks: allBlocks,
    onReuploadNeeded,
    isLoadingReuploadNeeded,
    activeTab,
  });
  const availableTabs = useMemo(() => tabs.filter(tab => !tab.hidden), [tabs]);
  const getUpdatedSearchParamsWithActiveTab = useCallback(
    ({ tab }: { tab: string }) => {
      const searchParams = new URLSearchParams(search);

      searchParams.set('activeTab', tab);

      return searchParams.toString();
    },
    [search],
  );

  return {
    blocks,
    onReuploadNeeded,
    isLoadingReuploadNeeded,
    isLoading,
    activeTab,
    getUpdatedSearchParamsWithActiveTab,
    tabs: availableTabs,
  };
};
