import { AlertDefinitionRepository } from '@/alert-definition/alert-definition.repository';
import { AlertRepository } from '@/alert/alert.repository';
import { AlertService } from '@/alert/alert.service';
import { BusinessReportService } from '@/business-report/business-report.service';
import { DataAnalyticsService } from '@/data-analytics/data-analytics.service';
import { ProjectScopeService } from '@/project/project-scope.service';
import { createCustomer } from '@/test/helpers/create-customer';
import { createProject } from '@/test/helpers/create-project';
import { cleanupDatabase, tearDownDatabase } from '@/test/helpers/database-helper';
import { commonTestingModules } from '@/test/helpers/nest-app-helper';
import {
  createBusinessCounterparty,
  createEndUserCounterparty,
  TransactionFactory,
} from '@/transaction/test-utils/transaction-factory';
import { faker } from '@faker-js/faker';
import { Test } from '@nestjs/testing';
import {
  AlertDefinition,
  AlertState,
  AlertStatus,
  Counterparty,
  Customer,
  PaymentMethod,
  Project,
  TransactionDirection,
  TransactionRecordType,
} from '@prisma/client';
import {
  ALERT_DEFINITIONS,
  generateAlertDefinitions,
  getAlertDefinitionCreateData,
} from '../../scripts/alerts/generate-alerts';

import { PrismaService } from '@/prisma/prisma.service';
import { BusinessService } from '@/business/business.service';
import { BusinessRepository } from '@/business/business.repository';
import { MerchantMonitoringClient } from '@/business-report/merchant-monitoring-client';
import { DataInvestigationService } from '@/data-analytics/data-investigation.service';
import { TIME_UNITS } from '@/data-analytics/consts';

type AsyncTransactionFactoryCallback = (
  transactionFactory: TransactionFactory,
) => Promise<TransactionFactory | void>;

const maskedVisaCardNumber = () => {
  const cardNumber: string = faker.finance.creditCardNumber('visa');

  // Extract the required parts of the card number
  const firstSix = cardNumber.substring(0, 6);
  const lastFour = cardNumber.substring(cardNumber.length - 4);

  // Construct the masked number with the desired pattern
  return `${firstSix}******${lastFour}`.replace('-', '');
};

const createTransactionsWithCounterpartyAsync = async (
  project: Project | undefined,
  prismaService: PrismaService,
  callback: AsyncTransactionFactoryCallback,
) => {
  const counteryparty = await createCounterparty(prismaService, project);

  const baseTransactionFactory = new TransactionFactory({
    prisma: prismaService,
    projectId: counteryparty.projectId,
  })
    .withCounterpartyBeneficiary(counteryparty.id)
    .direction(TransactionDirection.inbound)
    .paymentMethod(PaymentMethod.credit_card);

  (await callback(baseTransactionFactory)) as TransactionFactory;

  return baseTransactionFactory;
};

const createFutureDate = (daysToAdd: number) => {
  const currentDate = new Date();
  const futureDate = new Date(currentDate);
  futureDate.setDate(currentDate.getDate() + daysToAdd);

  return futureDate;
};

