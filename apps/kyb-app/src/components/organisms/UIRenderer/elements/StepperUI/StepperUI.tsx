import { Stepper } from '@/components/atoms/Stepper';
import {
  BreadcrumbItemInput,
  Breadcrumbs,
} from '@/components/atoms/Stepper/components/atoms/Breadcrumbs';
import { VerticalLayout } from '@/components/atoms/Stepper/layouts/Vertical';
import { usePageResolverContext } from '@/components/organisms/DynamicUI/PageResolver/hooks/usePageResolverContext';
import { useStateManagerContext } from '@/components/organisms/DynamicUI/StateManager/components/StateProvider';
import { useDynamicUIContext } from '@/components/organisms/DynamicUI/hooks/useDynamicUIContext';
import { UIElementState } from '@/components/organisms/DynamicUI/hooks/useUIStateLogic/hooks/useUIElementsStateLogic/types';
import { ErrorField } from '@/components/organisms/DynamicUI/rule-engines';
import { UIPage } from '@/domains/collection-flow';
import { CollectionFlowContext } from '@/domains/collection-flow/types/flow-context.types';
import { isPageCompleted } from '@/helpers/prepareInitialUIState';
import { ScrollArea, ScrollBar } from '@ballerine/ui';
import { FunctionComponent, useEffect, useMemo, useState } from 'react';

interface IStepperUIProps {
  revisionStateNames: string[];
}

export const StepperUI: FunctionComponent<IStepperUIProps> = ({ revisionStateNames }) => {
  const { state: uiState } = useDynamicUIContext();
  const { pages, currentPage } = usePageResolverContext();
  const { payload } = useStateManagerContext();

  const computeStepStatus = ({
    page,
    context,
    uiElementState,
  }: {
    page: UIPage;
    uiElementState: UIElementState;
    pageError: Record<string, ErrorField>;
    currentPage: UIPage;
    context: CollectionFlowContext;
  }) => {
    if (revisionStateNames?.includes(page.stateName)) return 'warning';

    if (isPageCompleted(page, context) || uiElementState?.isCompleted) return 'completed';

    return 'idle';
  };

  const [initialContext] = useState(() => structuredClone(payload));

  const steps: BreadcrumbItemInput[] = useMemo(() => {
    return pages.map(page => {
      const stepStatus = computeStepStatus({
        // @ts-ignore
        uiElementState: uiState.elements[page.stateName],
        page,
        context: initialContext,
        currentPage: currentPage as UIPage,
      });

      const step: BreadcrumbItemInput = {
        id: page.stateName,
        label: page.name,
        state: stepStatus,
      };

      return step;
    });
  }, [pages, uiState, initialContext, currentPage]);

  const activeStep = useMemo(() => {
    const activeStep = steps.find(step => step.id === currentPage?.stateName);

    if (!activeStep) return null;

    return activeStep;
  }, [steps, currentPage]);

  useEffect(() => {
    if (!activeStep) return;

    const activeBreadcrumb = document.querySelector(`[data-breadcrumb-id=${activeStep.id}]`);

    // Making sure that breadcrumb in viewport on transitions
    activeBreadcrumb?.scrollIntoView(true);
  }, [activeStep]);

  return (
    <ScrollArea orientation="vertical" className="h-full">
      <Stepper>
        <Breadcrumbs items={steps} active={activeStep}>
          {(items, theme) => {
            return (
              <VerticalLayout>
                {items.map(itemProps => {
                  return (
                    <div
                      data-breadcrumb-id={itemProps.active ? itemProps.id : undefined}
                      className={'flex flex-row items-center gap-4'}
                      key={itemProps.id}
                    >
                      <Breadcrumbs.Item
                        active={itemProps.active}
                        state={itemProps.state}
                        theme={theme}
                      />
                      <Breadcrumbs.Label
                        active={itemProps.active}
                        text={itemProps.label}
                        state={itemProps.state}
                      />
                    </div>
                  );
                })}
              </VerticalLayout>
            );
          }}
        </Breadcrumbs>
      </Stepper>
      <ScrollBar />
    </ScrollArea>
  );
};
