import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '../../components/TabBar';
import { useStore } from '../../state/store';

export default function ProviderTabs() {
  const { t, me, user, orders, collabs } = useStore();
  if (!user) return <Redirect href="/welcome" />;
  if (!me) return <Redirect href="/join" />;
  const newOrders = orders.filter((o) => o.providerId === me.id && o.status === 'requested').length;
  const newCollabs = collabs.filter((c) => c.toProviderId === me.id && c.status === 'pending').length;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <TabBar
          {...props}
          meta={{
            index: { icon: 'home', label: t('home'), badge: newOrders || undefined },
            jobs: { icon: 'briefcase', label: t('orders') },
            dashboard: { icon: 'stats-chart', label: t('dashboard') },
            partners: { icon: 'people', label: t('collaborate'), badge: newCollabs || undefined },
          }}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="jobs" />
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="partners" />
    </Tabs>
  );
}