const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('AlertService', () => {
  let prismaService: PrismaService;
  let alertService: AlertService;
  let customer: Customer;
  let project: Project;
  let transactionFactory: TransactionFactory;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: commonTestingModules,
      providers: [
        DataAnalyticsService,
        DataInvestigationService,
        ProjectScopeService,
        AlertRepository,
        AlertDefinitionRepository,
        BusinessReportService,
        AlertService,
        BusinessService,
        BusinessRepository,
        MerchantMonitoringClient,
      ],
    }).compile();

    prismaService = module.get(PrismaService);

    alertService = module.get(AlertService);
  });

  beforeEach(async () => {
    await cleanupDatabase();
    await prismaService.$executeRaw`TRUNCATE TABLE "public"."Alert" CASCADE;`;
    await prismaService.$executeRaw`TRUNCATE TABLE "public"."AlertDefinition" CASCADE;`;
    await prismaService.$executeRaw`TRUNCATE TABLE "public"."TransactionRecord" CASCADE;`;

    customer = await createCustomer(
      prismaService,
      faker.datatype.uuid(),
      faker.datatype.uuid(),
      '',
      '',
      'webhook-shared-secret',
    );

    project = await createProject(prismaService, customer, faker.datatype.uuid());

    transactionFactory = new TransactionFactory({
      prisma: prismaService,
      projectId: project.id,
    });
  });

  afterAll(tearDownDatabase);

  describe('checkAllAlerts', () => {
    let baseTransactionFactory: TransactionFactory;

    beforeEach(() => {
      baseTransactionFactory = transactionFactory
        .paymentMethod(PaymentMethod.credit_card)
        .transactionDate(faker.date.recent(1));
    });

    describe('Rule: DORMANT', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.DORMANT,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        expect(ALERT_DEFINITIONS.DORMANT).not.toHaveProperty('options');
      });

      test('When there is activity in the last 180 days', async () => {
        // Arrange
        const baseTransactionFactory = await createTransactionsWithCounterpartyAsync(
          project,
          prismaService,
          async (transactionFactory: TransactionFactory) => {
            const castedTransactionFactory = transactionFactory as TransactionFactory;

            const pastSixMonth = new Date();
            pastSixMonth.setMonth(pastSixMonth.getMonth() - 6);
            pastSixMonth.setDate(pastSixMonth.getDate() - 1);

            await castedTransactionFactory
              .transactionDate(faker.date.recent(30, pastSixMonth))
              .count(2)
              .create();

            await castedTransactionFactory.transactionDate(faker.date.recent(30)).count(1).create();
          },
        );

        const counterpartyBeneficiaryId =
          baseTransactionFactory?.data?.counterpartyBeneficiary?.connect?.id;

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counterpartyBeneficiaryId);
      });

      test('When there is no activity in the project', async () => {
        // Arrange
        const newProject = undefined;
        await createTransactionsWithCounterpartyAsync(
          newProject,
          prismaService,
          async transactionFactory => {
            await transactionFactory.transactionDate(faker.date.past(10)).count(9).create();
            await transactionFactory.transactionDate(faker.date.recent(30)).count(1).create();
          },
        );

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: STRUC_CC', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.STRUC_CC,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        expect(
          ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold,
        ).toBeGreaterThanOrEqual(5);
        expect(
          ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min,
        ).toBeGreaterThanOrEqual(500);
      });

      test('When there are more than 5 inbound transactions with amount of 501, an alert should be created', async () => {
        // Arrange
        const transactions = await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(
          transactions[0]?.counterpartyBeneficiaryId,
        );
      });

      test('When there inbound transactions with amount less of Threshold, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold - 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });

      test('When there inbound transactions with amount less of 500, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min - 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });

      test('When there are more than 5 inbound transactions with amount less than 500, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(499)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(6)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });

      test('Assigning and deciding alerts should set audit timestamps', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);

        const user = await prismaService.user.create({
          data: {
            firstName: 'Test',
            lastName: 'User',
            password: '',
            email: faker.internet.email(),
            roles: [],
          },
        });

        await alertService.updateAlertsAssignee(
          alerts.map(alert => alert.id),
          project.id,
          user.id,
        );

        const assignedAlerts = await prismaService.alert.findMany({
          where: {
            assignedAt: {
              not: null,
            },
          },
        });
        expect(assignedAlerts).toHaveLength(1);
        expect(assignedAlerts[0]?.assignedAt).toBeInstanceOf(Date);
        expect(assignedAlerts[0]?.assignedAt).not.toBeNull();
        // whenever update Decision we set the assignee to the authicated user
        await alertService.updateAlertsDecision(
          alerts.map(alert => alert.id),
          project.id,
          AlertState.rejected,
        );

        const updatedAlerts = await prismaService.alert.findMany({
          where: {
            decisionAt: {
              not: null,
            },
          },
        });

        expect(updatedAlerts).toHaveLength(1);
        expect(updatedAlerts[0]?.decisionAt).toBeInstanceOf(Date);
        expect(updatedAlerts[0]?.decisionAt).not.toBeNull();
        expect(updatedAlerts[0]?.status).toBe(AlertStatus.completed);
      });

      test('Dedupe - Alert should be deduped', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold + 1)
          .create();

        await alertService.checkAllAlerts();

        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const updatedAlerts = await prismaService.alert.findMany({
          where: {
            dedupedAt: {
              not: null,
            },
          },
        });

        expect(updatedAlerts).toHaveLength(1);
        expect(updatedAlerts[0]?.dedupedAt).toBeInstanceOf(Date);
        expect(updatedAlerts[0]?.dedupedAt).not.toBeNull();
      });

      test('Dedupe - Only non completed alerts will be dedupe', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountThreshold + 1)
          .create();

        await alertService.checkAllAlerts();

        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);

        // whenever update Decision we set the assignee to the authicated user
        await alertService.updateAlertsDecision(
          alerts.map(alert => alert.id),
          project.id,
          AlertState.rejected,
        );

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const updatedAlerts = await prismaService.alert.findMany({
          where: {
            dedupedAt: {
              not: null,
            },
          },
        });

        expect(updatedAlerts).toHaveLength(0);
      });
    });

    describe('Rule: STRUC_APM', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.STRUC_APM,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        expect(
          ALERT_DEFINITIONS.STRUC_APM.inlineRule.options.amountThreshold,
        ).toBeGreaterThanOrEqual(5);
        expect(
          ALERT_DEFINITIONS.STRUC_APM.inlineRule.options.amountBetween.min,
        ).toBeGreaterThanOrEqual(500);
      });

      test('When there are more than 5 inbound transactions with amount above between, an alert should be created', async () => {
        // Arrange
        const transactions = await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_APM.inlineRule.options.amountBetween.max - 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.bank_transfer)
          .count(ALERT_DEFINITIONS.STRUC_APM.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(
          transactions[0]?.counterpartyBeneficiaryId,
        );
      });

      test('When there are less than 5 inbound transactions with amount of 500, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.STRUC_CC.inlineRule.options.amountBetween.min - 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.pay_pal)
          .count(6)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });

      test('When there are more than 5 inbound transactions with amount of 499, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(499)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.pay_pal)
          .count(6)
          .create();

        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(501)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.pay_pal)
          .count(3)
          .create();

        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(501)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(6)
          .create();

        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(501)
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.pay_pal)
          .count(6)
          .create();
        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: CHVC_C', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.CHVC_C,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });
      });

      it('When there are more than or equal to 15 chargeback transactions, an alert should be created', async () => {
        // Arrange
        const business1Transactions = await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(16)
          .type(TransactionRecordType.chargeback)
          .create();
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(13)
          .type(TransactionRecordType.chargeback)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyOriginatorId).toEqual(
          business1Transactions[0]?.counterpartyOriginatorId,
        );
      });

      it('When there are less than 15 chargeback transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(14)
          .type(TransactionRecordType.chargeback)
          .create();
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(14)
          .type(TransactionRecordType.chargeback)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: SHCAC_C', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.SHCAC_C,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });
      });

      it('When the sum of chargebacks amount is greater than 5000, an alert should be created', async () => {
        // Arrange
        const business1Transactions = await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(100)
          .count(51)
          .type(TransactionRecordType.chargeback)
          .create();
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(100)
          .count(49)
          .type(TransactionRecordType.chargeback)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyOriginatorId).toEqual(
          business1Transactions[0]?.counterpartyOriginatorId,
        );
      });

      it('When the sum of chargebacks amount is less than 5000, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(100)
          .count(49)
          .type(TransactionRecordType.chargeback)
          .create();
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(100)
          .count(49)
          .type(TransactionRecordType.chargeback)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: CHCR_C', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(ALERT_DEFINITIONS.CHCR_C, project, undefined, {
            crossEnvKey: 'TEST',
          }),
        });
      });

      it('When there are more than or equal to 15 refund transactions, an alert should be created', async () => {
        // Arrange
        const business1Transactions = await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(15)
          .type(TransactionRecordType.refund)
          .create();
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(14)
          .type(TransactionRecordType.refund)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyOriginatorId).toEqual(
          business1Transactions[0]?.counterpartyOriginatorId,
        );
      });

      it('When there are less than 15 refund transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(14)
          .type(TransactionRecordType.refund)
          .create();
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .count(14)
          .type(TransactionRecordType.refund)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: SHCAR_C', () => {
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(ALERT_DEFINITIONS.SHCAR_C, project, undefined, {
            crossEnvKey: 'TEST',
          }),
        });
      });

      it('When the sum of refunds amount is greater than 5000, an alert should be created', async () => {
        // Arrange
        const business1Transactions = await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(1000)
          .count(11)
          .type(TransactionRecordType.refund)
          .create();

        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(10)
          .count(12)
          .type(TransactionRecordType.refund)
          .create();

        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(5001)
          .count(13)
          .type(TransactionRecordType.chargeback)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);

        expect(alerts[0] as any).toMatchObject({
          executionDetails: { executionRow: { transactionCount: '11' } },
        });

        expect(alerts[0] as any).toMatchObject({
          executionDetails: { executionRow: { totalAmount: 1000 * 11 } },
        });

        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyOriginatorId).toEqual(
          business1Transactions[0]?.counterpartyOriginatorId,
        );
      });

      it('When the sum of refunds amount is less than 5000, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessOriginator()
          .withEndUserBeneficiary()
          .amount(100)
          .count(49)
          .type(TransactionRecordType.refund)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: HPC', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(ALERT_DEFINITIONS.HPC, project, undefined, {
            crossEnvKey: 'TEST',
          }),
        });
        const correlationId = faker.datatype.uuid();
        counteryparty = await prismaService.counterparty.create({
          data: {
            project: { connect: { id: project.id } },
            correlationId: correlationId,
            business: {
              create: {
                correlationId: correlationId,
                companyName: faker.company.name(),
                registrationNumber: faker.datatype.uuid(),
                mccCode: faker.datatype.number({ min: 1000, max: 9999 }),
                businessType: faker.lorem.word(),
                project: { connect: { id: project.id } },
              },
            },
          },
        });
      });

      afterAll(async () => {
        return await prismaService.alertDefinition.delete({ where: { id: alertDefinition.id } });
      });

      it('When there are >=3 chargeback transactions and they are >=50% of the total transactions, an alert should be created', async () => {
        // Arrange
        const chargebackTransactions = await baseTransactionFactory
          .type(TransactionRecordType.chargeback)
          .withCounterpartyOriginator(counteryparty.id)
          .withEndUserBeneficiary()
          .count(3)
          .create();

        await baseTransactionFactory
          .type(TransactionRecordType.payment)
          .withCounterpartyOriginator(counteryparty.id)
          .withEndUserBeneficiary()
          .count(3)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyOriginatorId).toEqual(
          chargebackTransactions[0]?.counterpartyOriginatorId,
        );
      });

      it('When there are >=3 chargeback transactions and they are <50% of the total transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .type(TransactionRecordType.chargeback)
          .withEndUserBeneficiary()
          .withCounterpartyOriginator(counteryparty.id)
          .count(3)
          .create();

        await baseTransactionFactory
          .type(TransactionRecordType.payment)
          .withEndUserBeneficiary()
          .withCounterpartyOriginator(counteryparty.id)
          .count(4)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });

      it('When there are <3 chargeback transactions and they are >=50% of the total transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .type(TransactionRecordType.chargeback)
          .withEndUserBeneficiary()
          .withCounterpartyOriginator(counteryparty.id)
          .count(2)
          .create();

        await baseTransactionFactory
          .type(TransactionRecordType.payment)
          .withEndUserBeneficiary()
          .withCounterpartyOriginator(counteryparty.id)
          .count(2)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: TLHAICC', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.TLHAICC,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        counteryparty = await createCounterparty(prismaService, project);
      });

      it('When there are >2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, an alert should be created', async () => {
        const { minimumTransactionAmount } = ALERT_DEFINITIONS.TLHAICC.inlineRule.options;

        const txFactory = transactionFactory
          .paymentMethod(PaymentMethod.credit_card)
          .direction(TransactionDirection.inbound)
          .withCounterpartyBeneficiary(counteryparty.id);

        // Noise
        await txFactory
          .paymentMethod(PaymentMethod.apm)
          .amount(1500)
          .transactionDate(faker.date.recent(3))
          .count(1)
          .create();

        // Arrange
        await txFactory.amount(400).transactionDate(faker.date.past(3)).count(1).create();

        await txFactory.amount(300).transactionDate(faker.date.recent(30)).count(1).create();

        await baseTransactionFactory
          .paymentMethod(PaymentMethod.credit_card)
          .direction(TransactionDirection.inbound)
          .amount(minimumTransactionAmount + 1)
          .transactionDate(faker.date.past(2))
          .count(3)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counteryparty.id);
      });

      it('When there are 2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(150)
          .count(1)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(300)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: TLHAIAPM', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.TLHAIAPM,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        const correlationId = faker.datatype.uuid();
        counteryparty = await prismaService.counterparty.create({
          data: {
            project: { connect: { id: project.id } },
            correlationId: correlationId,
            business: {
              create: {
                correlationId: correlationId,
                companyName: faker.company.name(),
                registrationNumber: faker.datatype.uuid(),
                mccCode: faker.datatype.number({ min: 1000, max: 9999 }),
                businessType: faker.lorem.word(),
                project: { connect: { id: project.id } },
              },
            },
          },
        });
      });

      it('When there are >2 APM transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, an alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apple_pay)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(150)
          .count(2)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.pay_pal)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(300)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counteryparty.id);
      });

      it('When there are 2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.google_pay)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(150)
          .count(1)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.bank_transfer)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(300)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: PAY_HCA_CC', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(ALERT_DEFINITIONS.PAY_HCA_CC, project, undefined, {
            crossEnvKey: 'TEST',
          }),
        });

        expect(
          ALERT_DEFINITIONS.PAY_HCA_CC.inlineRule.options.amountThreshold,
        ).toBeGreaterThanOrEqual(1000);
        expect(ALERT_DEFINITIONS.PAY_HCA_CC.inlineRule.options.direction).toBe(
          TransactionDirection.inbound,
        );
      });

      it('When there are few transaction, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .amount(150)
          .count(ALERT_DEFINITIONS.PAY_HCA_CC.inlineRule.options.amountThreshold % 10)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .withBusinessBeneficiary()
          .paymentMethod(PaymentMethod.apple_pay)
          .amount(150)
          .count(ALERT_DEFINITIONS.PAY_HCA_CC.inlineRule.options.amountThreshold % 10)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: PAY_HCA_APM', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(ALERT_DEFINITIONS.PAY_HCA_APM, project, undefined, {
            crossEnvKey: 'TEST',
          }),
        });

        expect(
          ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.amountThreshold,
        ).toBeGreaterThanOrEqual(1000);
        expect(ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.direction).toBe(
          TransactionDirection.inbound,
        );

        expect(ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.excludePaymentMethods).toBe(true);
      });

      it('When there more than 1k credit card transactions, an alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.debit_card)
          .amount(ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.amountThreshold + 1)
          .count(1)
          .create();

        await baseTransactionFactory
          .withBusinessBeneficiary()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apple_pay)
          .amount(ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.amountThreshold + 1)
          .transactionDate(createFutureDate(1))
          .count(1)
          .create();
        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0] as any).toMatchObject({
          executionDetails: { executionRow: { transactionCount: '1', totalAmount: 1001 } },
        });
      });

      it('When there are few transaction, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .amount(150)
          .count(ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.amountThreshold % 10)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .withBusinessBeneficiary()
          .paymentMethod(PaymentMethod.apple_pay)
          .amount(150)
          .count(ALERT_DEFINITIONS.PAY_HCA_APM.inlineRule.options.amountThreshold % 10)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: PGAICT', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.PGAICT,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        const correlationId = faker.datatype.uuid();
        counteryparty = await prismaService.counterparty.create({
          data: {
            project: { connect: { id: project.id } },
            correlationId: correlationId,
            business: {
              create: {
                correlationId: correlationId,
                companyName: faker.company.name(),
                registrationNumber: faker.datatype.uuid(),
                mccCode: faker.datatype.number({ min: 1000, max: 9999 }),
                project: { connect: { id: project.id } },
                businessType: ALERT_DEFINITIONS.PGAICT.inlineRule.options.customerType,
              },
            },
          },
        });
      });

      it('When there are >2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, an alert should be created', async () => {
        // Noise transactions
        const { minimumTransactionAmount, transactionFactor, timeAmount } =
          ALERT_DEFINITIONS.PGAICT.inlineRule.options;
        await transactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .transactionDate(faker.date.past(2))
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount * transactionFactor * transactionFactor)
          .count(10)
          .create();

        // Arrange
        await transactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .transactionDate(faker.date.recent(timeAmount - 1))
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount + 1)
          .count(10)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount * transactionFactor + 1)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counteryparty.id);
      });

      it('When there are 2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(150)
          .count(1)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(300)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: PGAIAPM', () => {
      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.PGAIAPM,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        const correlationId = faker.datatype.uuid();
        counteryparty = await prismaService.counterparty.create({
          data: {
            project: { connect: { id: project.id } },
            correlationId: correlationId,
            business: {
              create: {
                correlationId: correlationId,
                companyName: faker.company.name(),
                registrationNumber: faker.datatype.uuid(),
                mccCode: faker.datatype.number({ min: 1000, max: 9999 }),
                project: { connect: { id: project.id } },
                businessType: ALERT_DEFINITIONS.PGAICT.inlineRule.options.customerType,
              },
            },
          },
        });
      });

      it('When there are >2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, an alert should be created', async () => {
        // Noise transactions
        const { minimumTransactionAmount, transactionFactor, timeAmount } =
          ALERT_DEFINITIONS.PGAICT.inlineRule.options;
        await transactionFactory
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.credit_card)
          .transactionDate(faker.date.past(2))
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount * transactionFactor * transactionFactor)
          .count(10)
          .create();

        await transactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apm)
          .transactionDate(faker.date.past(1))
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount + 1)
          .count(10)
          .create();

        // Arrange
        await transactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apm)
          .transactionDate(faker.date.recent(timeAmount - 1))
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount + 1)
          .count(10)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.debit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(minimumTransactionAmount * transactionFactor + 1)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counteryparty.id);
      });

      it('When there are 2 credit card transactions with >100 base amount and one transaction exceeds the average of all credit card transactions, no alert should be created', async () => {
        // Arrange
        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(150)
          .count(1)
          .create();

        await baseTransactionFactory
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .withCounterpartyBeneficiary(counteryparty.id)
          .amount(300)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: HVHAI_CC', () => {
      let oldTransactionFactory: TransactionFactory;

      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.HVHAI_CC,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        counteryparty = await createCounterparty(prismaService, project);

        oldTransactionFactory = transactionFactory
          .withCounterpartyBeneficiary(counteryparty.id)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card);
      });

      // Has the customer been active for over 180 days (Has the customer had at least 1 Inbound credit card transactions more than 180 days ago)? (A condition that is used to ensure that we are calculating an average from an available representative sample of data - this condition would cause the rule not to alert in the customer's first 180 days of their credit card life cycle)
      // Has the customer had more than a set [Number] of Inbound credit card transactions within the last 3 days? (A condition that is used to exclude cases when the number of Inbound credit card transactions in 3 days is more than 2 times greater than the customer's 3-day historic average number of Inbound credit card transactions, although of an insignificantly low number)
      // Has the customer's number of Inbound credit card transactions in 3 days been more than a set [Factor] times greater than the customer's 3-day average number of Inbound credit card transactions (when the average is caclulated from the 177 days preceding the evaluated 3 days)?
      it(`Trigger an alert when there inbound credit card transactions more than 180 days ago
          had more than a set X within the last 3 days`, async () => {
        // Arrange

        // Should have have old transactions
        const oldDaysAgo = new Date();
        oldDaysAgo.setDate(
          oldDaysAgo.getDate() -
            ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.activeUserPeriod.timeAmount,
        );
        oldDaysAgo.setHours(0, 0, 0, 0);

        const txDate = faker.date.recent(3, oldDaysAgo);
        await oldTransactionFactory.transactionDate(txDate).amount(3).count(1).create();

        // transactions from last days
        await oldTransactionFactory
          .date(() => faker.date.recent(1))
          .amount(300)
          .count(60)
          .create();

        // transactions in the last days
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(
          threeDaysAgo.getDate() -
            ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.lastDaysPeriod.timeAmount,
        );
        threeDaysAgo.setHours(0, 0, 0, 0);

        const txPeriod =
          ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.activeUserPeriod.timeAmount -
          ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.lastDaysPeriod.timeAmount;

        await oldTransactionFactory
          .date(() => faker.date.recent(txPeriod, threeDaysAgo))
          .amount(3)
          .count(125)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.severity).toEqual('medium');

        expect(alerts[0]?.executionDetails).toMatchObject({
          checkpoint: {
            hash: expect.any(String),
          },
          executionRow: {
            counterpartyBeneficiaryId: counteryparty.id,
          },
        });
      });

      it(`When there active users with no inbound credit card`, async () => {
        // Arrange
        const txFactory = oldTransactionFactory
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.apple_pay);

        await txFactory.amount(10).count(3).create();

        const thresholdTransaction = ALERT_DEFINITIONS.HVHAI_CC.inlineRule.options.minimumCount + 1;

        await txFactory
          .transactionDate(faker.date.recent(2))
          .amount(300)
          .count(thresholdTransaction)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: HVHAI_APM', () => {
      let oldTransactionFactory: TransactionFactory;

      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.HVHAI_APM,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        counteryparty = await createCounterparty(prismaService, project);

        oldTransactionFactory = transactionFactory
          .withCounterpartyBeneficiary(counteryparty.id)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apple_pay);
      });

      it(`Trigger an alert when there inbound and non credit card transactions more than 180 days ago
          had more than a set X within the last 3 days`, async () => {
        // Arrange

        // Should have have old transactions
        const oldDaysAgo = new Date();
        oldDaysAgo.setDate(
          oldDaysAgo.getDate() -
            ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.activeUserPeriod.timeAmount,
        );
        oldDaysAgo.setHours(0, 0, 0, 0);

        await oldTransactionFactory
          .transactionDate(faker.date.recent(3, oldDaysAgo))
          .amount(3)
          .count(1)
          .create();

        // transactions from last days
        await oldTransactionFactory
          .date(() => faker.date.recent(1))
          .amount(300)
          .count(60)
          .create();

        // transactions in the last days
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(
          threeDaysAgo.getDate() -
            ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.lastDaysPeriod.timeAmount,
        );
        threeDaysAgo.setHours(0, 0, 0, 0);

        const txPeriod =
          ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.activeUserPeriod.timeAmount -
          ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.lastDaysPeriod.timeAmount;

        await oldTransactionFactory
          .date(() => faker.date.recent(txPeriod, threeDaysAgo))
          .amount(3)
          .count(125)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.severity).toEqual('medium');

        expect(alerts[0]?.executionDetails).toMatchObject({
          checkpoint: {
            hash: expect.any(String),
          },
          executionRow: {
            counterpartyBeneficiaryId: counteryparty.id,
          },
        });
      });

      it(`When there active users with no inbound credit card`, async () => {
        // Arrange
        const txFactory = oldTransactionFactory
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.apple_pay);

        await txFactory.amount(10).count(3).create();

        const thresholdTransaction =
          ALERT_DEFINITIONS.HVHAI_APM.inlineRule.options.minimumCount + 1;

        await txFactory
          .transactionDate(faker.date.recent(2))
          .amount(300)
          .count(thresholdTransaction)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();
        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: MMOC_CC', () => {
      let _transactionFactory: TransactionFactory;

      let alertDefinition: AlertDefinition;
      let counteryparty: Counterparty;

      beforeEach(async () => {
        counteryparty = await createEndUserCounterparty({
          prismaService,
          projectId: project.id,
          correlationIdFn: maskedVisaCardNumber,
        });

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.MMOC_CC,
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        _transactionFactory = transactionFactory
          .withBusinessBeneficiary()
          .withCounterpartyOriginator(counteryparty.id)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .transactionDate(faker.date.recent(6))
          .count(1);

        await Promise.all(
          new Array(ALERT_DEFINITIONS.MMOC_CC.inlineRule.options.minimumCount + 1)
            .fill(null)
            .map(async () => {
              return await _transactionFactory.create();
            }),
        );
      });

      it(`Trigger an alert`, async () => {
        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.severity).toEqual('high');

        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyOriginatorId).toEqual(counteryparty.id);

        expect(alerts[0]?.executionDetails).toMatchObject({
          checkpoint: {
            hash: expect.any(String),
          },
          executionRow: {
            counterpartyOriginatorId: counteryparty.id,
            counterpertyInManyBusinessesCount: `${
              ALERT_DEFINITIONS.MMOC_CC.inlineRule.options.minimumCount + 1
            }`,
          },
        });
      });

      it.skip(`When ignore the originator counter party`, async () => {
        // Arrange
        await generateAlertDefinitions(prismaService, {
          project,
          alertsDef: {
            MMOC_CC: {
              ...ALERT_DEFINITIONS.MMOC_CC,
              inlineRule: {
                ...ALERT_DEFINITIONS.MMOC_CC.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.MMOC_CC.inlineRule.options,
                  excludedCounterparty: {
                    // @ts-ignore -- change list
                    counterpartyOriginatorIds: [counteryparty.correlationId],
                    // @ts-ignore -- change list
                    counterpartyBeneficiaryIds: [],
                  },
                },
              },
              correlationId: faker.datatype.uuid() + 123123,
            },
          },
        });

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: MGAV_CC', () => {
      let counterpartiesA: Array<Awaited<ReturnType<typeof createEndUserCounterparty>>> = [];
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        counterpartiesA = [];

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.MGAV_CC,

              ...ALERT_DEFINITIONS.MGAV_CC,
              inlineRule: {
                ...ALERT_DEFINITIONS.MGAV_CC.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.MGAV_CC.inlineRule.options,
                  transactionFactor: 1,
                },
              },

              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        const counterpartyByType = (
          businessType: string,
        ): ReturnType<typeof createBusinessCounterparty> =>
          createBusinessCounterparty({
            prismaService,
            projectId: project.id,
            businessTypeFn: () => businessType,
          });

        counterpartiesA = await Promise.all(
          new Array(3).fill(null).map(async () => counterpartyByType('businessA')),
        );

        await Promise.all(
          new Array(3).fill(null).map(async (_, i) =>
            counterpartiesA.map(async _counteryparty =>
              new TransactionFactory({
                prisma: prismaService,
                projectId: project.id,
              })
                .withCounterpartyBeneficiary(_counteryparty.id)
                .withEndUserOriginator()
                .direction(TransactionDirection.inbound)
                .paymentMethod(PaymentMethod.credit_card)
                .transactionDate(faker.date.past(2))
                .count(1 + i)
                .create(),
            ),
          ),
        );

        await Promise.all(
          new Array(2).fill(null).map(async (_, i) =>
            counterpartiesA.splice(1, 2).map(async _counteryparty =>
              new TransactionFactory({
                prisma: prismaService,
                projectId: project.id,
              })
                .withCounterpartyBeneficiary(_counteryparty.id)
                .withEndUserOriginator()
                .direction(TransactionDirection.inbound)
                .paymentMethod(PaymentMethod.credit_card)
                .transactionDate(faker.date.recent(2))
                .count(i % 2 === 0 ? 3 : 2)
                .create(),
            ),
          ),
        );

        await new TransactionFactory({
          prisma: prismaService,
          projectId: project.id,
        })
          // @ts-ignore
          .withCounterpartyBeneficiary(counterpartiesA[0].id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .transactionDate(faker.date.recent(5))
          .count(10)
          .create();

        await new TransactionFactory({
          prisma: prismaService,
          projectId: project.id,
        })
          // @ts-ignore
          .withCounterpartyBeneficiary(counterpartiesA[0].id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .transactionDate(faker.date.past(5))
          .count(10)
          .create();
      });

      it(`Trigger an alert`, async () => {
        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);
      });
    });

    describe('Rule: MGAV_APM', () => {
      let counterpartiesA: Array<Awaited<ReturnType<typeof createEndUserCounterparty>>> = [];
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        counterpartiesA = [];

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.MGAV_APM,

              ...ALERT_DEFINITIONS.MGAV_APM,
              inlineRule: {
                ...ALERT_DEFINITIONS.MGAV_APM.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.MGAV_APM.inlineRule.options,
                  transactionFactor: 1,
                },
              },

              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });

        const counterpartyByType = (businessType: string) =>
          createBusinessCounterparty({
            prismaService,
            projectId: project.id,
            businessTypeFn: () => businessType,
          });

        counterpartiesA = await Promise.all(
          new Array(3).fill(null).map(async () => counterpartyByType('businessA')),
        );

        await Promise.all(
          new Array(3).fill(null).map(async (_, i) =>
            counterpartiesA.map(
              async _counteryparty =>
                await new TransactionFactory({
                  prisma: prismaService,
                  projectId: project.id,
                })
                  .withCounterpartyBeneficiary(_counteryparty.id)
                  .withEndUserOriginator()
                  .direction(TransactionDirection.inbound)
                  .paymentMethod(PaymentMethod.apple_pay)
                  .transactionDate(faker.date.past(2))
                  .count(1 + i)
                  .create(),
            ),
          ),
        );

        await Promise.all(
          new Array(2).fill(null).map(async (_, i) =>
            counterpartiesA.splice(1, 2).map(
              async _counteryparty =>
                await new TransactionFactory({
                  prisma: prismaService,
                  projectId: project.id,
                })
                  .withCounterpartyBeneficiary(_counteryparty.id)
                  .withEndUserOriginator()
                  .direction(TransactionDirection.inbound)
                  .paymentMethod(PaymentMethod.apple_pay)
                  .transactionDate(faker.date.recent(2))
                  .count(i % 2 === 0 ? 3 : 2)
                  .create(),
            ),
          ),
        );

        await new TransactionFactory({
          prisma: prismaService,
          projectId: project.id,
        })
          // @ts-ignore
          .withCounterpartyBeneficiary(counterpartiesA[0].id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.bank_transfer)
          .transactionDate(faker.date.recent(5))
          .count(10)
          .create();

        await new TransactionFactory({
          prisma: prismaService,
          projectId: project.id,
        })
          // @ts-ignore
          .withCounterpartyBeneficiary(counterpartiesA[0].id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.debit_card)
          .transactionDate(faker.date.past(5))
          .count(10)
          .create();
      });

      it(`Trigger an alert`, async () => {
        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany();

        expect(alerts).toHaveLength(1);
      });
    });

    describe('Rule: DSTA_CC', () => {
      let counterparty: Awaited<ReturnType<typeof createBusinessCounterparty>>;
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        counterparty = await createBusinessCounterparty({
          prismaService,
          projectId: project.id,
          businessTypeFn: () => 'businessA',
        });

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.DSTA_CC,

              ...ALERT_DEFINITIONS.DSTA_CC,
              inlineRule: {
                ...ALERT_DEFINITIONS.DSTA_CC.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.DSTA_CC.inlineRule.options,
                  timeAmount: 1,
                  timeUnit: TIME_UNITS.days,
                  direction: TransactionDirection.inbound,
                },
              },
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });
      });

      it(`Trigger an alert`, async () => {
        // Arrange
        await baseTransactionFactory
          .withCounterpartyBeneficiary(counterparty.id)
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_CC.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counterparty.id);
      });

      it(`Shouldnt create alert for non credit card transaction`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_CC.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apple_pay)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });

      it(`Shouldnt create alert for transaction with less than the requested amount`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_CC.inlineRule.options.amountThreshold - 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });

      it(`Shouldnt create alert for non inbound transaction`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_CC.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: DSTA_APM', () => {
      let counterparty: Awaited<ReturnType<typeof createBusinessCounterparty>>;
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        counterparty = await createBusinessCounterparty({
          prismaService,
          projectId: project.id,
          businessTypeFn: () => 'businessA',
        });

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.DSTA_APM,

              ...ALERT_DEFINITIONS.DSTA_APM,
              inlineRule: {
                ...ALERT_DEFINITIONS.DSTA_APM.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.DSTA_APM.inlineRule.options,
                  timeAmount: 1,
                  timeUnit: TIME_UNITS.days,
                  direction: TransactionDirection.inbound,
                },
              },
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });
      });

      it(`Trigger an alert`, async () => {
        // Arrange
        await baseTransactionFactory
          .withCounterpartyBeneficiary(counterparty.id)
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_APM.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apm)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counterparty.id);
      });

      it(`Shouldnt create alert for non credit card transaction`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_APM.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });

      it(`Shouldnt create alert for transaction with less than the requested amount`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_APM.inlineRule.options.amountThreshold - 1)
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apm)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });

      it(`Shouldnt create alert for non inbound transaction`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DSTA_APM.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.apm)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: DMT_CC', () => {
      let counterparty: Awaited<ReturnType<typeof createBusinessCounterparty>>;
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        counterparty = await createBusinessCounterparty({
          prismaService,
          projectId: project.id,
          businessTypeFn: () => 'businessA',
        });

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.DMT_CC,

              ...ALERT_DEFINITIONS.DMT_CC,
              inlineRule: {
                ...ALERT_DEFINITIONS.DMT_CC.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.DMT_CC.inlineRule.options,
                  timeAmount: 1,
                  timeUnit: TIME_UNITS.days,
                  direction: TransactionDirection.inbound,
                },
              },
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });
      });

      it(`Trigger an alert`, async () => {
        // Arrange
        await baseTransactionFactory
          .withCounterpartyBeneficiary(counterparty.id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(ALERT_DEFINITIONS.DMT_CC.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counterparty.id);
        expect(alerts[0]?.executionDetails).toMatchObject({
          filters: {
            counterpartyBeneficiaryId: counterparty.id,
            paymentMethod: {
              in: ['credit_card'],
            },
            projectId: project.id,
            transactionDate: {
              gte: expect.stringMatching(isoPattern),
            },
            transactionDirection: 'inbound',
          },
          subject: {
            counterpartyBeneficiaryId: counterparty.id,
          },
        });
      });

      it(`Shouldnt create alert for non credit card transaction`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apple_pay)
          .count(ALERT_DEFINITIONS.DMT_CC.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });

      it(`Shouldnt create alert for transaction with less than the requested amount`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });

      it(`Shouldnt create alert for non inbound transaction`, async () => {
        // Arrange
        await baseTransactionFactory
          .withBusinessBeneficiary()
          .withEndUserOriginator()
          .amount(ALERT_DEFINITIONS.DMT_CC.inlineRule.options.amountThreshold + 1)
          .direction(TransactionDirection.outbound)
          .paymentMethod(PaymentMethod.credit_card)
          .count(1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });
    });

    describe('Rule: DMT_APM', () => {
      let counterparty: Awaited<ReturnType<typeof createBusinessCounterparty>>;
      let alertDefinition: AlertDefinition;

      beforeEach(async () => {
        counterparty = await createBusinessCounterparty({
          prismaService,
          projectId: project.id,
          businessTypeFn: () => 'businessA',
        });

        alertDefinition = await prismaService.alertDefinition.create({
          data: getAlertDefinitionCreateData(
            {
              ...ALERT_DEFINITIONS.DMT_APM,

              ...ALERT_DEFINITIONS.DMT_APM,
              inlineRule: {
                ...ALERT_DEFINITIONS.DMT_APM.inlineRule,
                options: {
                  ...ALERT_DEFINITIONS.DMT_APM.inlineRule.options,
                  timeAmount: 1,
                  timeUnit: TIME_UNITS.days,
                  direction: TransactionDirection.inbound,
                },
              },
              enabled: true,
            },
            project,
            undefined,
            { crossEnvKey: 'TEST' },
          ),
        });
      });

      it(`Trigger an alert`, async () => {
        // Arrange
        await baseTransactionFactory
          .withCounterpartyBeneficiary(counterparty.id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apm)
          .count(ALERT_DEFINITIONS.DMT_APM.inlineRule.options.amountThreshold + 1)
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(1);

        expect(alerts[0]?.alertDefinitionId).toEqual(alertDefinition.id);
        expect(alerts[0]?.counterpartyId).toEqual(null);
        expect(alerts[0]?.counterpartyBeneficiaryId).toEqual(counterparty.id);
      });

      it(`Shouldnt trigger alert for old transactions`, async () => {
        // Arrange
        await baseTransactionFactory
          .withCounterpartyBeneficiary(counterparty.id)
          .withEndUserOriginator()
          .direction(TransactionDirection.inbound)
          .paymentMethod(PaymentMethod.apm)
          .count(ALERT_DEFINITIONS.DMT_APM.inlineRule.options.amountThreshold + 1)
          .transactionDate(faker.date.recent(10, new Date().getDate() - 2))
          .create();

        // Act
        await alertService.checkAllAlerts();

        // Assert
        const alerts = await prismaService.alert.findMany({
          where: {
            alertDefinitionId: alertDefinition.id,
            projectId: project.id,
          },
        });

        expect(alerts).toHaveLength(0);
      });
    });
  });
});

const createCounterparty = async (
  prismaService: PrismaService,
  proj?: Pick<Project, 'id'>,
  {
    correlationIdFn,
  }: {
    correlationIdFn?: () => string;
  } = {},
) => {
  const correlationId = correlationIdFn ? correlationIdFn() : faker.datatype.uuid();

  if (!proj) {
    const customer = await createCustomer(
      prismaService,
      faker.datatype.uuid(),
      faker.datatype.uuid(),
      '',
      '',
      'webhook-shared-secret',
    );

    proj = await createProject(prismaService, customer, faker.datatype.uuid());
  }

  return await prismaService.counterparty.create({
    data: {
      project: { connect: { id: proj.id } },
      correlationId,
      business: {
        create: {
          correlationId,
          companyName: faker.company.name(),
          registrationNumber: faker.datatype.uuid(),
          mccCode: faker.datatype.number({ min: 1000, max: 9999 }),
          businessType: faker.lorem.word(),
          project: { connect: { id: proj.id } },
        },
      },
    },
  });
};
