import React, { FunctionComponent } from 'react';
import { Outlet } from 'react-router-dom';
import { UserAvatar } from '@/common/components/atoms/UserAvatar/UserAvatar';
import { useHomeLogic } from '@/common/hooks/useHomeLogic/useHomeLogic';
import { t } from 'i18next';
import { FullScreenLoader } from '@/common/components/molecules/FullScreenLoader/FullScreenLoader';
import { WelcomeCard } from '@/pages/Home/components/WelcomeCard/WelcomeCard';
import { GetFullAccessCard } from '@/common/components/molecules/GetFullAccessCard/GetFullAccessCard';

export const Home: FunctionComponent = () => {
  const {
    firstName,
    fullName,
    avatarUrl,
    statisticsLink,
    workflowsLink,
    defaultTabValue,
    isLoadingCustomer,
    isExample,
    isDemo,
  } = useHomeLogic();

  if (isLoadingCustomer) {
    return <FullScreenLoader />;
  }

  return (
    <div className={`flex flex-col gap-10 p-10`}>
      <div className={`flex items-center justify-between`}>
        <div className={`flex items-center`}>
          <UserAvatar
            fullName={fullName ?? ''}
            className={`mr-2 d-6`}
            avatarUrl={avatarUrl ?? undefined}
          />
          <h3 className={`flex max-w-[45ch] break-all text-2xl font-semibold`}>
            {t(`home.greeting`)}
            {firstName && ` ${firstName}`}
          </h3>
        </div>
        {/*<DateRangePicker*/}
        {/*  onChange={onDateRangeChange}*/}
        {/*  value={{ from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined }}*/}
        {/*/>*/}
      </div>
      <div>
        {/*<Tabs defaultValue={defaultTabValue} key={defaultTabValue}>*/}
        {/*  <TabsList>*/}
        {/*    <TabsTrigger asChild value={statisticsLink}>*/}
        {/*      <NavLink to={statisticsLink}>Statistics</NavLink>*/}
        {/*    </TabsTrigger>*/}
        {/*    <TabsTrigger asChild value={workflowsLink}>*/}
        {/*      <NavLink to={workflowsLink}>Workflows</NavLink>*/}
        {/*    </TabsTrigger>*/}
        {/*  </TabsList>*/}
        {/*  <TabsContent value={defaultTabValue}>*/}
        {/*  </TabsContent>*/}
        {/*</Tabs>*/}
        {(isDemo || isExample) && <Outlet />}
        {!isDemo && !isExample && <WelcomeCard />}
      </div>

      <GetFullAccessCard />
    </div>
  );
};
