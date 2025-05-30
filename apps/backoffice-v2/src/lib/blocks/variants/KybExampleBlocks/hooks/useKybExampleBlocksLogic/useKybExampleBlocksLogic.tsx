import { Button } from '@/common/components/atoms/Button/Button';
import { MotionButton } from '@/common/components/molecules/MotionButton/MotionButton';
import { useFilterId } from '@/common/hooks/useFilterId/useFilterId';
import { ctw } from '@/common/utils/ctw/ctw';
import { useAuthenticatedUserQuery } from '@/domains/auth/hooks/queries/useAuthenticatedUserQuery/useAuthenticatedUserQuery';
import { useRevisionTaskByIdMutation } from '@/domains/entities/hooks/mutations/useRevisionTaskByIdMutation/useRevisionTaskByIdMutation';
import { useStorageFilesQuery } from '@/domains/storage/hooks/queries/useStorageFilesQuery/useStorageFilesQuery';
import { useEventMutation } from '@/domains/workflows/hooks/mutations/useEventMutation/useEventMutation';
import { useWorkflowByIdQuery } from '@/domains/workflows/hooks/queries/useWorkflowByIdQuery/useWorkflowByIdQuery';
import { useAssociatedCompaniesInformationBlock } from '@/lib/blocks/hooks/useAssociatedCompaniesInformationBlock/useAssociatedCompaniesInformationBlock';
import { associatedCompanyAdapter } from '@/lib/blocks/hooks/useAssosciatedCompaniesBlock/associated-company-adapter';
import {
  motionButtonProps,
  useAssociatedCompaniesBlock,
} from '@/lib/blocks/hooks/useAssosciatedCompaniesBlock/useAssociatedCompaniesBlock';
import { useCaseInfoBlock } from '@/lib/blocks/hooks/useCaseInfoBlock/useCaseInfoBlock';
import { createDirectorsBlocks } from '@/lib/blocks/components/DirectorBlock/hooks/useDirectorBlock/create-directors-blocks';
import { useDirectorsRegistryProvidedBlock } from '@/lib/blocks/hooks/useDirectorsRegistryProvidedBlock/useDirectorsRegistryProvidedBlock';
import { useDirectorsUserProvidedBlock } from '@/lib/blocks/hooks/useDirectorsUserProvidedBlock/useDirectorsUserProvidedBlock';
import { useDocumentBlocks } from '@/lib/blocks/hooks/useDocumentBlocks/useDocumentBlocks';
import { useDocumentPageImages } from '@/lib/blocks/hooks/useDocumentPageImages';
import { useMainRepresentativeBlock } from '@/lib/blocks/hooks/useMainRepresentativeBlock/useMainRepresentativeBlock';
import { useCaseDecision } from '@/pages/Entity/components/Case/hooks/useCaseDecision/useCaseDecision';
import { useCaseState } from '@/pages/Entity/components/Case/hooks/useCaseState/useCaseState';
import { selectDirectorsDocuments } from '@/pages/Entity/selectors/selectDirectorsDocuments';
import { ExternalLink, Send } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { associatedCompanyToWorkflowAdapter } from '@/lib/blocks/hooks/useAssosciatedCompaniesBlock/associated-company-to-workflow-adapter';
import { getDocumentsByCountry } from '@ballerine/common';
import { extractCountryCodeFromDocuments } from '@/pages/Entity/hooks/useEntityLogic/utils';
import { directorAdapter } from '@/lib/blocks/components/DirectorBlock/hooks/useDirectorBlock/helpers';
import { useRemoveDecisionTaskByIdMutation } from '@/domains/entities/hooks/mutations/useRemoveDecisionTaskByIdMutation/useRemoveDecisionTaskByIdMutation';
import { useApproveTaskByIdMutation } from '@/domains/entities/hooks/mutations/useApproveTaskByIdMutation/useApproveTaskByIdMutation';

