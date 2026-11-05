import { Redirect, Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '../../components/TabBar';
import { useStore } from '../../state/store';

export default function CustomerTabs() {
  const { t, orders, user } = useStore();
  if (!user) return <Redirect href="/welcome" />;
  const active = orders.filter(
    (o) => o.customerId === user.id && !['delivered', 'declined', 'cancelled'].includes(o.status),
  ).length;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <TabBar
          {...props}
          meta={{
            index: { icon: 'home', label: t('home') },
            search: { icon: 'search', label: 'Search' },
            orders: { icon: 'receipt', label: t('orders'), badge: active || undefined },
            account: { icon: 'person', label: t('profile') },
          }}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
