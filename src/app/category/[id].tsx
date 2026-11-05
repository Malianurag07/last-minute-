import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { ProviderCard } from '../../components/cards';
import { Header } from '../../components/Header';
import { Chip, Empty, IconBox, Row, Screen, Txt, type IconName } from '../../components/ui';
import { categoryById } from '../../data/categories';
import { sortProviders, type Sort } from '../../lib/search';
import { useStore } from '../../state/store';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lang, providers, myProviderId } = useStore();
  const [sort, setSort] = useState<Sort>('best');
  const cat = categoryById(id);
  const list = sortProviders(
    providers.filter((p) => p.categoryId === cat.id && p.id !== myProviderId),
    sort,
  );
  return (
    <Screen>
      <Header title={lang === 'hi' ? cat.nameHi : cat.name} sub={`${list.length} home-based experts near you`} right={<IconBox icon={cat.icon as IconName} bg={cat.color} size={52} />} />
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        {(['best', 'near', 'fast', 'cheap'] as Sort[]).map((s) => (
          <Chip key={s} label={{ best: 'Best match', near: 'Nearest', fast: 'Fastest', cheap: 'Cheapest' }[s]} active={sort === s} onPress={() => setSort(s)} color={cat.soft} />
        ))}
      </Row>
      <View style={{ gap: 14 }}>
        {list.map((p) => (
          <ProviderCard key={p.id} p={p} onPress={() => router.push(`/provider/${p.id}`)} />
        ))}
        {!list.length ? <Empty icon="people" title="No one here yet" sub="Know someone good at this? Tell them to join LastMinute!" /> : null}
      </View>
      {list.length ? <Txt v="small" color="muted">Sorted by rating & distance. Everyone listed works from home.</Txt> : null}
    </Screen>
  );
}