export const useKybExampleBlocksLogic = () => {
  const { entityId: workflowId } = useParams();
  const filterId = useFilterId();
  const { data: workflow, isLoading } = useWorkflowByIdQuery({
    workflowId: workflowId ?? '',
    filterId: filterId ?? '',
  });
  const { noAction } = useCaseDecision();
  const { data: session } = useAuthenticatedUserQuery();
  const caseState = useCaseState(session?.user ?? null, workflow);
  const {
    store: _store,
    bank: _bank,
    directors: directorsUserProvided = [],
    mainRepresentative,
    mainContact: _mainContact,
    openCorporate: _openCorporate,
    ...entityDataAdditionalInfo
  } = workflow?.context?.entity?.data?.additionalInfo ?? {};
  const directorsRegistryProvided = useMemo(() => {
    return workflow?.context?.pluginsOutput?.directors?.data?.map(({ name, position }) => ({
      name,
      position,
    }));
  }, [workflow?.context?.pluginsOutput?.directors?.data]);
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

  const { mutate: mutateEvent, isLoading: isLoadingEvent } = useEventMutation();
  const onClose = useCallback(
    (associatedCompany: ReturnType<typeof associatedCompanyAdapter>) => () => {
      mutateEvent({
        workflowId: associatedCompany?.workflowId,
        event: 'START_ASSOCIATED_COMPANY_KYB',
      });
      window.open(associatedCompany?.collectionFlowUrl, '_blank');
    },
    [mutateEvent],
  );
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

  // Blocks
  const businessInformation = useCaseInfoBlock({
    entity: workflow?.context?.entity ?? {},
    workflow,
    entityDataAdditionalInfo,
  });
  const isWorkflowLevelResolution =
    workflow?.workflowDefinition?.config?.workflowLevelResolution ??
    workflow?.context?.entity?.type === 'business';
  const documentsBlocks = useDocumentBlocks({
    workflow,
    parentMachine: workflow?.context?.parentMachine,
    noAction,
    withEntityNameInHeader: false,
    caseState,
    onReuploadNeeded,
    isLoadingReuploadNeeded,
    // TODO - Remove `CallToActionLegacy` and revisit this object.
    dialog: {
      reupload: {
        Description: () => (
          <p className="text-sm">
            {isWorkflowLevelResolution && (
              <>
                After selecting one or more documents for re-upload, click ‘Ask for all re-uploads’
                at the top of the case. This action will open a new tab to simulate the document
                re-upload request process. Note: In the live environment, requests for document
                re-uploads are initiated via email to the company’s representative.
              </>
            )}
            {!isWorkflowLevelResolution && (
              <>
                <span className="mb-[10px] block">
                  Click the button below to simulate a document re-upload request process in a new
                  tab.
                </span>
                <span>
                  Note: In the live environment, requests for document re-uploads are initiated via
                  email to the company’s representative.
                </span>
              </>
            )}
          </p>
        ),
      },
    },
  });
  const mainRepresentativeBlock = useMainRepresentativeBlock({
    workflow,
    mainRepresentative,
  });

  const directorsRegistryProvidedBlock =
    useDirectorsRegistryProvidedBlock(directorsRegistryProvided);
  const directorsUserProvidedBlock = useDirectorsUserProvidedBlock(directorsUserProvided);

  const { mutate: mutateRemoveDecisionTaskById } = useRemoveDecisionTaskByIdMutation(workflow?.id);
  const { mutate: mutateApproveTaskById, isLoading: isLoadingApproveTaskById } =
    useApproveTaskByIdMutation(workflow?.id);

  const onMutateRevisionTaskByIdDirectors = useCallback(
    ({
        directorId,
        workflowId,
        documentId,
        reason,
      }: Pick<
        Parameters<typeof mutateRevisionTaskById>[0],
        'directorId' | 'workflowId' | 'documentId' | 'reason'
      >) =>
      () => {
        if (!documentId) {
          toast.error('Invalid task id');

          return;
        }

        mutateRevisionTaskById({
          directorId,
          workflowId,
          documentId,
          reason,
          contextUpdateMethod: 'director',
        });
        window.open(
          `${workflow?.context?.metadata?.collectionFlowUrl}/?token=${workflow?.context?.metadata?.token}`,
          '_blank',
        );
      },
    [
      mutateRevisionTaskById,
      workflow?.context?.metadata?.collectionFlowUrl,
      workflow?.context?.metadata?.token,
    ],
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

  const directorsBlock = createDirectorsBlocks({
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

  const kybChildWorkflows = workflow?.childWorkflows?.filter(
    childWorkflow => childWorkflow?.context?.entity?.type === 'business',
  );
  const associatedCompanies =
    !kybChildWorkflows?.length &&
    !workflow?.workflowDefinition?.config?.isAssociatedCompanyKybEnabled
      ? workflow?.context?.entity?.data?.additionalInfo?.associatedCompanies?.map(
          associatedCompanyToWorkflowAdapter,
        )
      : kybChildWorkflows;

  const associatedCompaniesBlock = useAssociatedCompaniesBlock({
    workflows: associatedCompanies ?? [],
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
          Explore our parent KYB Demo. Click the &quot;Open KYB&quot; to launch a simulated KYB
          process for {associatedCompany?.companyName} in a new tab. Note: In the live environment,
          the KYB process begins with an email to {associatedCompany?.companyName}&apos;s
          representative.
        </p>
      ),
      Close: ({ associatedCompany }) => (
        <>
          <Button
            className={ctw(`gap-x-2`, {
              loading: isLoadingEvent,
            })}
            disabled
          >
            <Send size={18} />
            Send email
          </Button>
          <Button
            className={ctw(`gap-x-2`, {
              loading: isLoadingEvent,
            })}
            onClick={onClose(associatedCompany)}
          >
            <ExternalLink size={18} />
            Open KYB
          </Button>
        </>
      ),
    },
    isAssociatedCompanyKybEnabled:
      !!workflow?.workflowDefinition?.config?.isAssociatedCompanyKybEnabled,
  });
  const associatedCompaniesInformationBlock = useAssociatedCompaniesInformationBlock(
    kybChildWorkflows ?? [],
  );
  // /Blocks

  const blocks = useMemo(() => {
    return [
      ...businessInformation,
      ...mainRepresentativeBlock,
      ...documentsBlocks,
      ...directorsRegistryProvidedBlock,
      ...directorsUserProvidedBlock,
      ...directorsBlock,
      ...associatedCompaniesBlock,
      ...associatedCompaniesInformationBlock,
    ];
  }, [
    businessInformation,
    mainRepresentativeBlock,
    documentsBlocks,
    directorsRegistryProvidedBlock,
    directorsUserProvidedBlock,
    directorsBlock,
    associatedCompaniesBlock,
    associatedCompaniesInformationBlock,
  ]);

  return {
    blocks,
    kybChildWorkflows,
    workflowId: workflow?.id,
    parentMachine: workflow?.context?.parentMachine,
    onReuploadNeeded,
    isLoadingReuploadNeeded,
    isLoading,
  };
};
