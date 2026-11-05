import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ProviderCard } from '../../components/cards';
import { Chip, Empty, Field, Row, Screen, Txt } from '../../components/ui';
import { CATEGORIES } from '../../data/categories';
import { isOpenNow } from '../../lib/format';
import { fastest, matches, sortProviders, type Sort } from '../../lib/search';
import { useStore } from '../../state/store';

export default function Search() {
  const params = useLocalSearchParams<{ q?: string; fast?: string }>();
  const { t, listed: providers } = useStore();
  const [q, setQ] = useState(params.q ?? '');
  const [quick, setQuick] = useState(params.fast === '1');
  const [openOnly, setOpenOnly] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('best');

  // when opened again from Home with new params, adopt them (React's "adjust state on prop change" pattern)
  const [seen, setSeen] = useState({ q: params.q, fast: params.fast });
  if (seen.q !== params.q || seen.fast !== params.fast) {
    setSeen({ q: params.q, fast: params.fast });
    if (params.q !== undefined) setQ(params.q);
    if (params.fast !== undefined) setQuick(params.fast === '1');
  }

  const results = useMemo(
    () =>
      sortProviders(
        providers.filter(
          (p) =>
            matches(p, q) &&
            (!quick || fastest(p) <= 120) &&
            (!openOnly || (p.available && isOpenNow(p.openFrom, p.openTo))) &&
            (!cat || p.categoryId === cat),
        ),
        sort,
      ),
    [providers, q, quick, openOnly, cat, sort],
  );

  return (
    <Screen>
      <Txt v="h1">{t('whatNeed')}</Txt>
      <Field icon="search" placeholder={t('searchPh')} value={q} onChangeText={setQ} autoFocus={!params.fast} returnKeyType="search" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip icon="flash" label={t('readyFast')} active={quick} onPress={() => setQuick(!quick)} />
        <Chip icon="time" label={t('open')} active={openOnly} onPress={() => setOpenOnly(!openOnly)} color="green" />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" active={!cat} onPress={() => setCat(null)} color="purpleSoft" />
        {CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.name.split(' ')[0].replace(',', '')} active={cat === c.id} onPress={() => setCat(cat === c.id ? null : c.id)} color={c.soft} />
        ))}
      </ScrollView>

      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Txt v="label">{results.length} found</Txt>
        <Row gap={6}>
          {(['best', 'near', 'fast', 'cheap'] as Sort[]).map((s) => (
            <Chip key={s} label={{ best: 'Best', near: 'Nearest', fast: 'Fastest', cheap: 'Cheapest' }[s]} active={sort === s} onPress={() => setSort(s)} color="blueSoft" />
          ))}
        </Row>
      </Row>

      <View style={{ gap: 14 }}>
        {results.map((p) => (
          <ProviderCard key={p.id} p={p} onPress={() => router.push(`/provider/${p.id}`)} />
        ))}
        {!results.length ? <Empty icon="search" title="No one found" sub="Try a different word or remove a filter." /> : null}
      </View>
    </Screen>
  );
}
