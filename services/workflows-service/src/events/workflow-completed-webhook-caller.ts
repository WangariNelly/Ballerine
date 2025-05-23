import { WorkflowEventEmitterService } from '@/workflow/workflow-event-emitter.service';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { AppLoggerService } from '@/common/app-logger/app-logger.service';
import { alertWebhookFailure } from '@/events/alert-webhook-failure';
import { ExtractWorkflowEventData } from '@/workflow/types';
import { getWebhooks, Webhook } from '@/events/get-webhooks';
import { WorkflowService } from '@/workflow/workflow.service';
import { WorkflowRuntimeData } from '@prisma/client';
import { sign, StateTag } from '@ballerine/common';
import type { TAuthenticationConfiguration } from '@/customer/types';
import { CustomerService } from '@/customer/customer.service';
import { WorkflowRuntimeDataRepository } from '@/workflow/workflow-runtime-data.repository';

@Injectable()
export class WorkflowCompletedWebhookCaller {
  #__axios: AxiosInstance;

  constructor(
    private httpService: HttpService,
    workflowEventEmitter: WorkflowEventEmitterService,
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
    private readonly workflowService: WorkflowService,
    private readonly customerService: CustomerService,
    private readonly workflowRuntimeDataRepository: WorkflowRuntimeDataRepository,
  ) {
    this.#__axios = this.httpService.axiosRef;

    workflowEventEmitter.on('workflow.completed', async data => {
      try {
        await this.handleWorkflowEvent(data);
      } catch (error) {
        console.error(error);
        alertWebhookFailure(error);
      }

      await this.updateSalesforceRecord(data.runtimeData);
    });
  }

  async handleWorkflowEvent(data: ExtractWorkflowEventData<'workflow.completed'>) {
    const customer = await this.customerService.getByProjectId(data.runtimeData.projectId, {
      select: {
        authenticationConfiguration: true,
        subscriptions: true,
      },
    });

    const webhooks = getWebhooks({
      workflowConfig: data.runtimeData.config,
      customerSubscriptions: customer.subscriptions,
      envName: this.configService.get('ENVIRONMENT_NAME'),
      event: 'workflow.completed',
    });

    const { webhookSharedSecret } =
      customer.authenticationConfiguration as TAuthenticationConfiguration;

    for (const webhook of webhooks) {
      let childWorkflowsRuntimeData;

      if (webhook.config?.withChildWorkflows) {
        childWorkflowsRuntimeData = await this.workflowRuntimeDataRepository.findMany(
          {
            where: {
              parentRuntimeDataId: data.runtimeData.id,
              deletedAt: null,
            },
          },
          [data.runtimeData.projectId],
        );
      }

      await this.sendWebhook({
        data: {
          ...data,
          ...(webhook.config?.withChildWorkflows ? { childWorkflowsRuntimeData } : {}),
        },
        webhook,
        webhookSharedSecret,
      });
    }
  }

  private async sendWebhook({
    data,
    webhook: { id, url, environment, apiVersion },
    webhookSharedSecret,
  }: {
    data: ExtractWorkflowEventData<'workflow.completed'>;
    webhook: Webhook;
    webhookSharedSecret: string;
  }) {
    this.logger.log('Sending webhook', { id, url });

    try {
      // Omit from data properties already sent as part of the webhook payload
      const { runtimeData, correlationId, entityId, childWorkflowsRuntimeData, ...restData } = data;
      const {
        createdAt,
        resolvedAt,
        workflowDefinitionId,
        id: runtimeDataId,
        ...restRuntimeData
      } = runtimeData;
      const payload = {
        id,
        eventName: 'workflow.completed',
        apiVersion,
        timestamp: new Date().toISOString(),
        workflowCreatedAt: createdAt,
        workflowResolvedAt: resolvedAt,
        workflowDefinitionId,
        workflowRuntimeId: runtimeDataId,
        workflowStatus: data.runtimeData.status,
        workflowFinalState: data.runtimeData.state,
        ballerineEntityId: entityId,
        correlationId,
        environment,
        data: {
          ...restRuntimeData.context,
          childWorkflowsRuntimeData,
        },
      };

      const res = await this.#__axios.post(url, payload, {
        headers: {
          'X-Authorization': webhookSharedSecret,
          'X-HMAC-Signature': sign({ payload, key: webhookSharedSecret }),
        },
      });

      this.logger.log('Webhook Result:', {
        status: res.status,
        statusText: res.statusText,
        data: res.data,
      });
    } catch (error: Error | any) {
      this.logger.log('Webhook error data::  ', {
        state: data.state,
        entityId: data.entityId,
        correlationId: data.correlationId,
        id: data.runtimeData.id,
      });
      this.logger.error('Failed to send webhook', { id, message: error?.message, error });
      alertWebhookFailure(error);
    }
  }

  private async updateSalesforceRecord(workflowRuntimeData: WorkflowRuntimeData) {
    const { salesforceRecordId, salesforceObjectName } = workflowRuntimeData;

    if (!salesforceRecordId || !salesforceObjectName) {
      return;
    }

    const statusMap = {
      [StateTag.APPROVED]: 'Approved',
      [StateTag.REJECTED]: 'Rejected',
    } as const;

    let status: (typeof statusMap)[keyof typeof statusMap] | undefined;

    // @ts-expect-error - error from Prisma types fix
    workflowRuntimeData.tags?.some((tag: string) => {
      if (tag in statusMap) {
        status = statusMap[tag as keyof typeof statusMap];

        return true;
      }
    });

    if (!status) {
      return;
    }

    await this.workflowService.updateSalesforceRecord({
      workflowRuntimeData,
      data: {
        KYB_Status__c: status,
      },
    });
  }
}
